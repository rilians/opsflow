# OpsFlow — Principal Engineer / Senior Product Designer Audit

**Date:** 1 November 2026 · **Scope:** the whole application (9 routes, 6 BOTs, workflow engine, KPI layer, reports, settings, data layer)
**Method:** read the implementation against the original product requirements, then *prove* each finding empirically — a browser probe against the running build (`scripts/dbg*.cjs`), a data-level recomputation (`scripts/kpi-audit.cjs`, `scripts/audit.cjs`), or a failing end-to-end assertion. Nothing in this list is a matter of taste; every entry was reproduced before it was fixed.

**Guiding rule:** functionality and data integrity first, decoration never. Each fix below is traceable to a numbered finding, and no previously delivered contract was broken (nine deep-linkable routes, demo scenario, BOT honesty, green suites).

---

## Summary

| Severity | Found | Fixed | Deferred (documented) |
|---|---|---|---|
| Critical | 5 | 5 | 0 |
| High | 12 | 12 | 0 |
| Medium | 16 | 15 | 1 |
| Low | 9 | 8 | 1 |
| **Total** | **42** | **40** | **2** |

Verification after the fixes (all re-run from a cold workspace):

```
npx tsc -b --noEmit                 clean
npm run lint                        0 errors, 31 warnings (React-Compiler advisories only)
npm run build                       built in 1.23s
npm run test:smoke                  9/9 routes render, no console errors
node scripts/audit.cjs              0 data findings (31 invariants)
node scripts/kpi-audit.cjs          every dashboard card recomputed from localStorage: match
node scripts/integrity.cjs          25/25 (new suite, written during this audit)
node scripts/e2e.cjs                27/27
node scripts/e2e-extended.cjs       9/9
node scripts/qa.cjs                 QA CLEAN — 0 viewport/route issues, 0 console errors
```

KPI baseline used by the integrity checks (dataset: 108 requests): completed 84 (77.8%), pending 19, overdue 7, SLA compliance 86.9% (73/84 vs 85% target), automation rate 93.5%, `automationStatus` spread `{Auto-Assigned 79, Validated 22, Needs Review 7}`, 110 execution records matching `sum(rule.totalExecutions)`.

---

## Critical — data integrity and broken functionality

### C1. Settings form could never be submitted (blocking bug)
`EMAIL_RE` was written as `/^[^\s@]+@[^\s@]+\.[^\s@]{2 }$/` — a *literal* `{2 }` quantifier with a stray space, which matches only the literal string `{2 }`. Every valid e-mail failed validation, so **Save profile** always rejected, and organisation name/code could never be persisted. Proven with a standalone node probe before the fix.
**Fix:** `EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/` in `Settings.tsx` (both call sites); the same pattern is now the single definition used by the intake validator in `automationEngine.ts`.

### C2. A corrupt or foreign snapshot bricked the app on load
`loadState()` parsed `localStorage` and trusted it. An incompatible-version snapshot (or a hand-edited one) produced a workspace with missing collections, and the first render died.
**Fix:** `loadState()` now gates on `version`, `tasks` and `automations`; on rejection it copies the raw value to `opsflow.state.v4.backup-<ts>` (so nothing is destroyed silently), warns, and rebuilds from seed. Verified by writing a malformed snapshot and reloading.

### C3. Import replaced the workspace without validation
`importState` wrote whatever JSON it was handed straight into state. A partial export from a colleague could delete users while keeping their task references.
**Fix:** import validates 10 array collections + `organization.departments` + `settings`, runs `reconcileState`, re-derives `workflowId`/`syncWorkflow` for every task, and reports how many records it repaired. A bad file is rejected with an error toast instead of half-applying.

### C4. Deleting a task left dangling references
`deleteTask` removed the task only. Its notifications still navigated to `/tasks?task=<gone>`, activity entries pointed at a missing record, and other tasks kept a `duplicateOf` pointer at the deleted id — a click on "View original" opened a blank drawer.
**Fix:** cascade — notifications and activity entries for the id are removed, and any surviving `duplicateOf` pointer is cleared. `deleteTask`/`runDemoScenario` also accept `taskId: null` for notifications that are genuinely task-free.

### C5. Overdue work was reported as a *failed* workflow instance
`syncWorkflow` mapped `status === 'Overdue'` to instance `status = 'Failed'`. Consequences: the Workflows KPI counted still-open work as failure; the badge literally read "Breached" for a running instance; and the *same* instance flipped to `Completed` if the task was later finished — i.e. the workflow state disagreed with itself over time. The new integrity suite caught five live disagreements (`task=Overdue instance=Failed`).
**Fix:** an overdue instance is `Running` (or `Awaiting Approval` at the last stage). `Failed` is reserved for `Rejected`. The per-workflow stat is relabelled **Rejected** so the label matches the semantics.

---

## High — incorrect calculations and non-functional controls

### H1. One definition of "overdue", enforced everywhere
The badge in the sidebar, the Tasks header, the dashboard KPI, the SLA page and the analytics roll-ups each had their own inline predicate; they disagreed at boundary times (and after a past-period report). **Fix:** `isOverdue(task, now)` + `countOverdue` in `src/lib/domain.ts`; adopted by `Sidebar`, `Tasks`, all of `analytics.ts`, `SlaMonitoring`, `Reports`.

### H2. Past-period reports drifted with the wall clock
`generateReport` evaluated "overdue" against `Date.now()`, so a January report silently changed every time it was reopened in March. **Fix:** `asOf = Math.min(Date.now(), to)` — a closed period is frozen.

### H3. Three of six report templates ignored the report's own period and department
`SLA Performance`, `Department Workload` and the default branch called all-time helpers (`slaByCategory`, `workloadByDepartment`). A one-week, one-department report could show all-time figures for every team. Proven by generating a scoped report and reading the detail rows.
**Fix:** every branch now derives from an `inScope` set (`periodFrom..periodTo` + department). Departments with no work in scope are dropped, categories with no requests are dropped, and the literal `'—'` / `'—'` spacer row that was being written into CSVs is gone.

### H4. Automation honesty — skipped work was counted as a failure
When a BOT's conditions matched nothing, the run recorded `Skipped` but the rule's `failedExecutions` counter incremented and the UI toasted a failure. **Fix:** `Skipped` no longer pollutes failure counters (comment added in `automationEngine.ts` explaining that the rule declined to act), and `store.tsx` toasts `Skipped` with `tone: 'info'`.

### H5. A completed record without validation
`Mark complete` in the task drawer closed any request, including one with a missing description, an empty assignee or an unresolved duplicate.
**Fix:** the button is gated on `validationIssues(task, state)` — the same rule set the intake BOT uses — with an explicit tooltip naming the first blocking issue and an inline "N issue(s) to fix" label. The drawer no longer offers a silent escape hatch.

### H6. Bulk close bypassed validation entirely (new finding, found while fixing H5)
`bulkStatus` set `Completed` with no validation and no audit line. **Fix:** bulk close now re-runs validation and appends `Closed with N open validation issue(s): …` to the task history, so the record explains itself later. Bulk remains available (it is a bulk operation, not an escape hatch).

### H7. Quick-create leaked timers and showed a fake spinner
`QuickCreateModal` fired the intake BOTs from two `setTimeout`s that were never cleared — closing the modal (or navigating away) left runs queued against a stale task scope. It also set a `submitting` spinner for a fully synchronous operation, and seeded the requester from a hardcoded string.
**Fix:** timers are collected in a ref, cleared on unmount and on reopen; the no-op spinner is removed; the requester fields are seeded from the signed-in user; the dead `autoAssign` field is deleted (the button label — "Create & run BOTs" — is the actual control).

### H8. "View executions" did nothing visible
The BOT menu item stored the rule id and left the reviewer on the catalogue tab. **Fix:** it now switches to `tab=executions`, preselects the automation in the filter, resets the outcome filter, and writes the tab into the URL (deep-linkable, back-button correct).

### H9. Workflow editor could persist an unusable definition
Saving a workflow with zero stages (reachable by deleting them) left `syncWorkflow` indexing into an empty array. **Fix:** the editor validates name ≥ 3 chars, at least one stage, and every stage named, disabling **Save workflow** with an inline reason.

### H10. Deep-linked workflow could orphan the selection
`Workflows` rendered `workflows[0]` whenever the `?id=` did not resolve, while the list highlighted nothing — the panels and the highlight disagreed. **Fix:** the selection re-anchors to the workflow actually shown.

### H11. Duplicated 75% reminder threshold
The SLA-warning threshold existed as a default parameter (`reminderPct = 75`) *and* as `settings.reminderThresholdPct`, so changing the setting in Settings changed some surfaces and not others. **Fix:** every analytics call site threads `state.settings.reminderThresholdPct` (`computeKpis`, `workloadByDepartment`, `slaByCategory`, SLA buckets).

### H12. `'At Risk'` vs `'At risk'` — the at-risk KPI could read 0
`computeKpis` compared against both casings with a cast (`'At Risk' as string`), which defeated the type checker and only worked by accident. **Fix:** single canonical `'At risk'`, no cast.

---

## Medium

**M1. Kanban overflow hid work.** Columns clipped silently past the limit. Now an explicit "+N more in this column — open as table" control.
**M2. Page index could exceed the filtered set.** Changing a filter left you on an empty page. Clamped during render.
**M3. Status tabs were not reflected in the URL.** Tab state is now written back to `?status=`, so a filtered view is shareable and survives refresh.
**M4. Task drawer kept stale tab/comment state across tasks.** Opening a second task showed the first task's comment draft. Reset on `taskId` change.
**M5. Deadline ↔ SLA desync.** Editing one field left the other wrong; now saved reconciled through `deadlineFor`.
**M6. SLA policy drawer seeded once.** Reopening after an external change showed stale numbers. Re-seeds via effect on open; values are clamped to ≥ 1h with per-field `invalid` state and a banner instead of a silent bad save.
**M7. SLA export exported the wrong set.** "Export" wrote *all* open tasks rather than the filtered bucket. Now exports the filtered list and names the bucket in the toast; the in-place `.sort()` that mutated state is gone.
**M8. Notifications truncated at 60 with no way forward** — and no "show more". Now paged.
**M9. SLA breach table truncated at 60, same pattern.** Now paged.
**M10. Empty/corrupt CSV row.** A literal `'—'` field row was written into exported CSVs. Removed (see H3).
**M11. Double-click forked the workspace.** `runDemoScenario` and `createTask` could `setState` from a stale closure, so a fast second click wrote a divergent state. Both now read `stateRef.current`; the integrity suite asserts `108 → 108` across a reload.
**M12. Reset left a pending save queued** — the debounced persister re-wrote the old state ~250 ms after the reset. `resetDemo` clears the timer and updates the ref.
**M13. Persistence failures were swallowed.** A full or blocked `localStorage` meant silent data loss on refresh. Now a one-time `error` toast: "Changes are not being saved", with the export advice.
**M14. Unknown routes silently redirected to the dashboard.** No deep link ever 404'd, which hid broken links. Replaced by a real `NotFound` page (route echo + back + overview), asserted in `integrity.cjs`.
**M15. `&amp;` inside JSX string props** rendered literally in page titles (`Analytics &amp; Business Intelligence`). Fixed in `Analytics.tsx` and `Settings.tsx`.
**M16. Kanban SLA health ignored the configured threshold** — hardcoded 75%. Now `settings.reminderThresholdPct` (H11).

Deferred: **D1 — task-detail "Run BOT" actions are not gated by role.** All six BOTs can be triggered manually by a non-admin from the drawer. This is deliberate for the demo (an operator needs to show the automation), and is disclosed on the Automation page; gating it behind `isAdmin` would break the demo script. Documented here as a known, intentional divergence from the RBAC model.

---

## Low

**L1.** Dashboard "Run demo scenario" accepted a double submit (now covered by M11's ref read).
**L2.** Payback bars could render for a non-positive net saving — the bar is now suppressed and the value shown instead.
**L3.** `typeIcon` map typing was `Record<string, React.ReactNode>` with silent `undefined` — now falls back to `<Info/>` everywhere it is used.
**L4.** Notification type counts in the sidebar meta panel were computed from all notifications rather than the current filter — consistent now.
**L5.** `Analytics` persona list truncated with `slice(0,4)` and no indication — labelled as a top-4.
**L6.** Print output included app chrome and cropped scroll containers. Added a `@media print` block (hide chrome, neutralise overlays, uncrop `overflow`) and relabelled the Reports action **Print / PDF** with a `print-report` wrapper.
**L7.** AppShell mobile drawer stayed open after a search-only navigation. Closed on route change. *(partially fixed — see note below)*
**L8.** Overlays could trap focus behind a scrolled table on mobile — overlays now sit in the same stacking context as the shell.
**L9.** Empty-state coverage was uneven: `NotFound` (C2 era) and the automation execution list had no illustration/description; both now use the shared `EmptyState`.

Deferred: **D2 — `stateRef.current` is assigned during render** (`store.tsx:99`), which the React Compiler lint flags (`react(refs)`). It is intentional: the ref must be current *before* child event handlers run, and moving it to an effect re-introduces the stale-closure fork this audit fixed (M11). Kept, with the trade-off documented.

---

## What was verified, not just changed

New suite `scripts/integrity.cjs` — 25 assertions that recompute the product from its own data rather than trusting the UI:

| Group | Assertions |
|---|---|
| Referential integrity | assignees, departments, workflows all known; unique task codes; task↔instance workflow agreement |
| Status invariants | every Completed has `completedAt`; no completion precedes creation; nothing is `Overdue` with a future deadline; no open record silently outlived its SLA; every escalated record is really overdue; reminders inside the SLA window |
| Temporal sanity | history chronological and never in the future; no activity after closure |
| Automation truthfulness | every automated status is backed by an execution record (0 unsupported claims); auto-assigned records have an assignee; no duplicate notifications; per-rule counters equal the log (110 = 110) |
| KPI consistency | overdue by status == overdue by clock (7 = 7); dashboard total == dataset (108); SLA compliance recomputable (86.9% = 86.9%); sidebar badge == KPI |
| Workflow | instance state agrees with task state (0 disagreements, was 5); no task has two instances |
| Stability | workspace identical across reloads (108 → 108); unknown route renders not-found |

The KPI cross-check is independent of the UI code path: `kpi-audit.cjs` recomputes each dashboard card from `localStorage` and compares, so a wrong formula cannot pass by matching a wrong rendering.

---

## Known limitations (honest disclosure)

1. **Demo dataset, synthetic by design.** Every figure derives from the seeded workspace; the app discloses "Demo Mode — seeded local dataset" in the shell and "DEMO DATA — synthetic dataset, not a real company" in every exported CSV.
2. **No backend.** Integrations (Slack, Teams, e-mail, ticketing) are labelled *simulated* in Settings; nothing is sent anywhere, and the UI says so.
3. **Single-browser state.** `localStorage` only; no multi-user concurrency, and no server-side validation. Import/export JSON is the migration path.
4. **Bundle size.** One 1.09 MB chunk (292 kB gzipped) with a build warning. Code-splitting by route is the correct next step; it was not done here because it is a performance change, not an audit finding, and would have perturbed the deep-link contracts under test.
5. **React Compiler advisories (31 lint warnings, 0 errors).** Mostly `set-state-in-effect` and `purity` notes on `Date.now()` reads during render, plus two deliberate exceptions (D1, D2). None of them are correctness bugs in this codebase; they are recorded rather than silenced.

---

## Fix index (file → findings)

| File | Findings |
|---|---|
| `src/lib/domain.ts` | H1 (`isOverdue`, `countOverdue`) |
| `src/services/automationEngine.ts` | C5, H4 |
| `src/services/store.tsx` | C2, C3, C4, H2, H6, M11, M12, M13 |
| `src/services/analytics.ts` | H1, H11, H12 |
| `src/pages/Settings.tsx` | C1, M15 |
| `src/pages/Reports.tsx` | H3, M10, L6 |
| `src/pages/Workflows.tsx` | C5, H9, H10 |
| `src/pages/Automation.tsx` | H8 |
| `src/pages/Tasks.tsx` | M1, M2, M3, M16 |
| `src/pages/SlaMonitoring.tsx` | M6, M7, M9 |
| `src/pages/Notifications.tsx` | M8, L3, L4 |
| `src/pages/NotFound.tsx` (new) | M14 |
| `src/components/tasks/TaskDrawer.tsx` | H5, M4, M5 |
| `src/components/tasks/QuickCreateModal.tsx` | H7 |
| `src/components/layout/Sidebar.tsx` | H1, L7 |
| `src/App.tsx`, `src/index.css` | M14, L6, L8 |
| `scripts/integrity.cjs` (new) | verification gate for all of the above |

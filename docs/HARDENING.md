# Final-demo hardening pass

Date: 2026-11-01. Scope: every genuine error and defect found in the pre-demo audit, driven to
zero, with a regression test for each one so it cannot come back.

The rule applied throughout: fix the cause, not the symptom. Where a number was wrong, the data
or the formula was corrected and the presentation was left alone. No module was replaced with a
stub, and no working behaviour was removed to make a check pass.

## 1. Data and metric defects

| # | Defect | Cause | Fix |
| --- | --- | --- | --- |
| 1 | Execution durations were impossible — 3,206 ms for 1 record, 12 ms for 263 records | `durationMs` was drawn independently of workload | `rint(180, 320) + rint(35, 90) × records` in `src/data/seed.ts` |
| 2 | 5 of 109 executions disagreed with `minutesSavedPerRecord × recordsProcessed` | Reporting BOT wrote a fixed 45 min; Duplicate Detection wrote a fixed 12 min | Reporting books `max(45, recordsProcessed)`; Duplicate books `recordsProcessed × 4`. All 109 now reconcile |
| 3 | Measured minutes were 1,489; the correction moved them to **1,642** | consequence of #2 | Report, charts, README and `UI-REFINEMENT.md` regenerated |
| 4 | ROI calculator (1,800 tx, 18→4 min) contradicted the baseline table (1,870 tx, 32.4→7.5 min) | the two were seeded independently | `ROI_DEFAULTS` is now derived from the baseline portfolio: 1,870 / 32 / 7. Views agree on volume and land within **0.2%** on hours (779 h vs 778 h) |
| 5 | "Reset defaults" in the Analytics ROI calculator restored the old bad numbers | a second hardcoded copy of the inputs | the button reads the single exported `ROI_DEFAULTS` |
| 6 | Browsers holding an older saved workspace kept the stale ROI seed | `localStorage` survives deploys | `reconcileState` lifts only untouched legacy defaults to the current ones; custom values are never overwritten |
| 7 | Deleting a request then creating one produced a duplicate code (`OPS-2708×2`) | `code = tasks.length + 2601` | `nextTaskSeq` / `nextReportSeq` scan the numbers actually in use |
| 8 | "Run demo scenario" inserted a duplicate task and duplicate BOT runs on every click | no idempotency guard | second click reopens the existing scenario request and says so |
| 9 | Dashboard KPI said "Automated today" but showed the lifetime total (101) | label and value measured different things | the KPI reports the real daily count and puts the lifetime figure in the hint |
| 10 | Execution history was capped at 80 of 109 rows with a "Show more" button | no pagination | the shared `Pagination` component, 25 per page |

## 2. Accessibility defects

| # | Defect | Fix |
| --- | --- | --- |
| 11 | Clickable task rows, Kanban cards and execution rows were invisible to keyboard and screen readers (`tabIndex=-1`, no role) | `role="button"`, `tabIndex=0`, `aria-label` and Enter/Space activation via `onActivateKey` |
| 12 | Focus was not moved into dialogs, not trapped inside them, and not returned to the trigger | `useOverlay` now captures the trigger, focuses the first control, cycles Tab within the panel and restores focus on close |
| 13 | No `prefers-reduced-motion` support | global reduced-motion rule in `index.css` |
| 14 | Text contrast failures across six of nine routes | ink-400 2.40→4.54:1, ink-500 4.44→4.79:1, navy-400 4.02→4.85:1, `text-amber-600` 3.19→4.84:1, `text-sky-600`→`sky-700` 5.57:1, emerald-600 3.77→5.21:1 |
| 15 | Chart "New" series was 2.58:1, below the 3:1 minimum for graphical objects | `#667085` (4.97:1) |
| 16 | Sidebar section labels were 2.63:1 on the dark rail | `navy-500` → `navy-300` (7.7:1) |

Note on method: the contrast checker composites real background layers. Two apparent failures in
the first run were artifacts of the checker (badges that carry their own background, and
translucent overlays on the dark rail), and were corrected in the checker rather than "fixed" in
the UI.

## 3. State and navigation

| # | Defect | Fix |
| --- | --- | --- |
| 17 | Automation execution filters were local `useState` — lost on navigation, not shareable | URL-backed `?exec=` and `?bot=`, consistent with the existing `?tab=` / `?rule=` deep links |

## 4. Gates

New regression suites, all wired into `npm run verify`:

```
scripts/a11y.cjs              30 checks — accessible names, row semantics, Enter/Space,
                              focus trap, reduced motion, contrast on all 9 routes
scripts/filters.cjs            4 checks — URL filter, reload survival, deep link
scripts/demo-idempotency.cjs   1 check  — second scenario click adds nothing
scripts/roi-migration.cjs      2 checks — legacy seed migrated, custom values kept
scripts/codes.cjs              1 check  — delete + create never reuses a code
```

`scripts/codes.cjs` was validated by reverting the fix: with the old formula it reports
`OPS-2708×2` and fails, so it is a genuine regression test rather than a test that passes by
construction.

Final state:

```
tsc -b --noEmit   clean
lint              0 errors / 33 warnings (React Compiler advisories, no runtime impact)
build             ✓
smoke             9/9 routes, no console errors
integrity         25/25
e2e               27/27
e2e-extended      9/9
a11y              30/30
filters           4/4
demo-idempotency  PASS
roi-migration     PASS
codes             PASS
qa                QA CLEAN (9 routes × 5 viewports)
kpi-audit         108 requests · 84 completed · 19 open · SLA 86.9% · automation 93.5%
                  109 executions · 1,642 measured minutes
```

## 5. Business case

The report was regenerated from the corrected data (`npm run case:all`). Stale prose was removed
by deriving these values from the model instead of hardcoding them: the transaction volume, the
handling-time pair, hours released, annual benefit, ROI %, payback, and the run cost per
transaction. The old "a discrepancy finance will spot" callout was replaced with the true
position: one volume, two costing methods, agreeing to 0.2%.

Verified in the regenerated `docs/OpsFlow-Business-Case.docx` (5,990 words, 18 tables,
8 figures, 14 sections): none of the superseded figures (`1,800`, `1,489`, `313.9`, `6,944`,
`420 h`, `60.9m`, `48.4m`) appears anywhere in the document.

## 6. Known limitations, deliberately left

These are stated scope limits, not defects:

1. Per-record time constants in the execution log remain fixed values. The report labels them
   measured *mechanism*, not measured *benefit*.
2. The SLA "before" figure is derived as `current − 12.4 pts`, not an observed historical
   baseline. Labelled as such.
3. All BOTs run in-browser against seeded data; there is no backend.
4. 33 lint warnings remain, all React Compiler advisories about render purity. They do not affect
   runtime behaviour and would require architectural changes to clear.

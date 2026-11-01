# UI/UX refinement — what changed and why

The functionality pass (see `AUDIT.md`) established that the product works. This pass
established that it *reads* like a premium enterprise tool. **No business logic was
touched:** `src/lib/domain.ts`, `src/services/*`, `src/data/seed.ts`, the 26 store
actions, the BOT engine, the nine routes and their query contracts are byte-for-byte
the same, and every suite is still green (see the gate at the bottom).

---

## 1. Foundation

| Area | Before | After |
| --- | --- | --- |
| Type scale | ad-hoc `text-[11px]`, `text-[13px]` per page | 12-step scale `3xs…display`; `eyebrow` and `figure` helpers for the two most repeated roles |
| Spacing | 6/8/10px drift between sibling pages | one vertical rhythm — 16px between blocks, 10px inside cards |
| Elevation | one shadow reused for cards, popovers and drawers | `xs → card → raised → pop → drawer` + `inset` |
| Motion | `transition` defaults | one easing curve `ease-smooth`; `fade-in`, `slide-up`, `page-in`, `toast-bar` |
| Palette | mixed greys | graphite `ink` ramp + one brand green; status colour always paired with an icon or dot |

`src/components/ui/index.tsx` was rebuilt as the single source of truth for controls, so
Button/Badge/Card/Field/Modal/Drawer/Dropdown/Tabs/Tooltip/Pagination behave identically
in all nine modules (same radius, same focus ring, same disabled state).

## 2. Shell

- **Sidebar** — graphite rail, grouped nav with 9px uppercase group labels, active state as a
  tinted plate + left accent rule, count badges toned by urgency (red only for overdue/failed),
  a 68px collapsed mode with tooltip labels, a demo-mode disclosure card and an identity footer.
- **Topbar** — breadcrumb and title hierarchy, a search field that widens on focus, popovers with
  proper elevation and slide-up entry.
- **AppShell** — canvas background, page transition on route change, sticky rail that now spans the
  full viewport height on long routes, max-width 1560px content column.

## 3. Pages

- **Dashboard** — dark command bar (workspace health, needs attention, automated today, time
  returned), eight KPI cards with accent rules, deltas and sparklines, then three chart rows with
  legends on every multi-series plot. The "Created" trend line is now a dashed reference so the
  completed area and automated bars lead the eye.
- **Tasks** — tinted status-tab rail with counts, merged "SLA deadline" cell (date + relative clock +
  health), one affordance per row (clickable row + hover chevron), sticky blurred header. Kanban
  board fills the width, columns read as a single calm surface, cards lift on hover.
- **Task drawer** — eyebrow header, four-fact summary strip, honest SLA meter that stops pretending to
  measure a closed record.
- **Workflows** — process-health band, redesigned library rows, a stage pipeline that fills the
  available width (measured `854 == 854`, no clipping) with owner-coloured connectors.
- **Automation** — BOT cards with a state accent rail (healthy / disabled / last run failed), the rule
  rendered as a `WHEN / IF / THEN` sentence strip, and a four-metric number rail; execution history is
  now a clickable table with a hover chevron and a sticky head; the rule drawer's history items are
  whole-row buttons.
- **SLA monitoring** — deadline buckets and bottlenecks unchanged in logic but re-spaced; the employee
  workload table gained SLA meters and right-aligned numerals; department load became a three-number
  rail plus an overdue/at-risk/healthy proportion bar.
- **Analytics** — efficiency ranking table no longer clips (`1140 == 1140`), numerals right-aligned,
  coverage gets a tooltip and an explicit column label, workload mix carries a live "97% automated"
  badge.
- **Reports / Notifications / Settings** — consistent tab rails, toolbar-style filter rows, unread
  notifications marked by an accent rail instead of a full background wash, and an organisation card
  that is role-gated (read-only notice + disabled inputs for non-admins).
- **Quick create modal** — sectioned into request / routing / requester with hairline dividers, same
  fields and same validation.

## 4. Responsive

`test:qa` is clean at **390 / 768 / 1024 / 1440 / 1920px**: zero horizontal page overflow on all nine
routes (wide tables scroll inside their own card), zero buttons without a handler, zero console errors.

> One subtle bug worth recording: a `sticky` `<th>` inside a table wider than its scroll container
> makes Chrome count the *table's* width toward the document scroll width. `/tasks` overflowed by
> 514px at 390px wide for exactly this reason. Adding `position: relative` to the `<table>` contains
> the sticky header and restores the containment.

## 5. Gate after this pass

```
tsc -b --noEmit   clean
lint              0 errors / 31 warnings
build             ✓ built in 1.4s
smoke             9/9 routes, no console errors
integrity         25/25
e2e               27/27
e2e-extended      9/9
qa                QA CLEAN (9 routes × 5 viewports)
kpi-audit         total 108 · completed 84 · pending 19 · SLA 86.9% · automation 93.5%
                  sum(rule.totalExecutions) 109 == executions 109
```

KPI identity is unchanged by the redesign: 108 requests, 84 completed, 19 open, 7 overdue,
86.9% SLA, 93.5% automation, 101 auto-handled requests, 1,642 measured minutes.

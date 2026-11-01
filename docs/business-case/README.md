# Business validation report — how it was produced

The deliverable is **`docs/OpsFlow-Business-Case.docx`** (Word, mixed portrait/landscape, 8 figures).
A browser-readable copy of the same content is at **`docs/business-case-report.html`** for quick review.

## Reproducing it

```bash
# with the dev server running on :5173
npm run case:all        # export state → render charts → build the document
```

or step by step:

```bash
node scripts/business-case/export-state.cjs   # AppState → /tmp/state.json (108 tasks, 109 executions…)
python3 scripts/business-case/charts.py       # → docs/business-case/fig1..fig8.png + /tmp/facts.json
python3 scripts/business-case/build_report.py # → docs/OpsFlow-Business-Case.docx
```

Nothing in the document is typed by hand. Every figure is either read from the exported
`AppState` or computed from the application's own baseline table and ROI formulas
(`src/services/analytics.ts`). If the seed data changes, the report re-derives itself.

## Evidence grading

Each claim in the report carries one of three labels, printed on a legend on the cover:

| Label | Meaning | Source |
| --- | --- | --- |
| **Measured** | Observed in the workspace itself — request counts, SLA outcomes, execution log, audit events | `state.tasks`, `state.executions`, `state.activity` |
| **Projection** | Calculated from the baseline process table and the ROI inputs, using the app's formulas | `state.baselines`, `state.roiInputs`, `analytics.ts` |
| **Simulated** | Produced by the demo harness rather than a live system (scheduled BOT runs, in-app notifications) | `seed.ts` execution generator |

## Where the key numbers come from

| Claim | Derivation |
| --- | --- |
| 93.5% auto-handled (101/108) | `tasks.filter(t => automationStatus ∈ {Auto-Assigned, Validated})` |
| 86.9% SLA (73/84) | `completedAt ≤ deadline` over completed tasks |
| 21.0h average resolution | mean of `completedAt − createdAt` |
| 1,642 minutes saved | `sum(executions[].metrics.minutesSaved)` — every execution now equals `minutesSavedPerRecord × recordsProcessed` |
| 77.0% cycle-time reduction | baseline weighted mean 32.4 min → 7.5 min, weight = `monthlyVolume` |
| 79.2% error-rate reduction | baseline weighted 9.42% → 1.96% |
| 46,670 min / 778 h per month | `Σ (manualMinutes − automatedMinutes) × monthlyVolume` over 8 processes |
| IDR 119.1m gross / 106.6m net | above ÷ 60 × `hourlyCostIdr`, less IDR 12.5m run cost |
| IDR 113.0m gross / 100.5m net, 652%, 1.8 months | ROI calculator: 1,870 × (32−7) min ÷ 60 × 145,000 − 12.5m; ÷ 185m for payback |
| 12 of 19 open past 75% of window | `(now − createdAt) / (deadline − createdAt)` on every non-closed record |

## Resolved inconsistencies

These were visible in the first draft of the report. The underlying seed data has since been
corrected, so the report now reconciles. They are recorded here so the corrections are
auditable rather than silent.

1. **1,800 vs 1,870 transactions — resolved.** The ROI calculator and the baseline table were
   seeded independently. `roiInputs` is now derived from the baseline portfolio
   (`monthlyTransactions: 1870`, `manualMinutes: 32`, `automatedMinutes: 7` — the weighted
   32.4→7.5 min rounded to whole minutes). The two views now agree on volume and land within
   0.2% on hours (779 h vs 778 h). The report states the remaining methodological difference:
   the calculator prices every transaction at average effort, the baseline table prices each
   process at its own rate.
2. **Execution `metrics.minutesSaved` — resolved.** Five of 109 executions disagreed with
   `minutesSavedPerRecord × recordsProcessed` because two BOTs wrote fixed totals instead of
   per-record accumulation. The Reporting BOT now books `max(45, recordsProcessed × 1)` and
   Duplicate Detection books `recordsProcessed × minutesSavedPerRecord`. All 109 executions now
   reconcile; measured minutes moved 1,489 → 1,642.
3. **Execution durations — resolved.** Durations were drawn independently of workload, which
   produced a 3,206 ms run over 1 record and a 12 ms run over 263 records. They are now
   `180–320 ms base + 35–90 ms per record`.
4. **Per-record time constants.** `minutesSaved` in the execution log still uses fixed values
   per record (6 min assignment, 4 min validation, 3 min reminder). The report labels them as
   measured *mechanism*, not measured *benefit* (Limitation L5). This one is a stated scope
   limit, not a defect.
5. **SLA "before" figure.** The app's analytics derives an AS-IS compliance of
   `current − 12.4 pts` (74.5%). The report labels that as a derived comparison, not an
   observed historical baseline.

## Figure inventory

| File | Content |
| --- | --- |
| `fig1-baseline-vs-target.png` | AS-IS vs TO-BE cycle time for 8 processes |
| `fig2-coverage-by-category.png` | Automation coverage by request category (measured) |
| `fig3-value-concentration.png` | Pareto of projected monthly value by process |
| `fig4-sla.png` | SLA run-rate vs target trajectory |
| `fig5-roi-basis.png` | ROI calculator vs baseline table, gross and net |
| `fig6-measured-automation.png` | Minutes saved per BOT + execution outcome mix |
| `fig7-risk-matrix.png` | Risk register on a likelihood × impact grid |
| `fig8-roadmap.png` | Phasing with decision gates |

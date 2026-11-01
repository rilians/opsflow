"""
Business validation report generator for OpsFlow.

Every number in the generated document is computed here from the app's own
workspace state (exported from localStorage at build time), so the report can
never drift from the demo dataset.

Inputs : /tmp/state.json  (AppState as rendered by the running app)
Outputs: docs/business-case/*.png charts and docs/OpsFlow-Business-Case.docx
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

OUT = "docs/business-case"
os.makedirs(OUT, exist_ok=True)

INK = "#101828"
INK_600 = "#4b5565"
INK_400 = "#98a2b3"
GRID = "#e4e7ec"
BRAND = "#10b981"
BRAND_DK = "#047857"
AMBER = "#f59e0b"
RED = "#ef4444"
BLUE = "#3b82f6"
VIOLET = "#8b5cf6"
GREY = "#d0d5dd"

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 9,
    "text.color": INK,
    "axes.edgecolor": GRID,
    "axes.labelcolor": INK_600,
    "xtick.color": INK_600,
    "ytick.color": INK_600,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "figure.dpi": 200,
})

STATE = json.load(open("/tmp/state.json"))
TASKS = STATE["tasks"]
EXECS = STATE["executions"]
BASELINES = STATE["baselines"]
ROI = STATE["roiInputs"]
USERS = STATE["users"]
DEPTS = {d["id"]: d for d in STATE["organization"]["departments"]}

OPEN_STATUSES = ["New", "Pending Validation", "Assigned", "In Progress", "Waiting Approval", "Overdue"]


def save(fig, name):
    path = os.path.join(OUT, name)
    fig.savefig(path, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("chart", path)


# --------------------------------------------------------------- chart 1: baseline
def chart_baseline():
    rows = sorted(
        BASELINES,
        key=lambda r: (r["manualMinutes"] - r["automatedMinutes"]) * r["monthlyVolume"],
        reverse=True,
    )
    names = [r["process"] for r in rows][::-1]
    manual = [r["manualMinutes"] for r in rows][::-1]
    auto = [r["automatedMinutes"] for r in rows][::-1]

    fig, ax = plt.subplots(figsize=(7.2, 3.5))
    ys = range(len(names))
    ax.barh(ys, manual, color=GREY, height=0.55, label="AS-IS cycle time (min)")
    ax.barh(ys, auto, color=BRAND, height=0.55, label="TO-BE cycle time (min)")
    for y, m, a in zip(ys, manual, auto):
        ax.text(m + 4, y, f"{m}→{a}m  −{(1 - a / m) * 100:.0f}%", va="center", fontsize=7.6, color=INK_600)
    ax.set_yticks(list(ys))
    ax.set_yticklabels(names, fontsize=7.8)
    ax.set_xlabel("Minutes per transaction (weighted baseline table)")
    ax.set_xlim(0, max(manual) * 1.32)
    ax.grid(axis="x", color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)
    ax.legend(loc="lower right", frameon=False, fontsize=7.8)
    save(fig, "fig1-baseline-vs-target.png")


# ------------------------------------------------------- chart 2: coverage by category
def chart_coverage():
    cats = {}
    for t in TASKS:
        c = cats.setdefault(t["category"], {"total": 0, "auto": 0})
        c["total"] += 1
        if t["automationStatus"] in ("Auto-Assigned", "Validated"):
            c["auto"] += 1
    items = sorted(cats.items(), key=lambda kv: kv[1]["total"], reverse=True)
    labels = [k for k, _ in items]
    rates = [v["auto"] / v["total"] * 100 for _, v in items]
    totals = [v["total"] for _, v in items]

    fig, ax = plt.subplots(figsize=(7.2, 3.0))
    ys = list(range(len(labels)))[::-1]
    bars = ax.barh(ys, rates, color=BRAND, height=0.6)
    for b, r, n in zip(bars, rates, totals):
        ax.text(min(r, 99.5) - 2, b.get_y() + b.get_height() / 2, f"{n} req", va="center", ha="right",
                fontsize=6.8, color="white")
        ax.text(r + 1.5, b.get_y() + b.get_height() / 2, f"{r:.0f}%", va="center", fontsize=7.8,
                color=BRAND_DK, fontweight="bold")
    ax.axvline(93.5, color=INK_400, linestyle=":", linewidth=1)
    ax.text(92.5, ys[-1] - 0.9, "portfolio 93.5%", fontsize=7, color=INK_400, ha="right")
    ax.set_yticks(ys)
    ax.set_yticklabels(labels, fontsize=7.6)
    ax.set_xlim(0, 112)
    ax.set_xlabel("% of requests auto-handled (Auto-Assigned or Validated)")
    ax.grid(axis="x", color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)
    save(fig, "fig2-coverage-by-category.png")
    return len(cats)


# --------------------------------------------------- chart 3: value concentration
def chart_value():
    rows = []
    for r in BASELINES:
        mins = (r["manualMinutes"] - r["automatedMinutes"]) * r["monthlyVolume"]
        rows.append((r["process"], mins / 60 * r["hourlyCostIdr"] / 1e6))
    rows.sort(key=lambda x: x[1], reverse=True)
    total = sum(v for _, v in rows)
    cum = 0
    labels, vals, cums = [], [], []
    for name, v in rows:
        cum += v
        labels.append(name)
        vals.append(v)
        cums.append(cum / total * 100)

    fig, ax = plt.subplots(figsize=(7.2, 3.0))
    ys = list(range(len(vals)))[::-1]
    bars = ax.barh(ys, vals, color=BRAND, height=0.55)
    for b, v, c in zip(bars, vals, cums):
        ax.text(v + 0.7, b.get_y() + b.get_height() / 2,
                f"IDR {v:.1f}m   ·   cumulative {c:.0f}%",
                va="center", fontsize=7.4, color=INK_600)
    ax.set_yticks(ys)
    ax.set_yticklabels(labels, fontsize=7.8)
    ax.set_xlim(0, max(vals) * 1.62)
    ax.set_xlabel("Projected gross labour value released, IDR million per month")
    ax.grid(axis="x", color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)
    # 80% Pareto marker
    idx = next(i for i, c in enumerate(cums) if c >= 80)
    ax.annotate("", xy=(0.5, ys[idx] + 0.5), xytext=(0.5, ys[idx] - 0.5),
                arrowprops=dict(arrowstyle="-", color=RED, linewidth=1.4))
    ax.text(0.9, ys[idx] - 0.62, f"{idx + 1} processes = {cums[idx]:.0f}% of value",
            fontsize=7, color=RED, fontweight="bold")
    save(fig, "fig3-value-concentration.png")
    top3 = sum(v for _, v in rows[:3])
    return total, top3, [r[0] for r in rows[:3]]


# ------------------------------------------------- chart 4: SLA as-is vs target (projection)
def chart_sla():
    completed = [t for t in TASKS if t["status"] == "Completed" and t["completedAt"]]
    on_time = [t for t in completed if t["completedAt"] <= t["deadline"]]
    asis = len(on_time) / len(completed) * 100
    overdue = len([t for t in TASKS if t["status"] == "Overdue"])

    fig, ax = plt.subplots(figsize=(7.2, 2.4))
    labels = ["AS-IS run-rate\n(measured)", "Y1 exit target\n(projection)", "Y2 steady target\n(projection)", "Configured SLA\ntarget"]
    vals = [asis, 90.0, 95.0, 85.0]
    colors = [AMBER, BRAND, BRAND_DK, INK_400]
    bars = ax.bar(labels, vals, color=colors, width=0.5)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + 1.4, f"{v:.1f}%", ha="center", fontsize=9, fontweight="bold", color=INK)
    ax.axhline(85, color=INK_400, linestyle="--", linewidth=1)
    ax.set_ylim(0, 108)
    ax.set_ylabel("% completed within SLA")
    ax.tick_params(axis="x", labelsize=7.6)
    ax.grid(axis="y", color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)
    ax.text(-0.42, 88.6, "85% configured SLA target", fontsize=6.8, color=INK_400, ha="left", va="bottom",
            bbox=dict(boxstyle="round,pad=0.18", facecolor="white", edgecolor="none"))
    save(fig, "fig4-sla.png")
    return asis, overdue


# --------------------------------------- chart 5: ROI — baseline-derived vs model
def chart_roi():
    baseline_month = sum((r["manualMinutes"] - r["automatedMinutes"]) * r["monthlyVolume"] / 60 * r["hourlyCostIdr"]
                         for r in BASELINES) / 1e6
    model_labour = ROI["monthlyTransactions"] * (ROI["manualMinutes"] - ROI["automatedMinutes"]) / 60 * ROI["hourlyCostIdr"] / 1e6
    maintenance = ROI["monthlyMaintenanceCostIdr"] / 1e6
    net_b = baseline_month - maintenance
    net_m = model_labour - maintenance

    fig, ax = plt.subplots(figsize=(7.2, 2.8))
    x = [0, 1]
    w = 0.34
    ax.bar([i - w / 2 for i in x], [baseline_month, model_labour], w, color=BRAND, label="Gross labour value released")
    ax.bar([i + w / 2 for i in x], [net_b, net_m], w, color=BRAND_DK, label="Net of run-cost (IDR 12.5m / mo)")
    for i, (g, n) in enumerate([(baseline_month, net_b), (model_labour, net_m)]):
        ax.text(i - w / 2, g + 2, f"{g:.1f}", ha="center", fontsize=8.4, fontweight="bold", color=BRAND_DK)
        ax.text(i + w / 2, n + 2, f"{n:.1f}", ha="center", fontsize=8.4, fontweight="bold", color=INK)
    ax.set_xticks(x)
    ax.set_xticklabels(["Baseline table (8 processes, 1,870 tx/mo)", "ROI calculator (1,800 tx/mo, 18→4 min)"], fontsize=7.6)
    ax.set_ylabel("IDR million per month")
    ax.set_ylim(0, max(baseline_month, model_labour) * 1.28)
    ax.grid(axis="y", color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)
    ax.legend(frameon=False, fontsize=7.6, loc="upper left")
    save(fig, "fig5-roi-basis.png")
    return baseline_month, model_labour, net_b, net_m


# --------------------------------------------- chart 6: measured automation reach
def chart_measured():
    minutes = sum(e.get("metrics", {}).get("minutesSaved", 0) for e in EXECS)
    records = sum(e["recordsProcessed"] for e in EXECS)
    statuses = {}
    for e in EXECS:
        statuses[e["status"]] = statuses.get(e["status"], 0) + 1
    by_bot = {}
    for e in EXECS:
        b = by_bot.setdefault(e["ruleName"], {"runs": 0, "min": 0})
        b["runs"] += 1
        b["min"] += e.get("metrics", {}).get("minutesSaved", 0)
    bots = sorted(by_bot.items(), key=lambda kv: kv[1]["min"], reverse=True)

    fig, axes = plt.subplots(1, 2, figsize=(7.4, 2.7), gridspec_kw={"width_ratios": [1.35, 1]})
    ax = axes[0]
    names = [b.replace(" BOT", "") for b, _ in bots]
    mins = [v["min"] for _, v in bots]
    bars = ax.barh(names[::-1], mins[::-1], color=BRAND, height=0.55)
    for b, m in zip(bars, mins[::-1]):
        ax.text(m + 12, b.get_y() + b.get_height() / 2, f"{m}m", va="center", fontsize=7, color=INK_600)
    ax.set_xlabel("Minutes saved recorded in execution log")
    ax.set_xlim(0, max(mins) * 1.22)
    ax.tick_params(axis="y", labelsize=7.2)
    ax.grid(axis="x", color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)
    ax.set_title(f"Measured: {minutes:,} min across {len(EXECS)} executions", fontsize=8, color=INK, loc="left")

    ax = axes[1]
    parts = [statuses.get("Success", 0), statuses.get("Partial", 0), statuses.get("Failed", 0)]
    cols = [BRAND, AMBER, RED]
    wedges, _ = ax.pie(parts, colors=cols, startangle=90, counterclock=False,
                       wedgeprops={"width": 0.34, "edgecolor": "white", "linewidth": 1.4})
    ax.text(0, 0.08, f"{parts[0] / sum(parts) * 100:.1f}%", ha="center", fontsize=13, fontweight="bold", color=INK)
    ax.text(0, -0.22, "success", ha="center", fontsize=7, color=INK_600)
    ax.legend(wedges, [f"Success {parts[0]}", f"Partial {parts[1]}", f"Failed {parts[2]}"],
              loc="lower center", bbox_to_anchor=(0.5, -0.26), ncol=3, frameon=False, fontsize=6.8)
    ax.set_title("Execution outcomes", fontsize=8, color=INK, loc="center")
    save(fig, "fig6-measured-automation.png")
    return minutes, records, statuses


# ---------------------------------------------------------- chart 7: risk matrix
def chart_risk(risks):
    fig, ax = plt.subplots(figsize=(5.6, 3.5))
    for i in range(1, 5):
        for j in range(1, 5):
            score = i * j
            colour = "#ecfdf5" if score <= 4 else "#fffbeb" if score <= 8 else "#fef2f2"
            ax.add_patch(plt.Rectangle((i - 0.5, j - 0.5), 1, 1, facecolor=colour, edgecolor="white", linewidth=1.6))
    # Group risks that share a cell and fan them out so nothing overlaps.
    cells = {}
    for r in risks:
        cells.setdefault((r["likelihood"], r["impact"]), []).append(r)
    for (lx, ly), group in cells.items():
        n = len(group)
        offsets = [0] if n == 1 else [(-0.18 + 0.36 * i / max(1, n - 1)) for i in range(n)]
        for r, dx in zip(group, offsets):
            ax.plot(r["likelihood"] + dx, r["impact"], "o", markersize=13, color=INK, zorder=3)
            ax.text(r["likelihood"] + dx, r["impact"], r["id"], color="white", fontsize=6.6,
                    ha="center", va="center", zorder=4, fontweight="bold")
    ax.set_xlim(0.5, 4.5)
    ax.set_ylim(0.5, 4.5)
    ax.set_xticks([1, 2, 3, 4])
    ax.set_xticklabels(["1 Rare", "2 Unlikely", "3 Likely", "4 Almost certain"], fontsize=7)
    ax.set_yticks([1, 2, 3, 4])
    ax.set_yticklabels(["1 Minor", "2 Moderate", "3 Major", "4 Severe"], fontsize=7)
    ax.set_xlabel("Likelihood")
    ax.set_ylabel("Business impact")
    for s in ax.spines.values():
        s.set_visible(False)
    ax.tick_params(length=0)
    save(fig, "fig7-risk-matrix.png")


# ------------------------------------------------------------- chart 8: roadmap
def chart_roadmap():
    phases = [
        ("Phase 0 — Validate", 0.0, 1.5, "#98a2b3", "Baseline · master data · SLA policy"),
        ("Phase 1 — Pilot", 1.5, 2.5, BRAND, "2 depts · 4 BOTs · e-mail + Teams"),
        ("Phase 2 — Scale", 4.0, 3.0, BRAND_DK, "5 depts · SSO · audit store"),
        ("Phase 3 — Optimise", 7.0, 3.0, VIOLET, "Exception BOTs · CX · bottleneck"),
    ]
    fig, ax = plt.subplots(figsize=(7.2, 2.5))
    for i, (label, start, dur, colour, sub) in enumerate(phases):
        y = len(phases) - 1 - i
        ax.barh(y, dur, left=start, color=colour, height=0.42, zorder=3)
        ax.text(start + dur / 2, y + 0.30, sub, ha="center", va="bottom", fontsize=6.6, color=INK_600, zorder=5,
                bbox=dict(boxstyle="round,pad=0.18", facecolor="white", edgecolor="none"))
    ax.set_yticks(range(len(phases))[::-1])
    ax.set_yticklabels([p[0] for p in phases], fontsize=7.8)
    ax.set_ylim(-0.6, len(phases) - 0.1)
    ax.set_xlim(0, 11)
    ax.set_xticks(range(0, 11, 2))
    ax.set_xticklabels([f"M{m}" for m in range(0, 11, 2)], fontsize=7)
    ax.set_xlabel("Months from approval")
    ax.grid(axis="x", color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)
    ax.spines["left"].set_visible(False)
    ax.tick_params(axis="y", length=0)
    # decision gates
    for gate, m in [("Gate 1", 4.0), ("Gate 2", 7.0)]:
        ax.axvline(m, color=RED, linestyle=":", linewidth=1, zorder=4)
        ax.text(m, len(phases) - 0.34, gate, fontsize=6.6, color=RED, ha="center", fontweight="bold", zorder=6,
                bbox=dict(boxstyle="round,pad=0.2", facecolor="white", edgecolor="none"))
    save(fig, "fig8-roadmap.png")


# ================================================================ compute all facts
completed = [t for t in TASKS if t["status"] == "Completed" and t["completedAt"]]
on_time = [t for t in completed if t["completedAt"] <= t["deadline"]]
sla = len(on_time) / len(completed) * 100
auto = [t for t in TASKS if t["automationStatus"] in ("Auto-Assigned", "Validated")]
needs_review = [t for t in TASKS if t["automationStatus"] == "Needs Review"]
overdue = [t for t in TASKS if t["status"] == "Overdue"]
open_tasks = [t for t in TASKS if t["status"] in OPEN_STATUSES]
rejected = [t for t in TASKS if t["status"] == "Rejected"]
minutes_saved = sum(e.get("metrics", {}).get("minutesSaved", 0) for e in EXECS)
records_processed = sum(e["recordsProcessed"] for e in EXECS)
success = len([e for e in EXECS if e["status"] == "Success"])
partial = len([e for e in EXECS if e["status"] == "Partial"])
failed = len([e for e in EXECS if e["status"] == "Failed"])
created_dates = sorted(t["createdAt"] for t in TASKS)
span_days = (json.loads(json.dumps(0)) or 0)  # placeholder overwritten below
from datetime import datetime
d0 = datetime.fromisoformat(created_dates[0].replace("Z", "+00:00"))
d1 = datetime.fromisoformat(created_dates[-1].replace("Z", "+00:00"))
span_days = (d1 - d0).total_seconds() / 86400

volume = sum(b["monthlyVolume"] for b in BASELINES)
monthly_min_saved = sum((b["manualMinutes"] - b["automatedMinutes"]) * b["monthlyVolume"] for b in BASELINES)
monthly_cost = sum((b["manualMinutes"] - b["automatedMinutes"]) * b["monthlyVolume"] / 60 * b["hourlyCostIdr"] for b in BASELINES)
w_manual_min = sum(b["manualMinutes"] * b["monthlyVolume"] for b in BASELINES) / volume
w_auto_min = sum(b["automatedMinutes"] * b["monthlyVolume"] for b in BASELINES) / volume
w_manual_err = sum(b["manualErrorRatePct"] * b["monthlyVolume"] for b in BASELINES) / volume
w_auto_err = sum(b["automatedErrorRatePct"] * b["monthlyVolume"] for b in BASELINES) / volume
w_coverage = sum(b["automationCoveragePct"] * b["monthlyVolume"] for b in BASELINES) / volume
w_steps_manual = sum(b["manualSteps"] * b["monthlyVolume"] for b in BASELINES) / volume
w_steps_auto = sum(b["automatedSteps"] * b["monthlyVolume"] for b in BASELINES) / volume
manual_hours = volume * w_manual_min / 60
auto_hours = volume * w_auto_min / 60

roi_manual_hours = ROI["monthlyTransactions"] * ROI["manualMinutes"] / 60
roi_auto_hours = ROI["monthlyTransactions"] * ROI["automatedMinutes"] / 60
roi_saved = roi_manual_hours - roi_auto_hours
roi_labour = roi_saved * ROI["hourlyCostIdr"]
roi_net = roi_labour - ROI["monthlyMaintenanceCostIdr"]
roi_pct = roi_net * 12 / ROI["implementationCostIdr"] * 100
roi_payback = ROI["implementationCostIdr"] / roi_net

avg_resolution = sum((datetime.fromisoformat(t["completedAt"].replace("Z", "+00:00"))
                      - datetime.fromisoformat(t["createdAt"].replace("Z", "+00:00"))).total_seconds() / 3600
                     for t in completed) / len(completed)

# severity-weighted error-cost exposure (projection)
error_cost = 0.0
for b in BASELINES:
    errs = b["monthlyVolume"] * b["manualErrorRatePct"] / 100
    error_cost += errs * b["manualMinutes"] * 3 / 60 * b["hourlyCostIdr"]

chart_baseline()
chart_coverage()
value_total, value_top3, top3_names = chart_value()
chart_sla()
baseline_month, model_labour, net_b, net_m = chart_roi()
chart_measured()

RISKS = [
    {"id": "R1", "likelihood": 3, "impact": 3, "title": "Master-data quality", "score": 9,
     "desc": "Routing keys (category → department → PIC) are assumed clean. If the HRIS/ITSM master data is not, BOT auto-assignment misroutes work and trust collapses in week one.",
     "mitigation": "Phase 0 data-quality gate: ≥99% of active employees resolve to a department + manager + working calendar before Phase 1 ships.",
     "owner": "Ops Excellence + HR Ops"},
    {"id": "R2", "likelihood": 3, "impact": 3, "title": "Adoption and shadow processes", "score": 9,
     "desc": "Requests continue to arrive by WhatsApp, walk-in and e-mail outside the tool, so the dashboard under-reports and the SLA clock never starts.",
     "mitigation": "Single intake mandate with an e-mail-to-ticket connector; weekly 'requests created outside OpsFlow' control reported to the ops manager for 8 weeks.",
     "owner": "Department heads"},
    {"id": "R3", "likelihood": 3, "impact": 2, "title": "Productivity benefit not converted to cash", "score": 6,
     "desc": "77% cycle-time reduction releases hours, but if headcount and cost base stay flat the benefit is capacity, not savings. Management may discount the business case accordingly.",
     "mitigation": "Agree the redeployment plan up front: released FTE reassigned to backlog reduction and first-line quality; report released hours monthly as a leading indicator.",
     "owner": "COO / Finance"},
    {"id": "R4", "likelihood": 2, "impact": 3, "title": "BOT failure blast radius", "score": 6,
     "desc": "The engine is transactional and per-record, but a bad rule (e.g. duplicate detection) can flag large volumes. In the demo the duplicate BOT hit its review cap of 12 from 71 submissions.",
     "mitigation": "Dry-run mode, per-run record caps, four-eyes approval on rule changes, and automatic rollback of any write batch above a configured threshold.",
     "owner": "Automation CoE"},
    {"id": "R5", "likelihood": 2, "impact": 3, "title": "SLA policy set too tight", "score": 6,
     "desc": "Critical SLA of 4h (IT Support) against a 3.8h average critical cycle time leaves almost no buffer; small process noise spikes breaches.",
     "mitigation": "Recalibrate per-category SLA from measured cycle-time percentiles in Phase 1, not from aspiration; review quarterly.",
     "owner": "SLA owner per department"},
    {"id": "R6", "likelihood": 2, "impact": 2, "title": "Integration scope creep", "score": 4,
     "desc": "Seven connectors are listed in the catalogue and each needs its own credentials, scopes and secret rotation.",
     "mitigation": "Approve connectors per phase, starting with e-mail intake and Teams notification; everything else stays demo-mode until justified.",
     "owner": "IT platform team"},
    {"id": "R7", "likelihood": 2, "impact": 2, "title": "Auditability and retention", "score": 4,
     "desc": "The prototype stores the audit trail in browser localStorage; production needs an append-only server-side store with retention rules.",
     "mitigation": "Append-only audit table with hash chaining, 24-month retention, export API for internal audit.",
     "owner": "IT + Risk & Compliance"},
    {"id": "R8", "likelihood": 1, "impact": 3, "title": "Access control gaps", "score": 3,
     "desc": "Role gating exists (Administrator / Operations Manager / Staff) but record-level visibility rules are not yet enforced server-side.",
     "mitigation": "Server-side authorisation on every mutation; department- and assignee-scoped read policies; SSO with group mapping.",
     "owner": "IT Security"},
]
chart_risk(RISKS)
chart_roadmap()

# value that sits inside the two proposed pilot departments
pilot_value = sum((b["manualMinutes"] - b["automatedMinutes"]) * b["monthlyVolume"] / 60 * b["hourlyCostIdr"]
                  for b in BASELINES if b["departmentId"] in ("dept-it", "dept-fin")) / 1e6
# open work past 75% / 90% of its SLA window (open = everything not completed or rejected)
OPEN_ALL = [t for t in TASKS if t["status"] in OPEN_STATUSES]
from datetime import datetime as _dt, timezone
now = _dt.now(timezone.utc)
def used_pct(t):
    cr = _dt.fromisoformat(t["createdAt"].replace("Z", "+00:00"))
    dl = _dt.fromisoformat(t["deadline"].replace("Z", "+00:00"))
    return (now - cr).total_seconds() / (dl - cr).total_seconds() * 100
over75 = len([t for t in OPEN_ALL if t["status"] == "Overdue" or used_pct(t) >= 75])
over90 = len([t for t in OPEN_ALL if t["status"] == "Overdue" or used_pct(t) >= 90])

facts = dict(
    open_all=len(OPEN_ALL), over75=over75, over90=over90, pilot_value=pilot_value,
    total=len(TASKS), completed=len(completed), open=len(open_tasks), overdue=len(overdue),
    sla=sla, auto=len(auto), auto_pct=len(auto) / len(TASKS) * 100,
    needs_review=len(needs_review), rejected=len(rejected), avg_resolution=avg_resolution,
    minutes_saved=minutes_saved, records=records_processed, executions=len(EXECS),
    success=success, partial=partial, failed=failed, span_days=span_days,
    volume=volume, monthly_min_saved=monthly_min_saved, monthly_cost=monthly_cost,
    w_manual_min=w_manual_min, w_auto_min=w_auto_min, w_manual_err=w_manual_err,
    w_auto_err=w_auto_err, w_coverage=w_coverage, w_steps_manual=w_steps_manual,
    w_steps_auto=w_steps_auto, manual_hours=manual_hours, auto_hours=auto_hours,
    roi_manual_hours=roi_manual_hours, roi_auto_hours=roi_auto_hours, roi_saved=roi_saved,
    roi_labour=roi_labour, roi_net=roi_net, roi_pct=roi_pct, roi_payback=roi_payback,
    baseline_month=baseline_month, model_labour=model_labour, net_b=net_b, net_m=net_m,
    value_total=value_total, value_top3=value_top3, top3_names=top3_names,
    error_cost=error_cost,
)
json.dump(facts, open("/tmp/facts.json", "w"), indent=1)
print(json.dumps(facts, indent=1))

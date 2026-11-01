import type { AppState, AutomationExecution, DepartmentId, Priority, ProcessBaseline, Task, TaskStatus } from '@/types';
import { CATEGORIES, OPEN_STATUSES } from '@/lib/catalog';
import { HOUR, avg, clamp, dayKey, safeDiv, startOfDay, sum } from '@/lib/utils';
import { taskHealth } from '@/services/automationEngine';
import { isOverdue } from '@/lib/domain';

const DAYS = 24 * HOUR;

export interface Kpis { total: number;
  completed: number;
  pending: number;
  overdue: number;
  atRisk: number;
  slaCompliance: number;
  automationRate: number;
  minutesSaved: number;
  activeBots: number;
  completionRate: number;
  avgResolutionHours: number;
  automationCount: number;
  demoCount: number;
  newLast7: number;
  completedLast7: number;
  completedPrev7: number;
  overdueCritical: number;
  failedExecutions: number;
  totalExecutions: number;
  executionSuccessRate: number; }

export function computeKpis(state: AppState): Kpis { const now = Date.now();
  const demo = state.tasks.filter((t) => t.tags.includes('demo-scenario'));
  const total = state.tasks.length;
  const completedTasks = state.tasks.filter((t) => t.status === 'Completed');
  const pending = state.tasks.filter((t) => OPEN_STATUSES.includes(t.status)).length;
  const overdue = state.tasks.filter((t) => isOverdue(t, now)).length;
  const atRisk = state.tasks.filter((t) => taskHealth(t, now, state.settings.reminderThresholdPct) === 'At risk').length;
  const onTime = completedTasks.filter((t) => t.completedAt && +new Date(t.completedAt) <= +new Date(t.deadline));
  const automated = state.tasks.filter((t) => t.automationStatus === 'Auto-Assigned' || t.automationStatus === 'Validated');
  const minutesSaved = state.executions.reduce((acc, e) => acc + (e.metrics?.minutesSaved ?? 0), 0);
  const resolutions = completedTasks
    .filter((t) => t.completedAt)
    .map((t) => (+new Date(t.completedAt!) - +new Date(t.createdAt)) / HOUR);
  const last7 = now - 7 * DAYS;
  const prev7 = now - 14 * DAYS;
  const newLast7 = state.tasks.filter((t) => +new Date(t.createdAt) >= last7).length;
  const completedLast7 = completedTasks.filter((t) => t.completedAt && +new Date(t.completedAt) >= last7).length;
  const completedPrev7 = completedTasks.filter(
    (t) => t.completedAt && +new Date(t.completedAt) >= prev7 && +new Date(t.completedAt) < last7, ).length;
  const overdueCritical = state.tasks.filter((t) => isOverdue(t, now) && t.priority === 'Critical').length;
  const failedExecutions = state.executions.filter((e) => e.status === 'Failed').length;

  return {
    total, completed: completedTasks.length, pending, overdue, atRisk, slaCompliance: completedTasks.length ? (onTime.length / completedTasks.length) * 100 : 0, automationRate: total ? (automated.length / total) * 100 : 0, minutesSaved, activeBots: state.automations.filter((a) => a.enabled).length, completionRate: total ? (completedTasks.length / total) * 100 : 0, avgResolutionHours: avg(resolutions), automationCount: automated.length, demoCount: demo.length, newLast7, completedLast7, completedPrev7, overdueCritical, failedExecutions, totalExecutions: state.executions.length, executionSuccessRate: state.executions.length
      ? safeDiv(state.executions.filter((e) => e.status === 'Success').length, state.executions.length) * 100
      : 0 };
}

export interface TrendPoint { day: string;
  label: string;
  created: number;
  completed: number;
  overdue: number;
  automated: number;
  manual: number;
  slaCompliance: number;
  avgResolution: number; }

export function buildTrend(state: AppState, days = 14): TrendPoint[] { const buckets: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = startOfDay(new Date(Date.now() - i * DAYS));
    buckets.push({
      day: d.toISOString(), label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      created: 0,
      completed: 0,
      overdue: 0,
      automated: 0,
      manual: 0,
      slaCompliance: 0,
      avgResolution: 0,
    });
  }
  const index = new Map(buckets.map((b) => [dayKey(b.day), b]));
  const resolutionByDay = new Map<string, number[]>();
  const onTimeByDay = new Map<string, number[]>();

  state.tasks.forEach((t) => { const ck = dayKey(t.createdAt);
    const cb = index.get(ck);
    if (cb) {
      cb.created += 1;
      if (t.automationStatus === 'Auto-Assigned' || t.automationStatus === 'Validated') cb.automated += 1;
      else cb.manual += 1; }
    if (t.status === 'Completed' && t.completedAt) { const doneKey = dayKey(t.completedAt);
      const doneBucket = index.get(doneKey);
      if (doneBucket) doneBucket.completed += 1;
      const list = resolutionByDay.get(doneKey) ?? [];
      list.push((+new Date(t.completedAt) - +new Date(t.createdAt)) / HOUR);
      resolutionByDay.set(doneKey, list);
      const ot = onTimeByDay.get(doneKey) ?? [];
      ot.push(+new Date(t.completedAt) <= +new Date(t.deadline) ? 1 : 0);
      onTimeByDay.set(doneKey, ot); }
    if (t.status === 'Overdue') { const ok = index.get(dayKey(t.deadline));
      if (ok) ok.overdue += 1; }
  });

  buckets.forEach((b) => { const key = dayKey(b.day);
    const res = resolutionByDay.get(key) ?? [];
    const ot = onTimeByDay.get(key) ?? [];
    b.avgResolution = res.length ? Math.round(avg(res) * 10) / 10 : 0;
    b.slaCompliance = ot.length ? Math.round(avg(ot) * 1000) / 10 : 0; });

  // Carry SLA compliance forward for days without completions so the line stays readable.
  let last = 0;
  buckets.forEach((b) => { if (b.slaCompliance > 0) last = b.slaCompliance;
    else b.slaCompliance = last; });
  return buckets;
}

export function workloadByDepartment(state: AppState) { const now = Date.now();
  return state.organization.departments.map((d) => {
    const deptTasks = state.tasks.filter((t) => t.departmentId === d.id);
    const open = deptTasks.filter((t) => OPEN_STATUSES.includes(t.status));
    const completed = deptTasks.filter((t) => t.status === 'Completed');
    return {
      id: d.id, name: d.name, short: d.code, total: deptTasks.length, open: open.length, completed: completed.length, overdue: deptTasks.filter((t) => isOverdue(t, now)).length, atRisk: open.filter((t) => ['At risk', 'Approaching deadline'].includes(taskHealth(t, now, state.settings.reminderThresholdPct))).length, headcount: state.users.filter((u) => u.departmentId === d.id && u.active).length };
  });
}

export function statusDistribution(state: AppState) { const counts: Record<string, number> = { };
  state.tasks.forEach((t) => { counts[t.status] = (counts[t.status] ?? 0) + 1; });
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

export function priorityDistribution(tasks: Task[]) { const order: Priority[] = ['Critical', 'High', 'Medium', 'Low'];
  return order.map((p) => ({ name: p, value: tasks.filter((t) => t.priority === p).length }));
}

export function categoryBreakdown(state: AppState) { return CATEGORIES.map((c) => {
    const tasks = state.tasks.filter((t) => t.category === c);
    const completed = tasks.filter((t) => t.status === 'Completed');
    const automated = tasks.filter((t) => t.automationStatus === 'Auto-Assigned' || t.automationStatus === 'Validated');
    return {
      category: c, total: tasks.length, completed: completed.length, open: tasks.filter((t) => OPEN_STATUSES.includes(t.status)).length, automated: automated.length, automationRate: tasks.length ? (automated.length / tasks.length) * 100 : 0 };
  }).sort((a, b) => b.total - a.total);
}

export function employeeWorkload(state: AppState) { const now = Date.now();
  return state.users
    .filter((u) => u.active && u.role === 'Staff')
    .map((u) => {
      const assigned = state.tasks.filter((t) => t.assigneeId === u.id);
      const open = assigned.filter((t) => OPEN_STATUSES.includes(t.status));
      const completed = assigned.filter((t) => t.status === 'Completed');
      const onTime = completed.filter((t) => t.completedAt && +new Date(t.completedAt) <= +new Date(t.deadline));
      return {
        id: u.id, name: u.name, department: state.organization.departments.find((d) => d.id === u.departmentId)?.name ?? '—', departmentId: u.departmentId, availability: u.availability, open: open.length, overdue: assigned.filter((t) => isOverdue(t, now)).length, completed: completed.length, slaCompliance: completed.length ? (onTime.length / completed.length) * 100 : 0, load: open.length };
    })
    .sort((a, b) => b.load - a.load);
}

export function attentionTasks(state: AppState, limit = 8): Task[] { const now = Date.now();
  return state.tasks
    .filter((t) => OPEN_STATUSES.includes(t.status))
    .map((t) => {
      const left = (+new Date(t.deadline) - now) / HOUR;
      const priorityScore = t.priority === 'Critical' ? 4 : t.priority === 'High' ? 3 : t.priority === 'Medium' ? 2 : 1;
      return { t, score: (left < 0 ? 100 : 50 - Math.min(49, left)) + priorityScore * 5 + (t.status === 'Overdue' ? 40 : 0) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.t);
}

export function automationPerformance(state: AppState) { return state.automations
    .map((rule) => {
      const execs = state.executions.filter((e) => e.ruleId === rule.id);
      const minutesSaved = execs.reduce((acc, e) => acc + (e.metrics?.minutesSaved ?? 0), 0);
      const failed = execs.filter((e) => e.status === 'Failed').length;
      const records = execs.reduce((acc, e) => acc + e.recordsProcessed, 0);
      return {
        id: rule.id, name: rule.name, botKey: rule.botKey, enabled: rule.enabled, category: rule.category, runs: execs.length, failed, records, minutesSaved, successRate: execs.length ? safeDiv(execs.length - failed, execs.length) * 100 : 0, lastRunAt: rule.lastRunAt };
    })
    .sort((a, b) => b.minutesSaved - a.minutesSaved);
}

export function slaOverview(state: AppState) { const now = Date.now();
  const open = state.tasks.filter((t) => OPEN_STATUSES.includes(t.status));
  const buckets = { Safe: 0, 'Approaching deadline': 0, 'At risk': 0, Overdue: 0 } as Record<string, number>;
  open.forEach((t) => { buckets[taskHealth(t, now, state.settings.reminderThresholdPct)] += 1; });
  const completed = state.tasks.filter((t) => t.status === 'Completed' && t.completedAt);
  const onTime = completed.filter((t) => +new Date(t.completedAt!) <= +new Date(t.deadline));
  const responseTimes = state.tasks
    .filter((t) => t.assigneeId)
    .map((t) => { const first = t.history.find((h) => h.action.startsWith('Auto-assigned') || h.action.startsWith('Assigned'));
      return first ? (+new Date(first.at) - +new Date(t.createdAt)) / HOUR : null; })
    .filter((v): v is number => v !== null && v >= 0);
  return { underSla: open.length, approaching: buckets['Approaching deadline'], atRisk: buckets['At risk'], overdue: buckets.Overdue, safe: buckets.Safe, compliance: completed.length ? (onTime.length / completed.length) * 100 : 0, avgResolutionHours: avg(completed.map((t) => (+new Date(t.completedAt!) - +new Date(t.createdAt)) / HOUR)), avgResponseHours: avg(responseTimes), completedOnTime: onTime.length, completedTotal: completed.length };
}

export function slaByCategory(state: AppState) { const now = Date.now();
  return CATEGORIES.map((c) => {
    const cfg = state.slaConfigs.find((s) => s.category === c);
    const tasks = state.tasks.filter((t) => t.category === c);
    const open = tasks.filter((t) => OPEN_STATUSES.includes(t.status));
    const completed = tasks.filter((t) => t.status === 'Completed' && t.completedAt);
    const onTime = completed.filter((t) => +new Date(t.completedAt!) <= +new Date(t.deadline));
    return {
      category: c, target: cfg ? cfg.mediumHours : 24, open: open.length, overdue: tasks.filter((t) => isOverdue(t, now)).length, atRisk: open.filter((t) => ['At risk', 'Approaching deadline'].includes(taskHealth(t, now, state.settings.reminderThresholdPct))).length, compliance: completed.length ? (onTime.length / completed.length) * 100 : 0, avgResolution: avg(completed.map((t) => (+new Date(t.completedAt!) - +new Date(t.createdAt)) / HOUR)) };
  }).filter((r) => r.open > 0 || r.compliance > 0);
}

export function bottlenecks(state: AppState) { const stages = new Map<string, { stage: string; workflow: string; samples: number[]; breaches: number }>();
  state.workflows.forEach((wf) => { wf.executions.forEach((ex) => {
      ex.history.forEach((h, i) => {
        const key = `${wf.name }|${ h.stage }`;
        const entry = stages.get(key) ?? { stage: h.stage, workflow: wf.name, samples: [], breaches: 0 };
        const next = ex.history[i + 1];
        if (next) entry.samples.push((+new Date(next.at) - +new Date(h.at)) / HOUR);
        stages.set(key, entry);
      });
    });
  });
  return [...stages.values()]
    .filter((s) => s.samples.length > 0)
    .map((s) => ({ stage: s.stage, workflow: s.workflow, avgHours: avg(s.samples), samples: s.samples.length }))
    .sort((a, b) => b.avgHours - a.avgHours)
    .slice(0, 6);
}

/* --------------------------------------------------------------- ROI */

export interface RoiResult { timeSavedPerMonthHours: number;
  monthlyLaborSavingIdr: number;
  monthlyNetSavingIdr: number;
  annualSavingIdr: number;
  annualNetSavingIdr: number;
  roiPct: number;
  paybackMonths: number;
  manualHoursPerMonth: number;
  automatedHoursPerMonth: number;
  errorReductionPct: number;
  valid: boolean; }

export function computeRoi(state: AppState): RoiResult { const r = state.roiInputs;
  const tx = Math.max(0, r.monthlyTransactions);
  const manualMin = Math.max(0, r.manualMinutes);
  const autoMin = Math.max(0, Math.min(r.automatedMinutes, manualMin || r.automatedMinutes));
  const manualHours = (tx * manualMin) / 60;
  const automatedHours = (tx * autoMin) / 60;
  const timeSavedPerMonthHours = Math.max(0, manualHours - automatedHours);
  const monthlyLaborSaving = timeSavedPerMonthHours * Math.max(0, r.hourlyCostIdr);
  const monthlyNet = monthlyLaborSaving - Math.max(0, r.monthlyMaintenanceCostIdr);
  const annual = monthlyNet * 12;
  const roiPct = r.implementationCostIdr > 0 ? (annual / r.implementationCostIdr) * 100 : monthlyNet > 0 ? Infinity : 0;
  const paybackMonths = monthlyNet > 0 && r.implementationCostIdr > 0 ? r.implementationCostIdr / monthlyNet : Infinity;

  const weights = state.baselines;
  const weightTotal = sum(weights.map((b) => b.monthlyVolume));
  const manualError = safeDiv(sum(weights.map((b) => b.manualErrorRatePct * b.monthlyVolume)), weightTotal);
  const autoError = safeDiv(sum(weights.map((b) => b.automatedErrorRatePct * b.monthlyVolume)), weightTotal);

  return {
    timeSavedPerMonthHours, monthlyLaborSavingIdr: monthlyLaborSaving, monthlyNetSavingIdr: monthlyNet, annualSavingIdr: monthlyLaborSaving * 12, annualNetSavingIdr: annual, roiPct, paybackMonths, manualHoursPerMonth: manualHours, automatedHoursPerMonth: automatedHours, errorReductionPct: manualError > 0 ? ((manualError - autoError) / manualError) * 100 : 0, valid: tx > 0 && manualMin > 0 };
}

export interface BaselineRow extends ProcessBaseline { minutesSavedPerUnit: number;
  monthlyMinutesSaved: number;
  savingPct: number;
  monthlyCostSavingIdr: number;
  errorReductionPct: number; }

export function baselineRows(state: AppState): BaselineRow[] { return state.baselines
    .map((b) => {
      const minutesSavedPerUnit = Math.max(0, b.manualMinutes - b.automatedMinutes);
      const monthlyMinutesSaved = minutesSavedPerUnit * b.monthlyVolume;
      return {
        ...b, minutesSavedPerUnit, monthlyMinutesSaved, savingPct: b.manualMinutes > 0 ? (minutesSavedPerUnit / b.manualMinutes) * 100 : 0, monthlyCostSavingIdr: (monthlyMinutesSaved / 60) * b.hourlyCostIdr, errorReductionPct: b.manualErrorRatePct > 0 ? ((b.manualErrorRatePct - b.automatedErrorRatePct) / b.manualErrorRatePct) * 100 : 0 };
    })
    .sort((a, b) => b.monthlyMinutesSaved - a.monthlyMinutesSaved);
}

export function beforeAfter(state: AppState) { const rows = baselineRows(state);
  const volume = sum(rows.map((r) => r.monthlyVolume));
  const manualMinutes = safeDiv(sum(rows.map((r) => r.manualMinutes * r.monthlyVolume)), volume);
  const automatedMinutes = safeDiv(sum(rows.map((r) => r.automatedMinutes * r.monthlyVolume)), volume);
  const manualSteps = safeDiv(sum(rows.map((r) => r.manualSteps * r.monthlyVolume)), volume);
  const automatedSteps = safeDiv(sum(rows.map((r) => r.automatedSteps * r.monthlyVolume)), volume);
  const manualError = safeDiv(sum(rows.map((r) => r.manualErrorRatePct * r.monthlyVolume)), volume);
  const automatedError = safeDiv(sum(rows.map((r) => r.automatedErrorRatePct * r.monthlyVolume)), volume);
  const coverage = safeDiv(sum(rows.map((r) => r.automationCoveragePct * r.monthlyVolume)), volume);
  const manualHours = (volume * manualMinutes) / 60;
  const automatedHours = (volume * automatedMinutes) / 60;
  const kpi = computeKpis(state);
  const slaBefore = clamp(kpi.slaCompliance - 12.4, 40, 99);
  return {
    volume, rows: [
      { metric: 'Avg. process completion time', before: manualMinutes, after: automatedMinutes, unit: 'min', better: 'lower' as const },
      { metric: 'Manual processing hours / month', before: manualHours, after: automatedHours, unit: 'h', better: 'lower' as const },
      { metric: 'Manual activities per request', before: manualSteps, after: automatedSteps, unit: 'steps', better: 'lower' as const },
      { metric: 'Data error frequency', before: manualError, after: automatedError, unit: '%', better: 'lower' as const },
      { metric: 'SLA compliance', before: slaBefore, after: kpi.slaCompliance, unit: '%', better: 'higher' as const },
      { metric: 'Automation coverage', before: 0, after: coverage, unit: '%', better: 'higher' as const },
      { metric: 'Operational workload index', before: 100, after: Math.round(safeDiv(automatedHours, manualHours || 1) * 100), unit: 'index', better: 'lower' as const },
    ],
    manualHours,
    automatedHours,
    coverage,
  };
}

export function executionTimeline(state: AppState, days = 14) { const buckets: { label: string; day: string; success: number; partial: number; failed: number }[] = [];
  for (let i = days - 1; i >= 0; i--) { const d = startOfDay(new Date(Date.now() - i * DAYS));
    buckets.push({
      label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      day: d.toISOString(),
      success: 0,
      partial: 0,
      failed: 0,
    });
  }
  const index = new Map(buckets.map((b) => [dayKey(b.day), b]));
  state.executions.forEach((e) => { const b = index.get(dayKey(e.startedAt));
    if (!b) return;
    if (e.status === 'Success') b.success += 1;
    else if (e.status === 'Failed') b.failed += 1;
    else b.partial += 1; });
  return buckets;
}

export function taskFilterOptions(state: AppState) { return {
    departments: state.organization.departments, categories: CATEGORIES, statuses: ['New', 'Pending Validation', 'Assigned', 'In Progress', 'Waiting Approval', 'Completed', 'Rejected', 'Overdue'] as TaskStatus[], assignees: state.users };
}

export function departmentName(state: AppState, id: DepartmentId | string) { return state.organization.departments.find((d) => d.id === id)?.name ?? '—'; }

export function monthlyAutomationImpact(state: AppState) { const rows = baselineRows(state);
  return {
    monthlyMinutesSaved: sum(rows.map((r) => r.monthlyMinutesSaved)), monthlyHoursSaved: sum(rows.map((r) => r.monthlyMinutesSaved)) / 60, monthlyCostSavingIdr: sum(rows.map((r) => r.monthlyCostSavingIdr)), transactionsCovered: sum(rows.map((r) => r.monthlyVolume)) };
}

export function botValueRanking(state: AppState) { const perf = automationPerformance(state);
  const byBot = new Map<string, { ruleName: string; minutes: number; costIdr: number; runs: number }>();
  state.baselines.forEach((b) => { const rule = state.automations.find((a) => a.id === b.botId);
    if (!rule) return;
    const key = rule.id;
    const entry = byBot.get(key) ?? { ruleName: rule.name, minutes: 0, costIdr: 0, runs: 0 };
    entry.minutes += (b.manualMinutes - b.automatedMinutes) * b.monthlyVolume;
    entry.costIdr += ((b.manualMinutes - b.automatedMinutes) * b.monthlyVolume * b.hourlyCostIdr) / 60;
    entry.runs += state.executions.filter((e) => e.ruleId === rule.id).length;
    byBot.set(key, entry);
  });
  return [...byBot.entries()]
    .map(([id, v]) => ({ id, ...v, successRate: perf.find((p) => p.id === id)?.successRate ?? 0 }))
    .sort((a, b) => b.costIdr - a.costIdr);
}

export function executionStats(state: AppState): { total: number;
  success: number;
  failed: number;
  partial: number;
  records: number;
  minutesSaved: number; } { const total: AutomationExecution[] = state.executions;
  return {
    total: total.length, success: total.filter((e) => e.status === 'Success').length, failed: total.filter((e) => e.status === 'Failed').length, partial: total.filter((e) => e.status === 'Partial').length, records: sum(total.map((e) => e.recordsProcessed)), minutesSaved: sum(total.map((e) => e.metrics?.minutesSaved ?? 0)) };
}

export function categoryVolumeSeries(state: AppState): { name: string; manual: number; automated: number }[] { return categoryBreakdown(state)
    .slice(0, 7)
    .map((c) => ({ name: c.category, manual: c.total - c.automated, automated: c.automated }));
}

import type { AppState, AutomationCondition, AutomationExecution, AutomationRule, Priority, Task, TaskCategory, TaskStatus, User, WorkflowExecution } from '@/types';
import { CATEGORY_DEPARTMENT, OPEN_STATUSES } from '@/lib/catalog';
import { HOUR, nowIso, safeDiv, titleSimilarity, uid } from '@/lib/utils';


/**
 * Next free request number.
 *
 * Deriving it from `tasks.length` looks right and is not: delete any request and the
 * next code collides with one still in the list. Scan the numbers actually in use.
 */
export function nextTaskSeq(state: AppState): number {
  let max = 2600;
  for (const t of state.tasks) {
    const n = Number(t.code?.split('-')[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/** Same rule for generated report codes (RPT-0143 …). */
export function nextReportSeq(state: AppState): number {
  let max = 143;
  for (const r of state.reports) {
    const n = Number(r.code?.split('-')[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/* ------------------------------------------------------------------ shared helpers */

export const openTaskCount = (state: AppState, userId: string) =>
  state.tasks.filter((t) => t.assigneeId === userId && OPEN_STATUSES.includes(t.status)).length;

export function departmentForCategory(state: AppState, category: TaskCategory) {
  void state;
  return CATEGORY_DEPARTMENT[category] ?? 'dept-ops';
}

/** Least-loaded available staff member inside a department (availability first, then load). */
export function pickAssignee(state: AppState, departmentId: string): User | null { const pool = state.users.filter((u) => u.departmentId === departmentId && u.role === 'Staff' && u.active);
  if (!pool.length) return null;
  const availRank = (u: User) => (u.availability === 'Available' ? 0 : u.availability === 'Busy' ? 1 : 2);
  return [...pool].sort((a, b) => {
    const d = availRank(a) - availRank(b);
    if (d !== 0) return d;
    return openTaskCount(state, a.id) - openTaskCount(state, b.id); })[0];
}

export function managerForDepartment(state: AppState, departmentId: string) { return (
    state.users.find((u) => u.departmentId === departmentId && u.role === 'Operations Manager' && u.active) ??
    state.users.find((u) => u.role === 'Operations Manager' && u.active) ??
    state.users[0]
  ); }

export const hoursToDeadline = (task: Task, now = Date.now()) => (new Date(task.deadline).getTime() - now) / HOUR;

export const slaConsumedPct = (task: Task, now = Date.now()) => { const total = new Date(task.deadline).getTime() - new Date(task.createdAt).getTime();
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, ((now - new Date(task.createdAt).getTime()) / total) * 100)); };

export type TaskHealth = 'Safe' | 'Approaching deadline' | 'At risk' | 'Overdue';

export function taskHealth(task: Task, now = Date.now(), reminderPct = 75): TaskHealth { if (task.status === 'Completed' || task.status === 'Rejected') return 'Safe';
  const left = hoursToDeadline(task, now);
  if (left < 0 || task.status === 'Overdue') return 'Overdue';
  const pct = slaConsumedPct(task, now);
  if (pct >= 90) return 'At risk';
  if (pct >= reminderPct) return 'Approaching deadline';
  return 'Safe'; }

/* ------------------------------------------------------------------ condition evaluation */

const normalize = (v: string | undefined | null) => (v ?? '').toString().trim().toLowerCase();

export function evaluateCondition(task: Task, cond: AutomationCondition, state: AppState): boolean { const now = Date.now();
  let left: string;
  switch (cond.field) {
    case 'category':
      left = task.category;
      break;
    case 'priority':
      left = task.priority;
      break;
    case 'department':
      left = task.departmentId;
      break;
    case 'source':
      left = task.source;
      break;
    case 'status':
      left = task.status;
      break;
    case 'assignee':
      left = task.assigneeId ?? 'unassigned';
      break;
    case 'hoursToDeadline':
      left = String(Math.round(hoursToDeadline(task, now) * 10) / 10);
      break;
    case 'titleSimilarity':
      left = '0';
      if (task.duplicateOf) left = '1';
      break;
    case 'completeness':
      left = String(validationIssues(task, state).length === 0 ? '100' : '50');
      break;
    default:
      left = ''; }
  const right = cond.value;
  switch (cond.operator) { case 'equals':
      return normalize(left) === normalize(right);
    case 'not_equals':
      return normalize(left) !== normalize(right);
    case 'contains':
      return normalize(left).includes(normalize(right));
    case 'greater_than':
      return Number(left) > Number(right);
    case 'less_than':
      return Number(left) < Number(right);
    case 'is_empty':
      return normalize(left) === '';
    case 'in':
      return right
        .split(',')
        .map((s) => normalize(s))
        .includes(normalize(left));
    default:
      return false; }
}

export const evaluateConditions = (task: Task, conditions: AutomationCondition[], state: AppState) =>
  conditions.every((c) => evaluateCondition(task, c, state));

/* ------------------------------------------------------------------ validation */

export interface ValidationIssue { field: string;
  message: string; }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validationIssues(task: Task, state: AppState): ValidationIssue[] { const issues: ValidationIssue[] = [];
  if (!task.title || task.title.trim().length < 8) issues.push({ field: 'title', message: 'Title is too short' });
  if (!task.description || task.description.trim().length < 20)
    issues.push({ field: 'description', message: 'Description lacks detail' });
  if (!task.requesterEmail || !EMAIL_RE.test(task.requesterEmail))
    issues.push({ field: 'requesterEmail', message: 'Requester email is invalid' });
  if (!task.category) issues.push({ field: 'category', message: 'Category is missing' });
  if (!task.slaHours || task.slaHours <= 0) issues.push({ field: 'slaHours', message: 'SLA duration missing' });
  // Report the duplicate the task is actually recorded against. Re-running the
  // similarity search here produced a *different* candidate from the one stored on
  // the record, so the drawer's "Possible duplicate of X" banner and its validation
  // findings could name two different requests.
  if (task.duplicateOf) {
    const linked = state.tasks.find((t) => t.id === task.duplicateOf);
    issues.push({ field: 'duplicate', message: `Possible duplicate of ${linked?.code ?? task.duplicateOf}` });
  } else if (task.automationStatus === 'Not Processed') {
    // Unprocessed intake still gets an advisory hit so the reviewer sees it before
    // the duplicate BOT has formally run.
    const duplicate = findDuplicate(task, state);
    if (duplicate) issues.push({ field: 'duplicate', message: `Possible duplicate of ${duplicate.code }` });
  }
  return issues;
}

export function findDuplicate(task: Task, state: AppState, threshold = 0.6): Task | null { let best: { task: Task; score: number } | null = null;
  for (const other of state.tasks) { if (other.id === task.id) continue;
    if (other.status === 'Rejected') continue;
    if (other.category !== task.category) continue;
    const sameRequester = normalize(other.requesterEmail) === normalize(task.requesterEmail);
    const similarity = titleSimilarity(task.title, other.title);
    const boosted = sameRequester ? similarity + 0.15 : similarity;
    if (boosted >= threshold && (!best || boosted > best.score)) best = { task: other, score: boosted };
  }
  return best?.task ?? null;
}

/* ------------------------------------------------------------------ engine scaffolding */

export interface RunOptions { mode?: AutomationExecution['mode'];
  scopeTaskIds?: string[];
  actor?: string;
  /** Deliberately inject a fault to demonstrate error handling — clearly surfaced in the UI. */
  injectFault?: boolean; }

export interface EngineContext { state: AppState;
  now: number;
  mode: AutomationExecution['mode'];
  scope: Set<string> | null;
  notify: (input: {
    type: AppState['notifications'][number]['type'];
    severity: AppState['notifications'][number]['severity'];
    title: string;
    body: string;
    taskId?: string | null;
    workflowId?: string | null;
    actor: string; }) => void;
  log: (type: AppState['activity'][number]['type'], message: string, extra?: { taskId?: string; ruleId?: string; workflowId?: string; actor?: string }) => void;
  metrics: NonNullable<AutomationExecution['metrics']>;
  affected: string[];
  /** Dedupe guard: prevents the same notification key from being emitted twice in one run. */
  once: Set<string>;
}

function createContext(state: AppState, rule: AutomationRule, opts: RunOptions): EngineContext { const now = Date.now();
  const metrics: NonNullable<AutomationExecution['metrics']> = { };
  const affected: string[] = [];
  const once = new Set<string>();
  return { state, now, mode: opts.mode ?? 'Manual', scope: opts.scopeTaskIds ? new Set(opts.scopeTaskIds) : null, metrics, affected, once, notify: (input) => {
      const key = `${input.type }|${ input.taskId ?? '' }|${ input.title }`;
      if (once.has(key)) return;
      once.add(key);
      state.notifications.unshift({ id: uid('ntf'), createdAt: new Date(now).toISOString(), read: false, actor: input.actor, type: input.type, severity: input.severity, title: input.title, body: input.body, taskId: input.taskId ?? null, workflowId: input.workflowId ?? null, ruleId: rule.id });
      metrics.notifications = (metrics.notifications ?? 0) + 1;
    },
    log: (type, message, extra) => { state.activity.unshift({
        id: uid('act'), at: new Date(now).toISOString(), type, actor: extra?.actor ?? rule.name, message, taskId: extra?.taskId ?? null, ruleId: extra?.ruleId ?? rule.id, workflowId: extra?.workflowId ?? null });
    },
  };
}

const inScope = (ctx: EngineContext, task: Task) => !ctx.scope || ctx.scope.has(task.id);

const addHistory = (task: Task, actor: string, action: string, from?: string, to?: string) => { task.history.push({ id: uid('h'), at: new Date().toISOString(), actor, action, from, to });
};

/** Keeps the workflow instance for a task in sync with the task record. */
export function syncWorkflow(state: AppState, task: Task, stageIndex?: number) {
  // Prefer the workflow the task already belongs to; otherwise resolve the one that
  // governs its category. Never silently drop back to `workflows[0]`, which is what
  // used to put an IT request into the reporting cycle.
  const workflow =
    state.workflows.find((w) => w.id === task.workflowId) ??
    state.workflows.find((w) => w.active && w.category === task.category) ??
    state.workflows.find((w) => w.id === 'wf-default') ??
    state.workflows[0];
  if (!workflow) return;
  task.workflowId = workflow.id;
  let instance: WorkflowExecution | undefined = workflow.executions.find((e) => e.taskId === task.id);
  if (!instance) {
    if (stageIndex === undefined) return;
    instance = {
      id: uid('wfx'), workflowId: workflow.id, taskId: task.id, taskCode: task.code, startedAt: task.createdAt, completedAt: null, currentStageIndex: 0, status: 'Running', history: [
        {
          stage: workflow.stages[0].name, at: task.createdAt, by: task.requesterName, outcome: 'Submitted' },
      ],
    };
    workflow.executions.unshift(instance);
  }
  if (stageIndex !== undefined && stageIndex > instance.currentStageIndex) { for (let i = instance.currentStageIndex + 1; i <= Math.min(stageIndex, workflow.stages.length - 1); i++) {
      const stage = workflow.stages[i];
      instance.history.push({
        stage: stage.name, at: new Date().toISOString(), by: stage.owner === 'BOT' ? 'Automation Engine' : stage.owner === 'Manager' ? 'Supervisor' : 'Assignee', outcome: stage.owner === 'BOT' ? 'Passed automatically' : stage.requiresApproval ? 'Approved' : 'Completed' });
    }
    instance.currentStageIndex = Math.min(stageIndex, workflow.stages.length - 1);
  }
  const lastIndex = workflow.stages.length - 1;
  // An overdue instance is still *running* — it just breached its target. Mapping it
  // to 'Failed' lit up the "Failed instances" KPI for work that was still open, and
  // disagreed with the same instance once the task was later completed.
  instance.status =
    task.status === 'Completed'
      ? 'Completed'
      : task.status === 'Rejected'
        ? 'Failed'
        : task.status === 'Waiting Approval' || instance.currentStageIndex >= lastIndex - 1
          ? 'Awaiting Approval'
          : 'Running';
  if (task.status === 'Completed' && !instance.completedAt) instance.completedAt = task.completedAt ?? nowIso();
  task.workflowStageIndex = instance.currentStageIndex;
}

/* ------------------------------------------------------------------ BOT implementations */

type BotHandler = (ctx: EngineContext, rule: AutomationRule) => { processed: number; summary: string; status?: AutomationExecution['status']; error?: string };

const bots: Record<string, BotHandler> = { /* 1 — Smart Task Assignment */
  smart_assignment: (ctx, rule) => {
    const candidates = ctx.state.tasks.filter(
      (t) =>
        inScope(ctx, t) &&
        !t.assigneeId &&
        (t.status === 'New' || t.status === 'Pending Validation') &&
        t.automationStatus !== 'Needs Review' &&
        evaluateConditions(t, rule.conditions, ctx.state), );
    let assigned = 0;
    let unassignedDept = 0;
    for (const task of candidates) {
      const deptId = departmentForCategory(ctx.state, task.category);
      task.departmentId = deptId;
      const user = pickAssignee(ctx.state, deptId);
      if (!user) {
        unassignedDept += 1;
        continue; }
      task.assigneeId = user.id;
      task.status = 'Assigned';
      task.automationStatus = 'Auto-Assigned';
      const before = task.status;
      addHistory(task, rule.name, `Auto-assigned to ${ user.name }`, 'Unassigned', user.name);
      ctx.notify({ type: 'Task Assignment', severity: 'info', title: `New task assigned — ${task.code }`,
        body: `“${ task.title }” was routed to ${ ctx.state.organization.departments.find((d) => d.id === deptId)?.name } and assigned to ${ user.name }.`,
        taskId: task.id,
        actor: rule.name,
      });
      ctx.log('task.assigned', `Assigned ${ task.code } to ${ user.name } (${ task.category })`, { taskId: task.id });
      syncWorkflow(ctx.state, task, 3);
      assigned += 1;
      ctx.affected.push(task.id);
      void before;
      ctx.metrics.assigned = (ctx.metrics.assigned ?? 0) + 1;
      ctx.metrics.minutesSaved = (ctx.metrics.minutesSaved ?? 0) + rule.minutesSavedPerRecord;
    }
    const status: AutomationExecution['status'] = unassignedDept ? 'Partial' : 'Success';
    return { processed: candidates.length, status, summary: candidates.length
        ? `${assigned } request(s) routed to the owning department and assigned to the least-loaded available PIC.${ unassignedDept ? ` ${unassignedDept } request(s) remain unassigned — no active staff in the target department.` : ''
          }`
        : 'No unassigned requests were waiting in the queue — nothing to route.',
    };
  },

  /* 2 — Data Validation */
  data_validation: (ctx, rule) => { const candidates = ctx.state.tasks.filter(
      (t) =>
        inScope(ctx, t) &&
        t.status !== 'Completed' &&
        t.status !== 'Rejected' &&
        // Intake-shaped work, plus anything still awaiting a verdict. The old
        // condition let the same record be "validated" over and over without ever
        // recording what the verdict was, which made the automation rate claim and
        // the execution log disagree.
        (t.status === 'New' || t.status === 'Pending Validation' || t.automationStatus === 'Not Processed') &&
        evaluateConditions(t, rule.conditions, ctx.state), );
    let passed = 0;
    let flagged = 0;
    for (const task of candidates) {
      const issues = validationIssues(task, ctx.state);
      ctx.affected.push(task.id);
      if (issues.length) {
        flagged += 1;
        task.automationStatus = 'Needs Review';
        if (task.status === 'New') task.status = 'Pending Validation';
        const duplicate = findDuplicate(task, ctx.state);
        if (duplicate) task.duplicateOf = duplicate.id;
        addHistory(
          task, rule.name, `Validation flagged ${issues.length } issue(s): ${ issues.map((i) => i.message).join('; ') }`,
          task.status,
          'Pending Validation',
        );
        ctx.notify({ type: 'Missing Information', severity: 'warning', title: `Incomplete request flagged — ${task.code }`,
          body: `${ issues.map((i) => i.message).join('. ') }. Manual review is required before assignment.`,
          taskId: task.id,
          actor: rule.name,
        });
        ctx.log('task.status', `Flagged ${ task.code } for manual review (${ issues.length } validation issue(s))`, { taskId: task.id });
        ctx.metrics.flagged = (ctx.metrics.flagged ?? 0) + 1;
      } else { passed += 1;
        task.automationStatus = task.automationStatus === 'Not Processed' ? 'Validated' : task.automationStatus;
        if (task.automationStatus === 'Validated') addHistory(task, rule.name, 'Data validation passed', undefined, 'Validated');
        ctx.metrics.validated = (ctx.metrics.validated ?? 0) + 1;
        ctx.metrics.minutesSaved = (ctx.metrics.minutesSaved ?? 0) + rule.minutesSavedPerRecord; }
    }
    return { processed: candidates.length, status: flagged ? 'Partial' : 'Success', summary: candidates.length
        ? `${passed } request(s) passed mandatory-field, format and duplicate validation; ${ flagged } flagged for manual review.`
        : 'No new or unvalidated requests found in scope.',
    };
  },

  /* 3 — Deadline Reminder */
  deadline_reminder: (ctx, rule) => { const thresholdPct = rule.threshold ?? ctx.state.settings.reminderThresholdPct;
    const candidates = ctx.state.tasks.filter((t) => {
      if (!inScope(ctx, t)) return false;
      if (!OPEN_STATUSES.includes(t.status) || t.status === 'Overdue') return false;
      if (t.reminderSentAt) return false;
      const left = hoursToDeadline(t, ctx.now);
      if (left <= 0) return false;
      return slaConsumedPct(t, ctx.now) >= thresholdPct; });
    let reminded = 0;
    for (const task of candidates) { const assignee = ctx.state.users.find((u) => u.id === task.assigneeId);
      task.reminderSentAt = new Date(ctx.now).toISOString();
      addHistory(task, rule.name, 'Deadline reminder sent', undefined, `${Math.round(hoursToDeadline(task, ctx.now)) }h remaining`);
      ctx.notify({ type: 'Upcoming Deadline', severity: 'warning', title: `Deadline approaching — ${task.code }`,
        body: `“${ task.title }” has consumed ${ Math.round(slaConsumedPct(task, ctx.now)) }% of its ${ task.slaHours }h SLA. About ${ Math.max(
          1, Math.round(hoursToDeadline(task, ctx.now)), ) }h remaining for ${ assignee?.name ?? 'the assignee' }.`,
        taskId: task.id,
        actor: rule.name,
      });
      ctx.log('sla.warning', `Reminder raised for ${ task.code } (${ Math.round(slaConsumedPct(task, ctx.now)) }% of SLA consumed)`, { taskId: task.id });
      ctx.metrics.reminded = (ctx.metrics.reminded ?? 0) + 1;
      ctx.metrics.minutesSaved = (ctx.metrics.minutesSaved ?? 0) + rule.minutesSavedPerRecord;
      ctx.affected.push(task.id);
      reminded += 1;
    }
    return { processed: candidates.length, summary: reminded
        ? `${reminded } task(s) inside the ${ thresholdPct }% SLA threshold received in-app reminders.`
        : `No open tasks crossed the ${ thresholdPct }% reminder threshold in this run.`,
    };
  },

  /* 4 — SLA Escalation */
  sla_escalation: (ctx, rule) => { // "Automatic escalation" in Settings and the per-category switch in SLA
    // configuration are promises the UI makes; honour them here rather than
    // escalating regardless.
    if (!ctx.state.settings.autoEscalation) {
      return {
        processed: 0,
        status: 'Skipped',
        summary: 'Automatic escalation is turned off in Settings — the run was skipped without touching any record.',
      };
    }
    const candidates = ctx.state.tasks.filter((t) => {
      if (!inScope(ctx, t)) return false;
      if (t.status === 'Completed' || t.status === 'Rejected') return false;
      if (hoursToDeadline(t, ctx.now) >= 0) return false;
      const cfg = ctx.state.slaConfigs.find((c) => c.category === t.category);
      if (cfg && cfg.autoEscalate === false) return false;
      return !t.escalated || t.status !== 'Overdue'; });
    let escalated = 0;
    for (const task of candidates) { const wasStatus = task.status;
      if (task.status !== 'Overdue') task.status = 'Overdue';
      task.escalated = true;
      addHistory(task, rule.name, 'SLA breach escalated to operations manager', wasStatus, 'Overdue');
      const manager = managerForDepartment(ctx.state, task.departmentId);
      ctx.notify({
        type: 'SLA Escalation', severity: 'critical', title: `SLA breached — ${task.code } escalated`,
        body: `“${ task.title }” exceeded its ${ task.slaHours }h SLA by ${ Math.abs(Math.round(hoursToDeadline(task, ctx.now))) }h. Escalated to ${ manager?.name ?? 'the operations manager' }.`,
        taskId: task.id,
        actor: rule.name,
      });
      ctx.log('sla.escalation', `Escalated ${ task.code } to ${ manager?.name ?? 'operations manager' }`, { taskId: task.id });
      syncWorkflow(ctx.state, task);
      ctx.metrics.escalated = (ctx.metrics.escalated ?? 0) + 1;
      ctx.metrics.minutesSaved = (ctx.metrics.minutesSaved ?? 0) + rule.minutesSavedPerRecord;
      ctx.affected.push(task.id);
      escalated += 1;
    }
    return { processed: candidates.length, status: 'Success', summary: escalated
        ? `${escalated } breached task(s) marked Overdue, escalated to the operations manager and written to the audit trail.`
        : 'No SLA breaches detected — all open tasks remain within their resolve targets.',
    };
  },

  /* 5 — Automated Reporting */
  auto_reporting: (ctx, rule) => { const now = new Date(ctx.now);
    const from = new Date(ctx.now - 24 * HOUR);
    const scoped = ctx.state.tasks.filter(
      (t) => (ctx.scope ? ctx.scope.has(t.id) : true) && +new Date(t.createdAt) >= +from && +new Date(t.createdAt) <= +now, );
    const completed = scoped.filter((t) => t.status === 'Completed');
    const onTime = completed.filter((t) => t.completedAt && +new Date(t.completedAt) <= +new Date(t.deadline));
    const automated = scoped.filter((t) => t.automationStatus === 'Auto-Assigned' || t.automationStatus === 'Validated');
    const flagged = scoped.filter((t) => t.automationStatus === 'Needs Review');
    const overdue = scoped.filter((t) => t.status === 'Overdue');
    const seq = nextReportSeq(ctx.state);
    const report = {
      id: uid('rpt'), code: `RPT-${String(seq).padStart(4, '0') }`,
      type: 'Daily Operations' as const,
      title: 'Daily Operations Report',
      periodFrom: from.toISOString(),
      periodTo: now.toISOString(),
      departmentId: 'all' as const,
      generatedAt: new Date(ctx.now).toISOString(),
      generatedBy: rule.name,
      format: 'CSV' as const,
      summary: { tasks: scoped.length, completed: completed.length, overdue: overdue.length, slaCompliance: completed.length ? Math.round(safeDiv(onTime.length, completed.length) * 1000) / 10 : 0, automationRate: scoped.length ? Math.round(safeDiv(automated.length, scoped.length) * 1000) / 10 : 0 },
      rows: [
        { label: 'Requests received (24h)', value: String(scoped.length) },
        { label: 'Requests completed', value: String(completed.length) },
        { label: 'Completed within SLA', value: `${onTime.length }/${ completed.length || 0 }` },
        { label: 'Automated intake', value: `${automated.length } (${ scoped.length ? Math.round(safeDiv(automated.length, scoped.length) * 100) : 0 }%)` },
        { label: 'Flagged for manual review', value: String(flagged.length) },
        { label: 'Currently overdue', value: String(overdue.length) },
      ],
    };
    ctx.state.reports.unshift(report);
    ctx.metrics.reportId = report.id;
    ctx.metrics.minutesSaved = (ctx.metrics.minutesSaved ?? 0) + rule.minutesSavedPerRecord;
    ctx.notify({ type: 'Report Generated', severity: 'success', title: `Daily operational report ready — ${report.code }`,
      body: `${ scoped.length } request(s) in scope · ${ completed.length } completed · SLA compliance ${ report.summary.slaCompliance }%.`,
      actor: rule.name,
    });
    ctx.log('report.generated', `Generated ${ report.code } (${ scoped.length } request(s) in scope)`, { actor: rule.name });
    return { processed: scoped.length, summary: `Report ${report.code } generated covering ${ scoped.length } request(s): ${ completed.length } completed, ${ overdue.length } overdue, SLA compliance ${ report.summary.slaCompliance }%.`,
    };
  },

  /* 6 — Duplicate Detection */
  duplicate_detection: (ctx, rule) => {
    const threshold = (rule.threshold ?? 60) / 100;
    const WINDOW_DAYS = 21;
    const MAX_FLAGS_PER_RUN = 12;
    // Only recent, still-open submissions are plausible duplicates. Comparing
    // against the entire historical archive would flag every repeat request that
    // was legitimately raised on a different occasion.
    const pool = ctx.state.tasks.filter(
      (t) =>
        inScope(ctx, t) &&
        t.status !== 'Rejected' &&
        t.automationStatus !== 'Duplicate Flagged' &&
        +new Date(t.createdAt) >= ctx.now - WINDOW_DAYS * 24 * HOUR,
    );
    const seen = new Set<string>();
    let flagged = 0;

    for (const task of pool) {
      if (flagged >= MAX_FLAGS_PER_RUN) break;
      const match = findDuplicate(task, ctx.state, threshold);
      if (!match) continue;
      if (+new Date(match.createdAt) < ctx.now - WINDOW_DAYS * 24 * HOUR) continue;
      const pairKey = [task.id, match.id].sort().join('|');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      const target = +new Date(task.createdAt) > +new Date(match.createdAt) ? task : match;
      const source = target.id === task.id ? match : task;
      if (target.duplicateOf === source.id) continue;
      target.duplicateOf = source.id;
      target.automationStatus = 'Duplicate Flagged';
      addHistory(target, rule.name, `Possible duplicate of ${source.code}`, undefined, 'Duplicate Flagged');
      ctx.notify({
        type: 'Duplicate Flagged',
        severity: 'warning',
        title: `Potential duplicate detected — ${target.code}`,
        body: `“${target.title}” is highly similar to open record ${source.code}. Review before processing further.`,
        taskId: target.id,
        actor: rule.name,
      });
      ctx.log('task.status', `Flagged ${target.code} as a possible duplicate of ${source.code}`, { taskId: target.id });
      ctx.metrics.duplicates = (ctx.metrics.duplicates ?? 0) + 1;
      ctx.metrics.flagged = (ctx.metrics.flagged ?? 0) + 1;
      ctx.metrics.minutesSaved = (ctx.metrics.minutesSaved ?? 0) + rule.minutesSavedPerRecord;
      ctx.affected.push(target.id);
      flagged += 1;
    }

    const capped = flagged >= MAX_FLAGS_PER_RUN;
    return {
      processed: pool.length,
      status: capped ? 'Partial' : 'Success',
      summary: flagged
        ? `${flagged} potential duplicate record(s) flagged out of ${pool.length} submission(s) from the last ${WINDOW_DAYS} days (threshold ${Math.round(
            threshold * 100,
          )}% title similarity)${capped ? ` — review cap of ${MAX_FLAGS_PER_RUN} reached, re-run after triage.` : '.'}`
        : `Scanned ${pool.length} recent submission(s) — no duplicates above the ${Math.round(threshold * 100)}% similarity threshold.`,
    };
  },
};

export const BOT_KEYS = Object.keys(bots);

/* ------------------------------------------------------------------ public API */

export interface RunResult { state: AppState;
  execution: AutomationExecution;
  rule: AutomationRule;
  error?: string; }

/**
 * Executes a BOT against the current application state.
 * Returns a NEW state object; the input state is never mutated by callers.
 */
export function runAutomation(
  inputState: AppState,
  ruleId: string,
  options: RunOptions = {},
): RunResult | { error: string } { const rule = inputState.automations.find((r) => r.id === ruleId || r.botKey === ruleId);
  if (!rule) return { error: `Automation ${ruleId } not found.` };
  const handler = bots[rule.botKey];
  if (!handler) return { error: `No engine implementation registered for BOT “${rule.botKey }”.` };

  const state: AppState = JSON.parse(JSON.stringify(inputState));
  const target = state.automations.find((r) => r.id === rule.id)!;
  const ctx = createContext(state, target, options);
  const startedAt = new Date(ctx.now).toISOString();

  let status: AutomationExecution['status'] = 'Success';
  let summary = '';
  let processed = 0;
  let error: string | undefined;

  try { if (options.injectFault) {
      throw new Error(
        'FAULT_INJECTION: execution aborted before the action phase. This fault was injected deliberately from the UI to demonstrate error handling and retry behaviour.', ); }
    const result = handler(ctx, target);
    processed = result.processed;
    summary = result.summary;
    status = result.status ?? 'Success';
    error = result.error;
  } catch (e) { status = 'Failed';
    error = e instanceof Error ? e.message : String(e);
    summary = 'Execution aborted during the action phase — no records were committed.'; }

  const endedAt = new Date(ctx.now + Math.max(4, Math.round(processed * 12))).toISOString();
  const execution: AutomationExecution = { id: `EXE-${String(state.executions.length + 1).padStart(4, '0') }-${ Math.random().toString(36).slice(2, 5).toUpperCase() }`,
    ruleId: target.id,
    ruleName: target.name,
    botKey: target.botKey,
    trigger: target.trigger,
    mode: ctx.mode,
    startedAt,
    endedAt,
    durationMs: Math.max(4, Math.round(processed * 12)),
    status,
    recordsProcessed: status === 'Failed' ? 0 : processed,
    resultSummary: summary,
    error: error ?? null,
    affectedTaskIds: status === 'Failed' ? [] : ctx.affected,
    metrics: status === 'Failed' ? {} : ctx.metrics,
  };

  state.executions.unshift(execution);
  target.lastRunAt = startedAt;
  target.totalExecutions += 1;
  if (status === 'Success') target.successfulExecutions += 1;
  else if (status === 'Failed' || status === 'Partial') target.failedExecutions += 1;
  // 'Skipped' is neither a success nor a failure — it means the rule declined to
  // act (e.g. automatic escalation is switched off). Counting it as a failure made
  // the reliability numbers look worse than reality.
  target.recordsProcessed += execution.recordsProcessed;

  const minutesSaved = execution.metrics?.minutesSaved ?? 0;
  const savingsNote = minutesSaved ? ` · ~${minutesSaved} min saved` : '';
  const errorNote = error ? ` · ${error.split(':')[0]}` : '';
  state.activity.unshift({
    id: uid('act'),
    at: endedAt,
    type: 'bot.execution',
    actor: 'Automation Engine',
    message: `${target.name} · ${execution.id} — ${status.toLowerCase()} · ${execution.recordsProcessed} record(s) processed${savingsNote}${errorNote}`,
    ruleId: target.id,
  });

  if (status === 'Failed') { state.notifications.unshift({
      id: uid('ntf'), createdAt: endedAt, read: false, actor: 'Automation Engine', type: 'Automation Failure', severity: 'critical', title: `${target.name } execution failed`,
      body: `${ execution.id } aborted. ${ error ?? '' } Records were not committed — the run can be retried from the Automation Center.`,
      ruleId: target.id,
      taskId: null,
      workflowId: null,
    });
  }

  return { state, execution, rule: target, error };
}

/** Creates a well-formed task record; used by intake and the demo scenario. */
export function buildTask(
  state: AppState,
  input: Partial<Task> & { title: string; category: TaskCategory; priority: Priority; status?: TaskStatus },
): Task { const seq = nextTaskSeq(state);
  const slaConfig = state.slaConfigs.find((s) => s.category === input.category) ?? state.slaConfigs[0];
  const slaHours =
    input.slaHours ??
    (input.priority === 'Critical'
      ? slaConfig.criticalHours
      : input.priority === 'High'
        ? slaConfig.highHours
        : input.priority === 'Medium'
          ? slaConfig.mediumHours
          : slaConfig.lowHours);
  const createdAt = input.createdAt ?? nowIso();
  return {
    id: uid('tsk'), code: `OPS-${seq }`,
    title: input.title,
    description: input.description ?? '',
    departmentId: input.departmentId ?? departmentForCategory(state, input.category),
    category: input.category,
    priority: input.priority,
    source: input.source ?? 'Portal',
    requesterName: input.requesterName ?? state.users.find((u) => u.id === state.currentUserId)!.name,
    requesterEmail: input.requesterEmail ?? state.users.find((u) => u.id === state.currentUserId)!.email,
    assigneeId: input.assigneeId ?? null,
    createdAt,
    deadline: input.deadline ?? new Date(+new Date(createdAt) + slaHours * HOUR).toISOString(),
    slaHours,
    status: input.status ?? 'New',
    completedAt: null,
    automationStatus: 'Not Processed',
    tags: input.tags ?? [],
    workflowId: input.workflowId ?? 'wf-default',
    workflowStageIndex: 0,
    duplicateOf: null,
    escalated: false,
    reminderSentAt: null,
    comments: [],
    history: [
      { id: uid('h'), at: createdAt, actor: input.requesterName ?? state.users.find((u) => u.id === state.currentUserId)!.name, action: 'Request submitted', to: `${input.source ?? 'Portal' } intake`,
      },
    ],
  };
}

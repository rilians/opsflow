import type { AppState, SlaConfiguration, Task, TaskCategory, Priority } from '@/types';
import { ROI_DEFAULTS } from '@/data/seed';
import { CATEGORY_DEPARTMENT, OPEN_STATUSES } from '@/lib/catalog';
import { HOUR } from '@/lib/utils';

/**
 * Single source of truth for "which workflow governs this request?".
 *
 * Both the seed and the intake BOT use this, which is what keeps
 * `task.workflowId` and the workflow instance it belongs to from drifting apart.
 * Previously the seed created category-appropriate instances while every BOT ran
 * `syncWorkflow` with the `wf-default` fallback, producing 13 records whose task
 * pointed at one workflow and whose instance lived in another.
 */
export function workflowIdForCategory(state: Pick<AppState, 'workflows'>, category: TaskCategory): string {
  const specific = state.workflows.find((w) => w.active && w.category === category);
  if (specific) return specific.id;
  const fallback = state.workflows.find((w) => w.id === 'wf-default') ?? state.workflows[0];
  return fallback?.id ?? 'wf-default';
}

/** Owning department for a category — mirrors the assignment BOT's routing table. */
export const departmentForCategoryId = (category: TaskCategory) => CATEGORY_DEPARTMENT[category] ?? 'dept-ops';

/** Configured resolve target in hours for a category + priority pair. */
export function slaHoursForConfig(
  configs: SlaConfiguration[],
  category: TaskCategory,
  priority: Priority,
): number {
  const c = configs.find((s) => s.category === category) ?? configs[0];
  if (!c) return 24;
  return priority === 'Critical'
    ? c.criticalHours
    : priority === 'High'
      ? c.highHours
      : priority === 'Medium'
        ? c.mediumHours
        : c.lowHours;
}

/**
 * Re-derives every field that must be a *function* of (status, SLA, now).
 *
 * The seed used to sprinkle these throughout creation code, which is how three
 * records ended up marked `Overdue` with a deadline still in the future — a state
 * the escalation BOT can never produce and which made the UI claim a breach that
 * had not happened. Every write path now funnels through this function instead of
 * setting the fields by hand.
 */
export function reconcileTask(task: Task, now = Date.now()): Task {
  const deadlineMs = +new Date(task.deadline);
  const createdMs = +new Date(task.createdAt);

  if (task.status === 'Completed' || task.status === 'Rejected') {
    task.escalated = false;
    if (task.status === 'Rejected') task.completedAt = null;
    // A completed record must never carry a "reminder pending" clock.
    if (task.status === 'Rejected') task.reminderSentAt = null;
    return task;
  }

  // Open work always has a completion timestamp removed.
  task.completedAt = null;

  // Breach is derived, never assigned: an open task whose deadline has passed IS
  // overdue, and one marked overdue without a passed deadline is not. Breach wins
  // over every other rule — an unassigned request can absolutely breach its SLA.
  const breached = deadlineMs <= now;
  if (breached) {
    task.status = 'Overdue';
  } else if (task.status === 'Overdue') {
    // The clock has not run out, so this is stale state. Fall back to the most
    // advanced status the record's own data supports.
    task.status = task.assigneeId ? 'Assigned' : 'New';
  }

  if (task.status !== 'Overdue') task.escalated = false;

  // A reminder timestamp only makes sense while the SLA clock is still running.
  if (task.reminderSentAt && +new Date(task.reminderSentAt) > deadlineMs) task.reminderSentAt = null;
  if (task.reminderSentAt && +new Date(task.reminderSentAt) < createdMs) task.reminderSentAt = null;

  // Assignment invariant: work that has moved past intake must have an owner. This
  // only applies while the record is still inside its SLA — a breached, unassigned
  // request stays Overdue so it surfaces in escalation instead of disappearing.
  if (
    !breached &&
    !task.assigneeId &&
    OPEN_STATUSES.includes(task.status) &&
    task.status !== 'New' &&
    task.status !== 'Pending Validation'
  ) {
    task.status = 'New';
  }

  return task;
}

/**
 * Removes records a previous store version left dangling (deleted tasks that are
 * still referenced by notifications, reports or automation counters).
 * Returns the number of repairs so callers can report them honestly.
 */
export function reconcileState(state: AppState, now = Date.now()): number {
  let repairs = 0;
  const ids = new Set(state.tasks.map((t) => t.id));
  const ruleIds = new Set(state.automations.map((a) => a.id));

  state.tasks.forEach((t) => {
    const before = `${t.status}|${t.escalated}|${t.completedAt}|${t.reminderSentAt}`;
    reconcileTask(t, now);
    if (`${t.status}|${t.escalated}|${t.completedAt}|${t.reminderSentAt}` !== before) repairs += 1;
  });

  const notifications = state.notifications.filter((n) => !n.taskId || ids.has(n.taskId));
  if (notifications.length !== state.notifications.length) {
    repairs += state.notifications.length - notifications.length;
    state.notifications = notifications;
  }

  const activity = state.activity.filter((a) => !a.taskId || ids.has(a.taskId));
  if (activity.length !== state.activity.length) {
    repairs += state.activity.length - activity.length;
    state.activity = activity;
  }

  state.workflows.forEach((w) => {
    const before = w.executions.length;
    w.executions = w.executions.filter((e) => ids.has(e.taskId));
    repairs += before - w.executions.length;
  });

  state.executions = state.executions.filter((e) => !e.ruleId || ruleIds.has(e.ruleId));

  // A workspace saved by an earlier build carries the old ROI seed (1,800 / 18 / 4),
  // which contradicts the baseline portfolio in the same document. If the inputs are
  // still untouched defaults, lift them to the current ones so old browsers do not
  // keep reporting a different business case. Custom values are never overwritten.
  const legacyRoi = state.roiInputs;
  if (
    legacyRoi &&
    legacyRoi.monthlyTransactions === 1800 &&
    legacyRoi.manualMinutes === 18 &&
    legacyRoi.automatedMinutes === 4
  ) {
    state.roiInputs = { ...legacyRoi, ...ROI_DEFAULTS };
    repairs += 1;
  }

  return repairs;
}

/** Deadline for a task created now, honouring an optional explicit SLA override. */
export const deadlineFor = (createdAtIso: string, slaHours: number) =>
  new Date(+new Date(createdAtIso) + Math.max(0.25, slaHours) * HOUR).toISOString();

/**
 * One definition of "overdue" for the whole product.
 *
 * The sidebar badge, the dashboard KPI and the Tasks badge used to disagree: one
 * counted `status === 'Overdue'`, another counted "open and past deadline". After
 * reconciliation those are the same set, but they must also stay the same if a
 * record is ever written by another path, so every surface calls this.
 */
export function isOverdue(task: Task, now = Date.now()): boolean {
  if (task.status === 'Completed' || task.status === 'Rejected') return false;
  return task.status === 'Overdue' || +new Date(task.deadline) <= now;
}

export const countOverdue = (tasks: Task[], now = Date.now()) => tasks.filter((t) => isOverdue(t, now)).length;

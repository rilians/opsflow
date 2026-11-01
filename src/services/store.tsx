import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, AutomationRule, NotificationType, Priority, ReportRecord, ReportType, SlaConfiguration, Task, TaskCategory, TaskStatus, User, Workflow } from '@/types';
import { prepareInitialState } from '@/services/seedRuntime';
import { buildTask, runAutomation, syncWorkflow, validationIssues, type RunOptions, type RunResult } from '@/services/automationEngine';
import { isOverdue, reconcileState, reconcileTask, workflowIdForCategory } from '@/lib/domain';
import { HOUR, nowIso, safeDiv, sanitizeText, startOfDay, uid } from '@/lib/utils';


const STORAGE_KEY = 'opsflow.state.v5';
export const STATE_VERSION = 5;

interface Toast { id: string;
  title: string;
  description?: string;
  tone: 'success' | 'error' | 'info' | 'warning'; }

interface StoreValue { state: AppState;
  toasts: Toast[];
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
  // tasks
  createTask: (input: Partial<Task> & { title: string; category: TaskCategory; priority: Priority }) => Task;
  updateTask: (id: string, patch: Partial<Task>, note?: string) => void;
  deleteTask: (id: string) => void;
  changeTaskStatus: (id: string, status: TaskStatus, note?: string) => void;
  bulkAssign: (ids: string[], assigneeId: string) => void;
  bulkStatus: (ids: string[], status: TaskStatus) => void;
  addComment: (taskId: string, body: string) => void;
  // automations
  runRule: (ruleId: string, opts?: RunOptions) => RunResult | { error: string };
  setRuleEnabled: (ruleId: string, enabled: boolean) => void;
  updateRule: (ruleId: string, patch: Partial<AutomationRule>) => void;
  createRule: (rule: Omit<AutomationRule, 'id'>) => AutomationRule;
  deleteRule: (ruleId: string) => void;
  // notifications
  markRead: (id: string, read?: boolean) => void;
  markAllRead: () => void;
  deleteNotification: (id: string) => void;
  // workflows
  setWorkflowActive: (id: string, active: boolean) => void;
  saveWorkflow: (wf: Workflow) => void;
  // settings
  updateSlaConfig: (id: string, patch: Partial<SlaConfiguration>) => void;
  updateSettings: (patch: Partial<AppState['settings']>) => void;
  updateRoi: (patch: Partial<AppState['roiInputs']>) => void;
  updateOrganization: (patch: Partial<AppState['organization']>) => void;
  saveUser: (user: User) => void;
  toggleUserActive: (id: string) => void;
  setCurrentUser: (id: string) => void;
  // reports
  generateReport: (input: { type: ReportType; from: string; to: string; departmentId: string; format?: 'CSV' | 'Preview' }) => ReportRecord;
  deleteReport: (id: string) => void;
  // demo
  runDemoScenario: () => { task: Task; executions: RunResult[] };
  resetDemo: () => void;
  importState: (json: string) => boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

/**
 * Loads the workspace and repairs it. A browser that has been running an older
 * build can hold records a newer one would never write (tasks deleted while their
 * notifications survived, an overdue flag on a record whose deadline has not
 * passed, an auto-assigned request with no automation record behind it). Repairing
 * on load is cheaper and more honest than storing a migration for every mistake.
 */
function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed?.version === STATE_VERSION && Array.isArray(parsed.tasks) && Array.isArray(parsed.automations)) {
        const repairs = reconcileState(parsed);
        if (repairs) {
          console.info(`[opsflow] repaired ${repairs} inconsistent record(s) while loading the workspace.`);
        }
        return parsed;
      }
      // A snapshot from an incompatible build (or a hand-edited one) must not be
      // trusted: rebuilding from the seed is safe, and the old value is retained
      // under a backup key so nothing is destroyed without a trace.
      localStorage.setItem(`${STORAGE_KEY}.backup-${Date.now()}`, raw.slice(0, 2_000_000));
      console.warn('[opsflow] workspace snapshot was unreadable or from another version — rebuilt from seed.');
    }
  } catch (e) {
    console.warn('[opsflow] could not read the stored workspace, starting from the seeded dataset.', e);
  }
  return prepareInitialState();
}

export function StoreProvider({ children }: { children: React.ReactNode }) { const [state, setState] = useState<AppState>(() => loadState());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Debounced persistence — survives refresh, keeps the demo state continuous.
  // Persistence errors used to be swallowed, so a full or blocked localStorage meant
  // the operator kept working while every change silently vanished on refresh. We
  // keep working in memory, but say so once.
  const storageWarned = useRef(false);
  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, version: STATE_VERSION }));
        storageWarned.current = false;
      } catch {
        if (storageWarned.current) return;
        storageWarned.current = true;
        setToasts((prev) => [
          ...prev.slice(-3),
          {
            id: uid('toast'),
            title: 'Changes are not being saved',
            description: 'Browser storage is full or blocked. The workspace keeps working in memory only — export a JSON snapshot to keep your data.',
            tone: 'error',
          },
        ]);
      }
    }, 250);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [state]);

  const toast = useCallback((t: Omit<Toast, 'id'>) => { const id = uid('toast');
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4600);
  }, []);
  const dismissToast = useCallback((id: string) => setToasts((prev) => prev.filter((x) => x.id !== id)), []);

  const patchState = useCallback((fn: (draft: AppState) => void) => {
    setState((prev) => {
      const draft: AppState = JSON.parse(JSON.stringify(prev));
      fn(draft);
      return draft;
    });
  }, []);

  const actorName = useMemo(() => state.users.find((u) => u.id === state.currentUserId)?.name ?? 'System', [state]);

  const logActivity = useCallback(
    (draft: AppState, type: AppState['activity'][number]['type'], message: string, extra: Record<string, unknown> = {}) => { draft.activity.unshift({
        id: uid('act'), at: nowIso(), type, actor: (extra.actor as string) ?? actorName, message, taskId: (extra.taskId as string) ?? null, ruleId: (extra.ruleId as string) ?? null, workflowId: (extra.workflowId as string) ?? null });
    },
    [actorName],
  );

  /* --------------------------------------------------------------- tasks */

  const createTask = useCallback<StoreValue['createTask']>(
    (input) => { const live = stateRef.current;
      const created = buildTask(live, { ...input, title: sanitizeText(input.title), description: sanitizeText(input.description ?? '') });
      created.workflowId = input.workflowId ?? workflowIdForCategory(live, created.category);
      patchState((draft) => { draft.tasks.unshift(created);
        logActivity(draft, 'task.created', `Created ${created.code } — “${ created.title }” via ${ created.source }`, { taskId: created.id, actor: created.requesterName });
        syncWorkflow(draft, created, 1);
      });
      toast({ title: `Request ${created.code } created`, description: 'Ready for BOT validation and assignment.', tone: 'success' });
      return created;
    },
    [patchState, logActivity, toast],
  );

  const updateTask = useCallback<StoreValue['updateTask']>(
    (id, patch, note) => { patchState((draft) => {
        const task = draft.tasks.find((t) => t.id === id);
        if (!task) return;
        const before = { status: task.status, assigneeId: task.assigneeId, deadline: task.deadline, priority: task.priority };
        Object.assign(task, patch);
        const changes: string[] = [];
        if (patch.status && patch.status !== before.status) changes.push(`status ${ before.status } → ${ patch.status }`);
        if (patch.assigneeId && patch.assigneeId !== before.assigneeId) { const u = draft.users.find((x) => x.id === patch.assigneeId);
          changes.push(`assignee → ${u?.name ?? 'unassigned' }`);
        }
        if (patch.deadline && patch.deadline !== before.deadline) changes.push('deadline updated');
        if (patch.priority && patch.priority !== before.priority) changes.push(`priority ${ before.priority } → ${ patch.priority }`);
        task.history.push({ id: uid('h'), at: nowIso(), actor: note ?? actorName, action: changes.length ? `Updated: ${changes.join(', ') }` : 'Task details updated',
        });
        // Derivation instead of hand-assignment: completion, escalation and breach
        // flags must stay consistent with the status and the SLA clock.
        reconcileTask(task);
        if (task.status === 'Completed' && !task.completedAt) task.completedAt = nowIso();
        // Moving work off a terminal state clears the completion stamp.
        if (task.status !== 'Completed') task.completedAt = null;
        syncWorkflow(draft, task, patch.status === 'Completed' ? 5 : patch.status === 'Waiting Approval' ? 4 : patch.status === 'In Progress' ? 3 : undefined);
        logActivity(draft, patch.status ? 'task.status' : 'task.updated' as never, `${ task.code } ${ changes.length ? changes.join(', ') : 'updated' }`, { taskId: task.id });
      });
      if (patch.status === 'Completed') { const t = state.tasks.find((x) => x.id === id);
        if (t) {
          patchState((draft) => {
            const assignee = draft.users.find((u) => u.id === t.assigneeId);
            draft.notifications.unshift({
              id: uid('ntf'), createdAt: nowIso(), read: false, actor: actorName, type: 'Task Completed', severity: 'success', title: `Task completed — ${t.code }`,
              body: `“${ t.title }” was closed by ${ assignee?.name ?? 'the assignee' }. SLA outcome recorded.`,
              taskId: t.id,
              workflowId: t.workflowId,
              ruleId: null,
            });
            const manager = draft.users.find((u) => u.departmentId === t.departmentId && u.role === 'Operations Manager');
            if (manager) draft.notifications.unshift({ id: uid('ntf'), createdAt: nowIso(), read: false, actor: 'Workflow Engine', type: 'Workflow Approval', severity: 'info', title: `Workflow closed — ${t.code }`,
              body: `Supervisor review completed for “${ t.title }”. The workflow instance is now closed.`,
              taskId: t.id,
              workflowId: t.workflowId,
              ruleId: null,
            });
          });
        }
      }
      toast({ title: 'Task updated', description: 'Changes saved and written to task history.', tone: 'success' });
    },
    [patchState, logActivity, toast, actorName, state.tasks],
  );

  const deleteTask = useCallback<StoreValue['deleteTask']>(
    (id) => { const task = stateRef.current.tasks.find((t) => t.id === id);
      patchState((draft) => {
        draft.tasks = draft.tasks.filter((t) => t.id !== id);
        draft.workflows.forEach((w) => {
          w.executions = w.executions.filter((e) => e.taskId !== id); });
        // Deleting the record must delete the things that point at it. Leaving them
        // behind produced notifications whose "Open" button led to a task that no
        // longer existed, and an activity feed referring to a deleted request.
        draft.notifications = draft.notifications.filter((n) => n.taskId !== id);
        draft.activity = draft.activity.filter((a) => a.taskId !== id);
        draft.tasks.forEach((t) => {
          if (t.duplicateOf === id) t.duplicateOf = null;
        });
        if (task) logActivity(draft, 'task.status', `Deleted ${ task.code } — “${ task.title }”`, { taskId: null });
      });
      toast({ title: 'Task deleted', description: 'The record, its workflow instance and its notifications were removed.', tone: 'info' });
    },
    [patchState, logActivity, toast],
  );

  const changeTaskStatus = useCallback<StoreValue['changeTaskStatus']>(
    (id, status, note) => { updateTask(id, { status }, note);
    },
    [updateTask],
  );

  const bulkAssign = useCallback<StoreValue['bulkAssign']>(
    (ids, assigneeId) => { patchState((draft) => {
        const user = draft.users.find((u) => u.id === assigneeId);
        ids.forEach((id) => {
          const task = draft.tasks.find((t) => t.id === id);
          if (!task) return;
          task.assigneeId = assigneeId;
          if (task.status === 'New' || task.status === 'Pending Validation') task.status = 'Assigned';
          task.history.push({ id: uid('h'), at: nowIso(), actor: actorName, action: `Bulk assigned to ${user?.name ?? 'user' }` });
          syncWorkflow(draft, task, 3);
        });
        logActivity(draft, 'task.assigned', `Bulk assigned ${ ids.length } task(s) to ${ user?.name ?? 'user' }`);
        if (user) { draft.notifications.unshift({
            id: uid('ntf'), createdAt: nowIso(), read: false, actor: actorName, type: 'Task Assignment', severity: 'info', title: `${ids.length } task(s) assigned to you`,
            body: `Bulk assignment by ${ actorName }. Open the task list to review the queue.`,
            taskId: ids[0] ?? null,
            workflowId: null,
            ruleId: null,
          });
        }
      });
      toast({ title: `${ids.length } task(s) reassigned`, tone: 'success' });
    },
    [patchState, logActivity, toast, actorName],
  );

  const bulkStatus = useCallback<StoreValue['bulkStatus']>(
    (ids, status) => { patchState((draft) => {
        ids.forEach((id) => {
          const task = draft.tasks.find((t) => t.id === id);
          if (!task) return;
          // Bulk close used to be unaudited work with no automation verdict: a request
          // could be marked Completed while still carrying open validation issues and
          // an empty automation trail. Re-run the same validation the intake BOT uses.
          const issues = status === 'Completed' ? validationIssues(task, draft) : [];
          task.status = status;
          reconcileTask(task);
          task.completedAt = status === 'Completed' ? task.completedAt ?? nowIso() : null;
          task.history.push({ id: uid('h'), at: nowIso(), actor: actorName, action: `Bulk status update → ${status }` });
          if (status === 'Completed' && issues.length) {
            task.automationStatus = task.automationStatus === 'Not Processed' ? 'Needs Review' : task.automationStatus;
            task.history.push({ id: uid('h'), at: nowIso(), actor: 'Data Validation BOT', action: `Closed with ${issues.length } open validation issue(s): ${ issues.map((i) => i.message).join('; ') }` });
          }
          syncWorkflow(draft, task, status === 'Completed' ? 5 : undefined);
        });
        logActivity(draft, 'task.status', `Bulk status update → ${ status } on ${ ids.length } task(s)`);
      });
      toast({ title: `${ids.length } task(s) set to ${ status }`, tone: 'success' });
    },
    [patchState, logActivity, toast, actorName],
  );

  const addComment = useCallback<StoreValue['addComment']>(
    (taskId, body) => { const clean = sanitizeText(body);
      if (!clean) return;
      patchState((draft) => {
        const task = draft.tasks.find((t) => t.id === taskId);
        if (!task) return;
        task.comments.push({ id: uid('c'), authorId: draft.currentUserId, body: clean, createdAt: nowIso() });
        task.history.push({ id: uid('h'), at: nowIso(), actor: actorName, action: 'Comment added' });
        logActivity(draft, 'task.comment', `Commented on ${ task.code }`, { taskId });
      });
      toast({ title: 'Comment added', tone: 'success' });
    },
    [patchState, logActivity, toast, actorName],
  );

  /* --------------------------------------------------------------- automations */

  const runRule = useCallback<StoreValue['runRule']>(
    (ruleId, opts = {}) => {
      const result = runAutomation(stateRef.current, ruleId, { ...opts, mode: opts.mode ?? 'Manual' });
      if ('error' in result && !('state' in result)) {
        toast({ title: 'Automation not found', description: result.error, tone: 'error' });
        return result;
      }
      const ok = result as RunResult;
      // Commit through an updater so concurrent state changes are preserved and
      // the ref stays ahead of the next BOT in a back-to-back sequence.
      stateRef.current = ok.state;
      setState(ok.state);
      if (ok.execution.status === 'Failed') {
        toast({ title: `${ok.rule.name} failed`, description: ok.execution.error ?? 'See execution history for details.', tone: 'error' });
      } else if (ok.execution.status === 'Skipped') {
        toast({ title: `${ok.rule.name} skipped`, description: ok.execution.resultSummary, tone: 'info' });
      } else if (ok.execution.status === 'Partial') {
        toast({ title: `${ok.rule.name} completed with warnings`, description: ok.execution.resultSummary, tone: 'warning' });
      } else {
        toast({ title: `${ok.rule.name} executed`, description: ok.execution.resultSummary, tone: 'success' });
      }
      return ok;
    },
    [toast],
  );

  const setRuleEnabled = useCallback<StoreValue['setRuleEnabled']>(
    (ruleId, enabled) => { patchState((draft) => {
        const rule = draft.automations.find((r) => r.id === ruleId);
        if (!rule) return;
        rule.enabled = enabled;
        logActivity(draft, 'settings.updated', `${enabled ? 'Enabled' : 'Disabled' } automation “${ rule.name }”`, { ruleId });
      });
      toast({ title: `Automation ${enabled ? 'enabled' : 'disabled' }`, tone: enabled ? 'success' : 'info' });
    },
    [patchState, logActivity, toast],
  );

  const updateRule = useCallback<StoreValue['updateRule']>(
    (ruleId, patch) => { patchState((draft) => {
        const rule = draft.automations.find((r) => r.id === ruleId);
        if (!rule) return;
        Object.assign(rule, patch);
        logActivity(draft, 'settings.updated', `Updated automation configuration “${rule.name }”`, { ruleId });
      });
      toast({ title: 'Automation updated', tone: 'success' });
    },
    [patchState, logActivity, toast],
  );

  const createRule = useCallback<StoreValue['createRule']>(
    (rule) => { const full: AutomationRule = { ...rule, id: uid('bot') };
      patchState((draft) => { draft.automations.push(full);
        logActivity(draft, 'settings.updated', `Created automation “${full.name }”`, { ruleId: full.id });
      });
      toast({ title: 'Automation created', description: 'Run it from the Automation Center to see it work.', tone: 'success' });
      return full;
    },
    [patchState, logActivity, toast],
  );

  const deleteRule = useCallback<StoreValue['deleteRule']>(
    (ruleId) => { patchState((draft) => {
        const rule = draft.automations.find((r) => r.id === ruleId);
        draft.automations = draft.automations.filter((r) => r.id !== ruleId);
        if (rule) logActivity(draft, 'settings.updated', `Deleted automation “${rule.name }”`, { ruleId });
      });
      toast({ title: 'Automation deleted', tone: 'info' });
    },
    [patchState, logActivity, toast],
  );

  /* --------------------------------------------------------------- notifications */

  const markRead = useCallback<StoreValue['markRead']>(
    (id, read = true) => { patchState((draft) => {
        const n = draft.notifications.find((x) => x.id === id);
        if (n) n.read = read; });
    },
    [patchState],
  );

  const markAllRead = useCallback<StoreValue['markAllRead']>(() => { patchState((draft) => {
      draft.notifications.forEach((n) => (n.read = true)); });
    toast({ title: 'All notifications marked as read', tone: 'info' });
  }, [patchState, toast]);

  const deleteNotification = useCallback<StoreValue['deleteNotification']>(
    (id) => { patchState((draft) => {
        draft.notifications = draft.notifications.filter((n) => n.id !== id); });
    },
    [patchState],
  );

  /* --------------------------------------------------------------- workflows */

  const setWorkflowActive = useCallback<StoreValue['setWorkflowActive']>(
    (id, active) => { patchState((draft) => {
        const wf = draft.workflows.find((w) => w.id === id);
        if (wf) {
          wf.active = active;
          logActivity(draft, 'settings.updated', `${active ? 'Activated' : 'Deactivated' } workflow “${ wf.name }”`, { workflowId: id });
        }
      });
      toast({ title: `Workflow ${active ? 'activated' : 'deactivated' }`, tone: active ? 'success' : 'info' });
    },
    [patchState, logActivity, toast],
  );

  const saveWorkflow = useCallback<StoreValue['saveWorkflow']>(
    (wf) => { patchState((draft) => {
        const idx = draft.workflows.findIndex((w) => w.id === wf.id);
        if (idx >= 0) draft.workflows[idx] = { ...wf, executions: draft.workflows[idx].executions };
        else draft.workflows.push({ ...wf, executions: [] });
        logActivity(draft, 'settings.updated', `Saved workflow “${ wf.name }”`, { workflowId: wf.id });
      });
      toast({ title: 'Workflow saved', description: `${wf.stages.length } stages configured.`, tone: 'success' });
    },
    [patchState, logActivity, toast],
  );

  /* --------------------------------------------------------------- settings */

  const updateSlaConfig = useCallback<StoreValue['updateSlaConfig']>(
    (id, patch) => { patchState((draft) => {
        const cfg = draft.slaConfigs.find((s) => s.id === id);
        if (!cfg) return;
        Object.assign(cfg, patch);
        logActivity(draft, 'settings.updated', `Updated SLA configuration for ${cfg.category }`);
      });
      toast({ title: 'SLA configuration saved', description: 'New durations apply to requests created from now.', tone: 'success' });
    },
    [patchState, logActivity, toast],
  );

  const updateSettings = useCallback<StoreValue['updateSettings']>(
    (patch) => { patchState((draft) => {
        draft.settings = { ...draft.settings, ...patch };
        logActivity(draft, 'settings.updated', 'Updated workspace settings');
      });
      toast({ title: 'Settings saved', tone: 'success' });
    },
    [patchState, logActivity, toast],
  );

  const updateRoi = useCallback<StoreValue['updateRoi']>((patch) => { setState((prev) => ({ ...prev, roiInputs: { ...prev.roiInputs, ...patch } }));
  }, []);

  const updateOrganization = useCallback<StoreValue['updateOrganization']>(
    (patch) => { patchState((draft) => {
        draft.organization = { ...draft.organization, ...patch };
        logActivity(draft, 'settings.updated', 'Updated organization profile');
      });
      toast({ title: 'Organization updated', tone: 'success' });
    },
    [patchState, logActivity, toast],
  );

  const saveUser = useCallback<StoreValue['saveUser']>(
    (user) => { patchState((draft) => {
        const idx = draft.users.findIndex((u) => u.id === user.id);
        if (idx >= 0) draft.users[idx] = user;
        else draft.users.push(user);
        logActivity(draft, 'user.updated', `Saved user “${user.name }” (${ user.role })`);
      });
      toast({ title: 'User saved', tone: 'success' });
    },
    [patchState, logActivity, toast],
  );

  const toggleUserActive = useCallback<StoreValue['toggleUserActive']>(
    (id) => { patchState((draft) => {
        const u = draft.users.find((x) => x.id === id);
        if (u) {
          u.active = !u.active;
          logActivity(draft, 'user.updated', `${u.active ? 'Activated' : 'Deactivated' } user “${ u.name }”`);
        }
      });
    },
    [patchState, logActivity],
  );

  const setCurrentUser = useCallback<StoreValue['setCurrentUser']>(
    (id) => { setState((prev) => ({ ...prev, currentUserId: id }));
      const u = state.users.find((x) => x.id === id);
      toast({ title: `Signed in as ${u?.name ?? 'user' }`, description: u?.role, tone: 'info' });
    },
    [state.users, toast],
  );

  /* --------------------------------------------------------------- reports */

  const generateReport = useCallback<StoreValue['generateReport']>(
    (input) => { const from = +new Date(startOfDay(input.from));
      const to = +new Date(input.to) === +new Date(startOfDay(input.to)) ? +new Date(input.to) + 24 * HOUR - 1 : +new Date(input.to);
      const scoped = state.tasks.filter((t) => {
        const c = +new Date(t.createdAt);
        return c >= from && c <= to && (input.departmentId === 'all' || t.departmentId === input.departmentId); });
      const completed = scoped.filter((t) => t.status === 'Completed');
      const onTime = completed.filter((t) => t.completedAt && +new Date(t.completedAt) <= +new Date(t.deadline));
      const automated = scoped.filter((t) => t.automationStatus === 'Auto-Assigned' || t.automationStatus === 'Validated');
      // A report covering a past period must report the workload *of that period*.
      // The previous version compared "overdue" against today's clock, so a January
      // report changed every time it was reopened in March.
      const asOf = Math.min(Date.now(), to);
      const overdue = scoped.filter((t) => isOverdue(t, asOf));
      const typeLabels: Record<ReportType, string> = { 'Daily Operations': 'Daily Operations Report', 'Weekly Operations': 'Weekly Operations Report', 'Monthly Operations': 'Monthly Operations Report', 'SLA Performance': 'SLA Performance Report', 'BOT Execution': 'BOT Execution Report', 'Department Workload': 'Department Workload Report', 'Automation Impact': 'Automation Impact Report' };
      const seq = state.reports.length + 143;
      const record: ReportRecord = { id: uid('rpt'), code: `RPT-${String(seq).padStart(4, '0') }`,
        type: input.type,
        title: typeLabels[input.type],
        periodFrom: input.from,
        periodTo: input.to,
        departmentId: input.departmentId as ReportRecord['departmentId'],
        generatedAt: nowIso(),
        generatedBy: actorName,
        format: input.format ?? 'CSV',
        summary: { tasks: scoped.length, completed: completed.length, overdue: overdue.length, slaCompliance: completed.length ? Math.round(safeDiv(onTime.length, completed.length) * 1000) / 10 : 0, automationRate: scoped.length ? Math.round(safeDiv(automated.length, scoped.length) * 1000) / 10 : 0 },
      };
      patchState((draft) => { draft.reports.unshift(record);
        logActivity(draft, 'report.generated', `Generated ${record.code } — ${ record.title }`, { actor: actorName });
        draft.notifications.unshift({ id: uid('ntf'), createdAt: nowIso(), read: false, actor: actorName, type: 'Report Generated' as NotificationType, severity: 'success', title: `${record.title } ready — ${ record.code }`,
          body: `${ record.summary.tasks } request(s) in scope · ${ record.summary.completed } completed · SLA compliance ${ record.summary.slaCompliance }%.`,
          taskId: null,
          workflowId: null,
          ruleId: null,
        });
      });
      toast({ title: `${record.code } generated`, description: `${ record.summary.tasks } request(s) included.`, tone: 'success' });
      return record;
    },
    [state.tasks, state.reports.length, patchState, logActivity, toast, actorName],
  );

  const deleteReport = useCallback<StoreValue['deleteReport']>(
    (id) => { patchState((draft) => {
        draft.reports = draft.reports.filter((r) => r.id !== id); });
      toast({ title: 'Report removed from history', tone: 'info' });
    },
    [patchState, toast],
  );

  /* --------------------------------------------------------------- demo scenario */

  const runDemoScenario = useCallback<StoreValue['runDemoScenario']>(() => { // 1. A realistic IT Support request arrives through the portal.
    const scenarioInput = {
      title: 'VPN access failing for the new finance analyst', description:
        'New finance analyst cannot establish the corporate VPN tunnel from the Jakarta office. Error 812 appears after credential entry; requires IT Support investigation and profile reset.', category: 'IT Support' as TaskCategory, priority: 'High' as Priority, source: 'Google Form' as Task['source'], requesterName: 'Hendra Gunawan', requesterEmail: 'hendra.gunawan@nusantararetail.co.id' };

    // Read the freshest state, not the closure's snapshot: clicking the scenario
    // twice in quick succession must extend the same workspace, not fork it.
    const live = stateRef.current;

    // Idempotency: the scenario is a guided walkthrough, not a generator. If it has
    // already been run, reopen the request it created instead of inserting a second
    // copy of the same task and its BOT runs.
    const existing = live.tasks.find((t) => (t.tags ?? []).includes('demo-scenario'));
    if (existing) {
      const priorRunCount = live.executions.filter((e) => (e.affectedTaskIds ?? []).includes(existing.id)).length;
      toast({
        title: 'Demo scenario already in progress',
        description: `${existing.code} was created by this scenario earlier${priorRunCount ? ` and has ${priorRunCount} BOT run(s) behind it` : ''}. Reopening it — reset the demo data to run the walkthrough again.`,
        tone: 'info',
      });
      return { task: existing, executions: [] };
    }

    const base = buildTask(live, scenarioInput);
    const created: Task = { ...base, tags: ['demo-scenario'], workflowId: workflowIdForCategory(live, base.category) };
    let working: AppState = JSON.parse(JSON.stringify(live));
    working.tasks.unshift(created);
    working.activity.unshift({ id: uid('act'), at: nowIso(), type: 'task.created', actor: created.requesterName, message: `Demo scenario started — created ${created.code } “${ created.title }” via Google Form`,
      taskId: created.id,
      ruleId: null,
      workflowId: 'wf-default',
    });
    syncWorkflow(working, working.tasks[0], 1);

    const results: RunResult[] = [];
    for (const botKey of ['data_validation', 'smart_assignment']) { const rule = working.automations.find((a) => a.botKey === botKey);
      if (!rule) continue;
      const res = runAutomation(working, rule.id, {
        mode: 'Simulated trigger', scopeTaskIds: [created.id] });
      if ('state' in res) { working = res.state;
        results.push(res); }
    }

    // The assigned task is then picked up and moved into execution.
    const liveTask = working.tasks.find((t) => t.id === created.id)!;
    if (liveTask.assigneeId) { liveTask.status = 'In Progress';
      liveTask.history.push({
        id: uid('h'), at: nowIso(), actor: working.users.find((u) => u.id === liveTask.assigneeId)?.name ?? 'Assignee', action: 'Started work on the request', from: 'Assigned', to: 'In Progress' });
      syncWorkflow(working, liveTask, 3);
    }

    stateRef.current = working;
    setState(working);
    toast({ title: 'Demo scenario executed', description: `${results.length } BOT(s) ran against ${ created.code }. Open the task to continue the scenario.`,
      tone: 'success',
    });
    return { task: liveTask, executions: results };
  }, [toast]);

  const resetDemo = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    // Clear any debounced write that would otherwise re-persist the old state right
    // after the reset.
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const fresh = prepareInitialState();
    stateRef.current = fresh;
    setState(fresh);
    toast({ title: 'Demo data reset', description: 'The workspace was rebuilt from the seeded demo dataset.', tone: 'info' });
  }, [toast]);

  const importState = useCallback<StoreValue['importState']>(
    (json) => { try {
        const parsed = JSON.parse(json) as AppState;
        // Shape-check the collections the whole app reads from. A file that only
        // *looks* like a snapshot used to be accepted and then crashed pages that
        // assumed `workflows`, `executions` or `slaConfigs` existed.
        const required: (keyof AppState)[] = [
          'tasks', 'users', 'automations', 'workflows', 'executions',
          'notifications', 'activity', 'reports', 'baselines', 'slaConfigs',
        ];
        const missing = required.filter((k) => !Array.isArray((parsed as never)[k]));
        if (missing.length) throw new Error(`Not an OpsFlow workspace file — missing: ${missing.join(', ')}`);
        if (!parsed.organization?.departments?.length) throw new Error('Workspace file has no organization departments.');
        if (!parsed.settings) throw new Error('Workspace file has no workspace settings.');
        const repairs = reconcileState(parsed);
        // Re-derive workflow membership: an imported snapshot may predate a workflow
        // change, and a task pointing at a workflow it has no instance in renders as
        // "no workflow" everywhere in the UI.
        parsed.tasks.forEach((t) => {
          if (!parsed.workflows.some((w) => w.id === t.workflowId)) {
            t.workflowId = workflowIdForCategory(parsed, t.category);
          }
          syncWorkflow(parsed, t);
        });
        stateRef.current = parsed;
        setState({ ...parsed, version: STATE_VERSION });
        toast({
          title: 'Workspace imported',
          description: `${parsed.tasks.length} task(s) restored${repairs ? `, ${repairs} inconsistent record(s) repaired` : ''}.`,
          tone: 'success',
        });
        return true;
      } catch (e) { toast({ title: 'Import failed', description: e instanceof Error ? e.message : 'Unreadable file', tone: 'error' });
        return false;
      }
    },
    [toast],
  );

  const value = useMemo<StoreValue>(
    () => ({ state, toasts, toast, dismissToast, busy, setBusy, createTask, updateTask, deleteTask, changeTaskStatus, bulkAssign, bulkStatus, addComment, runRule, setRuleEnabled, updateRule, createRule, deleteRule, markRead, markAllRead, deleteNotification, setWorkflowActive, saveWorkflow, updateSlaConfig, updateSettings, updateRoi, updateOrganization, saveUser, toggleUserActive, setCurrentUser, generateReport, deleteReport, runDemoScenario, resetDemo, importState }),
    [
      state, toasts, toast, dismissToast, busy, createTask, updateTask, deleteTask, changeTaskStatus, bulkAssign,
      bulkStatus, addComment, runRule, setRuleEnabled, updateRule, createRule, deleteRule, markRead, markAllRead,
      deleteNotification, setWorkflowActive, saveWorkflow, updateSlaConfig, updateSettings, updateRoi,
      updateOrganization, saveUser, toggleUserActive, setCurrentUser, generateReport, deleteReport, runDemoScenario,
      resetDemo, importState,
    ],
  );

  return <StoreContext.Provider value={ value }>{ children }</StoreContext.Provider>;
}

export function useStore() { const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx; }

export function useCurrentUser(): User { const { state } = useStore();
  return state.users.find((u) => u.id === state.currentUserId) ?? state.users[0];
}

export function usePermissions() { const user = useCurrentUser();
  const isAdmin = user.role === 'Administrator';
  const isManager = user.role === 'Operations Manager' || isAdmin;
  return {
    user, isAdmin, isManager, canConfigureAutomation: isAdmin, canDeleteTask: isManager, canManageUsers: isAdmin, canConfigureSla: isAdmin, canApprove: isManager, canGenerateReports: true };
}

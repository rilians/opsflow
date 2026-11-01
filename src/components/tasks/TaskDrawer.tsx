import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  Gauge,
  Clock,
  Copy,
  Pencil,
  Play,
  Send,
  Trash2,
  UserRound,
  History,
  MessageSquare,
  Info,
} from 'lucide-react';
import { Avatar, Button, ConfirmDialog, Drawer, Field, Input, KeyValue, Modal, Progress, Select, Textarea, Tooltip } from '@/components/ui';
import { AutomationStatusBadge, CategoryBadge, HealthBadge, PriorityBadge, StatusBadge } from '@/components/shared/bits';
import { usePermissions, useStore } from '@/services/store';
import { hoursToDeadline, slaConsumedPct, taskHealth, validationIssues } from '@/services/automationEngine';
import { STATUSES, PRIORITIES } from '@/lib/catalog';
import { cn, fmtDateTime, fmtHours, fmtRelative, toDateInputValue, fromDateInputValue } from '@/lib/utils';
import type { Priority, Task, TaskCategory, TaskStatus } from '@/types';
import { CATEGORIES } from '@/lib/catalog';

type Tab = 'overview' | 'comments' | 'history' | 'automation';

export function TaskDrawer({
  taskId,
  onClose,
  onOpenWorkflow,
}: {
  taskId: string | null;
  onClose: () => void;
  onOpenWorkflow?: (workflowId: string) => void;
}) {
  const { state, updateTask, deleteTask, addComment, runRule } = useStore();
  const { canDeleteTask, isManager } = usePermissions();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [comment, setComment] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [runningBot, setRunningBot] = useState<string | null>(null);

  const task = state.tasks.find((t) => t.id === taskId) ?? null;

  // Opening a different request must not inherit the previous one's tab or comment
  // draft — that read as "the comment box is empty but the tab says Automation".
  useEffect(() => {
    setTab('overview');
    setComment('');
  }, [taskId]);

  const [form, setForm] = useState<Partial<Task>>({});

  const openEdit = () => {
    if (!task) return;
    setForm({
      title: task.title,
      description: task.description,
      category: task.category,
      priority: task.priority,
      assigneeId: task.assigneeId,
      deadline: task.deadline,
      slaHours: task.slaHours,
      status: task.status,
      tags: task.tags,
    });
    setEditOpen(true);
  };

  const assignee = state.users.find((u) => u.id === task?.assigneeId);
  const department = state.organization.departments.find((d) => d.id === task?.departmentId);
  const workflow = state.workflows.find((w) => w.id === task?.workflowId);
  const instance = workflow?.executions.find((e) => e.taskId === task?.id);
  const health = task ? taskHealth(task, Date.now(), state.settings.reminderThresholdPct) : 'Safe';
  const issues = useMemo(() => (task ? validationIssues(task, state) : []), [task, state]);
  const relatedExecutions = useMemo(
    () => state.executions.filter((e) => task && e.affectedTaskIds.includes(task.id)),
    [state.executions, task],
  );
  const duplicateOf = task?.duplicateOf ? state.tasks.find((t) => t.id === task.duplicateOf) : null;

  const runBotOnTask = (botKey: string) => {
    if (!task) return;
    const rule = state.automations.find((a) => a.botKey === botKey);
    if (!rule) return;
    setRunningBot(botKey);
    window.setTimeout(() => {
      runRule(rule.id, { mode: 'Manual', scopeTaskIds: [task.id] });
      setRunningBot(null);
    }, 420);
  };

  return (
    <>
      <Drawer
        open={!!task}
        onClose={onClose}
        width="xl"
        eyebrow={
          <div className="flex items-center gap-2">
            <span className="tabular rounded border border-ink-200 bg-ink-50 px-1.5 py-px text-[10.5px] font-semibold text-ink-500">{task?.code}</span>
            {task && <StatusBadge status={task.status} />}
            {task && <PriorityBadge priority={task.priority} />}
          </div>
        }
        title={<span className="block pr-6 text-[15px] leading-snug">{task?.title}</span>}
        footer={
          task && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Select
                  value={task.status}
                  onChange={(e) => updateTask(task.id, { status: e.target.value as TaskStatus })}
                  className="h-8 w-[168px] py-0 text-[12px]"
                  aria-label="Change status"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
                <Select
                  value={task.assigneeId ?? ''}
                  onChange={(e) => updateTask(task.id, { assigneeId: e.target.value || null, status: task.status === 'New' || task.status === 'Pending Validation' ? 'Assigned' : task.status })}
                  className="h-8 w-[168px] py-0 text-[12px]"
                  aria-label="Assign task"
                >
                  <option value="">Unassigned</option>
                  {state.users.filter((u) => u.active).map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </Select>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={openEdit}>Edit</Button>
                {canDeleteTask && (
                  <Tooltip content="Delete this request">
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} aria-label="Delete task" className="text-red-600 hover:bg-red-50">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </Tooltip>
                )}
                {/* Closing a record the validation BOT would reject produced "completed"
                    work with no assignee, no description and no automation trail. The BOT
                    rule is the same one used for intake, so it is the honest gate here. */}
                <Tooltip
                  content={
                    task.status === 'Completed'
                      ? 'This request is already closed'
                      : issues.length
                        ? `Resolve ${issues.length} validation issue(s) before closing: ${issues[0].message}`
                        : 'Close this request'
                  }
                >
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    disabled={task.status === 'Completed' || issues.length > 0}
                    onClick={() => {
                      if (issues.length) return;
                      updateTask(task.id, { status: 'Completed' });
                    }}
                  >
                    {task.status === 'Completed' ? 'Completed' : 'Mark complete'}
                  </Button>
                </Tooltip>
                {task.status !== 'Completed' && issues.length > 0 && (
                  <span className="text-[10.5px] text-amber-700">{issues.length} issue(s) to fix</span>
                )}
              </div>
            </div>
          )
        }
      >
        {task && (
          <div>
            {/* Summary strip — the four facts an operator checks before reading anything. */}
            <div className="grid grid-cols-2 gap-px border-b border-ink-100 bg-ink-100 sm:grid-cols-4">
              {[
                { label: 'Assignee', value: assignee?.name ?? 'Unassigned', sub: department?.name ?? '', icon: <UserRound className="h-3 w-3" /> },
                { label: 'Deadline', value: fmtDateTime(task.deadline), sub: fmtRelative(task.deadline), icon: <CalendarClock className="h-3 w-3" /> },
                { label: 'SLA', value: `${task.slaHours}h window`, sub: `${Math.round(slaConsumedPct(task))}% consumed`, icon: <Clock className="h-3 w-3" /> },
                { label: 'Health', value: health, sub: task.escalated ? 'Escalated' : 'Not escalated', icon: <Gauge className="h-3 w-3" /> },
              ].map((s) => (
                <div key={s.label} className="bg-white px-4 py-2.5">
                  <p className="flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.09em] text-ink-400">{s.icon}{s.label}</p>
                  <p className="mt-1 truncate text-[12px] font-medium leading-tight text-ink-800">{s.value}</p>
                  <p className="truncate text-[10.5px] leading-tight text-ink-400">{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Tab bar follows the same pattern as the app's Tabs so panels match. */}
            <div className="flex gap-0.5 border-b border-ink-200/90 px-3">
              {[
                { id: 'overview' as Tab, label: 'Overview', icon: <Info className="h-3.5 w-3.5" /> },
                { id: 'comments' as Tab, label: `Comments (${task.comments.length})`, icon: <MessageSquare className="h-3.5 w-3.5" /> },
                { id: 'history' as Tab, label: `History (${task.history.length})`, icon: <History className="h-3.5 w-3.5" /> },
                { id: 'automation' as Tab, label: 'Automation', icon: <Bot className="h-3.5 w-3.5" /> },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'relative flex items-center gap-1.5 px-2.5 pb-2 pt-2.5 text-[12px] font-medium transition-colors',
                    tab === t.id ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800',
                  )}
                >
                  {t.icon}
                  {t.label}
                  {tab === t.id && <span className="absolute inset-x-1 -bottom-px h-[2px] rounded-t-full bg-brand-600" />}
                </button>
              ))}
            </div>

            <div className="p-4">
              {tab === 'overview' && (
                <div className="space-y-4">
                  <div>
                    <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Description</h4>
                    <p className="text-[12.5px] leading-relaxed text-ink-600">{task.description || '—'}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-ink-200 p-3">
                      <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">Request</h4>
                      <KeyValue label="Category"><CategoryBadge category={task.category} /></KeyValue>
                      <KeyValue label="Source">{task.source}</KeyValue>
                      <KeyValue label="Requester">{task.requesterName}</KeyValue>
                      <KeyValue label="Email"><span className="break-all text-[11.5px]">{task.requesterEmail}</span></KeyValue>
                      <KeyValue label="Created">{fmtDateTime(task.createdAt)}</KeyValue>
                      {task.completedAt && <KeyValue label="Completed">{fmtDateTime(task.completedAt)}</KeyValue>}
                    </div>
                    <div className="rounded-lg border border-ink-200 p-3">
                      <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">SLA &amp; automation</h4>
                      <KeyValue label="Deadline health"><HealthBadge health={health} /></KeyValue>
                      <KeyValue label="Time remaining">
                        {task.status === 'Completed' || task.status === 'Rejected' ? (
                          <span className="text-ink-400">Closed</span>
                        ) : hoursToDeadline(task) >= 0 ? (
                          fmtHours(hoursToDeadline(task))
                        ) : (
                          <span className="text-red-600">{fmtHours(Math.abs(hoursToDeadline(task)))} overdue</span>
                        )}
                      </KeyValue>
                      <KeyValue label="Automation status"><AutomationStatusBadge status={task.automationStatus} /></KeyValue>
                      <KeyValue label="Escalated">{task.escalated ? <span className="text-red-600">Yes</span> : 'No'}</KeyValue>
                      <KeyValue label="Reminder sent">{task.reminderSentAt ? fmtRelative(task.reminderSentAt) : 'Not yet'}</KeyValue>
                      <div className="mt-2">
                        {/* A closed record is judged on the clock it stopped at, not on
                            today's clock — otherwise an on-time completion shows a red
                            "100% consumed" bar. */}
                        {(() => {
                          const closed = task.status === 'Completed' || task.status === 'Rejected';
                          const onTime = !!task.completedAt && +new Date(task.completedAt) <= +new Date(task.deadline);
                          const pct = closed && task.completedAt
                            ? Math.min(100, Math.max(0, ((+new Date(task.completedAt) - +new Date(task.createdAt)) / (+new Date(task.deadline) - +new Date(task.createdAt))) * 100))
                            : slaConsumedPct(task);
                          const tone = closed ? (onTime ? 'emerald' : 'red') : pct >= 90 ? 'red' : pct >= 75 ? 'amber' : 'emerald';
                          return (
                            <>
                              <Progress value={pct} tone={tone} />
                              <p className="mt-1 text-[10.5px] text-ink-400">
                                {closed
                                  ? onTime
                                    ? `Closed after ${Math.round(pct)}% of the ${task.slaHours}h window — within SLA`
                                    : `Closed after ${Math.round(pct)}% of the ${task.slaHours}h window — SLA breached`
                                  : `${Math.round(pct)}% of the ${task.slaHours}h window consumed`}
                              </p>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {issues.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5" /> Validation findings ({issues.length})
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {issues.map((i) => (
                          <li key={i.message} className="text-[11.5px] text-amber-700">• {i.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {duplicateOf && (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3">
                      <p className="flex items-center gap-1.5 text-[11.5px] text-rose-800">
                        <Copy className="h-3.5 w-3.5" /> Possible duplicate of <strong>{duplicateOf.code}</strong> — {duplicateOf.title}
                      </p>
                      <Button size="xs" variant="secondary" onClick={() => navigate(`/tasks?task=${duplicateOf.id}`)}>Open</Button>
                    </div>
                  )}

                  {workflow && (
                    <div className="rounded-lg border border-ink-200 p-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Workflow progress</h4>
                        <button
                          onClick={() => {
                            onClose();
                            onOpenWorkflow?.(workflow.id);
                          }}
                          className="flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline"
                        >
                          Open workflow <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {workflow.stages.map((s, i) => {
                          const done = i <= (instance?.currentStageIndex ?? task.workflowStageIndex);
                          return (
                            <div key={s.id} className="flex items-center gap-1">
                              <span
                                className={cn(
                                  'flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium',
                                  done ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-ink-200 bg-white text-ink-400',
                                )}
                              >
                                {s.owner === 'BOT' && <Bot className="h-2.5 w-2.5" />}
                                {s.name}
                              </span>
                              {i < workflow.stages.length - 1 && <span className={cn('h-px w-2', done ? 'bg-brand-300' : 'bg-ink-200')} />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {task.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {task.tags.map((t) => (
                        <span key={t} className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[10.5px] text-ink-500">#{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === 'comments' && (
                <div className="space-y-3">
                  {task.comments.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-ink-200 py-6 text-center text-[12px] text-ink-400">
                      No comments yet. Comments are written to the task history.
                    </p>
                  ) : (
                    <ul className="space-y-4">
                      {[...task.comments].reverse().map((c) => {
                        const author = state.users.find((u) => u.id === c.authorId);
                        return (
                          <li key={c.id} className="flex gap-2.5">
                            <Avatar name={author?.name ?? 'User'} tone={author?.avatarTone} size="sm" />
                            <div className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-ink-50/50 px-3 py-2">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="text-[12px] font-semibold text-ink-800">{author?.name ?? 'User'}</p>
                                <p className="text-[10.5px] text-ink-400">{fmtRelative(c.createdAt)}</p>
                              </div>
                              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-600">{c.body}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="rounded-lg border border-ink-200 p-2.5">
                    <Textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Add a comment for the assignee or supervisor…"
                      className="min-h-[64px] border-0 p-0 focus:ring-0"
                      aria-label="New comment"
                    />
                    <div className="mt-1.5 flex justify-end">
                      <Button
                        size="xs"
                        variant="primary"
                        icon={<Send className="h-3 w-3" />}
                        disabled={!comment.trim()}
                        onClick={() => {
                          addComment(task.id, comment);
                          setComment('');
                        }}
                      >
                        Post comment
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'history' && (
                <ul className="space-y-0">
                  {[...task.history].reverse().map((h, i) => (
                    <li key={h.id} className="relative flex gap-3 pb-3">
                      {i < task.history.length - 1 && <span className="absolute left-[7px] top-4 h-full w-px bg-ink-100" />}
                      <span className="relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white bg-ink-300 ring-1 ring-ink-200" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium text-ink-800">{h.action}</p>
                        <p className="text-[10.5px] text-ink-400">
                          {h.actor} · {fmtDateTime(h.at)}
                          {h.to && <span className="ml-1 text-ink-500">→ {h.to}</span>}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {tab === 'automation' && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-3">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Run a BOT on this task</h4>
                    <p className="mt-0.5 text-[11px] text-ink-500">
                      Executions are scoped to this record only and are recorded in automation history.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {[
                        { key: 'data_validation', label: 'Validate data' },
                        { key: 'smart_assignment', label: 'Auto-assign' },
                        { key: 'deadline_reminder', label: 'Send reminder' },
                        { key: 'sla_escalation', label: 'Escalate SLA' },
                        { key: 'duplicate_detection', label: 'Check duplicates' },
                      ].map((b) => {
                        const rule = state.automations.find((a) => a.botKey === b.key);
                        return (
                          <Tooltip key={b.key} content={rule?.enabled ? rule.name : 'Disabled in Automation Center'}>
                            <Button
                              size="xs"
                              variant={rule?.enabled ? 'subtle' : 'secondary'}
                              loading={runningBot === b.key}
                              disabled={!rule?.enabled}
                              icon={<Play className="h-2.5 w-2.5" />}
                              onClick={() => runBotOnTask(b.key)}
                            >
                              {b.label}
                            </Button>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </div>

                  {relatedExecutions.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-ink-200 py-6 text-center text-[12px] text-ink-400">
                      No automation executions have touched this task yet.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {relatedExecutions.map((e) => (
                        <li key={e.id} className="rounded-lg border border-ink-200 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[12px] font-medium text-ink-800">{e.ruleName}</p>
                            <span className="tabular text-[10.5px] text-ink-400">{e.id}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] leading-snug text-ink-500">{e.resultSummary}</p>
                          <p className="mt-1 text-[10px] text-ink-400">
                            {e.status} · {e.mode} · {fmtDateTime(e.startedAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Edit modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit request details"
        description="Every change is appended to the task history for audit."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={
                !form.title ||
                form.title.trim().length < 8 ||
                !form.description ||
                form.description.trim().length < 20 ||
                !Number.isFinite(Number(form.slaHours)) ||
                Number(form.slaHours) <= 0
              }
              onClick={() => {
                if (!task) return;
                // Deadline and SLA duration are the same fact expressed twice, so the
                // edit form reconciles them instead of letting them drift apart (a
                // hand-edited deadline used to leave `slaHours` describing a window
                // that no longer existed, which broke every "% of SLA consumed" read).
                const nextSla = Number(form.slaHours);
                const nextDeadline =
                  form.deadline && form.deadline !== task.deadline
                    ? form.deadline
                    : new Date(+new Date(task.createdAt) + Math.max(0.25, nextSla) * 3_600_000).toISOString();
                updateTask(task.id, {
                  title: form.title,
                  description: form.description,
                  category: form.category as TaskCategory,
                  priority: form.priority as Priority,
                  assigneeId: form.assigneeId ?? null,
                  deadline: nextDeadline,
                  slaHours: Math.max(
                    0.25,
                    form.deadline && form.deadline !== task.deadline
                      ? (+new Date(nextDeadline) - +new Date(task.createdAt)) / 3_600_000
                      : nextSla,
                  ),
                  status: form.status as TaskStatus,
                });
                setEditOpen(false);
              }}
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field
            label="Title"
            required
            error={form.title && form.title.trim().length < 8 ? 'At least 8 characters.' : undefined}
          >
            <Input
              value={form.title ?? ''}
              invalid={!!form.title && form.title.trim().length < 8}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field
            label="Description"
            error={form.description && form.description.trim().length < 20 ? 'At least 20 characters — the validation BOT checks this.' : undefined}
          >
            <Textarea
              value={form.description ?? ''}
              invalid={!!form.description && form.description.trim().length < 20}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category">
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as TaskCategory })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
            </Field>
            <Field label="Assignee">
              <Select value={form.assigneeId ?? ''} onChange={(e) => setForm({ ...form, assigneeId: e.target.value || null })}>
                <option value="">Unassigned</option>
                {state.users.filter((u) => u.active).map((u) => (
                  <option key={u.id} value={u.id}>{u.name} · {u.title}</option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Deadline">
              <Input
                type="datetime-local"
                value={toDateInputValue(form.deadline)}
                onChange={(e) => setForm({ ...form, deadline: fromDateInputValue(e.target.value) ?? form.deadline })}
              />
            </Field>
            <Field label="SLA duration (hours)">
              <Input
                type="number"
                min={1}
                value={form.slaHours ?? ''}
                onChange={(e) => setForm({ ...form, slaHours: Number(e.target.value) })}
              />
            </Field>
          </div>
          {isManager && (
            <p className="rounded-md bg-ink-50 px-2.5 py-1.5 text-[11px] text-ink-500">
              You are editing as {isManager ? 'an operations manager' : 'staff'} — destructive actions are logged.
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!task) return;
          deleteTask(task.id);
          onClose();
        }}
        title="Delete this request?"
        description={`${task?.code} — “${task?.title}” and its workflow instance will be permanently removed from the demo workspace.`}
        confirmLabel="Delete request"
      />
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Bot, Clock3, GitBranch, Plus, Save, ShieldCheck, Trash2, UserRound, Workflow as WorkflowIcon, X } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Drawer, EmptyState, Field, Input, Modal, Select, Switch, Textarea, Tooltip } from '@/components/ui';
import { PageHeader, InfoNote, SectionTitle } from '@/components/shared/Page';
import { usePermissions, useStore } from '@/services/store';
import { cn, fmtDateTime, uid } from '@/lib/utils';
import type { Workflow, WorkflowStage } from '@/types';
import { CATEGORIES } from '@/lib/catalog';

function ExecutionStateBadge({ status }: { status: string }) {
  const tone = status === 'Completed' ? 'emerald' : status === 'Failed' ? 'red' : status === 'Awaiting Approval' ? 'violet' : 'blue';
  return (
    <Badge tone={tone} dot>
      {status === 'Awaiting Approval' ? 'Pending approval' : status}
    </Badge>
  );
}

export function Workflows() { const { state, setWorkflowActive, saveWorkflow, toast } = useStore();
  const { isAdmin } = usePermissions();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string>(params.get('id') ?? state.workflows[0]?.id ?? '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Workflow | null>(null);
  const [execDrawer, setExecDrawer] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => { const id = params.get('id');
    if (id) setSelectedId(id); }, [params]);

  const selected = state.workflows.find((w) => w.id === selectedId) ?? state.workflows[0];
  // A deep link (or a deleted workflow) can leave selectedId pointing at nothing; the
  // panels render workflow[0] while the list highlights nothing. Re-anchor to what is shown.
  const effectiveId = selected?.id ?? '';

  useEffect(() => {
    if (effectiveId && effectiveId !== selectedId) setSelectedId(effectiveId);
  }, [effectiveId, selectedId]);

  const stats = useMemo(() => { const all = state.workflows.flatMap((w) => w.executions);
    const running = all.filter((e) => e.status === 'Running' || e.status === 'Awaiting Approval');
    const completed = all.filter((e) => e.status === 'Completed');
    const failed = all.filter((e) => e.status === 'Failed');
    const durations = completed
      .filter((e) => e.completedAt)
      .map((e) => (+new Date(e.completedAt!) - +new Date(e.startedAt)) / 3_600_000);
    return {
      active: running.length, completed: completed.length, failed: failed.length, avgHours: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0, awaiting: all.filter((e) => e.status === 'Awaiting Approval').length };
  }, [state.workflows]);

  const wfStats = useMemo(() => { if (!selected) return { total: 0, running: 0, completed: 0, failed: 0, avg: 0 };
    const ex = selected.executions;
    const completed = ex.filter((e) => e.status === 'Completed' && e.completedAt);
    const durations = completed.map((e) => (+new Date(e.completedAt!) - +new Date(e.startedAt)) / 3_600_000);
    return { total: ex.length, running: ex.filter((e) => e.status === 'Running' || e.status === 'Awaiting Approval').length, completed: completed.length, failed: ex.filter((e) => e.status === 'Failed').length, avg: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0 };
  }, [selected]);

  // A workflow with no stages cannot hold an instance: syncWorkflow would index into an
  // empty array. Validate before saving rather than persisting a broken definition.
  const draftError = !draft
    ? null
    : draft.name.trim().length < 3
      ? 'Workflow name must be at least 3 characters.'
      : draft.stages.length === 0
        ? 'A workflow needs at least one stage.'
        : draft.stages.some((s) => s.name.trim().length === 0)
          ? 'Every stage needs a name.'
          : null;

  const startEdit = () => { if (!selected) return;
    setDraft(JSON.parse(JSON.stringify(selected)));
    setEditing(true); };

  const stageIcon = (owner: WorkflowStage['owner']) =>
    owner === 'BOT' ? <Bot className="h-3.5 w-3.5" /> : owner === 'Manager' ? <ShieldCheck className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />;

  const exec = selected?.executions.find((e) => e.id === execDrawer);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Workflow Management"
        description="Visual definition of the operational processes that govern every request. BOT-owned stages advance automatically; manager-owned stages require human approval."
        actions={ <>
            <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" /> } onClick={ () => setCreateOpen(true) } disabled={ !isAdmin }>
              New workflow
            </Button>
            <Button variant="primary" size="sm" icon={ <Save className="h-3.5 w-3.5" /> } onClick={ startEdit } disabled={ !selected || !isAdmin }>
              Edit workflow
            </Button>
          </>
        }
      />

      {/* Process health band — five numbers, one line, no competing cards. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-ink-200/80 bg-white px-4 py-2.5 shadow-card">
        {[
          { label: 'Processes', value: state.workflows.length, hint: `${state.workflows.filter((w) => w.active).length} active`, tone: 'text-ink-900' },
          { label: 'Live instances', value: stats.active, hint: `${stats.awaiting} awaiting approval`, tone: 'text-amber-700' },
          { label: 'Completed', value: stats.completed, hint: 'reached the final stage', tone: 'text-emerald-600' },
          { label: 'Rejected', value: stats.failed, hint: 'process stopped', tone: stats.failed ? 'text-red-600' : 'text-ink-900' },
          { label: 'Avg. cycle', value: `${stats.avgHours.toFixed(1)}h`, hint: 'start to final stage', tone: 'text-violet-600' },
        ].map((m) => (
          <div key={m.label} className="flex min-w-0 items-baseline gap-2">
            <span className="eyebrow">{m.label}</span>
            <span className={cn('figure text-[15px] font-semibold', m.tone)}>{m.value}</span>
            <span className="hidden text-[10.5px] text-ink-400 sm:inline">{m.hint}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        { /* workflow list */ }
        <Card className="h-fit">
          <CardHeader title="Workflow library" subtitle={ `${state.workflows.length } process definitions`} />
          <ul className="divide-y divide-ink-50">
            { state.workflows.map((w) => {
              const running = w.executions.filter((e) => e.status === 'Running' || e.status === 'Awaiting Approval').length;
              return (
                <li key={w.id }>
                  <button
                    onClick={ () => {
                      setSelectedId(w.id);
                      const next = new URLSearchParams(params);
                      next.set('id', w.id);
                      setParams(next, { replace: true });
                    }}
                    className={ cn(
                      'group relative w-full px-3 py-2.5 text-left transition-colors',
                      selected?.id === w.id ? 'bg-brand-50/70' : 'hover:bg-ink-50',
                    ) }
                  >
                    <span
                      className={ cn(
                        'absolute inset-y-1.5 left-0 w-[2px] rounded-r-full transition-opacity',
                        selected?.id === w.id ? 'bg-brand-600 opacity-100' : 'opacity-0',
                      ) }
                    />
                    <div className="flex items-start justify-between gap-2">
                      <p className={ cn('text-[12.5px] font-medium leading-snug', selected?.id === w.id ? 'text-brand-900' : 'text-ink-800') }>{ w.name }</p>
                      <span className={ cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', w.active ? 'bg-emerald-500' : 'bg-ink-300') } title={ w.active ? 'Active' : 'Inactive' } />
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="rounded bg-white px-1 py-px text-[9.5px] font-semibold text-ink-500 ring-1 ring-ink-200/80">{ w.stages.length } stages</span>
                      <span className="truncate text-[10.5px] text-ink-400">{ w.category === 'All' ? 'All categories' : w.category }</span>
                      { running > 0 && (
                        <span className="ml-auto shrink-0 rounded bg-brand-100/80 px-1 py-px text-[9.5px] font-semibold tabular text-brand-800">{ running } live</span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        { /* selected workflow */ }
        { selected && (
          <div className="space-y-4">
            <Card>
              <div className="flex flex-col gap-3 border-b border-ink-100 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink-900">{selected.name }</h2>
                    <Badge tone={ selected.active ? 'emerald' : 'slate' } dot>{ selected.active ? 'Active' : 'Inactive' }</Badge>
                    <Badge>{ selected.category === 'All' ? 'All categories' : selected.category }</Badge>
                  </div>
                  <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-ink-500">{ selected.description }</p>
                  <p className="mt-1.5 text-[10.5px] text-ink-400">Created { fmtDateTime(selected.createdAt) } · { selected.executions.length } instances</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Tooltip content={ isAdmin ? 'Toggle workflow availability' : 'Administrator role required' }>
                    <span><Switch checked={ selected.active } onChange={ (v) => isAdmin ? setWorkflowActive(selected.id, v) : toast({ title: 'Administrator role required', tone: 'warning' })} /></span>
                  </Tooltip>
                </div>
              </div>

              { /* Stage pipeline.
                   Each stage is a card in one continuous track; the connector carries
                   the hand-off semantics (solid brand for a BOT hand-off, violet for a
                   manager gate, hairline for a human hand-off) so the diagram explains
                   the process without needing the legend read first. */ }
              <div className="overflow-x-auto px-4 pb-4 pt-4">
                <div className="relative flex w-full items-stretch">
                  { selected.stages.map((s, i) => {
                    const dept = state.organization.departments.find((d) => d.id === s.departmentId);
                    const liveHere = selected.executions.filter((e) => e.currentStageIndex === i).length;
                    const skin =
                      s.owner === 'BOT'
                        ? { card: 'border-brand-200 bg-gradient-to-b from-brand-50/90 to-white', chip: 'bg-brand-100 text-brand-800', icon: 'bg-brand-700 text-white', ring: 'ring-brand-100' }
                        : s.requiresApproval
                          ? { card: 'border-violet-200 bg-gradient-to-b from-violet-50/80 to-white', chip: 'bg-violet-100 text-violet-800', icon: 'bg-violet-700 text-white', ring: 'ring-violet-100' }
                          : { card: 'border-ink-200 bg-gradient-to-b from-ink-50/80 to-white', chip: 'bg-ink-100 text-ink-600', icon: 'bg-ink-600 text-white', ring: 'ring-ink-100' };
                    return (
                      <div key={s.id} className="flex min-w-0 flex-1 items-stretch">
                        <div
                          className={ cn(
                            'group relative flex min-h-[126px] min-w-0 flex-1 flex-col rounded-xl border p-2 px-2.5 shadow-xs transition-all duration-200 hover:-translate-y-px hover:shadow-raised',
                            skin.card,
                          ) }
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="flex items-center gap-1">
                              <span className={ cn('flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ring-2 ring-white', skin.icon) }>{ i + 1 }</span>
                              { liveHere > 0 && (
                                <span
                                  className="rounded-full bg-white px-1.5 py-px text-[9px] font-semibold tabular text-ink-700 shadow-xs ring-1 ring-ink-200"
                                  title={`${liveHere} instance(s) currently at this stage`}
                                >
                                  { liveHere } live
                                </span>
                              )}
                            </span>
                            <span
                              title={ `${s.owner}-owned stage` }
                              className={ cn('flex shrink-0 items-center gap-0.5 rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide', skin.chip) }
                            >
                              { stageIcon(s.owner) } { s.owner === 'Manager' ? 'MGR' : s.owner === 'Human' ? 'HUM' : 'BOT' }
                            </span>
                          </div>
                          <p className="mt-1.5 text-[11.5px] font-semibold leading-tight text-ink-900">{ s.name }</p>
                          <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-ink-500">{ s.description }</p>
                          <div className="mt-auto flex items-center gap-1 pt-2">
                            { dept && <span className="rounded bg-white/90 px-1 py-px text-[9px] font-medium text-ink-600 ring-1 ring-ink-200/80">{dept.code }</span>}
                            { s.requiresApproval && (
                              <span title="Requires manager approval" className="flex text-violet-600"><ShieldCheck className="h-2.5 w-2.5" /></span>
                            )}
                            <span className="ml-auto flex items-center gap-0.5 text-[9px] tabular text-ink-400"><Clock3 className="h-2.5 w-2.5" />{ s.slaHours }h</span>
                          </div>
                        </div>
                        { i < selected.stages.length - 1 && (
                          <div className="relative flex w-3 shrink-0 items-center justify-center">
                            <span
                              className={ cn(
                                'h-px w-full',
                                s.owner === 'BOT' ? 'bg-brand-300' : s.requiresApproval ? 'bg-violet-300' : 'bg-ink-200',
                              ) }
                            />
                            <ArrowRight
                              className={ cn(
                                '-ml-1 h-3 w-3 shrink-0',
                                s.owner === 'BOT' ? 'text-brand-600' : s.requiresApproval ? 'text-violet-600' : 'text-ink-400',
                              ) }
                              strokeWidth={2.5}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-px border-t border-ink-100 bg-ink-100 sm:grid-cols-5">
                { [
                  { label: 'Instances', value: wfStats.total },
                  { label: 'Running', value: wfStats.running },
                  { label: 'Completed', value: wfStats.completed },
                  { label: 'Rejected', value: wfStats.failed },
                  { label: 'Avg. duration', value: `${wfStats.avg.toFixed(1) }h` },
                ].map((s) => (
                  <div key={ s.label } className="bg-white px-3 py-2.5">
                    <p className="text-[9.5px] font-semibold uppercase tracking-[0.09em] text-ink-400">{ s.label }</p>
                    <p className="figure mt-0.5 text-[15px] font-semibold">{ s.value }</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Workflow instances"
                subtitle="Task-level execution of this process"
                icon={ <GitBranch className="h-4 w-4 text-ink-400" /> }
                action={ <span className="text-[11px] text-ink-400">{selected.executions.length } instances</span>}
              />
              { selected.executions.length === 0 ? (
                <EmptyState compact title="No instances yet" description="Instances appear when a task enters this workflow." icon={<WorkflowIcon className="h-4 w-4" /> } />
              ) : (
                <div className="max-h-[340px] overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 border-b border-ink-100 bg-ink-50 text-[11px]">
                      <tr>
                        <th className="th pl-4">Task</th>
                        <th className="th">Stage</th>
                        <th className="th">Started</th>
                        <th className="th">Status</th>
                        <th className="th pr-4 text-right">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-50">
                      { selected.executions.slice(0, 40).map((e) => {
                        const task = state.tasks.find((t) => t.id === e.taskId);
                        return (
                          <tr key={e.id } className="transition-colors hover:bg-ink-50/60">
                            <td className="td max-w-[280px] pl-4">
                              <button onClick={ () => task && navigate(`/tasks?task=${task.id }`)} className="block max-w-full text-left">
                                <span className="block truncate text-[12px] font-medium text-ink-800 hover:text-brand-700">{ task?.title ?? e.taskId }</span>
                                <span className="text-[10px] text-ink-400">{ e.taskCode }</span>
                              </button>
                            </td>
                            <td className="td">
                              <div className="flex items-center gap-1">
                                { selected.stages.map((_, i) => (
                                  <span
                                    key={i }
                                    className={ cn('h-1.5 w-3 rounded-full', i <= e.currentStageIndex ? 'bg-brand-500' : 'bg-ink-200') }
                                  />
                                ))}
                                <span className="ml-1 text-[10.5px] text-ink-500">{ selected.stages[e.currentStageIndex]?.name }</span>
                              </div>
                            </td>
                            <td className="td whitespace-nowrap text-[11px]">{ fmtDateTime(e.startedAt) }</td>
                            <td className="td">
                              <ExecutionStateBadge status={e.status} />
                            </td>
                            <td className="td pr-4 text-right">
                              <Button size="xs" variant="ghost" onClick={ () => setExecDrawer(e.id) }>Trace</Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      { /* instance trace drawer */ }
      <Drawer
        open={ !!exec }
        onClose={ () => setExecDrawer(null) }
        title={ `Instance ${exec?.id ?? '' }`}
        subtitle={ exec ? `Task ${exec.taskCode } · ${ exec.status }` : ''}
        width="md"
      >
        { exec && (
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-ink-200 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-ink-400">Started</p>
                <p className="text-[11.5px] font-medium text-ink-800">{fmtDateTime(exec.startedAt) }</p>
              </div>
              <div className="rounded-lg border border-ink-200 p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-ink-400">Completed</p>
                <p className="text-[11.5px] font-medium text-ink-800">{ exec.completedAt ? fmtDateTime(exec.completedAt) : 'In progress' }</p>
              </div>
            </div>
            <div>
              <SectionTitle title="Stage history" />
              <ul className="space-y-0">
                { exec.history.map((h, i) => (
                  <li key={i } className="relative flex gap-2.5 pb-3">
                    { i < exec.history.length - 1 && <span className="absolute left-[6px] top-4 h-full w-px bg-ink-100" /> }
                    <span className="relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-white bg-brand-500 ring-1 ring-brand-200" />
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-ink-800">{ h.stage }</p>
                      <p className="text-[10.5px] text-ink-400">{ h.by } · { fmtDateTime(h.at) }</p>
                      <p className="text-[10.5px] text-brand-700">{ h.outcome }</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <SectionTitle title="Upcoming stages" />
              <ul className="space-y-1">
                { selected?.stages.slice(exec.currentStageIndex + 1).map((s) => (
                  <li key={s.id } className="flex items-center justify-between rounded-md border border-dashed border-ink-200 px-2 py-1">
                    <span className="text-[11.5px] text-ink-600">{ s.name }</span>
                    <span className="text-[10px] text-ink-400">{ s.owner }</span>
                  </li>
                ))}
                { selected && exec.currentStageIndex >= selected.stages.length - 1 && (
                  <li className="text-[11.5px] text-ink-400">This instance has reached the final stage.</li>
                ) }
              </ul>
            </div>
          </div>
        )}
      </Drawer>

      { /* editor */ }
      <Modal
        open={ editing && !!draft }
        onClose={ () => setEditing(false) }
        title="Edit workflow"
        description="Stage order, ownership, approval requirements and SLA targets."
        size="xl"
        footer={ <>
            { draftError && <p className="mr-auto text-[11.5px] font-medium text-red-600">{ draftError }</p> }
            <Button variant="secondary" onClick={() => setEditing(false) }>Cancel</Button>
            <Button
              variant="primary"
              disabled={ !!draftError }
              onClick={ () => {
                if (draft) saveWorkflow(draft);
                setEditing(false); }}
            >
              Save workflow
            </Button>
          </>
        }
      >
        { draft && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Workflow name" required>
                <Input value={draft.name } onChange={ (e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              <Field label="Applies to category">
                <Select value={ draft.category } onChange={ (e) => setDraft({ ...draft, category: e.target.value as Workflow['category'] })}>
                  <option value="All">All categories</option>
                  { CATEGORIES.map((c) => (
                    <option key={c } value={ c }>{ c }</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Description">
              <Textarea value={ draft.description } onChange={ (e) => setDraft({ ...draft, description: e.target.value })} />
            </Field>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Stages ({ draft.stages.length })</p>
                <Button
                  size="xs"
                  variant="secondary"
                  icon={ <Plus className="h-3 w-3" /> }
                  onClick={ () =>
                    setDraft({
                      ...draft, stages: [
                        ...draft.stages, {
                          id: uid('st'), name: `Stage ${draft.stages.length + 1 }`,
                          description: 'Describe what happens at this stage.',
                          owner: 'Human',
                          departmentId: 'dept-ops',
                          requiresApproval: false,
                          slaHours: 8,
                        },
                      ],
                    })
                  }
                >
                  Add stage
                </Button>
              </div>
              <div className="space-y-1.5">
                { draft.stages.map((s, i) => (
                  <div key={s.id } className="rounded-lg border border-ink-200 p-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[10px] font-bold text-ink-600">{ i + 1 }</span>
                      <Input
                        value={ s.name }
                        onChange={ (e) =>
                          setDraft({ ...draft, stages: draft.stages.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)) })
                        }
                        className="h-7 w-[168px] text-[11.5px]"
                        aria-label={ `Stage ${i + 1 } name`}
                      />
                      <Select
                        value={ s.owner }
                        onChange={ (e) =>
                          setDraft({ ...draft, stages: draft.stages.map((x) => (x.id === s.id ? { ...x, owner: e.target.value as WorkflowStage['owner'] } : x)) })
                        }
                        className="h-7 w-[104px] py-0 text-[11.5px]"
                        aria-label="Owner type"
                      >
                        <option value="BOT">BOT</option>
                        <option value="Human">Human</option>
                        <option value="Manager">Manager</option>
                      </Select>
                      <Select
                        value={ s.departmentId ?? '' }
                        onChange={ (e) =>
                          setDraft({ ...draft, stages: draft.stages.map((x) => (x.id === s.id ? { ...x, departmentId: (e.target.value || null) as WorkflowStage['departmentId'] } : x)) })
                        }
                        className="h-7 w-[128px] py-0 text-[11.5px]"
                        aria-label="Department"
                      >
                        <option value="">Any department</option>
                        { state.organization.departments.map((d) => (
                          <option key={d.id } value={ d.id }>{ d.name }</option>
                        ))}
                      </Select>
                      <Input
                        type="number"
                        min={ 1 }
                        value={ s.slaHours }
                        onChange={ (e) =>
                          setDraft({ ...draft, stages: draft.stages.map((x) => (x.id === s.id ? { ...x, slaHours: Number(e.target.value) } : x)) })
                        }
                        className="h-7 w-[64px] text-[11.5px]"
                        aria-label="Stage SLA hours"
                      />
                      <label className="flex items-center gap-1 text-[10.5px] text-ink-500">
                        <input
                          type="checkbox"
                          checked={ s.requiresApproval }
                          onChange={ (e) =>
                            setDraft({ ...draft, stages: draft.stages.map((x) => (x.id === s.id ? { ...x, requiresApproval: e.target.checked } : x)) })
                          }
                          className="accent-brand-600"
                        />
                        Approval
                      </label>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="ml-auto text-red-600 hover:bg-red-50"
                        onClick={ () => setDraft({ ...draft, stages: draft.stages.filter((x) => x.id !== s.id) })}
                        aria-label="Remove stage"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <Input
                      value={ s.description }
                      onChange={ (e) => setDraft({ ...draft, stages: draft.stages.map((x) => (x.id === s.id ? { ...x, description: e.target.value } : x)) })}
                      className="mt-1.5 h-7 text-[11px]"
                      aria-label={ `Stage ${i + 1 } description`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <CreateWorkflowModal
        open={ createOpen }
        onClose={ () => setCreateOpen(false) }
        onCreate={ (wf) => {
          saveWorkflow(wf);
          setSelectedId(wf.id);
          setCreateOpen(false); }}
      />

      <InfoNote>
        <strong>How stages drive the app.</strong> When a task is created, an instance is opened at “Request Submitted”. BOT stages advance
        automatically during automation runs; human and manager stages advance when the assignee or supervisor updates the task. Instances marked
        Failed correspond to SLA breaches or rejections.
      </InfoNote>
    </div>
  );
}

function CreateWorkflowModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (wf: Workflow) => void }) { const [name, setName] = useState('New operational process');
  const [description, setDescription] = useState('Describe the purpose of this process and which requests it governs.');
  const [category, setCategory] = useState<Workflow['category']>('All');
  const [stageNames, setStageNames] = useState<string[]>(['Request Submitted', 'Review', 'Completed']);

  return (
    <Modal
      open={open }
      onClose={ onClose }
      title="New workflow"
      description="Start from a three-stage skeleton, then refine stages in the editor."
      size="md"
      footer={ <>
          <Button variant="secondary" onClick={onClose }>Cancel</Button>
          <Button
            variant="primary"
            onClick={ () =>
              onCreate({
                id: uid('wf'), name, description, category, active: true, createdAt: new Date().toISOString(), stages: stageNames.filter(Boolean).map((n, i) => ({
                  id: uid('st'), name: n, description: `${n } stage of the ${ name } process.`,
                  owner: i === 0 ? 'Human' : i === stageNames.length - 1 ? 'BOT' : 'Manager',
                  departmentId: i === 0 || i === stageNames.length - 1 ? null : 'dept-ops',
                  requiresApproval: i > 0 && i < stageNames.length - 1,
                  slaHours: i === 0 ? 1 : 8,
                })),
                executions: [],
              })
            }
          >
            Create workflow
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name" required>
          <Input value={ name } onChange={ (e) => setName(e.target.value) } />
        </Field>
        <Field label="Description">
          <Textarea value={ description } onChange={ (e) => setDescription(e.target.value) } />
        </Field>
        <Field label="Applies to category">
          <Select value={ category } onChange={ (e) => setCategory(e.target.value as Workflow['category']) }>
            <option value="All">All categories</option>
            { CATEGORIES.map((c) => (
              <option key={c } value={ c }>{ c }</option>
            ))}
          </Select>
        </Field>
        <div>
          <p className="label">Stages</p>
          <div className="space-y-1.5">
            { stageNames.map((s, i) => (
              <div key={i } className="flex items-center gap-1.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[10px] font-bold text-ink-600">{ i + 1 }</span>
                <Input
                  value={ s }
                  onChange={ (e) => setStageNames(stageNames.map((x, xi) => (xi === i ? e.target.value : x))) }
                  className="h-7 text-[11.5px]"
                  aria-label={ `Stage ${i + 1 }`}
                />
                <Button size="xs" variant="ghost" onClick={ () => setStageNames(stageNames.filter((_, xi) => xi !== i)) } aria-label="Remove">
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <Button size="xs" variant="secondary" className="mt-1.5" icon={ <Plus className="h-3 w-3" /> } onClick={ () => setStageNames([...stageNames, 'New stage']) }>
            Add stage
          </Button>
        </div>
      </div>
    </Modal>
  );
}

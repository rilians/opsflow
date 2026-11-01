import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, AlertOctagon, Bot, CheckCircle2, ChevronDown, ChevronRight, Download, Filter, Gauge, History, Layers, Play, Plus, Settings2, SlidersHorizontal, Sparkles, Trash2, TriangleAlert, Workflow as WorkflowIcon, X, Zap } from 'lucide-react';
import { Badge, Button, Card, CardHeader, ConfirmDialog, Drawer, Dropdown, EmptyState, Field, Input, KeyValue, MenuItem, Modal, Pagination, Progress, Segmented, Select, Switch, Tabs, Tooltip } from '@/components/ui';
import { PageHeader, InfoNote, SectionTitle } from '@/components/shared/Page';
import { ExecutionStatusBadge, KpiCard } from '@/components/shared/bits';
import { ExecutionStatusChart } from '@/components/charts/Charts';
import { usePermissions, useStore } from '@/services/store';
import { automationPerformance, computeKpis, executionStats, executionTimeline } from '@/services/analytics';
import { BOT_KEYS } from '@/services/automationEngine';
import { cn, downloadFile, fmtDateTime, fmtNumber, fmtRelative, onActivateKey, toCsv } from '@/lib/utils';
import type { ActionType, AutomationRule, AutomationExecution, ConditionField, Operator, TriggerType } from '@/types';

/**
 * Trigger options for the builder.
 *
 * `task.created` is the only trigger the in-browser engine can actually observe —
 * there is no scheduler and no event bus. Offering the others would produce a rule
 * that claims to fire on an SLA breach but never does, so they are marked as
 * unavailable instead of silently ignored.
 */
const triggerOptions: { value: TriggerType; label: string; supported?: boolean }[] = [
  { value: 'task.created', label: 'When a new request is created', supported: true },
  { value: 'manual', label: 'On manual execution only', supported: true },
  { value: 'sla.approaching', label: 'When a task approaches its SLA deadline', supported: false },
  { value: 'sla.breached', label: 'When a task exceeds its SLA', supported: false },
  { value: 'schedule.daily', label: 'On a daily schedule', supported: false },
  { value: 'schedule.weekly', label: 'On a weekly schedule', supported: false },
  { value: 'task.updated', label: 'When a request is updated', supported: false },
];

const fieldOptions: { value: ConditionField; label: string }[] = [
  { value: 'category', label: 'Category' },
  { value: 'priority', label: 'Priority' },
  { value: 'department', label: 'Department' },
  { value: 'source', label: 'Request source' },
  { value: 'status', label: 'Status' },
  { value: 'completeness', label: 'Data completeness (%)' },
  { value: 'assignee', label: 'Assignee' },
];

const operatorOptions: { value: Operator; label: string }[] = [
  { value: 'equals', label: 'is equal to' },
  { value: 'not_equals', label: 'is not equal to' },
  { value: 'contains', label: 'contains' },
  { value: 'in', label: 'is one of' },
];

const actionOptions: { value: ActionType; label: string }[] = [
  { value: 'assign_department', label: 'Assign owning department' },
  { value: 'assign_user', label: 'Assign least-loaded employee' },
  { value: 'set_status', label: 'Set task status' },
  { value: 'notify_assignee', label: 'Notify assignee' },
  { value: 'notify_role', label: 'Notify role' },
  { value: 'flag_review', label: 'Flag for manual review' },
  { value: 'escalate', label: 'Escalate to operations manager' },
  { value: 'generate_report', label: 'Generate operational report' },
  { value: 'log_activity', label: 'Write activity log' },
];

type Tab = 'catalogue' | 'executions' | 'builder';

export function Automation() { const { state, runRule, setRuleEnabled, updateRule, deleteRule, toast } = useStore();
  const { isAdmin } = usePermissions();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(((params.get('tab') as Tab) ?? 'catalogue') as Tab);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(params.get('rule'));
  const [running, setRunning] = useState<string | null>(null);
  const [execDetail, setExecDetail] = useState<AutomationExecution | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AutomationRule | null>(null);
  const [configRule, setConfigRule] = useState<AutomationRule | null>(null);
  // Execution filters are URL-backed so a filtered view survives reload and can be
  // shared, matching how ?tab= and ?rule= already behave.
  const execFilter = (params.get('exec') as 'all' | 'Success' | 'Partial' | 'Failed' | null) ?? 'all';
  const setExecFilter = (value: 'all' | 'Success' | 'Partial' | 'Failed') =>
    setParams((prev) => { const next = new URLSearchParams(prev); if (value === 'all') next.delete('exec'); else next.set('exec', value); return next; }, { replace: true });
  const botFilter = params.get('bot') ?? 'all';
  const setBotFilter = (value: string) =>
    setParams((prev) => { const next = new URLSearchParams(prev); if (value === 'all') next.delete('bot'); else next.set('bot', value); return next; }, { replace: true });
  const [execPage, setExecPage] = useState(1);
  const [execPageSize, setExecPageSize] = useState(25);

  const stats = useMemo(() => executionStats(state), [state]);
  const perf = useMemo(() => automationPerformance(state), [state]);
  const kpis = useMemo(() => computeKpis(state), [state]);
  const timeline = useMemo(() => executionTimeline(state, 14), [state]);

  useEffect(() => { const r = params.get('rule');
    if (r) setSelectedRuleId(r);
    const t = params.get('tab') as Tab | null;
    if (t) setTab(t); }, [params]);

  const selectedRule = state.automations.find((r) => r.id === selectedRuleId) ?? null;

  // "View executions" used to only remember the rule id and leave the reviewer on the
  // catalogue tab, so nothing visibly happened. Switch to history pre-filtered instead.
  const openExecutionsFor = (ruleId: string) => {
    setBotFilter(ruleId);
    setExecFilter('all');
    setTab('executions');
    const next = new URLSearchParams(params);
    next.set('tab', 'executions');
    setParams(next, { replace: true });
  };

  const run = (rule: AutomationRule, opts?: { injectFault?: boolean }) => { setRunning(rule.id);
    window.setTimeout(() => {
      runRule(rule.id, { mode: 'Manual', injectFault: opts?.injectFault });
      setRunning(null);
    }, 520);
  };

  useEffect(() => { setExecPage(1); }, [execFilter, botFilter]);

  const executions = state.executions.filter((e) => { if (execFilter !== 'all' && e.status !== execFilter) return false;
    if (botFilter !== 'all' && e.ruleId !== botFilter) return false;
    return true; });

  const exportExecutions = () => { const headers = ['Execution ID', 'Automation', 'Trigger', 'Mode', 'Started', 'Ended', 'Duration (ms)', 'Status', 'Records', 'Summary', 'Error'];
    const rows = executions.map((e) => [
      e.id, e.ruleName, e.trigger, e.mode, fmtDateTime(e.startedAt), fmtDateTime(e.endedAt), e.durationMs, e.status, e.recordsProcessed, e.resultSummary, e.error ?? '', ]);
    downloadFile(`opsflow-bot-executions-${new Date().toISOString().slice(0, 10) }.csv`, toCsv(headers, rows));
    toast({ title: 'Execution log exported', description: `${executions.length } record(s).`, tone: 'success' });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Automation Center"
        description="Configure and execute the BOTs that carry repetitive BAU work. Every execution in this workspace is performed by a real in-browser rule engine — no success message is shown for work that did not happen."
        actions={ <>
            <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" /> } onClick={ exportExecutions }>
              Export log
            </Button>
            <Button variant="primary" size="sm" icon={ <Plus className="h-3.5 w-3.5" /> } onClick={ () => setTab('builder') } disabled={ !isAdmin }>
              New automation
            </Button>
          </>
        }
        meta={ <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="emerald" dot>{kpis.activeBots } active</Badge>
            <Badge tone="slate">{ state.automations.length } rules</Badge>
            <Badge tone="blue">{ fmtNumber(stats.total) } executions</Badge>
            { stats.failed > 0 && <Badge tone="red">{stats.failed } failed</Badge>}
            <span className="text-[11px] text-ink-400">Scheduled BOTs are simulated on demand — no background scheduler runs in this demo.</span>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <KpiCard label="Automation rules" value={ state.automations.length } icon={ <Layers className="h-3.5 w-3.5" /> } hint={ `${state.automations.filter((a) => a.enabled).length } enabled`} tone="blue" />
        <KpiCard label="Active automations" value={ kpis.activeBots } icon={ <Gauge className="h-3.5 w-3.5" /> } hint="Running on intake or schedule" tone="emerald" />
        <KpiCard label="Total executions" value={ fmtNumber(stats.total) } icon={ <History className="h-3.5 w-3.5" /> } hint={ `${stats.records } records processed`} tone="violet" trend={ timeline.map((t) => t.success) } />
        <KpiCard
          label="Success / failure"
          value={ <span className="text-[17px]">{stats.success }<span className="text-ink-400"> / </span><span className={ stats.failed ? 'text-red-600' : '' }>{ stats.failed }</span></span>}
          icon={ <CheckCircle2 className="h-3.5 w-3.5" /> }
          hint={ `${stats.partial } completed with warnings`}
          tone={ stats.failed ? 'amber' : 'emerald' }
          footer={ `${((stats.success / Math.max(1, stats.total)) * 100).toFixed(1) }% success rate`}
        />
        <KpiCard
          label="Time saved by automation"
          value={ `${fmtNumber(stats.minutesSaved / 60, 1) }h`}
          icon={ <Zap className="h-3.5 w-3.5" /> }
          hint={ `${fmtNumber(stats.minutesSaved) } minutes measured`}
          tone="emerald"
          footer="records × configured handling time"
        />
      </div>

      <Tabs
        value={ tab }
        onChange={ (v) => {
          setTab(v);
          const next = new URLSearchParams(params);
          next.set('tab', v);
          setParams(next, { replace: true });
        }}
        tabs={ [
          { value: 'catalogue', label: 'BOT catalogue', count: state.automations.length },
          { value: 'executions', label: 'Execution history', count: state.executions.length },
          { value: 'builder', label: 'Automation builder' },
        ]}
      />

      { tab === 'catalogue' && (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            {state.automations.map((rule) => {
              const p = perf.find((x) => x.id === rule.id)!;
              const execs = state.executions.filter((e) => e.ruleId === rule.id);
              const lastExec = execs[0];
              return (
                <Card key={rule.id } className={ cn('group relative overflow-hidden transition-shadow duration-200 hover:shadow-raised', !rule.enabled && 'opacity-95') }>
                  <span
                    className={ cn(
                      'absolute inset-y-0 left-0 w-[2px]',
                      !rule.enabled ? 'bg-ink-300' : lastExec?.status === 'Failed' ? 'bg-red-400' : 'bg-brand-500',
                    ) }
                  />
                  <div className="flex flex-col gap-3 p-3.5 pl-4 sm:flex-row sm:items-start">
                    <div
                      className={ cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', rule.enabled ? 'bg-brand-50 text-brand-600' : 'bg-ink-100 text-ink-400', ) }
                    >
                      <Bot className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="text-[13.5px] font-semibold text-ink-900">{ rule.name }</h3>
                        <Badge tone={ rule.enabled ? 'emerald' : 'slate' } dot>{ rule.enabled ? 'Active' : 'Disabled' }</Badge>
                        <Badge>{ rule.category }</Badge>
                        { lastExec?.status === 'Failed' && <Badge tone="red" dot>Last run failed</Badge> }
                      </div>
                      <p className="mt-1 text-[12px] leading-relaxed text-ink-500">{ rule.description }</p>

                      {/* The rule as a sentence: trigger → conditions → actions. */}
                      <div className="mt-2 flex flex-wrap items-center gap-1 text-[10.5px]">
                        <span className="rounded bg-ink-100 px-1.5 py-0.5 font-medium text-ink-700">
                          <span className="font-bold text-ink-500">WHEN</span> { rule.triggerLabel }
                        </span>
                        { rule.conditions.map((c) => (
                          <span key={c.id } className="rounded bg-sky-50 px-1.5 py-0.5 font-medium text-sky-800 ring-1 ring-inset ring-sky-200/70">
                            <span className="font-bold text-sky-700">IF</span> { fieldOptions.find((f) => f.value === c.field)?.label ?? c.field }{' '}
                            { operatorOptions.find((o) => o.value === c.operator)?.label ?? c.operator } { c.value }
                          </span>
                        ))}
                        <span className="rounded bg-brand-50 px-1.5 py-0.5 font-medium text-brand-800 ring-1 ring-inset ring-brand-200/70">
                          <span className="font-bold text-brand-700">THEN</span> { rule.actions.length } action(s)
                        </span>
                      </div>

                      <div className="mt-2.5 grid grid-cols-2 divide-ink-100 rounded-lg border border-ink-100 bg-ink-50/40 sm:grid-cols-4 sm:divide-x">
                        <Metric label="Executions" value={ fmtNumber(p.runs) } />
                        <Metric label="Records" value={ fmtNumber(p.records) } />
                        <Metric label="Time saved" value={ `${fmtNumber(p.minutesSaved) }m`} />
                        <Metric label="Success" value={ `${p.successRate.toFixed(0) }%`} tone={ p.failed ? 'amber' : 'emerald' } />
                      </div>
                      <p className="mt-1.5 text-[10.5px] text-ink-400">
                        Last run { rule.lastRunAt ? fmtRelative(rule.lastRunAt) : 'never' } · { rule.frequency === 'n/a' ? 'event-driven' : `${rule.frequency } schedule (simulated)`}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <Switch
                          checked={ rule.enabled }
                          onChange={ (v) => {
                            if (!isAdmin) {
                              toast({ title: 'Administrator role required', description: 'Switch persona to Aulia Rahman to change automation state.', tone: 'warning' });
                              return;
                            }
                            setRuleEnabled(rule.id, v);
                          }}
                          label={ `Toggle ${rule.name }`}
                        />
                        <Dropdown
                          trigger={ ({ toggle }) => (
                            <Button size="xs" variant="ghost" onClick={ toggle } aria-label="Automation actions">•••</Button>
                          )}
                        >
                          { ({ close }) => (
                            <>
                              <MenuItem icon={ <Play className="h-3.5 w-3.5" /> } onClick={ () => { close(); run(rule); }}>
                                Run now
                              </MenuItem>
                              <MenuItem icon={ <SlidersHorizontal className="h-3.5 w-3.5" /> } onClick={ () => { close(); setConfigRule(rule); }} disabled={ !isAdmin }>
                                Configure
                              </MenuItem>
                              <MenuItem icon={ <TriangleAlert className="h-3.5 w-3.5" /> } onClick={ () => { close(); run(rule, { injectFault: true }); }}>
                                Simulate failure
                              </MenuItem>
                              <MenuItem icon={ <Activity className="h-3.5 w-3.5" /> } onClick={ () => { close(); openExecutionsFor(rule.id); }}>
                                View executions
                              </MenuItem>
                              { !rule.builtIn && (
                                <>
                                  <div className="my-1 border-t border-ink-100" />
                                  <MenuItem danger icon={<Trash2 className="h-3.5 w-3.5" /> } onClick={ () => { close(); setConfirmDelete(rule); }} disabled={ !isAdmin }>
                                    Delete automation
                                  </MenuItem>
                                </>
                              )}
                            </>
                          )}
                        </Dropdown>
                      </div>
                      <Button
                        size="xs"
                        variant={ rule.enabled ? 'primary' : 'secondary' }
                        loading={ running === rule.id }
                        onClick={ () => run(rule) }
                        icon={ <Play className="h-3 w-3" /> }
                      >
                        Execute
                      </Button>
                    </div>
                  </div>
                  { lastExec && (
                    <div className="flex items-center gap-2 border-t border-ink-100 bg-ink-50/50 px-3.5 py-1.5">
                      <ExecutionStatusBadge status={lastExec.status } />
                      <p className="min-w-0 flex-1 truncate text-[10.5px] text-ink-500">
                        { lastExec.id } · { lastExec.resultSummary }
                      </p>
                      <button onClick={ () => setExecDetail(lastExec) } className="shrink-0 text-[10.5px] font-medium text-brand-700 hover:underline">
                        Details
                      </button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Execution health" subtitle="Last 14 days by outcome" />
              <div className="px-2 py-2">
                <ExecutionStatusChart data={ timeline } height={ 168 } />
              </div>
            </Card>

            <Card>
              <CardHeader title="Automation value ranking" subtitle="Measured minutes saved" icon={ <Zap className="h-4 w-4 text-brand-600" /> } />
              <ol className="divide-y divide-ink-50">
                { perf.slice(0, 5).map((p, i) => {
                  const max = Math.max(...perf.map((x) => x.minutesSaved), 1);
                  return (
                    <li key={p.id } className="px-3.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-ink-700">
                          <span className="mr-1.5 text-ink-400">{ i + 1 }.</span>
                          { p.name }
                        </span>
                        <span className="shrink-0 text-[11px] font-semibold tabular text-ink-800">{ fmtNumber(p.minutesSaved) }m</span>
                      </div>
                      <Progress value={ (p.minutesSaved / max) * 100 } className="mt-1" height="h-1" tone={ p.failed ? 'amber' : 'emerald' } />
                    </li>
                  );
                })}
              </ol>
            </Card>

            <Card>
              <CardHeader title="What actually happens" subtitle="Engine internals" icon={ <Settings2 className="h-4 w-4 text-ink-400" /> } />
              <div className="space-y-1.5 p-3.5">
                { [
                  ['1', 'BOT loads a deep copy of the workspace state'], ['2', 'Trigger + IF conditions are evaluated per record'], ['3', 'Actions mutate tasks, notifications and workflows'], ['4', 'Execution record, activity log and audit trail written'], ['5', 'State committed; duplicate notifications suppressed'], ].map(([n, t]) => (
                  <div key={n } className="flex gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[9px] font-bold text-ink-600">{ n }</span>
                    <p className="text-[11px] leading-snug text-ink-600">{ t }</p>
                  </div>
                ))}
                <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[10.5px] leading-snug text-amber-800">
                  Failures are caught mid-transaction; the run is recorded as Failed and no partial records are committed.
                </p>
              </div>
            </Card>
          </div>
        </div>
      )}

      { tab === 'executions' && (
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 p-3">
            <Segmented
              value={execFilter }
              onChange={ setExecFilter }
              options={ [
                { value: 'all', label: 'All' },
                { value: 'Success', label: 'Success' },
                { value: 'Partial', label: 'Partial' },
                { value: 'Failed', label: 'Failed' },
              ]}
            />
            <Select value={ botFilter } onChange={ (e) => setBotFilter(e.target.value) } className="h-8 w-[210px] py-0 text-[12px]" aria-label="Filter by automation">
              <option value="all">All automations</option>
              { state.automations.map((r) => (
                <option key={r.id } value={ r.id }>{ r.name }</option>
              ))}
            </Select>
            <span className="ml-auto text-[11.5px] text-ink-500">{ executions.length } execution record(s)</span>
          </div>
          { executions.length === 0 ? (
            <EmptyState title="No executions match this filter" description="Try a different outcome or automation." icon={<History className="h-4.5 w-4.5" /> } />
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="relative w-full min-w-[900px]">
                <thead className="sticky top-0 z-10 border-b border-ink-200/80 bg-ink-50/95 backdrop-blur">
                  <tr>
                    <th className="th pl-4">Execution</th>
                    <th className="th">Automation</th>
                    <th className="th">Trigger</th>
                    <th className="th">Started</th>
                    <th className="th text-right">Duration</th>
                    <th className="th text-right">Records</th>
                    <th className="th">Status</th>
                    <th className="th pr-4 text-right sr-only">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50">
                  { executions.slice((execPage - 1) * execPageSize, execPage * execPageSize).map((e) => (
                    <tr
                      key={e.id }
                      role="button"
                      tabIndex={ 0 }
                      data-row-interactive=""
                      aria-label={ `Inspect execution ${e.id} — ${e.ruleName}, ${e.status}` }
                      className="group cursor-pointer transition-colors hover:bg-ink-50/60"
                      onClick={ () => setExecDetail(e) }
                      onKeyDown={ onActivateKey(() => setExecDetail(e)) }
                    >
                      <td className="td pl-4 whitespace-nowrap tabular text-[11.5px] font-medium text-ink-700">{ e.id }</td>
                      <td className="td max-w-[210px]">
                        <p className="truncate text-[12px] font-medium text-ink-800">{ e.ruleName }</p>
                        <p className="text-[10px] text-ink-400">{ e.botKey } <span className="text-ink-300">·</span> { e.mode }</p>
                      </td>
                      <td className="td whitespace-nowrap text-[11px] text-ink-500">{ e.trigger }</td>
                      <td className="td whitespace-nowrap text-[11px]">{ fmtDateTime(e.startedAt) }</td>
                      <td className="td whitespace-nowrap text-right tabular text-[11px] text-ink-500">{ e.durationMs }ms</td>
                      <td className="td text-right tabular text-[11.5px]">{ e.recordsProcessed }</td>
                      <td className="td">
                        <Tooltip content={ e.error ?? e.resultSummary }>
                          <span><ExecutionStatusBadge status={ e.status } /></span>
                        </Tooltip>
                      </td>
                      <td className="td pr-4 text-right">
                        <button
                          type="button"
                          onClick={ (ev) => { ev.stopPropagation(); setExecDetail(e); } }
                          aria-label={ `Inspect execution ${e.id}` }
                          className="rounded p-1 text-ink-300 opacity-0 transition-opacity hover:bg-ink-100 hover:text-ink-700 group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {executions.length > 0 && (
            <Pagination
              page={ execPage }
              pageSize={ execPageSize }
              total={ executions.length }
              onPage={ setExecPage }
              onPageSize={ (n) => { setExecPageSize(n); setExecPage(1); } }
            />
          )}
        </Card>
      )}

      { tab === 'builder' && <AutomationBuilder onCreated={() => setTab('catalogue') } />}

      { /* rule drawer */ }
      <Drawer
        open={ !!selectedRule }
        onClose={ () => {
          setSelectedRuleId(null);
          const next = new URLSearchParams(params);
          next.delete('rule');
          setParams(next, { replace: true });
        }}
        title={ selectedRule?.name ?? '' }
        subtitle={ selectedRule ? `${selectedRule.category } · ${ selectedRule.triggerLabel }` : ''}
        width="lg"
        footer={ selectedRule && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-ink-500">{selectedRule.totalExecutions } total executions recorded</span>
              <Button variant="primary" size="sm" loading={ running === selectedRule.id } icon={ <Play className="h-3.5 w-3.5" /> } onClick={ () => run(selectedRule) }>
                Execute now
              </Button>
            </div>
          )
        }
      >
        { selectedRule && (
          <div className="space-y-4 p-4">
            <p className="text-[12.5px] leading-relaxed text-ink-600">{selectedRule.description }</p>
            <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-3">
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">Logic</p>
              <div className="space-y-1.5">
                <LogicRow tone="ink" label="WHEN" value={ selectedRule.triggerLabel } />
                { selectedRule.conditions.length === 0 ? (
                  <LogicRow tone="slate" label="IF" value="No additional conditions" />
                ) : (
                  selectedRule.conditions.map((c) => (
                    <LogicRow
                      key={c.id }
                      tone="sky"
                      label="IF"
                      value={ `${fieldOptions.find((f) => f.value === c.field)?.label ?? c.field } ${ operatorOptions.find((o) => o.value === c.operator)?.label ?? c.operator } ${ c.value }`}
                    />
                  ))
                )}
                { selectedRule.actions.map((a) => (
                  <LogicRow key={a.id } tone="brand" label="THEN" value={ actionOptions.find((x) => x.value === a.type)?.label ?? a.type } />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-ink-100 rounded-lg border border-ink-200 bg-ink-50/50">
              <div className="p-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-400">Success rate</p>
                <p className="figure mt-0.5 text-[17px] font-semibold text-ink-900">
                  { (((selectedRule.totalExecutions - selectedRule.failedExecutions) / Math.max(1, selectedRule.totalExecutions)) * 100).toFixed(1) }%
                </p>
              </div>
              <div className="p-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-400">Records processed</p>
                <p className="figure mt-0.5 text-[17px] font-semibold text-ink-900">{ fmtNumber(selectedRule.recordsProcessed) }</p>
              </div>
            </div>
            <div>
              <SectionTitle title="Execution history" />
              <ul className="space-y-1.5">
                { state.executions.filter((e) => e.ruleId === selectedRule.id).slice(0, 12).map((e) => (
                  <li key={e.id }>
                    <button
                      type="button"
                      onClick={ () => setExecDetail(e) }
                      className="group w-full rounded-lg border border-ink-200 bg-white p-2.5 text-left transition-colors hover:border-ink-300 hover:bg-ink-50/60"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <ExecutionStatusBadge status={ e.status } />
                        <span className="tabular text-[10px] text-ink-400">{ fmtDateTime(e.startedAt) }</span>
                      </div>
                      <p className="mt-1 text-[11px] leading-snug text-ink-600">{ e.resultSummary }</p>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[10px] text-ink-400">{ e.recordsProcessed } record(s) · { e.durationMs }ms</span>
                        <span className="flex items-center gap-0.5 text-[10px] font-medium text-brand-700 group-hover:underline">
                          Inspect
                          <ChevronRight className="h-3 w-3" />
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
                { state.executions.filter((e) => e.ruleId === selectedRule.id).length === 0 && (
                  <li className="rounded-lg border border-dashed border-ink-200 py-5 text-center text-[11.5px] text-ink-400">
                    This automation has not been executed yet.
                  </li>
                ) }
              </ul>
            </div>
          </div>
        )}
      </Drawer>

      { /* execution detail */ }
      <Modal
        open={ !!execDetail }
        onClose={ () => setExecDetail(null) }
        title={ execDetail ? `Execution ${execDetail.id }` : ''}
        description={ execDetail?.ruleName }
        size="lg"
        footer={ <Button variant="secondary" onClick={() => setExecDetail(null) }>Close</Button>}
      >
        { execDetail && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'Status', value: <ExecutionStatusBadge status={execDetail.status } /> },
                { label: 'Trigger', value: execDetail.trigger },
                { label: 'Mode', value: execDetail.mode },
                { label: 'Duration', value: `${execDetail.durationMs }ms` },
              ].map((x) => (
                <div key={ x.label } className="rounded-lg border border-ink-200 p-2">
                  <p className="text-[10px] uppercase tracking-wide text-ink-400">{ x.label }</p>
                  <div className="mt-0.5 text-[11.5px] font-medium text-ink-800">{ x.value }</div>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-ink-200">
              <div className="border-b border-ink-100 bg-ink-50/50 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">Result summary</div>
              <p className="px-3 py-2.5 text-[12px] leading-relaxed text-ink-700">{ execDetail.resultSummary }</p>
            </div>
            { execDetail.error && (
              <div className="rounded-lg border border-red-200 bg-red-50/70 p-3">
                <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-red-800">
                  <AlertOctagon className="h-3.5 w-3.5" /> Error detail
                </p>
                <p className="mt-1 font-mono text-[11px] leading-relaxed text-red-700">{execDetail.error }</p>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-ink-200 p-2.5">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Timing</p>
                <KeyValue label="Started">{ fmtDateTime(execDetail.startedAt) }</KeyValue>
                <KeyValue label="Ended">{ fmtDateTime(execDetail.endedAt) }</KeyValue>
                <KeyValue label="Records processed">{ execDetail.recordsProcessed }</KeyValue>
              </div>
              <div className="rounded-lg border border-ink-200 p-2.5">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Metrics</p>
                { execDetail.metrics && Object.keys(execDetail.metrics).length ? (
                  Object.entries(execDetail.metrics).map(([k, v]) => (
                    <KeyValue key={k } label={ k }>{ String(v) }</KeyValue>
                  ))
                ) : (
                  <p className="text-[11.5px] text-ink-400">No metrics recorded.</p>
                )}
              </div>
            </div>
            { execDetail.affectedTaskIds.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Affected records ({execDetail.affectedTaskIds.length })</p>
                <div className="flex flex-wrap gap-1">
                  { execDetail.affectedTaskIds.slice(0, 20).map((id) => {
                    const t = state.tasks.find((x) => x.id === id);
                    return (
                      <button
                        key={id }
                        onClick={ () => {
                          if (!t) return;
                          setExecDetail(null);
                          navigate(`/tasks?task=${t.id }`);
                        }}
                        className="rounded border border-ink-200 bg-white px-1.5 py-0.5 text-[10.5px] text-ink-600 hover:border-brand-300 hover:text-brand-700"
                      >
                        { t?.code ?? id }
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      { /* configure rule */ }
      <ConfigureRuleModal
        rule={ configRule }
        onClose={ () => setConfigRule(null) }
        onSave={ (patch) => {
          if (!configRule) return;
          updateRule(configRule.id, patch);
          setConfigRule(null); }}
      />

      <ConfirmDialog
        open={ !!confirmDelete }
        onClose={ () => setConfirmDelete(null) }
        onConfirm={ () => confirmDelete && deleteRule(confirmDelete.id) }
        title="Delete this automation?"
        description={ `“${confirmDelete?.name }” will be removed. Historical execution records are retained for audit.`}
        confirmLabel="Delete automation"
      />

      <InfoNote>
        <strong>Honest automation.</strong> These six BOTs are real: they read workspace data, evaluate conditions and mutate records. Use{ ' ' }
        <em>Simulate failure</em> on any rule to see the failure path — the execution is marked Failed, no records are committed, and an Automation
        Failure notification is raised.
      </InfoNote>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'amber' }) { return (
    <div className="px-2.5 py-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-400">{label }</p>
      <p className={ cn('figure text-[12.5px] font-semibold', tone === 'amber' ? 'text-amber-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-ink-900') }>{ value }</p>
    </div>
  );
}

function LogicRow({ label, value, tone }: { label: string; value: string; tone: 'ink' | 'sky' | 'brand' | 'slate' }) { const tones = {
    ink: 'border-ink-200 bg-white text-ink-700', sky: 'border-sky-200 bg-sky-50 text-sky-800', brand: 'border-brand-200 bg-brand-50 text-brand-800', slate: 'border-ink-200 bg-ink-50 text-ink-500' };
  return (
    <div className={ cn('flex items-start gap-2 rounded-md border px-2 py-1', tones[tone]) }>
      <span className="mt-px w-9 shrink-0 text-[9.5px] font-bold uppercase tracking-wide opacity-70">{ label }</span>
      <span className="text-[11.5px] font-medium leading-snug">{ value }</span>
    </div>
  );
}

function ConfigureRuleModal({ rule, onClose, onSave }: { rule: AutomationRule | null;
  onClose: () => void;
  onSave: (patch: Partial<AutomationRule>) => void; }) { const [threshold, setThreshold] = useState(rule?.threshold ?? 75);
  const [freq, setFreq] = useState<NonNullable<AutomationRule['frequency']>>(rule?.frequency ?? 'n/a');
  const [name, setName] = useState(rule?.name ?? '');
  const [conditions, setConditions] = useState(rule?.conditions ?? []);

  useEffect(() => {
    if (rule) {
      setThreshold(rule.threshold ?? 75);
      setFreq(rule.frequency ?? 'n/a');
      setName(rule.name);
      setConditions(rule.conditions); }
  }, [rule]);

  if (!rule) return null;

  return (
    <Modal
      open={ !!rule }
      onClose={ onClose }
      title="Configure automation"
      description={ rule.name }
      size="md"
      footer={ <>
          <Button variant="secondary" onClick={onClose }>Cancel</Button>
          <Button variant="primary" onClick={ () => onSave({ threshold, frequency: freq, name, conditions })}>
            Save configuration
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Automation name">
          <Input value={ name } onChange={ (e) => setName(e.target.value) } />
        </Field>
        <Field label="Execution frequency" hint="Scheduled frequencies are simulated on demand in this demo.">
          <Select value={ freq } onChange={ (e) => setFreq(e.target.value as NonNullable<AutomationRule['frequency']>) }>
            <option value="n/a">Event-driven (no schedule)</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </Select>
        </Field>
        { (rule.botKey === 'deadline_reminder' || rule.botKey === 'duplicate_detection') && (
          <Field
            label={rule.botKey === 'deadline_reminder' ? 'Reminder threshold (% of SLA consumed)' : 'Similarity threshold (%)' }
            hint={ rule.botKey === 'deadline_reminder'
                ? 'Tasks that have consumed this share of their SLA window receive a reminder.'
                : 'Title similarity above this percentage flags a potential duplicate.' }
          >
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={ 30 }
                max={ 95 }
                step={ 5 }
                value={ threshold }
                onChange={ (e) => setThreshold(Number(e.target.value)) }
                className="w-full accent-brand-600"
                aria-label="Threshold"
              />
              <span className="w-10 shrink-0 text-right text-[12px] font-semibold tabular text-ink-800">{ threshold }%</span>
            </div>
          </Field>
        )}
        <div>
          <p className="label">Trigger conditions</p>
          <div className="space-y-1.5">
            { conditions.map((c) => (
              <div key={c.id } className="flex items-center gap-1.5">
                <Select
                  value={ c.field }
                  onChange={ (e) => setConditions(conditions.map((x) => (x.id === c.id ? { ...x, field: e.target.value as ConditionField } : x)))}
                  className="h-8 py-0 text-[11.5px]"
                >
                  { fieldOptions.map((f) => (
                    <option key={f.value } value={ f.value }>{ f.label }</option>
                  ))}
                </Select>
                <Select
                  value={ c.operator }
                  onChange={ (e) => setConditions(conditions.map((x) => (x.id === c.id ? { ...x, operator: e.target.value as Operator } : x)))}
                  className="h-8 py-0 text-[11.5px]"
                >
                  { operatorOptions.map((o) => (
                    <option key={o.value } value={ o.value }>{ o.label }</option>
                  ))}
                </Select>
                <Input
                  value={ c.value }
                  onChange={ (e) => setConditions(conditions.map((x) => (x.id === c.id ? { ...x, value: e.target.value } : x)))}
                  className="h-8 text-[11.5px]"
                />
                <Button size="xs" variant="ghost" onClick={ () => setConditions(conditions.filter((x) => x.id !== c.id)) } aria-label="Remove condition">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            { conditions.length === 0 && <p className="text-[11.5px] text-ink-400">No conditions — this BOT applies to every matching record.</p> }
          </div>
          <Button
            size="xs"
            variant="secondary"
            className="mt-2"
            icon={ <Plus className="h-3 w-3" /> }
            onClick={ () => setConditions([...conditions, { id: `c-${Date.now() }`, field: 'category', operator: 'equals', value: 'IT Support' }])}
          >
            Add condition
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ builder */

function AutomationBuilder({ onCreated }: { onCreated: () => void }) {
  const { state, createRule, toast } = useStore();
  const [name, setName] = useState('Route critical IT incidents to senior engineer');
  const [trigger, setTrigger] = useState<TriggerType>('task.created');
  const [conditions, setConditions] = useState([{ id: 'c1', field: 'category' as ConditionField, operator: 'equals' as Operator, value: 'IT Support' }]);
  const [actions, setActions] = useState<ActionType[]>(['assign_department', 'assign_user', 'notify_assignee', 'log_activity']);
  const [threshold] = useState(6);
  const [preview, setPreview] = useState<{ matched: number; samples: { code: string; title: string }[] } | null>(null);

  const evaluate = () => { const matched = state.tasks.filter((t) => {
      return conditions.every((c) => {
        const left = String((t as unknown as Record<string, unknown>)[c.field] ?? '').toLowerCase();
        const right = c.value.toLowerCase();
        if (c.operator === 'equals') return left === right;
        if (c.operator === 'not_equals') return left !== right;
        if (c.operator === 'contains') return left.includes(right);
        return c.value.split(',').map((v) => v.trim().toLowerCase()).includes(left); });
    });
    setPreview({ matched: matched.length, samples: matched.slice(0, 5).map((t) => ({ code: t.code, title: t.title })) });
  };

  const save = () => { if (!name.trim()) {
      toast({ title: 'Name required', tone: 'error' });
      return;
    }
    if (actions.length === 0) { toast({ title: 'Add at least one action', tone: 'error' });
      return;
    }
    if (triggerOptions.find((t) => t.value === trigger)?.supported === false) {
      toast({
        title: 'Trigger not available in this build',
        description: 'Pick “When a new request is created” or “On manual execution only”.',
        tone: 'error',
      });
      return;
    }
    createRule({ name: name.trim(), botKey: 'smart_assignment', description: `Builder rule · ${triggerOptions.find((t) => t.value === trigger)?.label }. Runs the registered Smart Assignment implementation, restricted to the conditions you configured — the THEN list documents the steps it performs rather than scripting arbitrary actions.`,
      trigger,
      triggerLabel: triggerOptions.find((t) => t.value === trigger)?.label ?? 'When triggered',
      conditions,
      actions: actions.map((a, i) => ({ id: `a${i }`, type: a, params: {} })),
      enabled: true,
      frequency: 'n/a',
      threshold,
      category: 'Assignment',
      lastRunAt: null,
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      recordsProcessed: 0,
      minutesSavedPerRecord: 5,
    });
    onCreated();
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader title="Automation builder" subtitle="Compose a rule as WHEN → IF → THEN. Saved rules run through the same engine as the built-in BOTs." icon={ <Sparkles className="h-4 w-4 text-brand-600" /> } />
        <div className="space-y-4 p-4">
          <Field label="Automation name" required>
            <Input value={ name } onChange={ (e) => setName(e.target.value) } placeholder="e.g. Escalate critical hardware requests" />
          </Field>

          <div className="rounded-lg border border-ink-200 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-500">
              <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[9px] text-white">WHEN</span> Trigger
            </p>
            <Select value={ trigger } onChange={ (e) => setTrigger(e.target.value as TriggerType) }>
              { triggerOptions.map((t) => (
                <option key={t.value } value={ t.value } disabled={ t.supported === false }>
                  { t.label }{ t.supported === false ? ' — unavailable in this build' : '' }
                </option>
              ))}
            </Select>
            <p className="mt-1.5 text-[10.5px] leading-snug text-amber-800">
              Only the creation event and manual execution can be observed in-browser. Scheduled and SLA-event triggers need a server-side worker,
              so they are listed but disabled rather than silently ignored.
            </p>
          </div>

          <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-sky-700">
                <span className="rounded bg-sky-600 px-1.5 py-0.5 text-[9px] text-white">IF</span> Conditions (all must match)
              </p>
              <Button
                size="xs"
                variant="secondary"
                icon={ <Plus className="h-3 w-3" /> }
                onClick={ () => setConditions([...conditions, { id: `c${Date.now() }`, field: 'priority', operator: 'equals', value: 'High' }])}
              >
                Add
              </Button>
            </div>
            <div className="space-y-1.5">
              { conditions.map((c) => (
                <div key={c.id } className="flex flex-wrap items-center gap-1.5 rounded-md border border-sky-200 bg-white p-1.5">
                  <Select
                    value={ c.field }
                    onChange={ (e) => setConditions(conditions.map((x) => (x.id === c.id ? { ...x, field: e.target.value as ConditionField } : x)))}
                    className="h-7 w-[126px] py-0 text-[11.5px]"
                  >
                    { fieldOptions.map((f) => (
                      <option key={f.value } value={ f.value }>{ f.label }</option>
                    ))}
                  </Select>
                  <Select
                    value={ c.operator }
                    onChange={ (e) => setConditions(conditions.map((x) => (x.id === c.id ? { ...x, operator: e.target.value as Operator } : x)))}
                    className="h-7 w-[112px] py-0 text-[11.5px]"
                  >
                    { operatorOptions.map((o) => (
                      <option key={o.value } value={ o.value }>{ o.label }</option>
                    ))}
                  </Select>
                  <Input
                    value={ c.value }
                    onChange={ (e) => setConditions(conditions.map((x) => (x.id === c.id ? { ...x, value: e.target.value } : x)))}
                    className="h-7 flex-1 text-[11.5px]"
                  />
                  <Button size="xs" variant="ghost" onClick={ () => setConditions(conditions.filter((x) => x.id !== c.id)) } aria-label="Remove">
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              { conditions.length === 0 && <p className="text-[11.5px] text-sky-700">No conditions — the rule applies to all matching triggers.</p> }
            </div>
          </div>

          <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-700">
                <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[9px] text-white">THEN</span> Actions
              </p>
              <Button
                size="xs"
                variant="secondary"
                icon={ <Plus className="h-3 w-3" /> }
                onClick={ () => setActions([...actions, 'log_activity']) }
              >
                Add
              </Button>
            </div>
            <div className="space-y-1">
              { actions.map((a, i) => (
                <div key={`${a }-${ i }`} className="flex items-center gap-1.5 rounded-md border border-brand-200 bg-white px-2 py-1">
                  <span className="text-[9.5px] font-bold text-brand-600">{ i + 1 }</span>
                  <Select
                    value={ a }
                    onChange={ (e) => setActions(actions.map((x, xi) => (xi === i ? (e.target.value as ActionType) : x))) }
                    className="h-7 flex-1 py-0 text-[11.5px]"
                  >
                    { actionOptions.map((o) => (
                      <option key={o.value } value={ o.value }>{ o.label }</option>
                    ))}
                  </Select>
                  <Button size="xs" variant="ghost" onClick={ () => setActions(actions.filter((_, xi) => xi !== i)) } aria-label="Remove action">
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              { actions.length === 0 && <p className="text-[11.5px] text-brand-700">Add at least one action.</p> }
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" icon={ <Filter className="h-3.5 w-3.5" /> } onClick={ evaluate }>
              Test against current data
            </Button>
            <Button variant="primary" icon={ <CheckCircle2 className="h-3.5 w-3.5" /> } onClick={ save }>
              Save automation
            </Button>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Workflow preview" subtitle="How this rule will read" icon={ <WorkflowIcon className="h-4 w-4 text-ink-400" /> } />
          <div className="space-y-2 p-3.5">
            <div className="rounded-lg border border-ink-800 bg-ink-900 p-2.5 text-white">
              <p className="text-[9px] font-bold uppercase tracking-wider text-navy-300">When</p>
              <p className="mt-0.5 text-[11.5px] font-medium">{ triggerOptions.find((t) => t.value === trigger)?.label }</p>
            </div>
            <div className="flex justify-center"><ChevronDown className="h-3.5 w-3.5 text-ink-400" /></div>
            <div className="rounded-lg border border-sky-300 bg-sky-50 p-2.5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-sky-700">If</p>
              { conditions.length === 0 ? (
                <p className="mt-0.5 text-[11.5px] text-sky-900">always</p>
              ) : (
                <ul className="mt-0.5 space-y-0.5">
                  {conditions.map((c, i) => (
                    <li key={c.id } className="text-[11px] text-sky-900">
                      { i > 0 && <span className="mr-1 font-semibold text-sky-700">AND</span> }
                      { fieldOptions.find((f) => f.value === c.field)?.label } { operatorOptions.find((o) => o.value === c.operator)?.label } <strong>{ c.value }</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex justify-center"><ChevronDown className="h-3.5 w-3.5 text-ink-400" /></div>
            <div className="rounded-lg border border-brand-300 bg-brand-50 p-2.5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-brand-700">Then</p>
              <ul className="mt-0.5 space-y-0.5">
                { actions.map((a, i) => (
                  <li key={`${a }-${ i }`} className="text-[11px] text-brand-900">
                    { i > 0 && <span className="mr-1 font-semibold text-brand-700">AND</span> }
                    { actionOptions.find((o) => o.value === a)?.label }
                  </li>
                ))}
                { actions.length === 0 && <li className="text-[11px] text-brand-700">No actions yet</li> }
              </ul>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Dry run" subtitle="Conditions evaluated against live records" icon={ <Gauge className="h-4 w-4 text-ink-400" /> } />
          <div className="p-3.5">
            { preview ? (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[22px] font-semibold tabular text-ink-900">{preview.matched }</span>
                  <span className="text-[11.5px] text-ink-500">record(s) currently match</span>
                </div>
                <ul className="mt-2 space-y-1">
                  { preview.samples.map((s) => (
                    <li key={s.code } className="truncate text-[11px] text-ink-600">
                      <span className="font-medium text-ink-800">{ s.code }</span> · { s.title }
                    </li>
                  ))}
                  { preview.matched === 0 && <li className="text-[11px] text-ink-400">No records match — widen the conditions.</li> }
                </ul>
              </>
            ) : (
              <p className="text-[11.5px] text-ink-500">Run a dry test to see how many records the rule would touch today.</p>
            )}
            <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[10.5px] leading-snug text-amber-800">
              Dry runs never mutate data. Saving a rule makes it available in the catalogue immediately.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Engine capabilities" subtitle="Registered BOT implementations" />
          <ul className="space-y-1 p-3.5">
            { BOT_KEYS.map((k) => (
              <li key={k } className="flex items-center gap-1.5 text-[11px] text-ink-600">
                <CheckCircle2 className="h-3 w-3 text-brand-600" />
                <span className="font-mono text-[10.5px]">{ k }</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

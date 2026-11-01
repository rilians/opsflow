import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertOctagon, ArrowRight, Bot, CheckCircle2, Clock, Gauge, ListChecks, PlayCircle, RefreshCw, ShieldCheck, Sparkles, Timer, TrendingUp, TriangleAlert, Zap } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, Progress, Segmented, Select, Tooltip } from '@/components/ui';
import { PageHeader, InfoNote } from '@/components/shared/Page';
import { KpiCard, HealthBadge, StatusBadge, PriorityBadge } from '@/components/shared/bits';
import { ChartLegendList, CompletionTrendChart, DepartmentWorkloadChart, ExecutionStatusChart, ManualVsAutomatedChart, SlaTrendChart, StatusDonutChart } from '@/components/charts/Charts';
import { useStore } from '@/services/store';
import { attentionTasks, automationPerformance, buildTrend, computeKpis, executionTimeline, slaOverview, statusDistribution, workloadByDepartment } from '@/services/analytics';
import { taskHealth } from '@/services/automationEngine';
import { cn, fmtCompact, fmtDateTime, fmtNumber, fmtRelative } from '@/lib/utils';

const activityIcon: Record<string, React.ReactNode> = { 'task.created': <ListChecks className="h-3.5 w-3.5" />, 'task.assigned': <Sparkles className="h-3.5 w-3.5" />, 'task.status': <RefreshCw className="h-3.5 w-3.5" />, 'task.comment': <Activity className="h-3.5 w-3.5" />, 'bot.execution': <Bot className="h-3.5 w-3.5" />, 'workflow.completed': <CheckCircle2 className="h-3.5 w-3.5" />, 'sla.warning': <Clock className="h-3.5 w-3.5" />, 'sla.escalation': <AlertOctagon className="h-3.5 w-3.5" />, 'report.generated': <ShieldCheck className="h-3.5 w-3.5" />, 'settings.updated': <Gauge className="h-3.5 w-3.5" />, 'user.updated': <Gauge className="h-3.5 w-3.5" /> };

const activityTone: Record<string, string> = { 'task.created': 'bg-sky-50 text-sky-700', 'task.assigned': 'bg-brand-50 text-brand-600', 'task.status': 'bg-ink-100 text-ink-500', 'task.comment': 'bg-ink-100 text-ink-500', 'bot.execution': 'bg-violet-50 text-violet-600', 'workflow.completed': 'bg-emerald-50 text-emerald-600', 'sla.warning': 'bg-amber-50 text-amber-700', 'sla.escalation': 'bg-red-50 text-red-600', 'report.generated': 'bg-sky-50 text-sky-700', 'settings.updated': 'bg-ink-100 text-ink-500', 'user.updated': 'bg-ink-100 text-ink-500' };

export function Dashboard() { const { state, runDemoScenario, runRule } = useStore();
  const navigate = useNavigate();
  const [trendDays, setTrendDays] = useState<'14' | '30'>('14');
  const [activityFilter, setActivityFilter] = useState<'all' | 'bots' | 'sla'>('all');

  const kpis = useMemo(() => computeKpis(state), [state]);
  const trend = useMemo(() => buildTrend(state, trendDays === '14' ? 14 : 30), [state, trendDays]);
  const workload = useMemo(() => workloadByDepartment(state), [state]);
  const statusData = useMemo(() => statusDistribution(state), [state]);
  const sla = useMemo(() => slaOverview(state), [state]);
  const attention = useMemo(() => attentionTasks(state, 6), [state]);
  const perf = useMemo(() => automationPerformance(state), [state]);
  const execTimeline = useMemo(() => executionTimeline(state, 14), [state]);
  // Requests a BOT actually handled today — distinct from the lifetime total the
  // KPI used to report under a "today" label.
  const automatedToday = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return state.tasks.filter(
      (t) =>
        ['Auto-Assigned', 'Validated'].includes(t.automationStatus) &&
        +new Date(t.createdAt) >= +start,
    ).length;
  }, [state]);

  const series = (key: 'created' | 'completed') => trend.map((t) => t[key]);
  const sparkCompleted = series('completed');
  const sparkCreated = series('created');

  const healthScore = useMemo(() => {
    // Composite health: SLA performance, throughput and automation reliability.
    // Deliberately simple and explainable rather than a black box.
    return Math.round(
      0.45 * kpis.slaCompliance + 0.25 * kpis.completionRate + 0.3 * kpis.executionSuccessRate,
    );
  }, [kpis]);

  const activity = state.activity.filter((a) =>
    activityFilter === 'all' ? true : activityFilter === 'bots' ? a.type === 'bot.execution' : a.type.startsWith('sla.'),
  );

  const byKey = useMemo(() => Object.fromEntries(state.automations.map((a) => [a.botKey, a])), [state.automations]);
  const [running, setRunning] = useState<string | null>(null);

  const runBot = (botKey: string) => { const rule = byKey[botKey];
    if (!rule) return;
    if (!rule.enabled) {
      navigate('/automation');
      return; }
    setRunning(botKey);
    window.setTimeout(() => { runRule(rule.id, { mode: 'Manual' });
      setRunning(null);
    }, 380);
  };

  const demo = () => { const result = runDemoScenario();
    navigate(`/tasks?task=${result.task.id }`);
  };

  const topValue = perf.slice(0, 3);
  const errorBots = [...perf].filter((p) => p.failed > 0).sort((a, b) => b.failed - a.failed).slice(0, 2);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Executive Overview"
        description="Live operational command centre for Business As Usual. Every figure is calculated from the current workspace dataset, not hardcoded."
        actions={ <>
            <Segmented
              value={trendDays }
              onChange={ setTrendDays }
              options={ [
                { value: '14', label: '14 days' },
                { value: '30', label: '30 days' },
              ]}
            />
            <Button variant="secondary" icon={ <RefreshCw className="h-3.5 w-3.5" /> } onClick={ () => navigate('/analytics') }>
              Analytics
            </Button>
            <Button variant="primary" icon={ <PlayCircle className="h-3.5 w-3.5" /> } onClick={ demo }>
              Run demo scenario
            </Button>
          </>
        }
      />

      { /* Command bar: the operational verdict, the live clock and the three
           numbers an executive acts on, in one band of ink rather than five
           competing cards. */ }
      <section className="relative overflow-hidden rounded-2xl border border-navy-800 bg-navy-950 text-white shadow-raised">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-[0.16]" />
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full blur-3xl"
          style={ { background: 'radial-gradient(circle, rgba(16,185,129,0.30), transparent 68%)' } }
        />
        <div className="relative grid gap-px bg-white/[0.06] lg:grid-cols-[1.15fr_1fr_1fr_1fr]">
          <div className="bg-navy-950/40 px-4 py-3.5">
            <div className="flex items-center gap-2">
              <span className="relative flex h-6 w-6 items-center justify-center rounded-md bg-brand-500/15">
                <Activity className="h-3.5 w-3.5 text-brand-300" />
                <span className="absolute inset-0 animate-pulse-ring rounded-md" />
              </span>
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-navy-300">Workspace status</p>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="figure text-[26px] font-semibold leading-none text-white">{ healthScore }</p>
              <span className="text-[11px] text-navy-300">/ 100</span>
              <span
                className={ cn(
                  'rounded px-1.5 py-0.5 text-[10.5px] font-semibold',
                  healthScore >= 85 ? 'bg-brand-500/15 text-brand-300' : healthScore >= 70 ? 'bg-amber-500/15 text-amber-300' : 'bg-red-500/15 text-red-300',
                ) }
              >
                { healthScore >= 85 ? 'Healthy' : healthScore >= 70 ? 'Needs attention' : 'At risk' }
              </span>
            </div>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-navy-300">
              Weighted SLA { kpis.slaCompliance.toFixed(1) }% · throughput { kpis.completionRate.toFixed(1) }% · automation reliability { kpis.executionSuccessRate.toFixed(1) }%
            </p>
          </div>

          { [
            { label: 'Needs attention', value: sla.atRisk + sla.approaching + kpis.overdueCritical, hint: `${kpis.overdue } overdue · ${ sla.atRisk } at risk · ${ sla.approaching } approaching`, to: '/sla', tone: 'text-amber-300' },
            {
              label: 'Automated today',
              value: automatedToday,
              hint: `${ fmtNumber(kpis.automationCount) } lifetime · ${ kpis.activeBots } of ${ state.automations.length } BOTs active`,
              to: '/automation',
              tone: 'text-brand-300',
            },
            { label: 'Time returned', value: `${fmtNumber(kpis.minutesSaved / 60, 1) }h`, hint: `${ fmtNumber(kpis.minutesSaved) } min across ${ fmtNumber(kpis.totalExecutions) } BOT runs`, to: '/analytics', tone: 'text-sky-300' },
          ].map((m) => (
            <button
              key={ m.label }
              onClick={ () => navigate(m.to) }
              className="group bg-navy-950/40 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.035]"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-navy-300">{ m.label }</p>
                <ArrowRight className="h-3 w-3 text-navy-500 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-white/70" />
              </div>
              <p className={ cn('figure mt-2 text-[26px] font-semibold leading-none', m.tone) }>{ m.value }</p>
              <p className="mt-1.5 truncate text-[10.5px] text-navy-300">{ m.hint }</p>
            </button>
          ))}
        </div>
        <div className="relative flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-4 py-2">
          <p className="text-[10.5px] text-navy-400">
            Data as of { fmtDateTime(new Date().toISOString()) } · { fmtNumber(state.tasks.length) } requests · { fmtNumber(state.executions.length) } executions in repository
          </p>
          <button onClick={ () => navigate('/reports') } className="flex items-center gap-1 text-[10.5px] font-medium text-brand-300 hover:text-brand-200">
            Generate a report <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </section>

      { /* KPI grid */ }
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard
          label="Total Tasks"
          value={ fmtNumber(kpis.total) }
          icon={ <ListChecks className="h-3.5 w-3.5" /> }
          hint={ `${kpis.newLast7} created in the last 7 days` }
          trend={ sparkCreated }
          tone="blue"
          tooltip="All operational requests currently in the repository, across every status."
          onClick={ () => navigate('/tasks') }
        />
        <KpiCard
          label="Completed Tasks"
          value={ fmtNumber(kpis.completed) }
          icon={ <CheckCircle2 className="h-3.5 w-3.5" /> }
          delta={ kpis.completedPrev7 ? ((kpis.completedLast7 - kpis.completedPrev7) / kpis.completedPrev7) * 100 : 0 }
          deltaLabel="vs previous 7 days"
          trend={ sparkCompleted }
          tone="emerald"
          footer={ `${kpis.completionRate.toFixed(1) }% overall completion rate`}
          onClick={ () => navigate('/tasks?status=Completed') }
        />
        <KpiCard
          label="Pending Tasks"
          value={ fmtNumber(kpis.pending) }
          icon={ <Clock className="h-3.5 w-3.5" /> }
          hint="Open across all workflows"
          tone="amber"
          footer={ `${sla.approaching } approaching deadline · ${ sla.atRisk } at risk`}
          onClick={ () => navigate('/tasks?status=open') }
        />
        <KpiCard
          label="Overdue Tasks"
          value={ fmtNumber(kpis.overdue) }
          icon={ <TriangleAlert className="h-3.5 w-3.5" /> }
          tone="red"
          hint={ `${kpis.overdueCritical } critical priority breached`}
          footer="Escalated by the SLA Escalation BOT"
          onClick={ () => navigate('/tasks?status=Overdue') }
        />
        <KpiCard
          label="SLA Compliance"
          value={ `${kpis.slaCompliance.toFixed(1) }%`}
          icon={ <ShieldCheck className="h-3.5 w-3.5" /> }
          delta={ kpis.slaCompliance - 85 }
          deltaLabel="vs 85% target"
          trend={ trend.map((t) => t.slaCompliance) }
          tone="emerald"
          tooltip="Share of completed tasks closed on or before their SLA deadline."
          footer={ `${sla.completedOnTime }/${ sla.completedTotal } completed within SLA`}
          onClick={ () => navigate('/sla') }
        />
        <KpiCard
          label="Automation Rate"
          value={ `${kpis.automationRate.toFixed(1) }%`}
          icon={ <Bot className="h-3.5 w-3.5" /> }
          hint={ `${fmtNumber(kpis.automationCount) } requests handled automatically`}
          tone="violet"
          footer={ `${kpis.activeBots } of ${ state.automations.length } BOTs active`}
          onClick={ () => navigate('/automation') }
        />
        <KpiCard
          label="Estimated Time Saved"
          value={ `${fmtNumber(kpis.minutesSaved / 60, 1) }h`}
          icon={ <Zap className="h-3.5 w-3.5" /> }
          hint={ `${fmtNumber(kpis.minutesSaved) } minutes from ${ fmtNumber(kpis.totalExecutions) } BOT runs`}
          tone="emerald"
          footer="Sum of measured per-record handling time"
          tooltip="Derived from execution records: records processed × configured minutes saved per record."
          onClick={ () => navigate('/analytics') }
        />
        <KpiCard
          label="Active BOTs"
          value={ `${kpis.activeBots }`}
          icon={ <Gauge className="h-3.5 w-3.5" /> }
          hint={ `${kpis.executionSuccessRate.toFixed(1) }% execution success`}
          tone="blue"
          footer={ kpis.failedExecutions ? `${kpis.failedExecutions } failed run(s) need review` : 'No failed executions'}
          onClick={ () => navigate('/automation') }
        />
      </div>

      { /* Charts row 1 */ }
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Task completion trend"
            subtitle="Requests created vs closed, with the automated share of intake"
            action={ <span className="text-[11px] text-ink-400">{trendDays } days</span>}
          />
          <div className="flex flex-wrap items-center gap-3 px-3.5 pt-1">
            { [
              { label: 'Created', color: '#3b82f6', line: true },
              { label: 'Completed', color: '#10b981', line: false },
              { label: 'Automated share', color: '#6ee7b7', line: false },
            ].map((l) => (
              <span key={ l.label } className="flex items-center gap-1.5 text-[10.5px] font-medium text-ink-500">
                { l.line
                  ? <span className="h-px w-4 border-t-[1.5px] border-dashed" style={ { borderColor: l.color } } />
                  : <span className="h-2 w-2 rounded-sm" style={ { background: l.color } } /> }
                { l.label }
              </span>
            ))}
          </div>
          <div className="px-2 pb-3 pt-1">
            <CompletionTrendChart data={ trend } height={ 272 } />
          </div>
        </Card>
        <Card>
          <CardHeader title="Task status distribution" subtitle={ `${state.tasks.length } requests across 8 statuses`} />
          <div className="px-3 py-3">
            <StatusDonutChart data={ statusData } height={ 190 } />
            <ChartLegendList data={ statusData } className="mt-1 border-t border-ink-100 pt-1.5" />
          </div>
        </Card>
      </div>

      { /* Charts row 2 */ }
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Operational workload by department" subtitle="Open vs completed vs overdue" />
          <div className="px-2 py-3">
            <DepartmentWorkloadChart data={ workload } height={ 218 } />
          </div>
        </Card>
        <Card>
          <CardHeader title="SLA compliance trend" subtitle="On-time completion rate by day" />
          <div className="px-2 py-3">
            <SlaTrendChart data={ trend } height={ 218 } />
          </div>
        </Card>
        <Card>
          <CardHeader title="Manual vs automated workload" subtitle="Share of requests handled by BOTs" />
          <div className="px-2 py-3">
            <ManualVsAutomatedChart
              data={ trend.map((t) => ({ label: t.label, manual: t.manual, automated: t.automated }))}
              height={ 218 }
            />
          </div>
        </Card>
      </div>

      { /* Attention + activity */ }
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Priority attention"
            subtitle="Open requests ranked by breach risk and priority"
            icon={ <TriangleAlert className="h-4 w-4 text-amber-500" /> }
            action={ <Button size="xs" variant="ghost" iconRight={<ArrowRight className="h-3 w-3" /> } onClick={ () => navigate('/tasks?status=open') }>
                All tasks
              </Button>
            }
          />
          <div className="overflow-x-auto">
            { attention.length === 0 ? (
              <EmptyState compact title="Nothing needs attention" description="Every open request is inside its SLA window." />
            ) : (
              <table className="w-full min-w-[620px]">
                <thead className="border-b border-ink-100 bg-ink-50/50">
                  <tr>
                    <th className="th">Task</th>
                    <th className="th">Assignee</th>
                    <th className="th">Priority</th>
                    <th className="th">Deadline</th>
                    <th className="th">Status</th>
                    <th className="th">Health</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50">
                  {attention.map((t) => {
                    const assignee = state.users.find((u) => u.id === t.assigneeId);
                    const health = taskHealth(t, Date.now(), state.settings.reminderThresholdPct);
                    return (
                      <tr
                        key={t.id }
                        className="cursor-pointer transition-colors hover:bg-brand-50/30"
                        onClick={ () => navigate(`/tasks?task=${t.id }`)}
                      >
                        <td className="td max-w-[240px]">
                          <p className="truncate font-medium text-ink-800">{ t.title }</p>
                          <p className="text-[11px] text-ink-400">{ t.code } · { t.category }</p>
                        </td>
                        <td className="td whitespace-nowrap text-[12px]">{ assignee?.name ?? <span className="font-medium text-amber-700">Unassigned</span> }</td>
                        <td className="td"><PriorityBadge priority={ t.priority } /></td>
                        <td className="td whitespace-nowrap text-[11.5px]">
                          <p className="text-ink-700">{ fmtDateTime(t.deadline).split(', ')[0] }</p>
                          <p className="text-[10.5px] text-ink-400">{ fmtRelative(t.deadline) }</p>
                        </td>
                        <td className="td"><StatusBadge status={ t.status } /></td>
                        <td className="td"><HealthBadge health={ health } /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Recent activity"
            subtitle="Task, BOT, workflow and SLA events"
            action={ <Select
                value={activityFilter }
                onChange={ (e) => setActivityFilter(e.target.value as typeof activityFilter) }
                className="h-7 py-0 text-[11.5px]"
                aria-label="Filter activity"
              >
                <option value="all">All</option>
                <option value="bots">BOTs</option>
                <option value="sla">SLA</option>
              </Select>
            }
          />
          <div className="max-h-[330px] flex-1 overflow-y-auto px-3 py-2">
            { activity.length === 0 ? (
              <EmptyState compact title="No activity for this filter" />
            ) : (
              <ul className="space-y-0">
                {activity.slice(0, 14).map((a, i) => (
                  <li key={a.id } className="relative flex gap-2.5 pb-2.5">
                    { i < Math.min(13, activity.length - 1) && <span className="absolute left-[11px] top-6 h-full w-px bg-ink-100" /> }
                    <span
                      className={ cn(
                        'relative z-10 mt-0.5 flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full ring-2 ring-white', activityTone[a.type] ?? 'bg-ink-100 text-ink-500', ) }
                      style={ { height: 22, width: 22 }}
                    >
                      { activityIcon[a.type] }
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[11.5px] leading-snug text-ink-700">{ a.message }</p>
                      <p className="mt-0.5 text-[10px] text-ink-400">
                        { a.actor } · { fmtRelative(a.at) }
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            onClick={ () => navigate('/notifications') }
            className="border-t border-ink-100 py-2 text-center text-[11.5px] font-medium text-brand-700 transition-colors hover:bg-ink-50"
          >
            Open notification center
          </button>
        </Card>
      </div>

      { /* Automation performance */ }
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Automation performance"
            subtitle="Time saved and reliability per BOT — top value creators highlighted"
            icon={ <Bot className="h-4 w-4 text-brand-600" /> }
            action={ <Button size="xs" variant="ghost" iconRight={<ArrowRight className="h-3 w-3" /> } onClick={ () => navigate('/automation') }>
                Automation center
              </Button>
            }
          />
          <div className="divide-y divide-ink-50">
            { perf.map((p) => {
              const max = Math.max(...perf.map((x) => x.minutesSaved), 1);
              return (
                <div key={p.id } className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[12.5px] font-medium text-ink-800">{ p.name }</p>
                      { !p.enabled && <span className="rounded bg-ink-100 px-1 py-px text-[9.5px] font-semibold uppercase text-ink-500">Off</span> }
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Progress value={ (p.minutesSaved / max) * 100 } className="max-w-[220px]" height="h-1" tone={ p.failed ? 'amber' : 'emerald' } />
                      <span className="text-[10.5px] tabular text-ink-400">
                        { p.runs } runs · { p.records } records · { p.successRate.toFixed(0) }% success
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[12.5px] font-semibold tabular text-ink-900">{ fmtNumber(p.minutesSaved) }m</p>
                    <p className={ cn('text-[10.5px]', p.failed ? 'text-red-600' : 'text-ink-400') }>
                      { p.failed ? `${p.failed } failed` : 'saved'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Highest value automations" subtitle="By measured minutes saved" icon={ <TrendingUp className="h-4 w-4 text-brand-600" /> } />
            <ol className="space-y-2 p-4">
              { topValue.map((p, i) => (
                <li key={p.id } className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[10.5px] font-bold text-brand-700">
                    { i + 1 }
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-ink-800">{ p.name }</p>
                    <p className="text-[10.5px] text-ink-400">{ fmtNumber(p.minutesSaved) } min · { p.runs } executions</p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold tabular text-brand-700">{ fmtCompact(p.minutesSaved) }</span>
                </li>
              ))}
            </ol>
          </Card>
          <Card>
            <CardHeader title="Automation exceptions" subtitle="Rules that need operator attention" icon={ <AlertOctagon className="h-4 w-4 text-red-500" /> } />
            <div className="p-3.5">
              { errorBots.length === 0 ? (
                <p className="text-[11.5px] text-ink-500">No failed executions recorded. All enabled rules are running cleanly.</p>
              ) : (
                <ul className="space-y-2">
                  {errorBots.map((b) => (
                    <li key={b.id } className="rounded-lg border border-red-100 bg-red-50/50 p-2">
                      <p className="text-[12px] font-medium text-red-800">{ b.name }</p>
                      <p className="mt-0.5 text-[10.5px] text-red-600">
                        { b.failed } failed run(s) of { b.runs } · last { fmtRelative(b.lastRunAt) }
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 space-y-1.5">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">Quick BOT run</p>
                <div className="flex flex-wrap gap-1.5">
                  { [
                    { key: 'data_validation', label: 'Validate' },
                    { key: 'smart_assignment', label: 'Assign' },
                    { key: 'deadline_reminder', label: 'Remind' },
                    { key: 'sla_escalation', label: 'Escalate' },
                  ].map((b) => { const rule = byKey[b.key];
                    return (
                      <Tooltip key={b.key } content={ rule?.enabled ? `Run ${rule.name }` : 'Disabled — open Automation Center to enable'}>
                        <Button
                          size="xs"
                          variant={ rule?.enabled ? 'subtle' : 'secondary' }
                          loading={ running === b.key }
                          onClick={ () => runBot(b.key) }
                          icon={ <Zap className="h-3 w-3" /> }
                        >
                          { b.label }
                        </Button>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      { /* Execution trend + demo CTA */ }
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Automation execution health" subtitle="Executions per day by outcome" icon={ <Timer className="h-4 w-4 text-ink-400" /> } />
          <div className="px-2 py-3">
            <ExecutionStatusChart data={ execTimeline } height={ 196 } />
          </div>
        </Card>
        <Card className="relative overflow-hidden border-brand-200 bg-gradient-to-br from-brand-50/80 via-white to-white">
          <div className="grid-bg absolute inset-0 opacity-40" />
          <div className="relative p-4">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-brand-600" />
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-brand-700">End-to-end demo</span>
            </div>
            <h3 className="mt-1.5 text-[14px] font-semibold leading-snug tracking-[-0.01em] text-ink-900">
              IT Support request automation
            </h3>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-600">
              Submits a real request, runs Data Validation + Smart Assignment, advances the workflow, raises notifications and updates SLA, dashboard
              and analytics — all in one click.
            </p>
            <ol className="mt-2.5 space-y-1">
              { ['Intake via Google Form', 'Validation BOT checks fields & duplicates', 'Assignment BOT routes to IT Support', 'Workflow reaches execution stage', 'Notifications, SLA & analytics update'].map((s, i) => (
                <li key={s } className="flex items-start gap-1.5 text-[11px] text-ink-600">
                  <span className="mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[8.5px] font-bold text-brand-700">
                    { i + 1 }
                  </span>
                  { s }
                </li>
              ))}
            </ol>
            <Button variant="primary" className="mt-3 w-full" icon={ <PlayCircle className="h-3.5 w-3.5" /> } onClick={ demo }>
              Run the scenario now
            </Button>
            <p className="mt-1.5 text-center text-[10px] text-ink-400">Creates a task tagged “demo-scenario” — safe to reset anytime</p>
          </div>
        </Card>
      </div>

      <InfoNote>
        <strong>Data provenance.</strong> Dashboard KPIs are derived from { state.tasks.length } tasks, { state.executions.length } automation executions and{ ' ' }
        { state.activity.length } activity records held in this browser. The dataset is synthetic demo data for { state.organization.name } and makes no
        claim about any real organisation. Nothing is sent to an external service.
      </InfoNote>
    </div>
  );
}

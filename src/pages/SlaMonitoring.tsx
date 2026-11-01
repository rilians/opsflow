import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertOctagon, BellRing, Clock, Download, Gauge, Save, ShieldCheck, Timer, TrendingDown, TriangleAlert, Users } from 'lucide-react';
import { Avatar, Badge, Button, Card, CardHeader, Drawer, EmptyState, Field, Input, Progress, Segmented, Switch } from '@/components/ui';
import { PageHeader, InfoNote, SectionTitle } from '@/components/shared/Page';
import { KpiCard, HealthBadge, PriorityBadge, StatusBadge } from '@/components/shared/bits';
import { usePermissions, useStore } from '@/services/store';
import { bottlenecks, employeeWorkload, slaByCategory, slaOverview, workloadByDepartment } from '@/services/analytics';
import { taskHealth } from '@/services/automationEngine';
import { OPEN_STATUSES } from '@/lib/catalog';
import { cn, downloadFile, fmtDateTime, fmtHours, fmtNumber, fmtRelative, toCsv } from '@/lib/utils';
import type { Task } from '@/types';

const PAGE = 60;

type HealthFilter = 'all' | 'Safe' | 'Approaching deadline' | 'At risk' | 'Overdue';

export function SlaMonitoring() { const { state, runRule, updateSlaConfig, updateSettings, toast } = useStore();
  const { isAdmin } = usePermissions();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<HealthFilter>('all');
  // Same truncation bug as the notification list: 60 rows, no way to reach the rest.
  const [visible, setVisible] = useState(PAGE);
  useEffect(() => setVisible(PAGE), [filter]);
  const [busy, setBusy] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const sla = useMemo(() => slaOverview(state), [state]);
  const byCategory = useMemo(() => slaByCategory(state), [state]);
  const workload = useMemo(() => employeeWorkload(state), [state]);
  const deptWorkload = useMemo(() => workloadByDepartment(state), [state]);
  const pinches = useMemo(() => bottlenecks(state), [state]);

  const openTasks = state.tasks.filter((t) => OPEN_STATUSES.includes(t.status));
  const buckets: Record<Exclude<HealthFilter, 'all'>, Task[]> = { Safe: [], 'Approaching deadline': [], 'At risk': [], Overdue: [] };
  openTasks.forEach((t) => { const h = taskHealth(t, Date.now(), state.settings.reminderThresholdPct);
    buckets[h as Exclude<HealthFilter, 'all'>]?.push(t); });

  const list = filter === 'all'
    ? [...openTasks].sort((a, b) => +new Date(a.deadline) - +new Date(b.deadline))
    : buckets[filter];

  const runBot = (botKey: string) => { const rule = state.automations.find((a) => a.botKey === botKey);
    if (!rule) return;
    if (!rule.enabled) {
      toast({ title: `${rule.name } is disabled`, description: 'Enable it in the Automation Center first.', tone: 'warning' });
      return;
    }
    setBusy(botKey);
    window.setTimeout(() => { runRule(rule.id, { mode: 'Manual' });
      setBusy(null);
    }, 460);
  };

  const exportSla = () => { const headers = ['Task ID', 'Title', 'Category', 'Priority', 'Status', 'Assignee', 'Deadline', 'SLA hours', 'Time remaining (h)', 'Health'];
    // Exports follow the active filter — a button labelled "Export" next to a filtered
    // table must not silently dump a different dataset.
    const rows = list.map((t) => [
      t.code, t.title, t.category, t.priority, t.status, state.users.find((u) => u.id === t.assigneeId)?.name ?? 'Unassigned', fmtDateTime(t.deadline), t.slaHours, ((+new Date(t.deadline) - Date.now()) / 3_600_000).toFixed(1), taskHealth(t, Date.now(), state.settings.reminderThresholdPct), ]);
    downloadFile(`opsflow-sla-monitor-${new Date().toISOString().slice(0, 10) }.csv`, toCsv(headers, rows));
    toast({ title: 'SLA report exported', description: `${rows.length } request(s)${filter === 'all' ? '' : ` in the “${filter}” bucket`}.`, tone: 'success' });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="SLA & Performance Monitoring"
        description="Deadline health across every open request, with automatic escalation, workload balancing and bottleneck detection driven by the SLA BOTs."
        actions={ <>
            <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" /> } onClick={ exportSla }>Export</Button>
            <Button
              variant="secondary"
              size="sm"
              icon={ <BellRing className="h-3.5 w-3.5" /> }
              loading={ busy === 'deadline_reminder' }
              onClick={ () => runBot('deadline_reminder') }
            >
              Run reminders
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={ <AlertOctagon className="h-3.5 w-3.5" /> }
              loading={ busy === 'sla_escalation' }
              onClick={ () => runBot('sla_escalation') }
            >
              Escalate breaches
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-6">
        <KpiCard label="Open under SLA" value={ fmtNumber(sla.underSla) } icon={ <Timer className="h-3.5 w-3.5" /> } hint="Active SLA clocks" tone="blue" />
        <KpiCard label="Approaching" value={ sla.approaching } icon={ <Clock className="h-3.5 w-3.5" /> } tone="amber" hint={ `≥ ${state.settings.reminderThresholdPct }% of SLA used`} />
        <KpiCard label="At risk" value={ sla.atRisk } icon={ <TriangleAlert className="h-3.5 w-3.5" /> } tone="amber" hint="≥ 90% of SLA used" />
        <KpiCard label="Overdue" value={ sla.overdue } icon={ <AlertOctagon className="h-3.5 w-3.5" /> } tone="red" hint="SLA breached" />
        <KpiCard label="Compliance" value={ `${sla.compliance.toFixed(1) }%`} icon={ <ShieldCheck className="h-3.5 w-3.5" /> } tone="emerald" hint={ `${sla.completedOnTime }/${ sla.completedTotal } on time`} />
        <KpiCard label="Avg. resolution" value={ fmtHours(sla.avgResolutionHours) } icon={ <Gauge className="h-3.5 w-3.5" /> } tone="violet" hint={ `Response ${fmtHours(sla.avgResponseHours) }`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Deadline monitoring" subtitle="Open requests by SLA health" />
          <div className="space-y-2 p-4">
            { (['Safe', 'Approaching deadline', 'At risk', 'Overdue'] as const).map((h) => {
              const count = buckets[h].length;
              const pct = openTasks.length ? (count / openTasks.length) * 100 : 0;
              const tone = h === 'Safe' ? 'emerald' : h === 'Overdue' ? 'red' : 'amber';
              return (
                <button key={h } onClick={ () => setFilter(filter === h ? 'all' : h) } className="w-full text-left">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <HealthBadge health={ h } />
                    </span>
                    <span className="text-[11.5px] font-semibold tabular text-ink-700">{ count }</span>
                  </div>
                  <Progress value={ pct } className="mt-1" tone={ tone } />
                </button>
              );
            })}
            <p className="pt-1 text-[10.5px] leading-snug text-ink-400">
              Thresholds: reminder at { state.settings.reminderThresholdPct }% of resolve time, at-risk at 90%, breach at 100%.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="SLA by category" subtitle="Configured targets vs achieved" />
          <div className="max-h-[228px] overflow-y-auto">
            <table className="w-full">
              <thead className="border-b border-ink-100 bg-ink-50/60">
                <tr>
                  <th className="th pl-3">Category</th>
                  <th className="th">Target</th>
                  <th className="th">Open</th>
                  <th className="th pr-3">Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                { byCategory.map((c) => (
                  <tr key={c.category }>
                    <td className="td max-w-[130px] pl-3">
                      <p className="truncate text-[11.5px] font-medium text-ink-700">{ c.category }</p>
                    </td>
                    <td className="td tabular text-[11px]">{ c.target }h</td>
                    <td className="td tabular text-[11px]">{ c.open }</td>
                    <td className="td pr-3">
                      <span className={ cn('text-[11.5px] font-semibold tabular', c.compliance >= 90 ? 'text-emerald-600' : c.compliance >= 75 ? 'text-amber-700' : 'text-red-600') }>
                        { c.compliance.toFixed(0) }%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Bottleneck identification" subtitle="Average dwell time per workflow stage" icon={ <TrendingDown className="h-4 w-4 text-amber-500" /> } />
          <div className="space-y-2 p-4">
            { pinches.map((p) => {
              const max = Math.max(...pinches.map((x) => x.avgHours), 1);
              return (
                <div key={`${p.workflow }-${ p.stage }`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[11.5px] font-medium text-ink-700">{ p.stage }</p>
                    <span className="shrink-0 text-[11px] font-semibold tabular text-ink-800">{ p.avgHours.toFixed(1) }h</span>
                  </div>
                  <Progress value={ (p.avgHours / max) * 100 } className="mt-0.5" height="h-1" tone={ p.avgHours > 8 ? 'red' : p.avgHours > 4 ? 'amber' : 'emerald' } />
                  <p className="mt-0.5 truncate text-[9.5px] text-ink-400">{ p.workflow } · { p.samples } samples</p>
                </div>
              );
            })}
            { pinches.length === 0 && <p className="text-[11.5px] text-ink-400">Not enough workflow history to identify bottlenecks.</p> }
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Deadline monitor"
          subtitle={ `${list.length } request(s) shown`}
          action={ <Segmented
              value={filter }
              onChange={ setFilter }
              options={ [
                { value: 'all', label: 'All' },
                { value: 'Safe', label: 'Safe' },
                { value: 'Approaching deadline', label: 'Approaching' },
                { value: 'At risk', label: 'At risk' },
                { value: 'Overdue', label: 'Overdue' },
              ]}
            />
          }
        />
        { list.length === 0 ? (
          <EmptyState compact title="No requests in this bucket" description="Switch the filter to see other open work." icon={<ShieldCheck className="h-4 w-4" /> } />
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full min-w-[820px]">
              <thead className="sticky top-0 z-10 border-b border-ink-100 bg-ink-50 text-[11px]">
                <tr>
                  <th className="th pl-4">Request</th>
                  <th className="th">Assignee</th>
                  <th className="th">Priority</th>
                  <th className="th">Status</th>
                  <th className="th">Deadline</th>
                  <th className="th">SLA used</th>
                  <th className="th pr-4">Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                { list.slice(0, visible).map((t) => {
                  const a = state.users.find((u) => u.id === t.assigneeId);
                  const h = taskHealth(t, Date.now(), state.settings.reminderThresholdPct);
                  const consumed = Math.min(100, Math.max(0, ((Date.now() - +new Date(t.createdAt)) / (+new Date(t.deadline) - +new Date(t.createdAt))) * 100));
                  return (
                    <tr key={t.id } className="cursor-pointer transition-colors hover:bg-brand-50/25" onClick={ () => navigate(`/tasks?task=${t.id }`)}>
                      <td className="td max-w-[280px] pl-4">
                        <p className="truncate text-[12px] font-medium text-ink-800">{ t.title }</p>
                        <p className="text-[10px] text-ink-400">{ t.code } · { t.category }</p>
                      </td>
                      <td className="td whitespace-nowrap">
                        { a ? (
                          <span className="flex items-center gap-1.5">
                            <Avatar name={a.name } tone={ a.avatarTone } size="xs" />
                            <span className="text-[11px]">{ a.name }</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-amber-700">Unassigned</span>
                        )}
                      </td>
                      <td className="td"><PriorityBadge priority={ t.priority } /></td>
                      <td className="td"><StatusBadge status={ t.status } /></td>
                      <td className="td whitespace-nowrap text-[11px]">
                        <p>{ fmtDateTime(t.deadline) }</p>
                        <p className="text-[10px] text-ink-400">{ fmtRelative(t.deadline) }</p>
                      </td>
                      <td className="td w-[110px]">
                        <Progress value={ consumed } tone={ consumed >= 100 ? 'red' : consumed >= 90 ? 'red' : consumed >= 75 ? 'amber' : 'emerald' } height="h-1" />
                        <p className="mt-0.5 text-[9.5px] tabular text-ink-400">{ Math.round(consumed) }% of { t.slaHours }h</p>
                      </td>
                      <td className="td pr-4"><HealthBadge health={ h } /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            { list.length > visible && (
              <div className="border-t border-ink-100 p-3">
                <Button variant="secondary" size="sm" className="w-full" onClick={() => setVisible((v) => v + PAGE)}>
                  Show {Math.min(PAGE, list.length - visible)} more · {list.length - visible} remaining
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Workload distribution by employee" subtitle="Open requests per person with SLA performance" icon={ <Users className="h-4 w-4 text-ink-400" /> } />
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 border-b border-ink-100 bg-ink-50">
                <tr>
                  <th className="th pl-4">Employee</th>
                  <th className="th">Availability</th>
                  <th className="th text-right">Open</th>
                  <th className="th text-right">Overdue</th>
                  <th className="th pr-4 text-right">SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                { workload.map((w) => (
                  <tr key={w.id } className="transition-colors hover:bg-ink-50/60">
                    <td className="td pl-4">
                      <p className="text-[12px] font-medium text-ink-800">{ w.name }</p>
                      <p className="text-[10px] text-ink-400">{ w.department }</p>
                    </td>
                    <td className="td">
                      <Badge tone={ w.availability === 'Available' ? 'emerald' : w.availability === 'Busy' ? 'amber' : 'slate' } dot>{ w.availability }</Badge>
                    </td>
                    <td className="td text-right tabular text-[11.5px] font-medium">{ w.open }</td>
                    <td className="td text-right tabular text-[11.5px]">{ w.overdue ? <span className="font-semibold text-red-600">{w.overdue }</span> : <span className="text-ink-400">—</span>}</td>
                    <td className="td pr-4">
                      <div className="flex items-center justify-end gap-2">
                        <Progress value={ w.slaCompliance } height="h-1" className="w-14" tone={ w.slaCompliance >= 90 ? 'emerald' : w.slaCompliance >= 70 ? 'amber' : 'red' } />
                        <span className={ cn('w-8 text-right text-[11.5px] font-semibold tabular', w.slaCompliance >= 90 ? 'text-emerald-600' : w.slaCompliance >= 70 ? 'text-amber-700' : 'text-red-600') }>
                          { w.slaCompliance.toFixed(0) }%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="SLA configuration"
            subtitle="Durations by category and priority — used by intake, reminders and escalation"
            icon={ <Timer className="h-4 w-4 text-ink-400" /> }
            action={ <Button size="xs" variant="secondary" onClick={() => setConfigOpen(true) } disabled={ !isAdmin }>Configure</Button>}
          />
          <div className="max-h-[330px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 border-b border-ink-100 bg-ink-50">
                <tr>
                  <th className="th pl-4">Category</th>
                  <th className="th">Critical</th>
                  <th className="th">High</th>
                  <th className="th">Medium</th>
                  <th className="th pr-4">Low</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                { state.slaConfigs.map((c) => (
                  <tr key={c.id }>
                    <td className="td pl-4 text-[11.5px] font-medium text-ink-700">{ c.category }</td>
                    <td className="td tabular text-[11px]">{ c.criticalHours }h</td>
                    <td className="td tabular text-[11px]">{ c.highHours }h</td>
                    <td className="td tabular text-[11px]">{ c.mediumHours }h</td>
                    <td className="td pr-4 tabular text-[11px]">{ c.lowHours }h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Department workload &amp; escalation load" subtitle="Open work, at-risk volume and headcount" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5">
          { deptWorkload.map((d) => (
            <div key={d.id } className="rounded-lg border border-ink-200 p-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[11.5px] font-semibold text-ink-800">{ d.short }</p>
                <span className="text-[10px] text-ink-400">{ d.headcount } people</span>
              </div>
              <p className="mt-0.5 truncate text-[10px] text-ink-400">{ d.name }</p>
              <div className="mt-2 grid grid-cols-3 divide-x divide-ink-100 rounded-md bg-ink-50/70 py-1">
                <div className="px-1.5">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-ink-400">Open</p>
                  <p className="figure text-[13px] font-semibold text-ink-900">{ d.open }</p>
                </div>
                <div className="px-1.5">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-ink-400">Risk</p>
                  <p className="figure text-[13px] font-semibold text-amber-700">{ d.atRisk }</p>
                </div>
                <div className="px-1.5">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-ink-400">Over</p>
                  <p className="figure text-[13px] font-semibold text-red-600">{ d.overdue }</p>
                </div>
              </div>
              <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-ink-100">
                { d.open > 0 && (
                  <>
                    <span className="h-full bg-red-400" style={ { width: `${(d.overdue / d.open) * 100}%` } } />
                    <span className="h-full bg-amber-400" style={ { width: `${(d.atRisk / d.open) * 100}%` } } />
                    <span className="h-full bg-emerald-400" style={ { width: `${(Math.max(0, d.open - d.atRisk - d.overdue) / d.open) * 100}%` } } />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <SlaConfigDrawer
        open={ configOpen }
        onClose={ () => setConfigOpen(false) }
        onSave={ updateSlaConfig }
        onSaveSettings={ updateSettings }
      />

      <InfoNote>
        <strong>Escalation behaviour.</strong> The Deadline Reminder BOT notifies assignees once a task consumes{ ' ' }
        { state.settings.reminderThresholdPct }% of its SLA window. The SLA Escalation BOT marks breached tasks Overdue, notifies the department's
        operations manager and writes an audit record. Both run on demand in this demo — there is no background scheduler.
      </InfoNote>
    </div>
  );
}

function SlaConfigDrawer({ open, onClose, onSave, onSaveSettings }: { open: boolean;
  onClose: () => void;
  onSave: (id: string, patch: Partial<{ criticalHours: number; highHours: number; mediumHours: number; lowHours: number }>) => void;
  onSaveSettings: (patch: Partial<{ reminderThresholdPct: number; autoEscalation: boolean }>) => void;
}) { const { state } = useStore();
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(state.slaConfigs.map((c) => [c.id, { ...c }])),
  );
  const [reminder, setReminder] = useState(state.settings.reminderThresholdPct);
  const [auto, setAuto] = useState(state.settings.autoEscalation);

  // Re-seed the draft every time the drawer is opened, otherwise a second open shows
  // the values from the first visit (or stale data after a reset).
  useEffect(() => {
    if (!open) return;
    setDraft(Object.fromEntries(state.slaConfigs.map((c) => [c.id, { ...c }])));
    setReminder(state.settings.reminderThresholdPct);
    setAuto(state.settings.autoEscalation);
  }, [open, state.slaConfigs, state.settings.reminderThresholdPct, state.settings.autoEscalation]);

  const invalid = Object.values(draft).some((c) =>
    [c.criticalHours, c.highHours, c.mediumHours, c.lowHours].some((h) => !Number.isFinite(h) || h < 1),
  );

  return (
    <Drawer
      open={ open }
      onClose={ onClose }
      title="SLA configuration"
      subtitle="Durations in hours per category and priority"
      width="lg"
      footer={ <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-ink-500">Changes apply to new requests and future reminder runs.</p>
          <Button
            variant="primary"
            size="sm"
            icon={<Save className="h-3.5 w-3.5" /> }
            onClick={ () => {
              Object.values(draft).forEach((c) => onSave(c.id, { criticalHours: c.criticalHours, highHours: c.highHours, mediumHours: c.mediumHours, lowHours: c.lowHours }));
              onSaveSettings({ reminderThresholdPct: reminder, autoEscalation: auto });
              onClose();
            }}
          >
            Save configuration
          </Button>
        </div>
      }
    >
      <div className="space-y-3 p-4">
        <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-3">
          <Field label={ `Reminder threshold — ${reminder }% of SLA consumed`} hint="The Deadline Reminder BOT uses this threshold.">
            <input type="range" min={ 50 } max={ 95 } step={ 5 } value={ reminder } onChange={ (e) => setReminder(Number(e.target.value)) } className="w-full accent-brand-600" />
          </Field>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <p className="text-[12px] font-medium text-ink-800">Automatic escalation</p>
              <p className="text-[10.5px] text-ink-500">Allow the escalation BOT to mark breached tasks Overdue automatically.</p>
            </div>
            <Switch checked={ auto } onChange={ setAuto } />
          </div>
        </div>

        {invalid && (
          <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
            Every resolve target must be at least 1 hour — fix the highlighted inputs before saving.
          </p>
        )}
        <SectionTitle title="Resolve targets (hours)" />
        <div className="space-y-1.5">
          { state.slaConfigs.map((c) => (
            <div key={c.id } className="rounded-lg border border-ink-200 p-2">
              <p className="mb-1 text-[11.5px] font-medium text-ink-700">{ c.category }</p>
              <div className="grid grid-cols-4 gap-1.5">
                { (['criticalHours', 'highHours', 'mediumHours', 'lowHours'] as const).map((k) => (
                  <div key={k }>
                    <label className="mb-0.5 block text-[9.5px] uppercase tracking-wide text-ink-400" htmlFor={ `${c.id }-${ k }`}>
                      { k.replace('Hours', '') }
                    </label>
                    <Input
                      id={ `${c.id }-${ k }`}
                      type="number"
                      min={ 1 }
                      value={ draft[c.id]?.[k] ?? c[k] }
                      onChange={ (e) =>
                        setDraft({ ...draft, [c.id]: { ...draft[c.id], [k]: Number(e.target.value) } })
                      }
                      invalid={!Number.isFinite(draft[c.id]?.[k]) || (draft[c.id]?.[k] ?? 0) < 1}
                      className="h-7 text-[11.5px]"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10.5px] text-ink-400">
          Note: existing tasks keep the SLA they were created with — a configuration change never retroactively rewrites history.
        </p>
      </div>
    </Drawer>
  );
}

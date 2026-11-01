import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bot,
  Building2,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Download,
  FileBarChart,
  FileText,
  History,
  Plus,
  Printer,
  Timer,
  Trash2,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Badge, Button, Card, CardHeader, ConfirmDialog, Drawer, EmptyState, Field, Input, Modal, Progress, Select, Tabs } from '@/components/ui';
import { PageHeader, InfoNote } from '@/components/shared/Page';
import { useStore } from '@/services/store';
import { automationPerformance, baselineRows, computeKpis } from '@/services/analytics';
import { isOverdue } from '@/lib/domain';
import { CATEGORIES } from '@/lib/catalog';
import { downloadFile, fmtDateTime, fmtNumber, startOfDay, toCsv } from '@/lib/utils';
import type { ReportRecord, ReportType } from '@/types';

// Icons are monochrome SVGs rather than emoji so the cards render identically on
// every platform (emoji fonts are not guaranteed to be installed).
const REPORT_TYPES: { type: ReportType; description: string; icon: ReactNode }[] = [
  { type: 'Daily Operations', description: 'Intake, completions, SLA outcome and automation activity for a single day.', icon: <CalendarDays className="h-4 w-4" /> },
  { type: 'Weekly Operations', description: 'Seven-day operational summary with trend direction per department.', icon: <CalendarRange className="h-4 w-4" /> },
  { type: 'Monthly Operations', description: 'Month-level management pack with backlog and throughput analysis.', icon: <TrendingUp className="h-4 w-4" /> },
  { type: 'SLA Performance', description: 'Compliance, breach and resolution-time detail by category.', icon: <Timer className="h-4 w-4" /> },
  { type: 'BOT Execution', description: 'Every automation execution with status, records and errors.', icon: <Bot className="h-4 w-4" /> },
  { type: 'Department Workload', description: 'Per-department and per-employee workload distribution.', icon: <Building2 className="h-4 w-4" /> },
  { type: 'Automation Impact', description: 'Before/after baselines, time saved and error reduction.', icon: <Zap className="h-4 w-4" /> },
];

export function Reports() { const { state, generateReport, deleteReport, toast } = useStore();
  const [genOpen, setGenOpen] = useState(false);
  const [type, setType] = useState<ReportType>('Daily Operations');
  const [from, setFrom] = useState(startOfDay(new Date(Date.now() - 7 * 86400000)).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [dept, setDept] = useState('all');
  const [preview, setPreview] = useState<ReportRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ReportRecord | null>(null);
  const [tab, setTab] = useState<'templates' | 'history'>('templates');

  const kpis = useMemo(() => computeKpis(state), [state]);

  const buildRows = (record: ReportRecord) => {
    const scoped = state.tasks.filter(
      (t) =>
        +new Date(t.createdAt) >= +new Date(record.periodFrom) &&
        +new Date(t.createdAt) <= +new Date(record.periodTo) &&
        (record.departmentId === 'all' || t.departmentId === record.departmentId),
    );
    const byStatus = Object.entries(
      scoped.reduce<Record<string, number>>((acc, t) => {
        acc[t.status] = (acc[t.status] ?? 0) + 1;
        return acc;
      }, {}),
    );
    const byCategory = Object.entries(
      scoped.reduce<Record<string, number>>((acc, t) => {
        acc[t.category] = (acc[t.category] ?? 0) + 1;
        return acc;
      }, {}),
    ).sort((a, b) => b[1] - a[1]);

    // Every branch below must honour the record's own period and department. Three of the
    // six templates used to read the *whole* workspace, so a one-week department report
    // could show all-time figures for every team.
    const inScope = state.tasks.filter(
      (t) =>
        +new Date(t.createdAt) >= +new Date(record.periodFrom) &&
        +new Date(t.createdAt) <= +new Date(record.periodTo) &&
        (record.departmentId === 'all' || t.departmentId === record.departmentId),
    );
    const deptName = (id: string) => state.organization.departments.find((d) => d.id === id)?.name ?? id;

    switch (record.type) {
      case 'SLA Performance':
        return CATEGORIES.flatMap((c) => {
          const rows = inScope.filter((t) => t.category === c);
          if (rows.length === 0) return [];
          const done = rows.filter((t) => t.status === 'Completed' && t.completedAt);
          const onTime = done.filter((t) => +new Date(t.completedAt!) <= +new Date(t.deadline));
          const breached = rows.filter((t) => isOverdue(t, +new Date(record.periodTo))).length;
          const avg = done.length
            ? done.reduce((a, t) => a + (+new Date(t.completedAt!) - +new Date(t.createdAt)) / 3_600_000, 0) / done.length
            : 0;
          return [{
            label: c as string,
            value: `${done.length ? ((onTime.length / done.length) * 100).toFixed(1) : '0.0'}% · ${breached} breached · avg ${avg.toFixed(1)}h · ${rows.length} request(s)`,
          }];
        });
      case 'BOT Execution': {
        const execs = state.executions.filter(
          (e) => +new Date(e.startedAt) >= +new Date(record.periodFrom) && +new Date(e.startedAt) <= +new Date(record.periodTo),
        );
        return automationPerformance(state).map((p) => {
          const scopedExec = execs.filter((e) => e.ruleId === p.id);
          return {
            label: p.name,
            value: `${scopedExec.length} run(s) · ${scopedExec.reduce((a, e) => a + e.recordsProcessed, 0)} records · ${scopedExec.filter((e) => e.status === 'Failed').length} failed`,
          };
        });
      }
      case 'Department Workload': {
        const rows = record.departmentId === 'all'
          ? state.organization.departments
          : state.organization.departments.filter((d) => d.id === record.departmentId);
        return rows.map((d) => {
          const own = inScope.filter((t) => t.departmentId === d.id);
          return {
            label: d.name,
            value: `${own.filter((t) => t.status !== 'Completed' && t.status !== 'Rejected').length} open · ${own.filter((t) => t.status === 'Completed').length} completed · ${own.filter((t) => isOverdue(t, +new Date(record.periodTo))).length} overdue · ${state.users.filter((u) => u.departmentId === d.id && u.active).length} staff`,
          };
        });
      }
      case 'Automation Impact':
        return baselineRows(state).map((b) => ({
          label: b.process,
          value: `${b.manualMinutes}m → ${b.automatedMinutes}m (${b.savingPct.toFixed(1)}% saved) · ${fmtNumber(b.monthlyMinutesSaved)} min/month`,
        }));
      default:
        return [
          ...byStatus.map(([label, value]) => ({ label: `Status · ${label}`, value: String(value) })),
          ...byCategory.slice(0, 8).map(([label, value]) => ({ label: `Category · ${label}`, value: String(value) })),
          ...(record.departmentId === 'all'
            ? state.organization.departments
                .map((d) => ({ label: `Department · ${deptName(d.id)}`, value: String(inScope.filter((t) => t.departmentId === d.id).length) }))
                .filter((r) => r.value !== '0')
            : []),
        ];
    }
  };

  const exportReport = (record: ReportRecord) => { const rows = buildRows(record);
    const meta = [
      ['Report', record.title], ['Report ID', record.code], ['Organization', state.organization.name], ['Period', `${fmtDateTime(record.periodFrom) } — ${ fmtDateTime(record.periodTo) }`],
      ['Department', record.departmentId === 'all' ? 'All departments' : state.organization.departments.find((d) => d.id === record.departmentId)?.name ?? ''],
      ['Generated', fmtDateTime(record.generatedAt)],
      ['Generated by', record.generatedBy],
      ['Mode', 'DEMO DATA — synthetic dataset, not a real company'],
      [],
      ['Summary metric', 'Value'],
      ['Requests in scope', record.summary.tasks],
      ['Completed', record.summary.completed],
      ['Overdue', record.summary.overdue],
      ['SLA compliance %', record.summary.slaCompliance],
      ['Automation rate %', record.summary.automationRate],
      [],
      ['Detail', 'Value'],
    ];
    const csv = toCsv(
      ['Field', 'Value'],
      [...meta.map((r) => [r[0] ?? '', r[1] ?? '']), ...rows.map((r) => [r.label, r.value])],
    );
    downloadFile(`${ record.code }-${ record.type.replace(/\s+/g, '-').toLowerCase() }.csv`, csv);
    toast({ title: `${record.code } exported`, description: `${ rows.length } detail row(s) written to CSV.`, tone: 'success' });
  };

  const generate = () => { const record = generateReport({ type, from, to, departmentId: dept, format: 'CSV' });
    setGenOpen(false);
    setPreview(record);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Report Center"
        description="Generate, preview and export operational reports. Reports are computed live from the workspace dataset — the Automated Reporting BOT also writes here."
        actions={ <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" /> } onClick={ () => setGenOpen(true) }>
            Generate report
          </Button>
        }
        meta={ <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="emerald" dot>{state.reports.length } reports in history</Badge>
            <Badge tone="blue">{ fmtNumber(kpis.total) } requests in scope</Badge>
          </div>
        }
      />

      <Tabs
        value={ tab }
        onChange={ setTab }
        tabs={ [
          { value: 'templates', label: 'Report templates', count: REPORT_TYPES.length },
          { value: 'history', label: 'Report history', count: state.reports.length },
        ]}
      />

      { tab === 'templates' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {REPORT_TYPES.map((r) => (
              <Card key={r.type } className="group flex flex-col p-3.5 transition-all hover:-translate-y-px hover:shadow-pop">
                <div className="flex items-start justify-between">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{r.icon}</span>
                  <FileBarChart className="h-3.5 w-3.5 text-ink-300" />
                </div>
                <p className="mt-1.5 text-[12.5px] font-semibold text-ink-900">{ r.type }</p>
                <p className="mt-0.5 flex-1 text-[11px] leading-relaxed text-ink-500">{ r.description }</p>
                <Button
                  size="xs"
                  variant="secondary"
                  className="mt-2.5 w-full"
                  icon={ <FileText className="h-3 w-3" /> }
                  onClick={ () => {
                    setType(r.type);
                    setGenOpen(true); }}
                >
                  Configure &amp; generate
                </Button>
              </Card>
            ))}
            <Card className="flex flex-col justify-between bg-gradient-to-br from-brand-50/70 to-white p-3.5">
              <div>
                <p className="text-[12.5px] font-semibold text-ink-900">Scheduled delivery</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-600">
                  The Automated Reporting BOT produces the daily operations pack. Distribution to email/Teams is not connected in this demo.
                </p>
              </div>
              <Badge tone="amber" className="mt-2 w-fit">Demo Mode</Badge>
            </Card>
          </div>

          <Card>
            <CardHeader title="Report history" subtitle="Latest generated reports" icon={ <History className="h-4 w-4 text-ink-400" /> } action={ <Button size="xs" variant="ghost" onClick={() => setTab('history') }>View all</Button>} />
            <ReportTable reports={ state.reports } onPreview={ setPreview } onExport={ exportReport } onDelete={ setConfirmDelete } limit={ 5 } />
          </Card>
        </>
      )}

      { tab === 'history' && (
        <Card>
          <CardHeader title="All generated reports" subtitle={`${state.reports.length } records`} />
          <ReportTable reports={ state.reports } onPreview={ setPreview } onExport={ exportReport } onDelete={ setConfirmDelete } />
        </Card>
      )}

      { /* generate modal */ }
      <Modal
        open={ genOpen }
        onClose={ () => setGenOpen(false) }
        title="Generate report"
        description="Reports are computed from live workspace data for the selected period."
        size="md"
        icon={ <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-600"><FileBarChart className="h-4 w-4" /></span> }
        footer={ <>
            <Button variant="secondary" onClick={() => setGenOpen(false) }>Cancel</Button>
            <Button variant="primary" onClick={ generate } icon={ <CheckCircle2 className="h-3.5 w-3.5" /> }>
              Generate report
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Report type">
            <Select value={ type } onChange={ (e) => setType(e.target.value as ReportType) }>
              { REPORT_TYPES.map((r) => (
                <option key={r.type } value={ r.type }>{ r.type }</option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Period from" required>
              <Input type="date" value={ from } max={ to } onChange={ (e) => setFrom(e.target.value) } />
            </Field>
            <Field label="Period to" required>
              <Input type="date" value={ to } min={ from } onChange={ (e) => setTo(e.target.value) } />
            </Field>
          </div>
          <Field label="Department scope">
            <Select value={ dept } onChange={ (e) => setDept(e.target.value) }>
              <option value="all">All departments</option>
              { state.organization.departments.map((d) => (
                <option key={d.id } value={ d.id }>{ d.name }</option>
              ))}
            </Select>
          </Field>
          <div className="rounded-lg border border-ink-200 bg-ink-50/60 p-2.5">
            <p className="text-[11px] leading-relaxed text-ink-600">
              Metadata written into the export: organization ({ state.organization.name }), reporting period, department scope, generation timestamp and
              an explicit demo-data disclaimer.
            </p>
          </div>
        </div>
      </Modal>

      { /* preview drawer */ }
      <Drawer
        open={ !!preview }
        onClose={ () => setPreview(null) }
        title={ preview?.title ?? '' }
        subtitle={ preview ? `${preview.code } · ${ preview.generatedBy }` : ''}
        width="xl"
        footer={ preview && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-ink-500">Period {fmtDateTime(preview.periodFrom) } → { fmtDateTime(preview.periodTo) }</span>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={ <Printer className="h-3.5 w-3.5" /> }
                  onClick={() => window.print()}
                  title="Opens the browser print dialog — choose “Save as PDF” for a PDF copy."
                >
                  Print / PDF
                </Button>
                <Button size="sm" variant="primary" icon={ <Download className="h-3.5 w-3.5" /> } onClick={ () => exportReport(preview) }>Export CSV</Button>
              </div>
            </div>
          )
        }
      >
        { preview && (
          <div className="space-y-4 p-5 print-report">
            <div className="border-b border-ink-200 pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-700">{state.organization.name }</p>
                  <h2 className="mt-0.5 text-[16px] font-semibold tracking-[-0.01em] text-ink-900">{ preview.title }</h2>
                  <p className="mt-0.5 text-[11px] text-ink-500">{ preview.code } · Generated { fmtDateTime(preview.generatedAt) }</p>
                </div>
                <Badge tone="amber">DEMO DATA</Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 text-[11px] sm:grid-cols-4">
                <div><span className="text-ink-400">Period: </span><span className="font-medium text-ink-700">{ fmtDateTime(preview.periodFrom).split(', ')[0] } – { fmtDateTime(preview.periodTo).split(', ')[0] }</span></div>
                <div><span className="text-ink-400">Department: </span><span className="font-medium text-ink-700">{ preview.departmentId === 'all' ? 'All' : state.organization.departments.find((d) => d.id === preview.departmentId)?.name }</span></div>
                <div><span className="text-ink-400">Prepared by: </span><span className="font-medium text-ink-700">{ preview.generatedBy }</span></div>
                <div><span className="text-ink-400">Classification: </span><span className="font-medium text-ink-700">Internal</span></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              { [
                { label: 'Requests', value: preview.summary.tasks },
                { label: 'Completed', value: preview.summary.completed },
                { label: 'Overdue', value: preview.summary.overdue },
                { label: 'SLA compliance', value: `${preview.summary.slaCompliance }%` },
                { label: 'Automation rate', value: `${preview.summary.automationRate }%` },
              ].map((s) => (
                <div key={ s.label } className="rounded-lg border border-ink-200 p-2">
                  <p className="text-[9.5px] uppercase tracking-wide text-ink-400">{ s.label }</p>
                  <p className="text-[15px] font-semibold tabular text-ink-900">{ s.value }</p>
                </div>
              ))}
            </div>

            <div>
              <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">Sections</p>
              <div className="divide-y divide-ink-100 rounded-lg border border-ink-200">
                { buildRows(preview).map((r, i) => (
                  <div key={`${r.label }-${ i }`} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <span className="text-[11.5px] text-ink-600">{ r.label }</span>
                    <span className="text-right text-[11.5px] font-medium tabular text-ink-800">{ r.value }</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">Performance vs target</p>
              { [
                { label: 'SLA compliance (target 85%)', value: preview.summary.slaCompliance },
                { label: 'Automation rate (target 60%)', value: preview.summary.automationRate },
                { label: 'Completion rate', value: preview.summary.tasks ? (preview.summary.completed / preview.summary.tasks) * 100 : 0 },
              ].map((m) => (
                <div key={ m.label } className="mb-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-ink-600">{ m.label }</span>
                    <span className="font-semibold tabular text-ink-800">{ m.value.toFixed(1) }%</span>
                  </div>
                  <Progress value={ m.value } tone={ m.value >= 85 ? 'emerald' : m.value >= 60 ? 'amber' : 'red' } height="h-1" />
                </div>
              ))}
            </div>

            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[10.5px] leading-relaxed text-amber-900">
              This report was generated in OpsFlow demo mode from a synthetic dataset for { state.organization.name }. Figures are illustrative and must
              not be used as a representation of any real organisation's performance.
            </p>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={ !!confirmDelete }
        onClose={ () => setConfirmDelete(null) }
        onConfirm={ () => confirmDelete && deleteReport(confirmDelete.id) }
        title="Remove this report from history?"
        description={ `${confirmDelete?.code } — ${ confirmDelete?.title } will be removed from the report history. The underlying task data is not affected.`}
        confirmLabel="Remove report"
      />

      <InfoNote>
        <strong>Exports.</strong> CSV export is fully functional and includes organization, period and a demo-data disclaimer. PDF export is
        available through your browser's print dialog (Print → Save as PDF) rather than a bundled PDF library.
      </InfoNote>
    </div>
  );
}

function ReportTable({ reports, onPreview, onExport, onDelete, limit }: { reports: ReportRecord[];
  onPreview: (r: ReportRecord) => void;
  onExport: (r: ReportRecord) => void;
  onDelete: (r: ReportRecord) => void;
  limit?: number; }) { const { state } = useStore();
  const rows = limit ? reports.slice(0, limit) : reports;
  if (!rows.length) { return <EmptyState compact title="No reports generated yet" description="Generate a report to populate the history." icon={<FileBarChart className="h-4 w-4" /> } />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px]">
        <thead className="border-b border-ink-100 bg-ink-50/60">
          <tr>
            <th className="th pl-4">Report</th>
            <th className="th">Period</th>
            <th className="th">Department</th>
            <th className="th">Scope</th>
            <th className="th">Generated</th>
            <th className="th">By</th>
            <th className="th pr-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-50">
          { rows.map((r) => (
            <tr key={r.id } className="transition-colors hover:bg-ink-50/60">
              <td className="td max-w-[240px] pl-4">
                <p className="truncate text-[12px] font-medium text-ink-800">{ r.title }</p>
                <p className="text-[10px] text-ink-400">{ r.code }</p>
              </td>
              <td className="td whitespace-nowrap text-[11px]">
                { fmtDateTime(r.periodFrom).split(', ')[0] } – { fmtDateTime(r.periodTo).split(', ')[0] }
              </td>
              <td className="td whitespace-nowrap text-[11px]">
                { r.departmentId === 'all' ? 'All' : state.organization.departments.find((d) => d.id === r.departmentId)?.code }
              </td>
              <td className="td whitespace-nowrap text-[11px] tabular">
                { r.summary.tasks } req · { r.summary.slaCompliance }% SLA
              </td>
              <td className="td whitespace-nowrap text-[11px]">{ fmtDateTime(r.generatedAt) }</td>
              <td className="td whitespace-nowrap text-[11px]">{ r.generatedBy }</td>
              <td className="td pr-4">
                <div className="flex items-center justify-end gap-0.5">
                  <Button size="xs" variant="ghost" onClick={ () => onPreview(r) }>Preview</Button>
                  <Button size="xs" variant="ghost" icon={ <Download className="h-3 w-3" /> } onClick={ () => onExport(r) } aria-label="Export CSV" />
                  <Button size="xs" variant="ghost" className="text-red-600 hover:bg-red-50" icon={ <Trash2 className="h-3 w-3" /> } onClick={ () => onDelete(r) } aria-label="Delete report" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

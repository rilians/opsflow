import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Banknote, Building2, Calculator, Clock, Download, Info, PiggyBank, RotateCcw, Sparkles, Target, TrendingUp, Wallet, Zap } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Progress, Select, Tooltip } from '@/components/ui';
import { PageHeader, InfoNote } from '@/components/shared/Page';
import { KpiCard } from '@/components/shared/bits';
import { BeforeAfterChart, EfficiencyRadar, ManualVsAutomatedChart } from '@/components/charts/Charts';
import { useStore } from '@/services/store';
import { ROI_DEFAULTS } from '@/data/seed';
import { baselineRows, beforeAfter, botValueRanking, buildTrend, computeKpis, computeRoi, monthlyAutomationImpact } from '@/services/analytics';
import { cn, downloadFile, fmtHours, fmtIdr, fmtNumber, fmtPct, toCsv } from '@/lib/utils';
import type { RoiInputs } from '@/types';

export function Analytics() { const { state, updateRoi, toast } = useStore();
  const [deptFilter, setDeptFilter] = useState('all');

  const kpis = useMemo(() => computeKpis(state), [state]);
  const baselines = useMemo(() => baselineRows(state), [state]);
  const ba = useMemo(() => beforeAfter(state), [state]);
  const roi = useMemo(() => computeRoi(state), [state]);
  const impact = useMemo(() => monthlyAutomationImpact(state), [state]);
  const botRanking = useMemo(() => botValueRanking(state), [state]);
  const trend = useMemo(() => buildTrend(state, 30), [state]);

  const filteredRows = deptFilter === 'all' ? baselines : baselines.filter((b) => b.departmentId === deptFilter);
  const maxMonthly = Math.max(...filteredRows.map((r) => r.monthlyMinutesSaved), 1);

  const roiForm = state.roiInputs;
  const setField = (k: keyof RoiInputs, v: string) => { const num = v === '' ? 0 : Number(v);
    updateRoi({ [k]: Number.isFinite(num) ? Math.max(0, num) : 0 } as Partial<RoiInputs>);
  };

  const exportAnalysis = () => { const headers = ['Process', 'Category', 'Department', 'Monthly volume', 'Manual min', 'Automated min', 'Time saved %', 'Monthly minutes saved', 'Monthly cost saving (IDR)', 'Manual error %', 'Automated error %', 'Error reduction %'];
    const rows = filteredRows.map((r) => [
      r.process, r.category, state.organization.departments.find((d) => d.id === r.departmentId)?.name ?? '', r.monthlyVolume, r.manualMinutes, r.automatedMinutes, r.savingPct.toFixed(1), r.monthlyMinutesSaved, Math.round(r.monthlyCostSavingIdr), r.manualErrorRatePct, r.automatedErrorRatePct, r.errorReductionPct.toFixed(1), ]);
    downloadFile(`opsflow-automation-impact-${new Date().toISOString().slice(0, 10) }.csv`, toCsv(headers, rows));
    toast({ title: 'Analysis exported', description: `${rows.length } process baseline(s).`, tone: 'success' });
  };

  const radar = [
    { subject: 'Completion', value: Math.round(kpis.completionRate) },
    { subject: 'SLA', value: Math.round(kpis.slaCompliance) },
    { subject: 'Automation', value: Math.round(kpis.automationRate) },
    { subject: 'Error control', value: Math.round(ba.rows.find((r) => r.metric === 'Data error frequency') ? 100 - ba.rows.find((r) => r.metric === 'Data error frequency')!.after * 5 : 80) },
    { subject: 'Throughput', value: Math.min(100, Math.round(kpis.completedLast7 * 10)) },
    { subject: 'Reliability', value: Math.round(kpis.executionSuccessRate) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analytics & Business Intelligence"
        description="Quantify the operational value of BAU simplification. Baselines, before/after comparisons and a transparent ROI model — all computed from the current workspace data and clearly labelled demo assumptions."
        actions={ <>
            <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" /> } onClick={ exportAnalysis }>Export analysis</Button>
            <Button variant="primary" size="sm" icon={ <Calculator className="h-3.5 w-3.5" /> } onClick={ () => document.getElementById('roi')?.scrollIntoView({ behavior: 'smooth' })}>
              ROI calculator
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard label="Monthly minutes saved" value={ fmtNumber(impact.monthlyMinutesSaved) } icon={ <Zap className="h-3.5 w-3.5" /> } tone="emerald" hint={ `${fmtHours(impact.monthlyHoursSaved) } of manual effort removed`} />
        <KpiCard label="Monthly cost saving" value={ fmtIdr(impact.monthlyCostSavingIdr, true) } icon={ <Wallet className="h-3.5 w-3.5" /> } tone="blue" hint="Baseline model for demo processes" />
        <KpiCard label="Transactions covered" value={ fmtNumber(impact.transactionsCovered) } icon={ <Target className="h-3.5 w-3.5" /> } tone="violet" hint="Per month across 8 baselines" />
        <KpiCard label="Measured automation savings" value={ `${fmtNumber(kpis.minutesSaved / 60, 1) }h`} icon={ <Sparkles className="h-3.5 w-3.5" /> } tone="emerald" hint={ `From ${state.executions.length } real BOT executions`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Before vs after automation" subtitle="Weighted by monthly transaction volume across the baseline processes" />
          <div className="px-2 py-3">
            <BeforeAfterChart
              data={ ba.rows.map((r) => ({ metric: r.metric, before: Number(r.before.toFixed(1)), after: Number(r.after.toFixed(1)) }))}
              height={ 280 }
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Impact summary" subtitle="Net change per metric" />
          <div className="divide-y divide-ink-50">
            { ba.rows.map((r) => {
              const better = r.better === 'lower' ? r.after < r.before : r.after > r.before;
              const change = r.before === 0 ? (r.after > 0 ? 100 : 0) : ((r.after - r.before) / r.before) * 100;
              return (
                <div key={r.metric } className="flex items-center justify-between gap-2 px-3.5 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[11.5px] font-medium text-ink-700">{ r.metric }</p>
                    <p className="text-[10px] tabular text-ink-400">
                      { r.before.toFixed(1) }{ r.unit === '%' || r.unit === 'index' ? r.unit : ` ${r.unit }`} → { r.after.toFixed(1) }{ r.unit === '%' || r.unit === 'index' ? r.unit : ` ${r.unit }`}
                    </p>
                  </div>
                  <span
                    className={ cn(
                      'flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10.5px] font-semibold tabular', better ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600', ) }
                  >
                    { better ? <ArrowDownRight className="h-2.5 w-2.5" /> : <ArrowUpRight className="h-2.5 w-2.5" /> }
                    { Math.abs(change).toFixed(1) }%
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Process efficiency ranking"
          subtitle="Which operational processes generate the greatest time saving"
          icon={ <TrendingUp className="h-4 w-4 text-brand-600" /> }
          action={ <Select value={deptFilter } onChange={ (e) => setDeptFilter(e.target.value) } className="h-7 w-[180px] py-0 text-[11.5px]" aria-label="Filter by department">
              <option value="all">All departments</option>
              { state.organization.departments.map((d) => (
                <option key={d.id } value={ d.id }>{ d.name }</option>
              ))}
            </Select>
          }
        />
        <div className="overflow-x-auto">
          <table className="relative w-full min-w-[900px]">
            <thead className="sticky top-0 z-10 border-b border-ink-200/80 bg-ink-50/95 backdrop-blur">
              <tr>
                <th className="th pl-4">Process</th>
                <th className="th">Department</th>
                <th className="th text-right">Volume / mo</th>
                <th className="th text-right">Manual</th>
                <th className="th text-right">Automated</th>
                <th className="th">Time saved</th>
                <th className="th text-right">Saving / mo</th>
                <th className="th text-right">Fewer errors</th>
                <th className="th pr-4 text-right">Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              { filteredRows.map((r) => (
                <tr key={r.id } className="transition-colors hover:bg-ink-50/60">
                  <td className="td max-w-[240px] pl-4">
                    <p className="truncate text-[12px] font-medium text-ink-800">{ r.process }</p>
                    <p className="text-[10px] text-ink-400">{ r.category }</p>
                  </td>
                  <td className="td whitespace-nowrap text-[11px]">
                    { state.organization.departments.find((d) => d.id === r.departmentId)?.code }
                  </td>
                  <td className="td text-right tabular text-[11.5px]">{ fmtNumber(r.monthlyVolume) }</td>
                  <td className="td text-right tabular text-[11.5px] text-ink-500">{ r.manualMinutes }m</td>
                  <td className="td text-right tabular text-[11.5px]">{ r.automatedMinutes }m</td>
                  <td className="td">
                    <div className="flex items-center gap-1.5">
                      <span className="w-11 text-[11.5px] font-semibold tabular text-emerald-700">{ r.savingPct.toFixed(1) }%</span>
                      <Progress value={ (r.monthlyMinutesSaved / maxMonthly) * 100 } height="h-1" className="w-16" tone="emerald" />
                    </div>
                  </td>
                  <td className="td text-right tabular text-[11.5px] font-medium">{ fmtIdr(r.monthlyCostSavingIdr, true) }</td>
                  <td className="td text-right tabular text-[11.5px]">
                    <span className="text-emerald-700">−{ r.errorReductionPct.toFixed(0) }%</span>
                  </td>
                  <td className="td pr-4 text-right">
                    <Tooltip content={`${r.automationCoveragePct}% of this process is handled by BOTs`}>
                      <Badge tone={ r.automationCoveragePct >= 80 ? 'emerald' : r.automationCoveragePct >= 60 ? 'amber' : 'slate' }>
                        { r.automationCoveragePct }%
                      </Badge>
                    </Tooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Operational capability profile" subtitle="Composite performance across dimensions" />
          <div className="px-2 py-2">
            <EfficiencyRadar data={ radar } height={ 250 } />
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="BOT value ranking" subtitle="Estimated monthly value delivered per automation" icon={ <Building2 className="h-4 w-4 text-ink-400" /> } />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead className="border-b border-ink-100 bg-ink-50/60">
                <tr>
                  <th className="th pl-4">Automation</th>
                  <th className="th">Runs</th>
                  <th className="th">Monthly minutes</th>
                  <th className="th">Monthly value</th>
                  <th className="th pr-4">Success</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                { botRanking.map((b, i) => (
                  <tr key={b.id } className="transition-colors hover:bg-ink-50/60">
                    <td className="td pl-4">
                      <p className="text-[12px] font-medium text-ink-800">
                        <span className="mr-1.5 text-ink-400">{ i + 1 }.</span>
                        { b.ruleName }
                      </p>
                    </td>
                    <td className="td tabular text-[11.5px]">{ b.runs }</td>
                    <td className="td tabular text-[11.5px]">{ fmtNumber(b.minutes) }</td>
                    <td className="td tabular text-[11.5px] font-medium text-emerald-700">{ fmtIdr(b.costIdr, true) }</td>
                    <td className="td pr-4">
                      <span className={ cn('text-[11.5px] font-semibold tabular', b.successRate >= 95 ? 'text-emerald-600' : b.successRate > 0 ? 'text-amber-700' : 'text-ink-400') }>
                        { b.successRate ? `${b.successRate.toFixed(0) }%` : 'no runs'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Workload mix over time"
            subtitle="Automated (green) vs manual (grey) share of daily intake, last 30 days"
            action={ <Badge tone="emerald" dot>{ `${Math.round((trend.reduce((a, t) => a + t.automated, 0) / Math.max(1, trend.reduce((a, t) => a + t.automated + t.manual, 0))) * 100)}% automated` }</Badge> }
          />
          <div className="px-2 py-3">
            <ManualVsAutomatedChart data={ trend.map((t) => ({ label: t.label, manual: t.manual, automated: t.automated }))} height={ 220 } />
          </div>
        </Card>
        <Card>
          <CardHeader title="Repetitiveness index" subtitle="Manual activities per request, ranked" icon={ <Clock className="h-4 w-4 text-ink-400" /> } />
          <div className="space-y-2 p-4">
            { [...filteredRows].sort((a, b) => b.manualSteps - a.manualSteps).slice(0, 6).map((r) => (
              <div key={r.id }>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[11.5px] font-medium text-ink-700">{ r.process }</p>
                  <span className="shrink-0 text-[10.5px] tabular text-ink-500">{ r.manualSteps } → { r.automatedSteps } steps</span>
                </div>
                <div className="mt-0.5 flex gap-1">
                  { Array.from({ length: r.manualSteps }).map((_, i) => (
                    <span key={ i } className={ cn('h-1.5 flex-1 rounded-full', i < r.automatedSteps ? 'bg-brand-500' : 'bg-ink-200') } />
                  ))}
                </div>
              </div>
            ))}
            <p className="pt-1 text-[10.5px] text-ink-400">Green segments are handled automatically by the configured BOTs.</p>
          </div>
        </Card>
      </div>

      { /* ROI */ }
      <div id="roi" className="scroll-mt-20">
        <Card className="overflow-hidden">
          <CardHeader
            title="Automation ROI calculator"
            subtitle="Transparent model — adjust any input and results recompute immediately"
            icon={ <Calculator className="h-4 w-4 text-brand-600" /> }
            action={ <Button
                size="xs"
                variant="ghost"
                icon={<RotateCcw className="h-3 w-3" /> }
                onClick={ () => updateRoi({ ...ROI_DEFAULTS }) }
              >
                Reset defaults
              </Button>
            }
          />
          <div className="grid gap-0 lg:grid-cols-[minmax(0,380px)_1fr]">
            <div className="space-y-3 border-ink-100 p-4 lg:border-r">
              { [
                { key: 'monthlyTransactions' as const, label: 'Transactions per month', hint: 'Requests handled by this process', step: 50 },
                { key: 'manualMinutes' as const, label: 'Manual processing time (min)', hint: 'Average before automation', step: 1 },
                { key: 'automatedMinutes' as const, label: 'Automated processing time (min)', hint: 'Average after automation', step: 1 },
                { key: 'hourlyCostIdr' as const, label: 'Employee hourly cost (IDR)', hint: 'Fully loaded operational cost', step: 5000 },
                { key: 'implementationCostIdr' as const, label: 'Implementation cost (IDR)', hint: 'One-off build & migration', step: 5_000_000 },
                { key: 'monthlyMaintenanceCostIdr' as const, label: 'Monthly maintenance (IDR)', hint: 'Licences, support, monitoring', step: 500_000 },
              ].map((f) => (
                <div key={ f.key }>
                  <label className="label" htmlFor={ `roi-${f.key }`}>{ f.label }</label>
                  <input
                    id={ `roi-${f.key }`}
                    type="number"
                    min={ 0 }
                    step={ f.step }
                    value={ roiForm[f.key] }
                    onChange={ (e) => setField(f.key, e.target.value) }
                    className="input tabular"
                  />
                  <p className="mt-0.5 text-[10.5px] text-ink-400">{ f.hint }</p>
                </div>
              ))}
              { roiForm.automatedMinutes > roiForm.manualMinutes && (
                <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                  Automated time exceeds manual time — the model clamps savings to zero rather than reporting a negative benefit.
                </p>
              ) }
            </div>

            <div className="bg-ink-50/40 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-ink-200 bg-white p-3">
                  <p className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-400"><Clock className="h-3 w-3" /> Time saved / month</p>
                  <p className="mt-1 text-[20px] font-semibold tabular text-ink-900">{ fmtNumber(roi.timeSavedPerMonthHours) } h</p>
                  <p className="text-[10.5px] text-ink-500">{ fmtNumber(roi.manualHoursPerMonth) } h manual → { fmtNumber(roi.automatedHoursPerMonth) } h automated</p>
                </div>
                <div className="rounded-lg border border-ink-200 bg-white p-3">
                  <p className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-400"><Banknote className="h-3 w-3" /> Monthly labour saving</p>
                  <p className="mt-1 text-[20px] font-semibold tabular text-emerald-700">{ fmtIdr(roi.monthlyLaborSavingIdr, true) }</p>
                  <p className="text-[10.5px] text-ink-500">Net of maintenance: { fmtIdr(roi.monthlyNetSavingIdr, true) }</p>
                </div>
                <div className="rounded-lg border border-ink-200 bg-white p-3">
                  <p className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-400"><PiggyBank className="h-3 w-3" /> Annualised saving</p>
                  <p className="mt-1 text-[20px] font-semibold tabular text-emerald-700">{ fmtIdr(roi.annualNetSavingIdr, true) }</p>
                  <p className="text-[10.5px] text-ink-500">Gross { fmtIdr(roi.annualSavingIdr, true) } · 12 months</p>
                </div>
                <div className="rounded-lg border border-ink-200 bg-white p-3">
                  <p className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-400"><Target className="h-3 w-3" /> Estimated ROI</p>
                  <p className="mt-1 text-[20px] font-semibold tabular text-ink-900">
                    { Number.isFinite(roi.roiPct) ? fmtPct(roi.roiPct, 0) : '∞' }
                  </p>
                  <p className="text-[10.5px] text-ink-500">
                    Payback { Number.isFinite(roi.paybackMonths) ? `${roi.paybackMonths.toFixed(1) } months` : 'not reached'}
                  </p>
                </div>
              </div>

              <div className="mt-2.5 rounded-lg border border-ink-200 bg-white p-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">Payback curve</p>
                <div className="mt-1.5 flex h-[68px] items-end gap-0.5">
                  {Array.from({ length: 24 }).map((_, m) => {
                    const cumulative = roi.monthlyNetSavingIdr * (m + 1);
                    const capex = roiForm.implementationCostIdr;
                    const progress = capex > 0 ? Math.min(100, (cumulative / capex) * 100) : 100;
                    return (
                      <div
                        key={m}
                        title={`Month ${m + 1}: ${fmtIdr(cumulative, true)} recovered (${progress.toFixed(0)}%)`}
                        className={cn('flex-1 rounded-t transition-all', cumulative >= capex ? 'bg-brand-500' : 'bg-brand-200')}
                        style={{ height: `${Math.max(6, (progress / 100) * 64)}px` }}
                      />
                    );
                  })}
                </div>
                <p className="mt-1 text-[10.5px] text-ink-500">
                  Cumulative net saving against the { fmtIdr(roiForm.implementationCostIdr, true) } implementation investment.
                </p>
              </div>

              <div className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5">
                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-900">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <strong>Model assumptions (demo).</strong> Linear savings, no ramp-up curve, no discounting, no headcount reduction assumed — savings
                    are redeployed capacity. Hourly cost is a fully loaded estimate. Actual results depend on process mix, adoption and data quality.
                  </span>
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <InfoNote>
        <strong>Method.</strong> Baseline process metrics are seeded demo figures for { state.organization.name }; live savings use measured BOT
        executions (records × configured handling time). Baseline totals are volume-weighted, so a high-volume low-saving process contributes
        proportionally more than a low-volume high-saving one.
      </InfoNote>
    </div>
  );
}

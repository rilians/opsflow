import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, Pie, PieChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, ComposedChart } from 'recharts';
import { CHART_COLORS } from '@/lib/catalog';

/** Semantic colours so the legend, donut and status badges agree. */
export const STATUS_COLORS: Record<string, string> = {
  New: '#667085', // 4.97:1 on white — meets WCAG for graphical objects
  'Pending Validation': '#f59e0b',
  Assigned: '#0ea5e9',
  'In Progress': '#6366f1',
  'Waiting Approval': '#8b5cf6',
  Overdue: '#ef4444',
  Completed: '#10b981',
  Rejected: '#f43f5e',
};

/* Axis treatment: no axis lines, no tick marks, tabular 10.5px labels and a
   hairline dashed grid that only ever runs horizontally. */
const axisProps = {
  stroke: 'transparent',
  tick: { fill: '#667085', fontSize: 10.5 },
  tickLine: false,
  axisLine: false,
} as const;

const grid = <CartesianGrid vertical={false} stroke="#eaecf0" strokeDasharray="2 4" />;

const cursorLine = { stroke: '#d0d5dd', strokeDasharray: '3 3' } as const;
const cursorFill = { fill: '#f7f8fa' } as const;

export function ChartTooltipContent({ active, payload, label, formatter, suffix }: { active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string }[];
  label?: string | number;
  formatter?: (v: number | string, name?: string) => string;
  suffix?: string;
}) { if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[132px] rounded-lg border border-ink-200/80 bg-white/97 px-2.5 py-2 shadow-pop backdrop-blur">
      {label !== undefined && label !== '' && <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">{label }</p>}
      <div className="space-y-1">
        { payload.map((p, i) => (
          <div key={i } className="flex items-center justify-between gap-3 text-[11.5px]">
            <span className="flex items-center gap-1.5 text-ink-500">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={ { background: p.color }} />
              { p.name }
            </span>
            <span className="font-semibold tabular text-ink-900">
              { formatter ? formatter(p.value ?? 0, p.name) : `${p.value }${ suffix ?? '' }`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CompletionTrendChart({ data, height = 240 }: { data: { label: string; created: number; completed: number; automated: number }[];
  height?: number;
}) { return (
    <ResponsiveContainer width="100%" height={height }>
      <ComposedChart data={ data } margin={ { top: 10, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={ 0.28 } />
            <stop offset="100%" stopColor="#10b981" stopOpacity={ 0.02 } />
          </linearGradient>
          <linearGradient id="gradBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6ee7b7" stopOpacity={ 0.95 } />
            <stop offset="100%" stopColor="#a7f3d0" stopOpacity={ 0.6 } />
          </linearGradient>
        </defs>
        {grid}
        <XAxis dataKey="label" { ...axisProps } interval="preserveStartEnd" minTickGap={24} />
        <YAxis { ...axisProps } width={ 38 } allowDecimals={ false } />
        <RTooltip content={ <ChartTooltipContent /> } cursor={ cursorLine } />
        <Bar dataKey="automated" name="Automated" fill="url(#gradBar)" radius={ [3, 3, 0, 0] } barSize={ 11 } />
        <Area type="monotone" dataKey="completed" name="Completed" stroke="#10b981" strokeWidth={ 2.25 } fill="url(#gradCompleted)" activeDot={ { r: 3.5, strokeWidth: 2, stroke: '#fff' }} />
        <Line
          type="monotone"
          dataKey="created"
          name="Created"
          stroke="#3b82f6"
          strokeWidth={ 1.5 }
          strokeDasharray="4 3"
          dot={ false }
          activeDot={ { r: 3, strokeWidth: 2, stroke: '#fff' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function SlaTrendChart({ data, height = 200 }: { data: { label: string; slaCompliance: number; avgResolution: number }[]; height?: number }) { return (
    <ResponsiveContainer width="100%" height={height }>
      <AreaChart data={ data } margin={ { top: 10, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradSla" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={ 0.20 } />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={ 0 } />
          </linearGradient>
        </defs>
        {grid}
        <XAxis dataKey="label" { ...axisProps } interval="preserveStartEnd" minTickGap={24} />
        <YAxis { ...axisProps } width={ 46 } domain={ [0, 100] } tickFormatter={ (v) => `${v }%`} />
        <RTooltip content={ <ChartTooltipContent suffix="%" /> } cursor={ cursorLine } />
        <Area type="monotone" dataKey="slaCompliance" name="SLA compliance" stroke="#3b82f6" strokeWidth={ 2 } fill="url(#gradSla)" activeDot={ { r: 3, strokeWidth: 2, stroke: '#fff' }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DepartmentWorkloadChart({ data, height = 230 }: { data: { short: string; name: string; open: number; completed: number; overdue: number }[];
  height?: number;
}) { return (
    <div>
    <div className="mb-1 flex flex-wrap items-center gap-3 px-2">
      {[
        { label: 'Open', color: '#10b981' },
        { label: 'Completed', color: '#cbd5e1' },
        { label: 'Overdue', color: '#ef4444' },
      ].map((l) => (
        <span key={l.label} className="flex items-center gap-1.5 text-[10.5px] text-ink-500">
          <span className="h-1.5 w-1.5 rounded-[2px]" style={{ background: l.color }} />
          {l.label}
        </span>
      ))}
    </div>
    <ResponsiveContainer width="100%" height={height }>
      <BarChart data={ data } margin={ { top: 10, right: 8, left: 0, bottom: 0 }} barGap={ 3 }>
        {grid}
        <XAxis dataKey="short" { ...axisProps } />
        <YAxis { ...axisProps } width={ 36 } allowDecimals={ false } />
        <RTooltip content={ <ChartTooltipContent /> } cursor={ cursorFill } />
        <Bar dataKey="open" name="Open" fill="#10b981" radius={ [3, 3, 0, 0] } barSize={ 14 } />
        <Bar dataKey="completed" name="Completed" fill="#cbd5e1" radius={ [3, 3, 0, 0] } barSize={ 14 } />
        <Bar dataKey="overdue" name="Overdue" fill="#ef4444" radius={ [3, 3, 0, 0] } barSize={ 14 } />
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}

/** Donut with a proper legend underneath: swatch, label, count and share. */
export function StatusDonutChart({ data, height = 220 }: { data: { name: string; value: number }[];
  height?: number;
}) { const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height }>
        <PieChart>
          <Pie
            data={ data }
            dataKey="value"
            nameKey="name"
            innerRadius="64%"
            outerRadius="90%"
            paddingAngle={ 1.5 }
            stroke="#fff"
            strokeWidth={ 2 }
            startAngle={ 90 }
            endAngle={ -270 }
          >
            { data.map((d, i) => (
              <Cell key={d.name} fill={STATUS_COLORS[d.name] ?? CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <RTooltip content={ <ChartTooltipContent formatter={(v) => `${v } · ${ ((Number(v) / (total || 1)) * 100).toFixed(1) }%`} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center justify-center" style={{ height }}>
        <span className="figure text-[22px] font-semibold leading-none">{total}</span>
        <span className="mt-1 text-[10px] uppercase tracking-[0.09em] text-ink-400">requests</span>
      </div>
    </div>
  );
}

/** Legend list that pairs with the donut — numbers line up with the chart. */
export function ChartLegendList({ data, className }: { data: { name: string; value: number }[]; className?: string }) {
  const total = data.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <ul className={className}>
      {data.map((d, i) => (
        <li key={d.name} className="flex items-center gap-2 py-1">
          <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: STATUS_COLORS[d.name] ?? CHART_COLORS[i % CHART_COLORS.length] }} />
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-600">{d.name}</span>
          <span className="w-9 shrink-0 text-right text-[11.5px] font-semibold tabular text-ink-900">{d.value}</span>
          <span className="w-10 shrink-0 text-right text-[10.5px] tabular text-ink-400">{((d.value / total) * 100).toFixed(0)}%</span>
        </li>
      ))}
    </ul>
  );
}

export function ManualVsAutomatedChart({ data, height = 210 }: { data: { label: string; manual: number; automated: number }[]; height?: number }) { return (
    <ResponsiveContainer width="100%" height={height }>
      <BarChart data={ data } margin={ { top: 10, right: 8, left: 0, bottom: 0 }} stackOffset="expand">
        {grid}
        <XAxis dataKey="label" { ...axisProps } interval="preserveStartEnd" minTickGap={30} />
        <YAxis { ...axisProps } width={ 42 } tickFormatter={ (v) => `${Math.round(v * 100) }%`} />
        <RTooltip content={ <ChartTooltipContent /> } cursor={ cursorFill } />
        <Bar dataKey="automated" name="Automated" stackId="a" fill="#10b981" />
        <Bar dataKey="manual" name="Manual" stackId="a" fill="#d0d5dd" radius={ [3, 3, 0, 0] } />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ExecutionStatusChart({ data, height = 200 }: { data: { label: string; success: number; partial: number; failed: number }[];
  height?: number;
}) { return (
    <ResponsiveContainer width="100%" height={height }>
      <BarChart data={ data } margin={ { top: 10, right: 8, left: 0, bottom: 0 } }>
        {grid}
        <XAxis dataKey="label" { ...axisProps } interval="preserveStartEnd" minTickGap={26} />
        <YAxis { ...axisProps } width={ 32 } allowDecimals={ false } />
        <RTooltip content={ <ChartTooltipContent /> } cursor={ cursorFill } />
        <Bar dataKey="success" name="Success" stackId="s" fill="#10b981" />
        <Bar dataKey="partial" name="Partial" stackId="s" fill="#f59e0b" />
        <Bar dataKey="failed" name="Failed" stackId="s" fill="#ef4444" radius={ [3, 3, 0, 0] } />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BeforeAfterChart({ data, height = 260 }: { data: { metric: string; before: number; after: number }[];
  height?: number;
}) { return (
    <ResponsiveContainer width="100%" height={height }>
      <BarChart data={ data } layout="vertical" margin={ { top: 4, right: 24, left: 8, bottom: 0 }} barGap={ 3 }>
        <CartesianGrid horizontal={false} stroke="#eaecf0" strokeDasharray="2 4" />
        <XAxis type="number" { ...axisProps } />
        <YAxis type="category" dataKey="metric" { ...axisProps } width={ 158 } tick={ { fill: '#475569', fontSize: 10.5 }} />
        <RTooltip content={ <ChartTooltipContent /> } cursor={ cursorFill } />
        <Bar dataKey="before" name="Before automation" fill="#d0d5dd" radius={ [0, 3, 3, 0] } barSize={ 8 } />
        <Bar dataKey="after" name="After automation" fill="#10b981" radius={ [0, 3, 3, 0] } barSize={ 8 } />
        <Legend wrapperStyle={ { fontSize: 11, paddingTop: 4 }} iconType="circle" iconSize={ 6 } />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EfficiencyRadar({ data, height = 240 }: { data: { subject: string; value: number }[]; height?: number }) { return (
    <ResponsiveContainer width="100%" height={height }>
      <RadarChart data={ data } outerRadius="72%">
        <PolarGrid stroke="#eaecf0" />
        <PolarAngleAxis dataKey="subject" tick={ { fill: '#667085', fontSize: 10 }} />
        <Radar dataKey="value" stroke="#10b981" fill="#10b981" fillOpacity={ 0.16 } strokeWidth={ 2 } />
        <RTooltip content={ <ChartTooltipContent suffix="%" /> } />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export function SparkArea({ data, color = '#10b981', height = 34 }: { data: number[]; color?: string; height?: number }) { const series = data.map((v, i) => ({ i, v }));
  const id = `spark-${color.replace('#', '')}`;
  return (
    <ResponsiveContainer width="100%" height={ height }>
      <AreaChart data={ series } margin={ { top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={ id } x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ color } stopOpacity={ 0.28 } />
            <stop offset="100%" stopColor={ color } stopOpacity={ 0 } />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={ color } strokeWidth={ 1.6 } fill={ `url(#${id})`} dot={ false } isAnimationActive={ false } />
      </AreaChart>
    </ResponsiveContainer>
  );
}

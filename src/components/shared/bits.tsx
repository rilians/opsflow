import React from 'react';
import { ArrowDownRight, ArrowUpRight, Info, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, Tooltip } from '@/components/ui';
import { CATEGORY_TONE, PRIORITY_STYLES, STATUS_STYLES } from '@/lib/catalog';
import type { Priority, TaskCategory, TaskStatus } from '@/types';
import { SparkArea } from '@/components/charts/Charts';

/**
 * KPI tile.
 *
 * Anatomy, top to bottom: label (with an optional explanation), the figure at
 * display weight, then one line of evidence. The accent is a 2px rule and a
 * tinted icon tile — the card surface itself stays white so a row of eight
 * tiles reads as one calm band rather than eight different colours.
 *
 * The DOM contract is deliberate: the first <p> is the label, the second is the
 * value. Verification scripts (`scripts/e2e.cjs`, `scripts/kpi-audit.cjs`) read
 * the number from there, so this ordering must not change.
 */
export function KpiCard({
  label,
  value,
  hint,
  icon,
  delta,
  deltaLabel,
  trend,
  tone = 'emerald',
  invertDelta,
  footer,
  tooltip,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ReactNode;
  delta?: number;
  deltaLabel?: string;
  trend?: number[];
  tone?: 'emerald' | 'blue' | 'amber' | 'red' | 'ink' | 'violet';
  invertDelta?: boolean;
  footer?: React.ReactNode;
  tooltip?: string;
  onClick?: () => void;
}) {
  const tones = {
    emerald: { bg: 'bg-brand-50', text: 'text-brand-700', rule: 'bg-brand-500', spark: '#10b981' },
    blue: { bg: 'bg-sky-50', text: 'text-sky-700', rule: 'bg-sky-500', spark: '#0ea5e9' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', rule: 'bg-amber-500', spark: '#f59e0b' },
    red: { bg: 'bg-red-50', text: 'text-red-700', rule: 'bg-red-500', spark: '#ef4444' },
    ink: { bg: 'bg-ink-100', text: 'text-ink-600', rule: 'bg-ink-400', spark: '#64748b' },
    violet: { bg: 'bg-violet-50', text: 'text-violet-700', rule: 'bg-violet-500', spark: '#8b5cf6' },
  }[tone];

  const showDelta = delta !== undefined && Number.isFinite(delta);
  const positive = invertDelta ? (delta ?? 0) < 0 : (delta ?? 0) > 0;
  const neutral = Math.abs(delta ?? 0) < 0.05;

  return (
    <div
      className={cn('card group relative overflow-hidden p-3.5', onClick && 'card-hover cursor-pointer')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <span className={cn('absolute inset-x-0 top-0 h-[2px] opacity-0 transition-opacity duration-200', tones.rule, onClick && 'group-hover:opacity-100')} />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate text-[11.5px] font-medium text-ink-500">
            {label}
            {tooltip && (
              <Tooltip content={tooltip}>
                <Info className="h-3 w-3 cursor-help text-ink-300 transition-colors group-hover:text-ink-400" />
              </Tooltip>
            )}
          </p>
          <p className="figure mt-1.5 text-[24px] font-semibold leading-none">{value}</p>
        </div>
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', tones.bg, tones.text)}>{icon}</span>
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          {showDelta ? (
            <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded px-1 py-px text-[10.5px] font-semibold tabular',
                  neutral ? 'bg-ink-100 text-ink-500' : positive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600',
                )}
              >
                {neutral ? <Minus className="h-2.5 w-2.5" /> : positive ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                {`${Math.abs(delta!).toFixed(1)}%`}
              </span>
              {deltaLabel && <span className="text-[10.5px] leading-tight text-ink-400">{deltaLabel}</span>}
            </span>
          ) : (
            <span className="text-[10.5px] leading-tight text-ink-400">{hint}</span>
          )}
        </div>
        {trend && trend.length > 1 && (
          <div className="h-7 w-12 shrink-0 self-end opacity-90 transition-opacity group-hover:opacity-100 sm:w-16">
            <SparkArea data={trend} color={tones.spark} height={28} />
          </div>
        )}
      </div>

      {footer && <div className="mt-2.5 border-t border-ink-100 pt-2 text-[10.5px] leading-relaxed text-ink-500">{footer}</div>}
    </div>
  );
}

/* Status / priority / category chips.
   One shared shape: dot + label, tinted background, hairline border, 11px type.
   Consistency here does most of the visual work in the data tables. */

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-[15px]',
        s.badge,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', s.dot)} />
      {status}
    </span>
  );
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-[15px]',
        PRIORITY_STYLES[priority],
        className,
      )}
    >
      {priority === 'Critical' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />}
      {priority}
    </span>
  );
}

export function CategoryBadge({ category, className }: { category: TaskCategory; className?: string }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-[15px]', CATEGORY_TONE[category], className)}>
      {category}
    </span>
  );
}

export type Health = 'Safe' | 'Approaching deadline' | 'At risk' | 'Overdue';

const HEALTH: Record<Health, { cls: string; dot: string }> = {
  Safe: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200/80', dot: 'bg-emerald-500' },
  'Approaching deadline': { cls: 'bg-amber-50 text-amber-800 border-amber-200/80', dot: 'bg-amber-500' },
  'At risk': { cls: 'bg-orange-50 text-orange-800 border-orange-200/80', dot: 'bg-orange-500' },
  Overdue: { cls: 'bg-red-50 text-red-700 border-red-200/80', dot: 'bg-red-500' },
};

export function HealthBadge({ health, className }: { health: Health; className?: string }) {
  const s = HEALTH[health];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-[15px]',
        s.cls,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', s.dot)} />
      {health}
    </span>
  );
}

export function AutomationStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    'Auto-Assigned': 'bg-brand-50 text-brand-800 border-brand-200/80',
    Validated: 'bg-sky-50 text-sky-800 border-sky-200/80',
    'Needs Review': 'bg-amber-50 text-amber-800 border-amber-200/80',
    'Duplicate Flagged': 'bg-rose-50 text-rose-800 border-rose-200/80',
    'Not Processed': 'bg-ink-100 text-ink-500 border-ink-200',
  };
  return <Badge className={cn('border', map[status] ?? 'border-ink-200 bg-ink-50 text-ink-600')}>{status}</Badge>;
}

export function ExecutionStatusBadge({ status }: { status: string }) {
  const map: Record<string, 'emerald' | 'amber' | 'red' | 'slate'> = {
    Success: 'emerald',
    Partial: 'amber',
    Failed: 'red',
    Skipped: 'slate',
  };
  return (
    <Badge tone={map[status] ?? 'slate'} dot>
      {status}
    </Badge>
  );
}

export function HealthPill({ score }: { score: number }) {
  const tone = score >= 85 ? 'emerald' : score >= 70 ? 'amber' : 'red';
  const label = score >= 85 ? 'Healthy' : score >= 70 ? 'Needs attention' : 'At risk';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        tone === 'emerald' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
        tone === 'amber' && 'border-amber-200 bg-amber-50 text-amber-800',
        tone === 'red' && 'border-red-200 bg-red-50 text-red-700',
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full animate-pulse-ring', tone === 'emerald' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-red-500')}
      />
      {label}
    </span>
  );
}

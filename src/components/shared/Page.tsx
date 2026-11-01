import React from 'react';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';
import { Tooltip } from '@/components/ui';

/**
 * Page header. The page title is the one place the product uses display-scale
 * type, and it lives in the content column only — the topbar shows the same
 * title at chrome scale, so the two never fight.
 */
export function PageHeader({
  title,
  description,
  actions,
  meta,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-5 flex flex-col justify-between gap-3 border-b border-ink-200/60 pb-4 sm:flex-row sm:items-end">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold text-ink-900">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-ink-500">{description}</p>}
        {meta && <div className="mt-2.5">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-2 flex items-end justify-between gap-3', className)}>
      <div className="flex items-center gap-1.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-500">{title}</h2>
        {hint && (
          <Tooltip content={hint}>
            <Info className="h-3.5 w-3.5 cursor-help text-ink-300" />
          </Tooltip>
        )}
      </div>
      {action}
    </div>
  );
}

export function InfoNote({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warning' }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-[11.5px] leading-relaxed',
        tone === 'info' ? 'border-ink-200/80 bg-white/60 text-ink-600' : 'border-amber-200 bg-amber-50/60 text-amber-900',
      )}
    >
      <Info className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', tone === 'info' ? 'text-ink-400' : 'text-amber-700')} />
      <div>{children}</div>
    </div>
  );
}

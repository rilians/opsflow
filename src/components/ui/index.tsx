import React, { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search, X, AlertTriangle, Info, CheckCircle2, XCircle, Loader2, ArrowUpDown, ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { cn, initials } from '@/lib/utils';

/* ------------------------------------------------------------------ Button

   Elevation is expressed with a hairline border plus a shadow that is barely
   there, so a primary action reads as solid rather than glossy. Interaction is
   a 1px translate on hover and a 0.985 scale on press — enough to feel alive,
   never enough to shift layout.
*/

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle' | 'outline';
type ButtonSize = 'xs' | 'sm' | 'md';

const variantClass: Record<ButtonVariant, string> = {
  primary:
    'border border-brand-700/20 bg-brand-600 text-white shadow-[0_1px_2px_rgb(16_24_40/0.10),inset_0_1px_0_rgb(255_255_255/0.14)] hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300 disabled:shadow-none',
  secondary:
    'border border-ink-300/90 bg-white text-ink-700 shadow-xs hover:border-ink-400/70 hover:bg-ink-50/80 active:bg-ink-100 disabled:border-ink-200 disabled:bg-white disabled:text-ink-400 disabled:shadow-none',
  ghost: 'border border-transparent bg-transparent text-ink-600 hover:bg-ink-100/80 hover:text-ink-900 active:bg-ink-200/70',
  danger:
    'border border-red-700/20 bg-red-600 text-white shadow-[0_1px_2px_rgb(16_24_40/0.10),inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-red-700 active:bg-red-800 disabled:bg-red-300 disabled:shadow-none',
  subtle: 'border border-brand-200/80 bg-brand-50 text-brand-800 hover:border-brand-300 hover:bg-brand-100/80 active:bg-brand-200/60',
  outline: 'border border-brand-400/70 bg-white text-brand-700 hover:bg-brand-50 hover:border-brand-500',
};

const sizeClass: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-[11.5px] gap-1.5 rounded-md',
  sm: 'h-8.5 px-3 text-[12.5px] gap-1.5 rounded-lg',
  md: 'h-9.5 px-3.5 text-[13px] gap-2 rounded-lg',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'sm', loading, icon, iconRight, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-[background-color,border-color,box-shadow,transform,color] duration-150 ease-snap active:scale-[0.985] disabled:pointer-events-none disabled:active:scale-100',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

/* ------------------------------------------------------------------ Badge */

type BadgeTone = 'emerald' | 'blue' | 'amber' | 'red' | 'slate' | 'violet' | 'cyan';

export function Badge({
  children,
  className,
  dot,
  tone,
}: {
  children: React.ReactNode;
  className?: string;
  /** Pass a colour class for a custom dot, or `true` to derive it from the tone. */
  dot?: string | boolean;
  tone?: BadgeTone;
}) {
  const tones: Record<BadgeTone, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    blue: 'bg-sky-50 text-sky-700 border-sky-200/80',
    amber: 'bg-amber-50 text-amber-800 border-amber-200/80',
    red: 'bg-red-50 text-red-700 border-red-200/80',
    slate: 'bg-ink-100 text-ink-600 border-ink-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200/80',
    cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200/80',
  };
  const dots: Record<BadgeTone, string> = {
    emerald: 'bg-emerald-500',
    blue: 'bg-sky-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    slate: 'bg-ink-400',
    violet: 'bg-violet-500',
    cyan: 'bg-cyan-500',
  };
  const dotClass = typeof dot === 'string' ? dot : dot ? dots[tone ?? 'slate'] : null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-[15px]',
        tone ? tones[tone] : 'border-ink-200 bg-ink-50 text-ink-600',
        className,
      )}
    >
      {dotClass && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass)} />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ Card */

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
  size = 'default',
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  size?: 'default' | 'compact';
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 border-b border-ink-100/90 px-4 sm:px-5',
        size === 'compact' ? 'py-2.5' : 'py-3',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-ink-200/70 bg-ink-50 text-ink-500">{icon}</div>}
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold text-ink-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-500">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Form fields */

export function Field({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-[11.5px] font-medium text-red-600">
          <AlertTriangle className="h-3 w-3 shrink-0" /> {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-[11.5px] leading-relaxed text-ink-400">{hint}</p>
      )}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return <input ref={ref} className={cn('input', invalid && 'border-red-400 focus:border-red-500 focus:ring-red-500/15', className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn('input min-h-[76px] resize-y leading-relaxed', invalid && 'border-red-400 focus:border-red-500 focus:ring-red-500/15', className)}
      {...props}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, children, invalid, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn('input cursor-pointer appearance-none pr-8', invalid && 'border-red-400 focus:border-red-500 focus:ring-red-500/15', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" strokeWidth={2.2} />
    </div>
  );
});

export function Checkbox({
  checked,
  onChange,
  label,
  indeterminate,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  indeterminate?: boolean;
  id?: string;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <label htmlFor={inputId} className="inline-flex cursor-pointer select-none items-center gap-2">
      <span className="relative flex h-4 w-4 items-center justify-center">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer h-4 w-4 cursor-pointer appearance-none rounded-[5px] border border-ink-300 bg-white shadow-xs transition-all duration-150 checked:border-brand-600 checked:bg-brand-600 hover:border-ink-400 focus-visible:ring-2 focus-visible:ring-brand-500/35"
        />
        {checked && !indeterminate && <Check className="pointer-events-none absolute h-3 w-3 text-white" strokeWidth={3} />}
        {indeterminate && <span className="pointer-events-none absolute h-0.5 w-2 rounded-full bg-white" />}
      </span>
      {label && <span className="text-[12.5px] text-ink-700">{label}</span>}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  size = 'md',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ?? 'toggle'}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-4 w-7' : 'h-5 w-9',
        checked ? 'border-brand-700/30 bg-brand-600' : 'border-ink-300/70 bg-ink-300',
      )}
    >
      <span
        className={cn(
          'inline-block transform rounded-full bg-white shadow-[0_1px_2px_rgb(16_24_40/0.25)] transition-transform duration-200 ease-smooth',
          size === 'sm' ? 'h-3 w-3' : 'h-4 w-4',
          checked ? (size === 'sm' ? 'translate-x-3.5' : 'translate-x-4.5') : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ Tooltip

   Rendered through a portal so it is never clipped by an overflow container
   (tables, drawers and scroll areas all had this problem), with a short open
   delay so sweeping the pointer across a row does not flash a dozen tooltips.
*/

export function Tooltip({
  content,
  children,
  side = 'top',
  delay = 180,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | null>(null);

  const show = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const gap = 8;
      if (side === 'top') setBox({ top: r.top - gap, left: r.left + r.width / 2 });
      else if (side === 'bottom') setBox({ top: r.bottom + gap, left: r.left + r.width / 2 });
      else if (side === 'left') setBox({ top: r.top + r.height / 2, left: r.left - gap });
      else setBox({ top: r.top + r.height / 2, left: r.right + gap });
      setOpen(true);
    }, delay);
  };
  const hide = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setOpen(false);
  };
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const transform =
    side === 'top'
      ? 'translate(-50%, -100%)'
      : side === 'bottom'
        ? 'translate(-50%, 0)'
        : side === 'left'
          ? 'translate(-100%, -50%)'
          : 'translate(0, -50%)';

  return (
    <span ref={anchor} className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocusCapture={show} onBlurCapture={hide}>
      {children}
      {open &&
        box &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-[130] w-max max-w-[260px] animate-fade-in rounded-md bg-ink-900 px-2 py-1 text-[11.5px] font-medium leading-snug text-white shadow-pop"
            style={{ top: box.top, left: box.left, transform }}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}

/* ------------------------------------------------------------------ Overlay shell

   Modal and Drawer share the same body-scroll lock, escape handling and
   backdrop treatment so the two never feel like different products.
*/

/** Elements inside an overlay that can hold focus, in DOM order. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Overlay behaviour shared by Modal and Drawer: Escape to close, page scroll lock,
 * focus moved into the panel on open and returned to the trigger on close, and
 * Tab cycling kept inside the panel so the page behind it stays unreachable.
 *
 * Returns the ref to attach to the dialog/panel element.
 */
function useOverlay(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the panel on the next frame so the enter animation has begun.
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      (items[0] ?? panel).focus({ preventScroll: true });
    });

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      if (returnTo && document.contains(returnTo)) returnTo.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  return panelRef;
}

const Backdrop = ({ onClose }: { onClose: () => void }) => (
  <div
    className="fixed inset-0 animate-fade-in bg-ink-950/45 backdrop-blur-[3px]"
    onClick={onClose}
    aria-hidden
  />
);

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  icon,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: React.ReactNode;
}) {
  const panelRef = useOverlay(open, onClose);
  if (!open) return null;
  const widths = { sm: 'max-w-[420px]', md: 'max-w-[544px]', lg: 'max-w-[720px]', xl: 'max-w-[1000px]' };
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <Backdrop onClose={onClose} />
      <div
        ref={ panelRef }
        role="dialog"
        aria-modal="true"
        tabIndex={ -1 }
        aria-label={typeof title === 'string' ? title : 'Dialog'}
        className={cn(
          'relative z-10 my-auto flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-ink-200/80 bg-white shadow-pop outline-none animate-slide-up',
          widths[size],
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-4 pt-5">
          <div className="flex items-start gap-3">
            {icon && <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink-200/70 bg-ink-50">{icon}</div>}
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink-900">{title}</h2>
              {description && <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">{description}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children && <div className="min-h-0 flex-1 overflow-y-auto border-t border-ink-100 px-5 py-4">{children}</div>}
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-ink-100 bg-ink-50/70 px-5 py-3">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'danger',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      icon={<AlertTriangle className={cn('h-4 w-4', tone === 'danger' ? 'text-red-600' : 'text-brand-600')} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

/* ------------------------------------------------------------------ Drawer */

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'lg',
  eyebrow,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'md' | 'lg' | 'xl';
  eyebrow?: React.ReactNode;
}) {
  const panelRef = useOverlay(open, onClose);
  if (!open) return null;
  const widths = { md: 'sm:max-w-[440px]', lg: 'sm:max-w-[600px]', xl: 'sm:max-w-[860px]' };
  return createPortal(
    <div className="fixed inset-0 z-[95] flex justify-end">
      <Backdrop onClose={onClose} />
      <div
        ref={ panelRef }
        role="dialog"
        aria-modal="true"
        tabIndex={ -1 }
        aria-label={typeof title === 'string' ? title : 'Details'}
        className={cn(
          'relative flex h-full w-full flex-col border-l border-ink-200/70 bg-white shadow-drawer outline-none animate-slide-in-right',
          widths[width],
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-ink-100 px-5 pb-3.5 pt-4">
          <div className="min-w-0">
            {eyebrow && <div className="mb-0.5">{eyebrow}</div>}
            <div className="text-[15px] font-semibold tracking-[-0.015em] text-ink-900">{title}</div>
            {subtitle && <div className="mt-0.5 text-[12px] text-ink-500">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="-mr-1 rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-ink-100 bg-ink-50/70 px-5 py-3 shadow-[0_-1px_0_rgb(16_24_40/0.03)]">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ Dropdown */

export function Dropdown({
  trigger,
  children,
  align = 'right',
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (props: { close: () => void }) => React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1.5 min-w-[196px] overflow-hidden rounded-xl border border-ink-200/80 bg-white/98 py-1 shadow-pop backdrop-blur animate-slide-up',
            align === 'right' ? 'right-0' : 'left-0',
            className,
          )}
          role="menu"
        >
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  icon,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        danger ? 'text-red-600 hover:bg-red-50' : 'text-ink-700 hover:bg-ink-100/70',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ Tabs / segmented */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'sm',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; icon?: React.ReactNode }[];
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-ink-200/90 bg-ink-100/80 p-0.5 shadow-xs">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[7px] font-medium transition-all duration-150',
            size === 'sm' ? 'px-2.5 py-1 text-[11.5px]' : 'px-3 py-1.5 text-[12.5px]',
            value === o.value
              ? 'bg-white text-ink-900 shadow-[0_1px_2px_rgb(16_24_40/0.08)]'
              : 'text-ink-500 hover:text-ink-800',
          )}
          aria-pressed={value === o.value}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { value: T; label: string; count?: number; icon?: React.ReactNode }[];
}) {
  return (
    <div className="-mb-px flex gap-0.5 overflow-x-auto border-b border-ink-200/90 no-scrollbar">
      {tabs.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            aria-selected={active}
            className={cn(
              'group relative shrink-0 whitespace-nowrap px-3 pb-2 pt-2 text-[12.5px] font-medium transition-colors',
              active ? 'text-ink-900' : 'text-ink-500 hover:text-ink-800',
            )}
          >
            <span className="flex items-center gap-1.5">
              {t.icon}
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    'rounded px-1.5 py-px text-[10.5px] font-semibold tabular',
                    active ? 'bg-brand-100 text-brand-800' : 'bg-ink-100 text-ink-500 group-hover:bg-ink-200/70',
                  )}
                >
                  {t.count}
                </span>
              )}
            </span>
            <span
              className={cn(
                'absolute inset-x-1.5 -bottom-px h-[2px] rounded-t-full transition-all duration-200',
                active ? 'bg-brand-600' : 'bg-transparent',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ Avatar */

const avatarTones: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-800 ring-emerald-200/70',
  blue: 'bg-sky-100 text-sky-800 ring-sky-200/70',
  violet: 'bg-violet-100 text-violet-800 ring-violet-200/70',
  amber: 'bg-amber-100 text-amber-800 ring-amber-200/70',
  cyan: 'bg-cyan-100 text-cyan-800 ring-cyan-200/70',
  rose: 'bg-rose-100 text-rose-800 ring-rose-200/70',
  indigo: 'bg-indigo-100 text-indigo-800 ring-indigo-200/70',
  teal: 'bg-teal-100 text-teal-800 ring-teal-200/70',
};

export function Avatar({
  name,
  tone = 'emerald',
  size = 'md',
  className,
}: {
  name: string;
  tone?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    xs: 'h-5 w-5 text-[9px]',
    sm: 'h-6.5 w-6.5 text-[10px]',
    md: 'h-8 w-8 text-[11px]',
    lg: 'h-10 w-10 text-[13px]',
  };
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold uppercase tracking-tight ring-1',
        avatarTones[tone] ?? avatarTones.emerald,
        sizes[size],
        className,
      )}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

/* ------------------------------------------------------------------ Progress */

export function Progress({
  value,
  className,
  tone = 'emerald',
  height = 'h-1.5',
}: {
  value: number;
  className?: string;
  tone?: 'emerald' | 'amber' | 'red' | 'blue' | 'ink' | 'violet';
  height?: string;
}) {
  const tones = {
    emerald: 'bg-brand-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    blue: 'bg-sky-500',
    ink: 'bg-ink-400',
    violet: 'bg-violet-500',
  };
  return (
    <div
      className={cn('w-full overflow-hidden rounded-full bg-ink-100', height, className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-700 ease-smooth', tones[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ Empty / Skeleton */

export function EmptyState({
  title,
  description,
  action,
  icon,
  compact,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 text-center', compact ? 'py-8' : 'py-14')}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-dashed border-ink-300 bg-ink-50/80 text-ink-400">
        {icon ?? <Search className="h-4.5 w-4.5" />}
      </div>
      <p className="text-[13px] font-semibold text-ink-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-md bg-ink-100', className)}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-brand-600', className)} />;
}

/* ------------------------------------------------------------------ Pagination */

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize?: (n: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const window: number[] = useMemo(() => {
    const start = Math.max(1, Math.min(page - 2, pages - 4));
    return Array.from({ length: Math.min(5, pages) }, (_, i) => start + i).filter((p) => p >= 1 && p <= pages);
  }, [page, pages]);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-ink-100 px-4 py-2.5 sm:flex-row">
      <p className="text-[11.5px] tabular text-ink-500">
        Showing <span className="font-medium text-ink-800">{from}</span>–<span className="font-medium text-ink-800">{to}</span> of{' '}
        <span className="font-medium text-ink-800">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        {onPageSize && (
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            aria-label="Rows per page"
            className="h-7 cursor-pointer rounded-md border border-ink-200 bg-white px-1.5 text-[11.5px] text-ink-600 hover:border-ink-300"
          >
            {[10, 15, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-0.5">
          <Button size="xs" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          {window.map((p) => (
            <button
              key={p}
              onClick={() => onPage(p)}
              aria-current={p === page ? 'page' : undefined}
              className={cn(
                'h-7 min-w-7 rounded-md px-1.5 text-[11.5px] font-medium tabular transition-colors',
                p === page ? 'bg-ink-900 text-white shadow-xs' : 'text-ink-600 hover:bg-ink-100',
              )}
            >
              {p}
            </button>
          ))}
          <Button size="xs" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Sort header */

export function SortHeader({
  label,
  active,
  direction,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  direction: 'asc' | 'desc';
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group inline-flex items-center gap-1 text-inherit transition-colors hover:text-ink-800',
        active && 'text-ink-900',
        className,
      )}
    >
      {label}
      {active ? (
        direction === 'asc' ? (
          <ArrowUp className="h-3 w-3" strokeWidth={2.5} />
        ) : (
          <ArrowDown className="h-3 w-3" strokeWidth={2.5} />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-30 transition-opacity group-hover:opacity-70" strokeWidth={2.5} />
      )}
      {active && <span className="sr-only">{direction === 'asc' ? 'ascending' : 'descending'}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ Toasts

   A left accent rail carries the tone, the icon sits in a tinted tile, and a
   thin bar drains over the toast's lifetime so the operator can see how long a
   message will stay without counting.
*/

export type ToastTone = 'success' | 'error' | 'info' | 'warning';
export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

const toastSkin: Record<ToastTone, { rail: string; tile: string; icon: React.ReactNode }> = {
  success: { rail: 'bg-emerald-500', tile: 'bg-emerald-50 text-emerald-600', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  error: { rail: 'bg-red-500', tile: 'bg-red-50 text-red-600', icon: <XCircle className="h-3.5 w-3.5" /> },
  warning: { rail: 'bg-amber-500', tile: 'bg-amber-50 text-amber-700', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  info: { rail: 'bg-sky-500', tile: 'bg-sky-50 text-sky-700', icon: <Info className="h-3.5 w-3.5" /> },
};

export function ToastHost({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[calc(100vw-2rem)] max-w-[380px] flex-col gap-2">
      {toasts.map((t) => {
        const s = toastSkin[t.tone];
        return (
          <div
            key={t.id}
            className="pointer-events-auto relative flex items-start gap-2.5 overflow-hidden rounded-xl border border-ink-200/80 bg-white pl-3 pr-2 py-2.5 shadow-pop animate-slide-up"
            role="status"
          >
            <span className={cn('absolute inset-y-0 left-0 w-0.5', s.rail)} />
            <span className={cn('mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md', s.tile)}>{s.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold leading-tight text-ink-900">{t.title}</p>
              {t.description && <p className="mt-0.5 line-clamp-3 text-[11.5px] leading-relaxed text-ink-500">{t.description}</p>}
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss"
              className="-mr-0.5 rounded p-1 text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-600"
            >
              <X className="h-3 w-3" />
            </button>
            <span className={cn('absolute bottom-0 left-0 h-0.5 w-full origin-left animate-toast-bar opacity-30', s.rail)} />
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ misc */

export function StatDelta({ value, invert }: { value: number; invert?: boolean }) {
  const positive = invert ? value < 0 : value > 0;
  const neutral = Math.abs(value) < 0.05;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11.5px] font-semibold tabular',
        neutral ? 'text-ink-400' : positive ? 'text-emerald-600' : 'text-red-600',
      )}
    >
      {neutral ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`}
    </span>
  );
}

export function KeyValue({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-ink-50 py-1.5 last:border-0', className)}>
      <span className="text-[11.5px] text-ink-500">{label}</span>
      <span className="text-right text-[12px] font-medium text-ink-800">{children}</span>
    </div>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1 py-px text-[9.5px] font-semibold uppercase tracking-wide text-amber-700',
        className,
      )}
      title="Simulated capability — no external service is connected"
    >
      Demo
    </span>
  );
}

/* ------------------------------------------------------------------ Guided tour context */

interface TourValue {
  active: boolean;
  step: number;
  start: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  steps: { title: string; body: string; to: string }[];
}
const TourContext = createContext<TourValue | null>(null);
export const useTour = () => {
  const v = useContext(TourContext);
  if (!v) throw new Error('useTour outside provider');
  return v;
};
export { TourContext };

import { NavLink } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, ShieldCheck, Sparkles } from 'lucide-react';
import { NAV_GROUPS } from './nav';
import { useStore, useCurrentUser } from '@/services/store';
import { cn } from '@/lib/utils';
import { Avatar, Tooltip } from '@/components/ui';
import { useMemo } from 'react';
import { OPEN_STATUSES } from '@/lib/catalog';
import { countOverdue } from '@/lib/domain';

/**
 * Navigation rail.
 *
 * Graphite surface, hairline separators, one accent colour. The active item is
 * indicated three ways — a tinted plate, a left rule and an accent icon — so it
 * survives being glanced at. Badges are toned by urgency: only overdue work and
 * failing automations earn red.
 */
export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const { state } = useStore();
  const user = useCurrentUser();

  const badges = useMemo(() => {
    const open = state.tasks.filter((t) => OPEN_STATUSES.includes(t.status)).length;
    const unread = state.notifications.filter((n) => !n.read).length;
    const overdue = countOverdue(state.tasks);
    const failed = state.executions.filter((e) => e.status === 'Failed').length;
    return { tasks: open, notifications: unread, overdue, automation: failed };
  }, [state]);

  const badgeValue = (key?: string) => {
    if (!key) return 0;
    return (badges as Record<string, number>)[key] ?? 0;
  };

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 animate-fade-in bg-ink-950/50 backdrop-blur-sm lg:hidden" onClick={onCloseMobile} aria-hidden />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[250px] flex-col border-r border-white/[0.06] bg-navy-950 transition-[width,transform] duration-200 ease-smooth lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          collapsed ? 'lg:w-[68px]' : 'lg:w-[250px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Primary navigation"
      >
        {/* Brand */}
        <div className={cn('flex h-14 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-3', collapsed && 'lg:justify-center lg:px-0')}>
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br from-brand-400 to-brand-600 shadow-[0_2px_8px_rgb(5_150_105/0.35)]">
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" aria-hidden>
              <path d="M4 7h9M4 12h13M4 17h6" stroke="white" strokeWidth="2.1" strokeLinecap="round" />
              <circle cx="18.5" cy="7" r="2.1" fill="white" />
              <circle cx="19.5" cy="12" r="2.1" fill="white" opacity="0.65" />
              <circle cx="12.5" cy="17" r="2.1" fill="white" opacity="0.45" />
            </svg>
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-semibold tracking-[-0.015em] text-white">OpsFlow</span>
                <span className="rounded border border-white/15 bg-white/[0.06] px-1 py-px text-[8.5px] font-bold uppercase tracking-[0.08em] text-navy-200">
                  v1.0
                </span>
              </div>
              <p className="truncate text-[10px] leading-tight text-navy-400">BAU Automation &amp; Control Tower</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2.5 scroll-thin">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-3 last:mb-0">
              {!collapsed ? (
                <p className="mb-1 px-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-navy-300">{group.label}</p>
              ) : (
                <div className="mx-2 mb-2 border-t border-white/[0.06]" />
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const count = badgeValue(item.badgeKey);
                  const urgent = item.badgeKey === 'overdue' || item.badgeKey === 'automation';
                  const content = (
                    <NavLink
                      to={item.to}
                      onClick={onCloseMobile}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center gap-2.5 rounded-lg py-[7px] pl-2.5 pr-2 text-[12.5px] font-medium transition-colors duration-150',
                          isActive ? 'bg-white/[0.08] text-white' : 'text-navy-200/80 hover:bg-white/[0.04] hover:text-white',
                          collapsed && 'lg:justify-center lg:px-0',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            className={cn(
                              'absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full transition-all',
                              isActive ? 'bg-brand-400 opacity-100' : 'opacity-0',
                            )}
                          />
                          <item.icon
                            className={cn('h-4 w-4 shrink-0 transition-colors', isActive ? 'text-brand-400' : 'text-navy-400 group-hover:text-navy-200')}
                            strokeWidth={1.9}
                          />
                          {!collapsed && (
                            <>
                              <span className="flex-1 truncate">{item.label}</span>
                              {count > 0 && (
                                <span
                                  className={cn(
                                    'rounded px-1.5 py-px text-[9.5px] font-semibold tabular',
                                    urgent ? 'bg-red-500/20 text-red-300' : 'bg-white/[0.09] text-navy-100',
                                  )}
                                >
                                  {count}
                                </span>
                              )}
                            </>
                          )}
                          {collapsed && count > 0 && (
                            <span className={cn('absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full', urgent ? 'bg-red-400' : 'bg-brand-400')} />
                          )}
                        </>
                      )}
                    </NavLink>
                  );
                  return (
                    <li key={item.to}>
                      {collapsed ? (
                        <Tooltip content={item.label} side="right">
                          {content}
                        </Tooltip>
                      ) : (
                        content
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Demo disclosure */}
        {state.settings.demoMode && (
          <div className={cn('mx-2 mb-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.06] p-2.5', collapsed && 'lg:px-1.5 lg:py-2')}>
            <div className={cn('flex items-center gap-1.5', collapsed && 'lg:justify-center')}>
              <Sparkles className="h-3 w-3 shrink-0 text-amber-300" />
              {!collapsed && <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-amber-200">Demo mode</span>}
            </div>
            {!collapsed && (
              <p className="mt-1 text-[10px] leading-snug text-amber-100/50">
                Local seeded dataset · BOTs run in-browser · no external services connected
              </p>
            )}
          </div>
        )}

        {/* Identity */}
        <div className={cn('border-t border-white/[0.06] p-2', collapsed && 'lg:px-1')}>
          <div className={cn('flex items-center gap-2.5 rounded-lg px-1.5 py-1.5', collapsed && 'lg:justify-center')}>
            <Avatar name={user.name} tone={user.avatarTone} size="md" className="ring-2 ring-white/10" />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold leading-tight text-white">{user.name}</p>
                <p className="flex items-center gap-1 truncate text-[10px] leading-tight text-navy-400">
                  <ShieldCheck className="h-2.5 w-2.5 shrink-0 text-brand-400" />
                  {user.role}
                </p>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={onToggle}
          className="hidden h-8 items-center justify-center gap-1.5 border-t border-white/[0.06] text-[10.5px] font-medium text-navy-400 transition-colors hover:bg-white/[0.04] hover:text-white lg:flex"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <><ChevronsLeft className="h-3.5 w-3.5" /> Collapse</>}
        </button>
      </aside>
    </>
  );
}

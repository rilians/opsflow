import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronRight,
  Command,
  Menu,
  Plus,
  Search,
  LogOut,
  UserCog,
  RotateCcw,
  PlayCircle,
  CheckCheck,
  AlertTriangle,
  Clock,
  FileBarChart,
  Bot,
  Users,
} from 'lucide-react';
import { Avatar, Badge, Button, Dropdown, MenuItem, Modal, Tooltip } from '@/components/ui';
import { useStore, useCurrentUser, usePermissions } from '@/services/store';
import { PAGE_META } from './nav';
import { cn, fmtRelative } from '@/lib/utils';
import { SEVERITY_STYLES } from '@/lib/catalog';
import { SEVERITY_STYLES as _ss } from '@/lib/catalog';
import { QuickCreateModal } from '@/components/tasks/QuickCreateModal';

void _ss;

export function Topbar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const { state, markAllRead, resetDemo, setCurrentUser } = useStore();
  const { isAdmin } = usePermissions();
  const user = useCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();
  const meta = PAGE_META[location.pathname] ?? { title: 'OpsFlow', group: 'Workspace', description: '' };

  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const unread = state.notifications.filter((n) => !n.read);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const tasks = state.tasks
      .filter((t) => t.title.toLowerCase().includes(q) || t.code.toLowerCase().includes(q) || t.requesterName.toLowerCase().includes(q))
      .slice(0, 5)
      .map((t) => ({ kind: 'task' as const, id: t.id, title: t.title, sub: `${t.code} · ${t.status}`, to: `/tasks?task=${t.id}` }));
    const users = state.users
      .filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 3)
      .map((u) => ({ kind: 'user' as const, id: u.id, title: u.name, sub: `${u.role} · ${u.title}`, to: '/settings?tab=users' }));
    const bots = state.automations
      .filter((a) => a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q))
      .slice(0, 3)
      .map((a) => ({ kind: 'bot' as const, id: a.id, title: a.name, sub: `Automation · ${a.enabled ? 'Active' : 'Disabled'}`, to: `/automation?rule=${a.id}` }));
    const workflows = state.workflows
      .filter((w) => w.name.toLowerCase().includes(q))
      .slice(0, 2)
      .map((w) => ({ kind: 'workflow' as const, id: w.id, title: w.name, sub: `Workflow · ${w.stages.length} stages`, to: `/workflows?id=${w.id}` }));
    return [...tasks, ...bots, ...workflows, ...users];
  }, [search, state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setNotifOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setSearchOpen(false);
    setNotifOpen(false);
    setSearch('');
  }, [location.pathname]);

  const go = useCallback(
    (to: string) => {
      navigate(to);
      setSearchOpen(false);
      setSearch('');
    },
    [navigate],
  );

  const kindIcon = (kind: string) =>
    kind === 'task' ? <Clock className="h-3.5 w-3.5" /> : kind === 'bot' ? <Bot className="h-3.5 w-3.5" /> : kind === 'user' ? <Users className="h-3.5 w-3.5" /> : <CheckCheck className="h-3.5 w-3.5" />;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-ink-200/70 bg-white/85 backdrop-blur-xl">
        <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-6">
          <button className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 lg:hidden" onClick={onOpenMobile} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-ink-400">
              <span>{meta.group}</span>
              <ChevronRight className="h-2.5 w-2.5 text-ink-300" />
              <span className="truncate text-ink-500">{meta.title}</span>
            </div>
            <h1 className="truncate text-[14.5px] font-semibold leading-tight tracking-[-0.015em] text-ink-900">{meta.title}</h1>
          </div>

          {/* Search */}
          <div className="relative hidden md:block">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
                placeholder="Search tasks, BOTs, people…"
                aria-label="Global search"
                className="h-8.5 w-56 rounded-lg border border-ink-200/90 bg-ink-50/70 pl-8 pr-14 text-[12.5px] text-ink-800 placeholder:text-ink-400 transition-[width,border-color,background-color,box-shadow] duration-200 ease-smooth hover:border-ink-300 focus:w-80 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/12"
              />
              <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded border border-ink-200 bg-white px-1 py-px text-[9.5px] font-medium text-ink-400 lg:flex">
                <Command className="h-2.5 w-2.5" />K
              </kbd>
            </div>
            {searchOpen && search.trim() && (
              <div className="absolute right-0 top-full z-50 mt-2 w-[400px] overflow-hidden rounded-xl border border-ink-200/80 bg-white shadow-pop animate-slide-up">
                {results.length === 0 ? (
                  <p className="px-3 py-4 text-center text-[12px] text-ink-500">No matches for “{search}”</p>
                ) : (
                  <ul className="max-h-[340px] overflow-y-auto py-1">
                    {results.map((r) => (
                      <li key={`${r.kind}-${r.id}`}>
                        <button
                          onMouseDown={() => go(r.to)}
                          className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-ink-50"
                        >
                          <span className="mt-0.5 text-ink-400">{kindIcon(r.kind)}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-[12.5px] font-medium text-ink-800">{r.title}</span>
                            <span className="block truncate text-[11px] text-ink-500">{r.sub}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Tooltip content="Create a new request">
              <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setQuickOpen(true)} className="hidden sm:inline-flex">
                New request
              </Button>
            </Tooltip>
            <Button variant="primary" size="sm" onClick={() => setQuickOpen(true)} className="sm:hidden" aria-label="New request">
              <Plus className="h-4 w-4" />
            </Button>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen((v) => !v)}
                aria-label={`Notifications (${unread.length} unread)`}
                className={cn(
                  'relative rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800',
                  notifOpen && 'bg-ink-100 text-ink-800',
                )}
              >
                <Bell className="h-4 w-4" />
                {unread.length > 0 && (
                  <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-600 px-0.5 text-[9px] font-bold text-white ring-2 ring-white">
                    {unread.length > 9 ? '9+' : unread.length}
                  </span>
                )}
              </button>
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} aria-hidden />
                  <div className="absolute right-0 z-50 mt-2 w-[356px] overflow-hidden rounded-xl border border-ink-200/80 bg-white shadow-pop animate-slide-up">
                    <div className="flex items-center justify-between border-b border-ink-100 px-3.5 py-2.5">
                      <p className="text-[12.5px] font-semibold text-ink-800">Notifications</p>
                      <div className="flex items-center gap-1">
                        <Button size="xs" variant="ghost" onClick={markAllRead} disabled={!unread.length}>
                          Mark all read
                        </Button>
                      </div>
                    </div>
                    <ul className="max-h-[360px] overflow-y-auto">
                      {state.notifications.slice(0, 8).map((n) => {
                        const s = SEVERITY_STYLES[n.severity];
                        return (
                          <li key={n.id}>
                            <button
                              onClick={() => {
                                setNotifOpen(false);
                                navigate(n.taskId ? `/tasks?task=${n.taskId}` : '/notifications');
                              }}
                              className={cn('flex w-full gap-2.5 border-b border-ink-50 px-3 py-2.5 text-left transition-colors hover:bg-ink-50', !n.read && 'bg-brand-50/30')}
                            >
                              <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', s.dot)} />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-baseline justify-between gap-2">
                                  <span className="truncate text-[12px] font-semibold text-ink-800">{n.title}</span>
                                  <span className="shrink-0 text-[10px] text-ink-400">{fmtRelative(n.createdAt)}</span>
                                </span>
                                <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-ink-500">{n.body}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                      {state.notifications.length === 0 && <li className="px-3 py-6 text-center text-[12px] text-ink-500">No notifications yet</li>}
                    </ul>
                    <button
                      onClick={() => {
                        setNotifOpen(false);
                        navigate('/notifications');
                      }}
                      className="block w-full border-t border-ink-100 py-2 text-center text-[12px] font-medium text-brand-700 transition-colors hover:bg-ink-50"
                    >
                      Open notification center
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Profile */}
            <Dropdown
              trigger={({ toggle }) => (
                <button onClick={toggle} className="flex items-center gap-1.5 rounded-lg p-0.5 pr-1 transition-colors hover:bg-ink-100" aria-label="User menu">
                  <Avatar name={user.name} tone={user.avatarTone} size="md" />
                </button>
              )}
            >
              {({ close }) => (
                <>
                  <div className="border-b border-ink-100 px-3 py-2">
                    <p className="text-[12.5px] font-semibold text-ink-800">{user.name}</p>
                    <p className="truncate text-[11px] text-ink-500">{user.email}</p>
                    <Badge tone="emerald" className="mt-1.5">{user.role}</Badge>
                  </div>
                  <div className="mt-1">
                    <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Switch demo persona</p>
                    {state.users.slice(0, 4).map((u) => (
                      <MenuItem
                        key={u.id}
                        icon={<Avatar name={u.name} tone={u.avatarTone} size="xs" />}
                        onClick={() => {
                          setCurrentUser(u.id);
                          close();
                        }}
                      >
                        <span className="flex items-center gap-1.5">
                          {u.name}
                          {u.id === user.id && <span className="text-[10px] text-brand-600">●</span>}
                        </span>
                      </MenuItem>
                    ))}
                  </div>
                  <div className="my-1 border-t border-ink-100" />
                  <MenuItem icon={<UserCog className="h-3.5 w-3.5" />} onClick={() => { close(); navigate('/settings?tab=users'); }}>
                    Administration
                  </MenuItem>
                  <MenuItem icon={<PlayCircle className="h-3.5 w-3.5" />} onClick={() => { close(); setHelpOpen(true); }}>
                    How the demo works
                  </MenuItem>
                  {isAdmin && (
                    <MenuItem icon={<RotateCcw className="h-3.5 w-3.5" />} danger onClick={() => { close(); setResetOpen(true); }}>
                      Reset demo data
                    </MenuItem>
                  )}
                  <MenuItem icon={<LogOut className="h-3.5 w-3.5" />} disabled onClick={() => undefined}>
                    <span className="flex items-center gap-2">
                      Sign out
                      <span className="rounded bg-ink-100 px-1 py-px text-[9px] font-semibold uppercase text-ink-500">SSO in prod</span>
                    </span>
                  </MenuItem>
                </>
              )}
            </Dropdown>
          </div>
        </div>
      </header>

      <QuickCreateModal open={quickOpen} onClose={() => setQuickOpen(false)} />

      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="How this demo works"
        description="OpsFlow runs entirely in your browser against a seeded operational dataset."
        size="lg"
        icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
        footer={<Button variant="primary" onClick={() => setHelpOpen(false)}>Got it</Button>}
      >
        <div className="space-y-3 text-[12.5px] leading-relaxed text-ink-600">
          <p>
            <strong className="text-ink-800">Data.</strong> {state.tasks.length} operational requests, {state.users.length} employees,{' '}
            {state.automations.length} automation rules and {state.workflows.length} workflows are seeded into a local repository that persists to{' '}
            <code className="rounded bg-ink-100 px-1 py-px text-[11px]">localStorage</code>. Refreshing the page keeps your changes.
          </p>
          <p>
            <strong className="text-ink-800">Automation.</strong> The six BOTs are executed by a real in-browser rule engine (trigger → condition →
            action). Running a BOT mutates tasks, writes execution records, raises notifications and appends activity logs. Nothing is faked.
          </p>
          <p>
            <strong className="text-ink-800">Not connected.</strong> Email, Teams, Slack, Telegram, Google Sheets/Forms and Excel integrations are
            shown with their honest status. No message leaves this browser.
          </p>
          <p>
            <strong className="text-ink-800">Suggested walkthrough.</strong> Use the <em>Run demo scenario</em> button on the Executive Overview or the
            Automation Center, then follow the resulting task through Tasks → Workflow → SLA → Notifications → Analytics.
          </p>
        </div>
      </Modal>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset demo data?"
        description="All tasks, executions, notifications and settings you created in this browser will be replaced by the original seeded dataset."
        size="sm"
        icon={<RotateCcw className="h-4 w-4 text-red-500" />}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                resetDemo();
                setResetOpen(false);
              }}
            >
              Reset workspace
            </Button>
          </>
        }
      />
    </>
  );
}

export function ReportBadge() {
  return (
    <Badge tone="blue">
      <FileBarChart className="h-3 w-3" /> Report
    </Badge>
  );
}

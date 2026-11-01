import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, Bot, CheckCheck, CheckCircle2, Clock, Filter, Info, Mail, MessageSquare, Send, Trash2, TriangleAlert, AlertOctagon, FileBarChart, Copy, Workflow, Search, X } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Segmented, Switch, Tooltip } from '@/components/ui';
import { PageHeader, InfoNote } from '@/components/shared/Page';
import { useStore } from '@/services/store';
import { SEVERITY_STYLES } from '@/lib/catalog';
import { cn, fmtDateTime, fmtRelative } from '@/lib/utils';

const PAGE = 60;

const typeIcon: Record<string, React.ReactNode> = { 'Task Assignment': <Bot className="h-3.5 w-3.5" />, 'Missing Information': <TriangleAlert className="h-3.5 w-3.5" />, 'Upcoming Deadline': <Clock className="h-3.5 w-3.5" />, 'SLA Warning': <Clock className="h-3.5 w-3.5" />, 'SLA Escalation': <AlertOctagon className="h-3.5 w-3.5" />, 'Workflow Approval': <Workflow className="h-3.5 w-3.5" />, 'Automation Failure': <AlertOctagon className="h-3.5 w-3.5" />, 'Report Generated': <FileBarChart className="h-3.5 w-3.5" />, 'Duplicate Flagged': <Copy className="h-3.5 w-3.5" />, 'Task Completed': <CheckCircle2 className="h-3.5 w-3.5" /> };

export function Notifications() { const { state, markRead, markAllRead, deleteNotification, updateSettings } = useStore();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread' | 'critical'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const unread = state.notifications.filter((n) => !n.read).length;
  // The list used to hard-stop at 60 entries with no way to reach the rest, so older
  // notifications were silently invisible. Page it instead of truncating.
  const [visible, setVisible] = useState(PAGE);
  useEffect(() => setVisible(PAGE), [filter, typeFilter, search]);

  const counts = useMemo(() => { const c: Record<string, number> = { };
    state.notifications.forEach((n) => { c[n.type] = (c[n.type] ?? 0) + 1; });
    return c;
  }, [state.notifications]);

  const list = state.notifications.filter((n) => { if (filter === 'unread' && n.read) return false;
    if (filter === 'critical' && n.severity !== 'critical') return false;
    if (typeFilter !== 'all' && n.type !== typeFilter) return false;
    if (search && !(n.title.toLowerCase().includes(search.toLowerCase()) || n.body.toLowerCase().includes(search.toLowerCase()))) return false;
    return true; });

  const open = (n: (typeof state.notifications)[number]) => { markRead(n.id, true);
    if (n.taskId) navigate(`/tasks?task=${n.taskId }`);
    else if (n.workflowId) navigate(`/workflows?id=${ n.workflowId }`);
    else if (n.ruleId) navigate(`/automation?rule=${ n.ruleId }`);
    else navigate('/dashboard');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notification Center"
        description="Every event raised by the platform or a BOT. Notifications are generated only by real application events — never seeded as decoration after the workspace is built."
        actions={ <>
            <Button variant="secondary" size="sm" icon={<CheckCheck className="h-3.5 w-3.5" /> } onClick={ markAllRead } disabled={ unread === 0 }>
              Mark all read
            </Button>
          </>
        }
        meta={ <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={unread ? 'red' : 'emerald' } dot>{ unread } unread</Badge>
            <Badge tone="slate">{ state.notifications.length } total</Badge>
            <Badge tone="red">{ state.notifications.filter((n) => n.severity === 'critical').length } critical</Badge>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <Card>
          <div className="flex flex-col gap-2 border-b border-ink-100 p-3 sm:flex-row sm:items-center">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
              <input
                value={ search }
                onChange={ (e) => setSearch(e.target.value) }
                placeholder="Search notifications…"
                aria-label="Search notifications"
                className="input h-8 pl-8 text-[12.5px]"
              />
              { search && (
                <button onClick={() => setSearch('') } className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400" aria-label="Clear">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Segmented
              value={ filter }
              onChange={ setFilter }
              options={ [
                { value: 'all', label: 'All' },
                { value: 'unread', label: `Unread (${unread })` },
                { value: 'critical', label: 'Critical' },
              ]}
            />
          </div>

          { list.length === 0 ? (
            <EmptyState title="No notifications match" description="Try clearing the filters or the search term." icon={<BellRing className="h-4.5 w-4.5" /> } />
          ) : (
            <ul className="divide-y divide-ink-50">
              { list.slice(0, visible).map((n) => {
                const s = SEVERITY_STYLES[n.severity];
                return (
                  <li
                    key={n.id }
                    className={ cn(
                      'group relative flex gap-3 border-l-2 border-l-transparent px-3.5 py-3 transition-colors hover:bg-ink-50/70',
                      !n.read && 'border-l-brand-500 bg-brand-50/25',
                    ) }
                  >
                    <span className={ cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border shadow-xs', s.badge) }>
                      { typeIcon[n.type] ?? <Info className="h-3.5 w-3.5" /> }
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button onClick={ () => open(n) } className="text-left text-[12.5px] font-semibold text-ink-800 hover:text-brand-700">
                          { n.title }
                        </button>
                        { !n.read && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> }
                        <Badge>{ n.type }</Badge>
                      </div>
                      <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-600">{ n.body }</p>
                      <p className="mt-1 text-[10.5px] text-ink-400">
                        { n.actor } · { fmtDateTime(n.createdAt) } · { fmtRelative(n.createdAt) }
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Tooltip content={ n.read ? 'Mark unread' : 'Mark read' }>
                          <Button size="xs" variant="ghost" onClick={ () => markRead(n.id, !n.read) } aria-label="Toggle read">
                            <CheckCheck className="h-3 w-3" />
                          </Button>
                        </Tooltip>
                        <Tooltip content="Delete notification">
                          <Button size="xs" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={ () => deleteNotification(n.id) } aria-label="Delete">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </Tooltip>
                      </div>
                      <Button size="xs" variant="ghost" onClick={ () => open(n) }>Open</Button>
                    </div>
                  </li>
                );
              })}
              { list.length > visible && (
                <li className="p-3">
                  <Button variant="secondary" size="sm" className="w-full" onClick={() => setVisible((v) => v + PAGE)}>
                    Show {Math.min(PAGE, list.length - visible)} more · {list.length - visible} remaining
                  </Button>
                </li>
              )}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Filter by type" subtitle="Notification categories" icon={ <Filter className="h-4 w-4 text-ink-400" /> } />
            <ul className="p-2">
              <li>
                <button
                  onClick={ () => setTypeFilter('all') }
                  className={ cn('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px]', typeFilter === 'all' ? 'bg-brand-50 font-medium text-brand-800' : 'text-ink-600 hover:bg-ink-50') }
                >
                  All types
                  <span className="tabular text-[10.5px] text-ink-400">{ state.notifications.length }</span>
                </button>
              </li>
              { Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t, c]) => (
                <li key={t }>
                  <button
                    onClick={ () => setTypeFilter(t) }
                    className={ cn('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px]', typeFilter === t ? 'bg-brand-50 font-medium text-brand-800' : 'text-ink-600 hover:bg-ink-50') }
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="text-ink-400">{ typeIcon[t] }</span>
                      <span className="truncate">{ t }</span>
                    </span>
                    <span className="tabular text-[10.5px] text-ink-400">{ c }</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Delivery channels" subtitle="Where notifications are sent" icon={ <Send className="h-4 w-4 text-ink-400" /> } />
            <div className="space-y-2 p-3.5">
              { [
                { key: 'inApp', label: 'In-app (always on)', icon: <BellRing className="h-3.5 w-3.5" />, disabled: true },
                { key: 'email', label: 'Email (SMTP)', icon: <Mail className="h-3.5 w-3.5" /> },
                { key: 'teams', label: 'Microsoft Teams', icon: <MessageSquare className="h-3.5 w-3.5" /> },
                { key: 'telegram', label: 'Telegram', icon: <Send className="h-3.5 w-3.5" /> },
                { key: 'slack', label: 'Slack', icon: <MessageSquare className="h-3.5 w-3.5" /> },
              ].map((c) => (
                <div key={ c.key } className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[11.5px] text-ink-600">
                    <span className="text-ink-400">{ c.icon }</span>
                    { c.label }
                  </span>
                  <div className="flex items-center gap-1.5">
                    { c.key !== 'inApp' && <Badge tone="amber">Demo</Badge> }
                    <Switch
                      checked={ !!state.settings.notificationChannels[c.key] }
                      disabled={ c.disabled }
                      onChange={ (v) => updateSettings({ notificationChannels: { ...state.settings.notificationChannels, [c.key]: v } })}
                      label={ c.label }
                      size="sm"
                    />
                  </div>
                </div>
              ))}
              <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[10.5px] leading-snug text-amber-800">
                Only in-app delivery is wired up. Enabling an external channel only flags intent — no message leaves this browser.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <InfoNote>
        <strong>Traceable events.</strong> Every notification links back to the task, workflow or automation rule that produced it. Assignment and
        escalation notices come from the BOTs; missing-information notices come from the Data Validation BOT; report notices come from the Automated
        Reporting BOT or a manual generation.
      </InfoNote>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bot, Columns3, Download, Filter, ListChecks, MoreHorizontal, Plus, Rows3, Search, Trash2, Users, X, ChevronDown, Zap, PlayCircle } from 'lucide-react';
import { Avatar, Badge, Button, Card, Checkbox, ConfirmDialog, Dropdown, EmptyState, MenuItem, Pagination, Segmented, Select, SortHeader, Tabs } from '@/components/ui';
import { PageHeader, InfoNote } from '@/components/shared/Page';
import { AutomationStatusBadge, PriorityBadge, StatusBadge, CategoryBadge } from '@/components/shared/bits';
import { QuickCreateModal } from '@/components/tasks/QuickCreateModal';
import { TaskDrawer } from '@/components/tasks/TaskDrawer';
import { usePermissions, useStore } from '@/services/store';
import { taskHealth } from '@/services/automationEngine';
import { isOverdue } from '@/lib/domain';
import { CATEGORIES, OPEN_STATUSES, PRIORITIES, STATUSES } from '@/lib/catalog';
import { cn, downloadFile, fmtDateTime, fmtRelative, onActivateKey, toCsv } from '@/lib/utils';
import type { Priority, Task, TaskStatus } from '@/types';

type View = 'table' | 'kanban';
type SortKey = 'createdAt' | 'deadline' | 'priority' | 'status' | 'code' | 'title';

const priorityRank: Record<Priority, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export function Tasks() { const { state, bulkAssign, bulkStatus, updateTask, deleteTask, changeTaskStatus, runRule, toast } = useStore();
  const { isManager } = usePermissions();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [view, setView] = useState<View>('table');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(params.get('status') ?? 'all');
  const [dept, setDept] = useState('all');
  const [category, setCategory] = useState('all');
  const [priority, setPriority] = useState('all');
  const [assignee, setAssignee] = useState('all');
  const [health, setHealth] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'createdAt', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selected, setSelected] = useState<string[]>([]);
  const [openTaskId, setOpenTaskId] = useState<string | null>(params.get('task'));
  const [quickOpen, setQuickOpen] = useState(false);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [kanbanBusy, setKanbanBusy] = useState<string | null>(null);

  // Deep link from the drawer / notifications.
  useEffect(() => { const id = params.get('task');
    if (id) setOpenTaskId(id);
    const st = params.get('status');
    if (st) setStatus(st); }, [params]);

  const setTaskParam = (id: string | null) => { setOpenTaskId(id);
    const next = new URLSearchParams(params);
    if (id) next.set('task', id);
    else next.delete('task');
    setParams(next, { replace: true });
  };

  const filtered = useMemo(() => { const q = search.trim().toLowerCase();
    let rows = state.tasks.filter((t) => {
      if (q && !(t.title.toLowerCase().includes(q) || t.code.toLowerCase().includes(q) || t.requesterName.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))) return false;
      if (status === 'open' ? !OPEN_STATUSES.includes(t.status) : status !== 'all' && t.status !== status) return false;
      if (dept !== 'all' && t.departmentId !== dept) return false;
      if (category !== 'all' && t.category !== category) return false;
      if (priority !== 'all' && t.priority !== priority) return false;
      if (assignee !== 'all') {
        if (assignee === 'unassigned' ? !!t.assigneeId : t.assigneeId !== assignee) return false; }
      if (health !== 'all' && taskHealth(t, Date.now(), state.settings.reminderThresholdPct) !== health) return false;
      if (from && +new Date(t.createdAt) < +new Date(from)) return false;
      if (to && +new Date(t.createdAt) > +new Date(to) + 86400000) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => { const dir = sort.dir === 'asc' ? 1 : -1;
      switch (sort.key) {
        case 'deadline':
          return (+new Date(a.deadline) - +new Date(b.deadline)) * dir;
        case 'priority':
          return (priorityRank[a.priority] - priorityRank[b.priority]) * dir;
        case 'status':
          return a.status.localeCompare(b.status) * dir;
        case 'code':
          return a.code.localeCompare(b.code) * dir;
        case 'title':
          return a.title.localeCompare(b.title) * dir;
        default:
          return (+new Date(a.createdAt) - +new Date(b.createdAt)) * dir; }
    });
    return rows;
  }, [state.tasks, state.settings.reminderThresholdPct, search, status, dept, category, priority, assignee, health, from, to, sort]);

  useEffect(() => { setPage(1); }, [search, status, dept, category, priority, assignee, health, from, to]);

  // Keep the page inside the available range: deleting or filtering rows could leave
  // the operator stranded on a page that no longer exists.
  useEffect(() => {
    const last = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page > last) setPage(last);
  }, [filtered.length, pageSize, page]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pageIds = paged.map((t) => t.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  const statusCounts = useMemo(() => { const base = state.tasks.filter((t) => {
      if (dept !== 'all' && t.departmentId !== dept) return false;
      if (category !== 'all' && t.category !== category) return false;
      return true; });
    return { all: base.length, open: base.filter((t) => OPEN_STATUSES.includes(t.status)).length, ...Object.fromEntries(STATUSES.map((s) => [s, base.filter((t) => t.status === s).length])) } as Record<string, number>;
  }, [state.tasks, dept, category]);

  const activeFilterCount = [dept, category, priority, assignee, health, from, to].filter((v) => v && v !== 'all').length + (status !== 'all' && status !== 'open' ? 1 : 0);

  const resetFilters = () => { setDept('all');
    setCategory('all');
    setPriority('all');
    setAssignee('all');
    setHealth('all');
    setFrom('');
    setTo('');
    setStatus('all');
    setSearch(''); };

  const exportCsv = () => { const headers = ['Task ID', 'Title', 'Category', 'Department', 'Priority', 'Status', 'Assignee', 'Requester', 'Source', 'Created', 'Deadline', 'SLA Hours', 'Completed', 'Automation Status', 'Health'];
    const rows = filtered.map((t) => [
      t.code, t.title, t.category, state.organization.departments.find((d) => d.id === t.departmentId)?.name ?? '', t.priority, t.status, state.users.find((u) => u.id === t.assigneeId)?.name ?? 'Unassigned', t.requesterName, t.source, fmtDateTime(t.createdAt), fmtDateTime(t.deadline), t.slaHours, t.completedAt ? fmtDateTime(t.completedAt) : '', t.automationStatus, taskHealth(t, Date.now(), state.settings.reminderThresholdPct), ]);
    downloadFile(`opsflow-tasks-${new Date().toISOString().slice(0, 10) }.csv`, toCsv(headers, rows));
    toast({ title: 'CSV exported', description: `${filtered.length } task record(s) written to file.`, tone: 'success' });
  };

  const kanbanColumns: { status: TaskStatus; accent: string }[] = [
    { status: 'New', accent: 'bg-slate-400' },
    { status: 'Pending Validation', accent: 'bg-amber-500' },
    { status: 'Assigned', accent: 'bg-sky-500' },
    { status: 'In Progress', accent: 'bg-indigo-500' },
    { status: 'Waiting Approval', accent: 'bg-violet-500' },
    { status: 'Overdue', accent: 'bg-red-500' },
    { status: 'Completed', accent: 'bg-emerald-500' },
    { status: 'Rejected', accent: 'bg-rose-500' },
  ];

  const moveTask = (task: Task, nextStatus: TaskStatus) => { setKanbanBusy(task.id);
    window.setTimeout(() => {
      changeTaskStatus(task.id, nextStatus);
      setKanbanBusy(null); }, 220);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tasks & Requests"
        description="Centralised operational work management. Every request carries its own SLA clock, automation trail and audit history."
        actions={ <>
            <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" /> } onClick={ exportCsv }>
              Export CSV
            </Button>
            <Button variant="primary" size="sm" icon={ <Plus className="h-3.5 w-3.5" /> } onClick={ () => setQuickOpen(true) }>
              New request
            </Button>
          </>
        }
        meta={ <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-500">
            <Badge tone="blue">{state.tasks.length } total</Badge>
            <Badge tone="amber">{ state.tasks.filter((t) => OPEN_STATUSES.includes(t.status)).length } open</Badge>
            <Badge tone="red">{ state.tasks.filter((t) => isOverdue(t)).length } overdue</Badge>
            <Badge tone="emerald">{ state.tasks.filter((t) => t.status === 'Completed').length } completed</Badge>
          </div>
        }
      />

      <Card>
        { /* toolbar */ }
          <div className="border-b border-ink-100 bg-ink-50/50 px-3 pt-1.5">
          <Tabs
            value={ status }
            onChange={ (next) => {
              setStatus(next);
              const q = new URLSearchParams(params);
              if (next === 'all') q.delete('status');
              else q.set('status', next);
              setParams(q, { replace: true });
            }}
            tabs={ [
              { value: 'all', label: 'All', count: statusCounts.all },
              { value: 'open', label: 'Open', count: statusCounts.open },
              { value: 'New', label: 'New', count: statusCounts.New },
              { value: 'Pending Validation', label: 'Pending validation', count: statusCounts['Pending Validation'] },
              { value: 'Assigned', label: 'Assigned', count: statusCounts.Assigned },
              { value: 'In Progress', label: 'In progress', count: statusCounts['In Progress'] },
              { value: 'Waiting Approval', label: 'Waiting approval', count: statusCounts['Waiting Approval'] },
              { value: 'Overdue', label: 'Overdue', count: statusCounts.Overdue },
              { value: 'Completed', label: 'Completed', count: statusCounts.Completed },
              { value: 'Rejected', label: 'Rejected', count: statusCounts.Rejected },
            ]}
          />
        </div>

        <div className="flex flex-col gap-2 border-b border-ink-100 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-full sm:basis-auto sm:min-w-[190px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
              <input
                value={ search }
                onChange={ (e) => setSearch(e.target.value) }
                placeholder="Search by title, ID or requester…"
                aria-label="Search tasks"
                className="input h-8 pl-8 text-[12.5px]"
              />
              { search && (
                <button onClick={() => setSearch('') } className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700" aria-label="Clear search">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button
              variant={ filtersOpen || activeFilterCount ? 'subtle' : 'secondary' }
              size="sm"
              icon={ <Filter className="h-3.5 w-3.5" /> }
              onClick={ () => setFiltersOpen((v) => !v) }
            >
              Filters{ activeFilterCount ? ` · ${activeFilterCount }` : ''}
              <ChevronDown className={ cn('h-3 w-3 transition-transform', filtersOpen && 'rotate-180') } />
            </Button>
            <Segmented
              value={ view }
              onChange={ setView }
              options={ [
                { value: 'table', label: 'Table', icon: <Rows3 className="h-3 w-3" /> },
                { value: 'kanban', label: 'Kanban', icon: <Columns3 className="h-3 w-3" /> },
              ]}
            />
          </div>

          { filtersOpen && (
            <div className="grid gap-2 rounded-lg border border-ink-200 bg-ink-50/60 p-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-500" htmlFor="f-dept">Department</label>
                <Select id="f-dept" value={dept } onChange={ (e) => setDept(e.target.value) } className="h-8 py-0 text-[12px]">
                  <option value="all">All departments</option>
                  { state.organization.departments.map((d) => (
                    <option key={d.id } value={ d.id }>{ d.name }</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-500" htmlFor="f-cat">Category</label>
                <Select id="f-cat" value={ category } onChange={ (e) => setCategory(e.target.value) } className="h-8 py-0 text-[12px]">
                  <option value="all">All categories</option>
                  { CATEGORIES.map((c) => (
                    <option key={c } value={ c }>{ c }</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-500" htmlFor="f-pri">Priority</label>
                <Select id="f-pri" value={ priority } onChange={ (e) => setPriority(e.target.value) } className="h-8 py-0 text-[12px]">
                  <option value="all">All priorities</option>
                  { PRIORITIES.map((p) => (
                    <option key={p } value={ p }>{ p }</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-500" htmlFor="f-asg">Assignee</label>
                <Select id="f-asg" value={ assignee } onChange={ (e) => setAssignee(e.target.value) } className="h-8 py-0 text-[12px]">
                  <option value="all">Anyone</option>
                  <option value="unassigned">Unassigned</option>
                  { state.users.map((u) => (
                    <option key={u.id } value={ u.id }>{ u.name }</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-500" htmlFor="f-health">SLA health</label>
                <Select id="f-health" value={ health } onChange={ (e) => setHealth(e.target.value) } className="h-8 py-0 text-[12px]">
                  <option value="all">Any health</option>
                  { ['Safe', 'Approaching deadline', 'At risk', 'Overdue'].map((h) => (
                    <option key={h } value={ h }>{ h }</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-500" htmlFor="f-from">Created from</label>
                <input id="f-from" type="date" value={ from } onChange={ (e) => setFrom(e.target.value) } className="input h-8 py-0 text-[12px]" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-ink-500" htmlFor="f-to">Created to</label>
                <input id="f-to" type="date" value={ to } onChange={ (e) => setTo(e.target.value) } className="input h-8 py-0 text-[12px]" />
              </div>
              <div className="flex items-end">
                <Button variant="secondary" size="sm" onClick={ resetFilters } className="w-full" icon={ <X className="h-3.5 w-3.5" /> }>
                  Clear filters
                </Button>
              </div>
            </div>
          )}

        </div>

        { /* bulk bar */ }
        { selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-brand-100 bg-brand-50/70 px-3 py-2">
            <span className="text-[12px] font-medium text-brand-800">{selected.length } selected</span>
            <Button size="xs" variant="secondary" icon={ <Users className="h-3 w-3" /> } onClick={ () => setBulkAssignOpen(true) }>
              Assign
            </Button>
            <Dropdown
              trigger={ ({ toggle }) => (
                <Button size="xs" variant="secondary" icon={ <Zap className="h-3 w-3" /> } onClick={ toggle }>
                  Set status
                  <ChevronDown className="h-3 w-3" />
                </Button>
              )}
            >
              { ({ close }) => (
                <>
                  { STATUSES.map((s) => (
                    <MenuItem
                      key={s }
                      onClick={ () => {
                        bulkStatus(selected, s);
                        setSelected([]);
                        close(); }}
                    >
                      { s }
                    </MenuItem>
                  ))}
                </>
              )}
            </Dropdown>
            { isManager && (
              <Button size="xs" variant="ghost" className="text-red-600 hover:bg-red-50" icon={<Trash2 className="h-3 w-3" /> } onClick={ () => setConfirmBulkDelete(true) }>
                Delete
              </Button>
            )}
            <Button size="xs" variant="ghost" onClick={ () => setSelected([]) } className="ml-auto">
              Clear selection
            </Button>
          </div>
        )}

        { /* views */ }
        { view === 'table' ? (
          filtered.length === 0 ? (
            <EmptyState
              title="No requests match these filters"
              description="Try widening the date range, clearing filters, or capture a new request."
              icon={<ListChecks className="h-4.5 w-4.5" /> }
              action={ <div className="flex gap-2">
                  <Button variant="secondary" onClick={resetFilters }>Clear filters</Button>
                  <Button variant="primary" icon={ <Plus className="h-3.5 w-3.5" /> } onClick={ () => setQuickOpen(true) }>New request</Button>
                </div>
              }
            />
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="relative w-full min-w-[1080px]">
                <thead className="sticky top-0 z-10 border-b border-ink-200/80 bg-ink-50/95 backdrop-blur">
                  <tr>
                    <th className="th w-9 pl-3">
                      <Checkbox
                        checked={ allPageSelected }
                        indeterminate={ !allPageSelected && pageIds.some((id) => selected.includes(id)) }
                        onChange={ (v) => setSelected(v ? [...new Set([...selected, ...pageIds])] : selected.filter((id) => !pageIds.includes(id))) }
                        id="sel-all"
                      />
                    </th>
                    <th className="th"><SortHeader label="Task" active={ sort.key === 'code' } direction={ sort.dir } onClick={ () => setSort({ key: 'code', dir: sort.key === 'code' && sort.dir === 'desc' ? 'asc' : 'desc' })} /></th>
                    <th className="th hidden lg:table-cell">Category</th>
                    <th className="th">Assignee</th>
                    <th className="th"><SortHeader label="Priority" active={ sort.key === 'priority' } direction={ sort.dir } onClick={ () => setSort({ key: 'priority', dir: sort.key === 'priority' && sort.dir === 'asc' ? 'desc' : 'asc' })} /></th>
                    <th className="th"><SortHeader label="Status" active={ sort.key === 'status' } direction={ sort.dir } onClick={ () => setSort({ key: 'status', dir: sort.key === 'status' && sort.dir === 'desc' ? 'asc' : 'desc' })} /></th>
                    <th className="th"><SortHeader label="SLA deadline" active={ sort.key === 'deadline' } direction={ sort.dir } onClick={ () => setSort({ key: 'deadline', dir: sort.key === 'deadline' && sort.dir === 'asc' ? 'desc' : 'asc' })} /></th>
                    <th className="th hidden xl:table-cell">Automation</th>
                    <th className="th w-8 pr-2" aria-label="Row actions" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50">
                  { paged.map((t) => {
                    const a = state.users.find((u) => u.id === t.assigneeId);
                    const h = taskHealth(t, Date.now(), state.settings.reminderThresholdPct);
                    return (
                      <tr
                        key={t.id }
                        role="button"
                        tabIndex={ 0 }
                        data-row-interactive=""
                        aria-label={ `Open request ${t.code}: ${t.title}` }
                        onClick={ () => setTaskParam(t.id) }
                        onKeyDown={ onActivateKey(() => setTaskParam(t.id)) }
                        className={ cn(
                          'group cursor-pointer border-l-2 border-l-transparent transition-colors hover:border-l-brand-500 hover:bg-brand-50/30',
                          selected.includes(t.id) && 'border-l-brand-500 bg-brand-50/40',
                        ) }
                      >
                        <td className="td pl-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={ selected.includes(t.id) }
                            onChange={ (v) => setSelected(v ? [...selected, t.id] : selected.filter((x) => x !== t.id)) }
                            id={ `sel-${t.id }`}
                          />
                        </td>
                        <td className="td max-w-[290px]">
                          <button onClick={ () => setTaskParam(t.id) } className="block max-w-full text-left">
                            <span className="block truncate text-[12.5px] font-medium text-ink-800 group-hover:text-brand-700">{ t.title }</span>
                            <span className="flex items-center gap-1.5 text-[10.5px] text-ink-400">
                              <span className="tabular">{ t.code }</span>
                              <span>·</span>
                              <span>{ t.source }</span>
                              <span>·</span>
                              <span>{ state.organization.departments.find((d) => d.id === t.departmentId)?.code }</span>
                            </span>
                          </button>
                        </td>
                        <td className="td hidden lg:table-cell"><CategoryBadge category={ t.category } /></td>
                        <td className="td">
                          { a ? (
                            <span className="flex items-center gap-1.5">
                              <Avatar name={a.name } tone={ a.avatarTone } size="xs" />
                              <span className="truncate text-[11.5px]">{ a.name.split(' ')[0] } { a.name.split(' ')[1]?.[0] }.</span>
                            </span>
                          ) : (
                            <span className="text-[11.5px] text-amber-700">Unassigned</span>
                          )}
                        </td>
                        <td className="td"><PriorityBadge priority={ t.priority } /></td>
                        <td className="td whitespace-nowrap"><StatusBadge status={ t.status } /></td>
                        <td className="td whitespace-nowrap">
                          {/* Deadline and health describe the same fact — one cell, three
                              signals: the date, the countdown, and a health dot. */}
                          <div className="flex items-center gap-2">
                            <span
                              className={ cn(
                                'h-1.5 w-1.5 shrink-0 rounded-full',
                                h === 'Overdue' ? 'bg-red-500' : h === 'Safe' ? 'bg-emerald-500' : h === 'At risk' ? 'bg-orange-500' : 'bg-amber-500',
                              ) }
                              aria-hidden
                            />
                            <div className="min-w-0">
                              <p className="text-[11.5px] leading-tight text-ink-700">{ fmtDateTime(t.deadline).split(', ')[0] }</p>
                              <p className={ cn('text-[10px] leading-tight', h === 'Overdue' ? 'text-red-600' : h === 'Safe' ? 'text-ink-400' : 'text-amber-700') }>{ fmtRelative(t.deadline) }</p>
                            </div>
                            <span className="sr-only">{ h }</span>
                          </div>
                        </td>
                        <td className="td hidden xl:table-cell"><AutomationStatusBadge status={ t.automationStatus } /></td>
                        <td className="td w-8 pr-2 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end">
                            {/* One affordance per row: the whole row already opens the
                                record, so the overflow only carries secondary actions. */}
                            <Dropdown
                              trigger={ ({ toggle }) => (
                                <button
                                  onClick={ toggle }
                                  aria-label="Row actions"
                                  className="rounded-md p-1 text-ink-400 opacity-0 transition-all hover:bg-ink-100 hover:text-ink-800 focus-visible:opacity-100 group-hover:opacity-100 data-[open=true]:opacity-100"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                              )}
                            >
                              { ({ close }) => (
                                <>
                                  <MenuItem icon={ <PlayCircle className="h-3.5 w-3.5" /> } onClick={ () => { close(); updateTask(t.id, { status: 'In Progress' }); }}>
                                    Start work
                                  </MenuItem>
                                  <MenuItem icon={ <Bot className="h-3.5 w-3.5" /> } onClick={ () => {
                                    close();
                                    const rule = state.automations.find((x) => x.botKey === 'data_validation');
                                    if (rule?.enabled) runRule(rule.id, { mode: 'Manual', scopeTaskIds: [t.id] });
                                    else toast({ title: 'Data Validation BOT is disabled', description: 'Enable it in the Automation Center.', tone: 'warning' });
                                  }}>
                                    Re-run validation
                                  </MenuItem>
                                  <MenuItem onClick={ () => { close(); setTaskParam(t.id); }}>Open details</MenuItem>
                                  <div className="my-1 border-t border-ink-100" />
                                  <MenuItem danger icon={ <Trash2 className="h-3.5 w-3.5" /> } onClick={ () => { close(); deleteTask(t.id); }} disabled={ !isManager }>
                                    Delete
                                  </MenuItem>
                                </>
                              )}
                            </Dropdown>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="w-full overflow-x-auto p-3">
            <div className="flex w-full min-w-[1120px] gap-2.5">
              { kanbanColumns.map((col) => {
                const items = filtered.filter((t) => t.status === col.status);
                return (
                  <div key={col.status } className="flex min-w-0 flex-1 flex-col">
                    {/* Column header: saturated only by its status dot, so a board of
                        eight columns still reads as one calm surface. */}
                    <div className="mb-2 flex items-center justify-between rounded-lg border border-ink-200/70 bg-white px-2.5 py-1.5 shadow-xs">
                      <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-800">
                        <span className={ cn('h-2 w-2 rounded-full', col.accent) } />
                        { col.status }
                      </span>
                      <span className="rounded bg-ink-100 px-1.5 py-px text-[10.5px] font-semibold tabular text-ink-600">{ items.length }</span>
                    </div>
                    <div className="flex flex-1 flex-col gap-2">
                      { items.slice(0, 12).map((t) => {
                        const a = state.users.find((u) => u.id === t.assigneeId);
                        return (
                          <div
                            key={t.id }
                            role="button"
                            tabIndex={ 0 }
                            data-row-interactive=""
                            aria-label={ `Open request ${t.code}: ${t.title}` }
                            className={ cn(
                              'group cursor-pointer rounded-lg border border-ink-200/90 bg-white p-2.5 shadow-xs transition-all duration-150 hover:-translate-y-px hover:border-brand-300 hover:shadow-raised focus-visible:-translate-y-px focus-visible:border-brand-300 focus-visible:shadow-raised', kanbanBusy === t.id && 'opacity-50', ) }
                            onClick={ () => setTaskParam(t.id) }
                            onKeyDown={ onActivateKey(() => setTaskParam(t.id)) }
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="shrink-0 whitespace-nowrap tabular text-[9.5px] font-semibold text-ink-400">{ t.code }</span>
                              <PriorityBadge priority={ t.priority } className="shrink-0 px-1 text-[9.5px] leading-[13px]" />
                            </div>
                            <p className="mt-1 line-clamp-2 text-[12px] font-medium leading-snug text-ink-800">{ t.title }</p>
                            <p className="mt-1 text-[10px] text-ink-400">{ t.category }</p>
                            <div className="mt-1.5 flex items-center justify-between">
                              { a ? <Avatar name={a.name } tone={ a.avatarTone } size="xs" /> : <span className="text-[10px] text-amber-700">Unassigned</span>}
                              <span className={ cn('text-[10px]', taskHealth(t, Date.now(), state.settings.reminderThresholdPct) === 'Overdue' ? 'text-red-600' : 'text-ink-400') }>{ fmtRelative(t.deadline) }</span>
                            </div>
                            { t.status !== 'Completed' && (
                              <div className="mt-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                {t.status !== 'In Progress' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); moveTask(t, 'In Progress'); }}
                                    className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-indigo-700 hover:bg-indigo-100"
                                  >
                                    Start
                                  </button>
                                )}
                                <button
                                  onClick={ (e) => { e.stopPropagation(); moveTask(t, 'Completed'); }}
                                  className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-emerald-700 hover:bg-emerald-100"
                                >
                                  Complete
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      { items.length === 0 && (
                        <div className="rounded-lg border border-dashed border-ink-200 py-6 text-center text-[10.5px] text-ink-400">
                          No tasks
                        </div>
                      ) }
                      { items.length > 12 && (
                        <button
                          onClick={() => { setView('table'); setStatus(col.status); }}
                          className="w-full rounded-md border border-dashed border-ink-200 py-1 text-[10.5px] font-medium text-brand-700 hover:bg-brand-50"
                        >
                          +{ items.length - 12 } more in this column — open as table
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        { view === 'table' && filtered.length > 0 && (
          <Pagination page={page } pageSize={ pageSize } total={ filtered.length } onPage={ setPage } onPageSize={ setPageSize } />
        )}
      </Card>

      <InfoNote>
        <strong>Tip.</strong> Bulk-selected rows support reassignment and status changes. Opening a request exposes history, comments and the exact BOT
        executions that touched it — try a scoped BOT run from the Automation tab of the drawer.
      </InfoNote>

      <QuickCreateModal open={ quickOpen } onClose={ () => setQuickOpen(false) } />
      <TaskDrawer
        taskId={ openTaskId }
        onClose={ () => setTaskParam(null) }
        onOpenWorkflow={ (workflowId) => navigate(`/workflows?id=${workflowId}`) }
      />

      { /* Bulk assign modal */ }
      <BulkAssign
        open={ bulkAssignOpen }
        onClose={ () => setBulkAssignOpen(false) }
        value={ bulkAssignee }
        onChange={ setBulkAssignee }
        onConfirm={ () => {
          if (!bulkAssignee) return;
          bulkAssign(selected, bulkAssignee);
          setBulkAssignOpen(false);
          setSelected([]); }}
        count={ selected.length }
      />

      <ConfirmDialog
        open={ confirmBulkDelete }
        onClose={ () => setConfirmBulkDelete(false) }
        onConfirm={ () => {
          selected.forEach((id) => deleteTask(id));
          setSelected([]); }}
        title={ `Delete ${selected.length } request(s)?`}
        description="This removes the selected records and their workflow instances from the demo workspace. The action cannot be undone except by resetting the demo data."
        confirmLabel="Delete requests"
      />
    </div>
  );
}

function BulkAssign({ open, onClose, value, onChange, onConfirm, count }: { open: boolean;
  onClose: () => void;
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  count: number; }) { const { state } = useStore();
  return (
    <div>
      { open && (
        <div className="fixed inset-0 z-[92] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-ink-900/40" onClick={onClose } aria-hidden />
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-ink-200 bg-white p-4 shadow-pop animate-slide-up">
            <h3 className="text-[14px] font-semibold text-ink-900">Bulk assign { count } request(s)</h3>
            <p className="mt-1 text-[12px] text-ink-500">Choose the employee who should own these records.</p>
            <div className="mt-3">
              <label className="label" htmlFor="bulk-assignee">Assignee</label>
              <Select id="bulk-assignee" value={ value } onChange={ (e) => onChange(e.target.value) }>
                <option value="">Select an employee…</option>
                { state.users.filter((u) => u.active).map((u) => (
                  <option key={u.id } value={ u.id }>
                    { u.name } · { state.organization.departments.find((d) => d.id === u.departmentId)?.code } · { u.availability }
                  </option>
                ))}
              </Select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={ onClose }>Cancel</Button>
              <Button variant="primary" disabled={ !value } onClick={ onConfirm }>Assign { count }</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

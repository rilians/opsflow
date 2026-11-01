import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, CheckCircle2, ShieldAlert, Download, Link2, Plug, Save, ShieldCheck, Timer, Upload, Users, XCircle, RotateCcw, Settings2, Database, FileJson } from 'lucide-react';
import { Avatar, Badge, Button, Card, CardHeader, ConfirmDialog, Drawer, Field, Input, KeyValue, Modal, Select, Switch, Tabs, Textarea, Tooltip } from '@/components/ui';
import { PageHeader, InfoNote } from '@/components/shared/Page';
import { usePermissions, useStore } from '@/services/store';
import { DEMO_ORG } from '@/lib/org';
import { cn, downloadFile, fmtDateTime, fmtNumber } from '@/lib/utils';
import type { DepartmentId, Role, SlaConfiguration, User } from '@/types';

type Tab = 'organization' | 'users' | 'roles' | 'sla' | 'integrations' | 'data';

/** Same rule the data-validation BOT applies to requester addresses. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function Settings() { const { state, updateOrganization, saveUser, toggleUserActive, setCurrentUser, updateSettings, updateSlaConfig, resetDemo, importState, toast } = useStore();
  const { isAdmin, user: currentUser } = usePermissions();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(((params.get('tab') as Tab) ?? 'organization') as Tab);
  const [orgName, setOrgName] = useState(state.organization.name);
  const [orgCode, setOrgCode] = useState(state.organization.code);

  // Keep the form in step with the workspace: resetting or importing a snapshot used
  // to leave the old organisation name sitting in the inputs.
  useEffect(() => {
    setOrgName(state.organization.name);
    setOrgCode(state.organization.code);
  }, [state.organization.name, state.organization.code]);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');

  const deptCounts = useMemo(
    () =>
      state.organization.departments.map((d) => ({ ...d, users: state.users.filter((u) => u.departmentId === d.id).length, tasks: state.tasks.filter((t) => t.departmentId === d.id).length })),
    [state],
  );

  const roles: { role: Role; description: string; permissions: string[] }[] = [
    { role: 'Administrator', description: 'Full control of configuration, automation and workspace data.', permissions: ['Configure automation & workflows', 'Manage users and roles', 'Edit SLA configuration', 'Delete tasks & reports', 'Reset / import workspace'] },
    { role: 'Operations Manager', description: 'Supervises the department queue, approves work and reviews performance.', permissions: ['Approve workflow stages', 'Reassign and close tasks', 'View analytics & reports', 'Run automation manually'] },
    { role: 'Staff', description: 'Executes assigned operational work.', permissions: ['Update own tasks', 'Comment and attach notes', 'View own SLA status', 'Generate personal reports'] },
  ];

  const exportWorkspace = () => { downloadFile(
      `opsflow-workspace-${new Date().toISOString().slice(0, 10) }.json`,
      JSON.stringify(state, null, 2),
      'application/json',
    );
    toast({ title: 'Workspace exported', description: 'Full JSON snapshot downloaded.', tone: 'success' });
  };

  const guardAdmin = (fn: () => void) => { if (!isAdmin) {
      toast({ title: 'Administrator role required', description: 'Switch to the Administrator persona from the profile menu to make this change.', tone: 'warning' });
      return;
    }
    fn();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Administration & Settings"
        description="Organization structure, people, role-based access, SLA policy, integration status and workspace data — with clear disclosure of what is connected versus simulated."
        actions={ <Badge tone={isAdmin ? 'emerald' : 'amber' } dot>
            { isAdmin ? 'Administrator access' : 'Read-only for your role' }
          </Badge>
        }
      />

      <div className="rounded-xl border border-ink-200/80 bg-white px-3 pt-1 shadow-card">
      <Tabs
        value={ tab }
        onChange={ (v) => {
          setTab(v);
          const next = new URLSearchParams(params);
          next.set('tab', v);
          setParams(next, { replace: true });
        }}
        tabs={ [
          { value: 'organization', label: 'Organization' },
          { value: 'users', label: 'User management', count: state.users.length },
          { value: 'roles', label: 'Roles & access' },
          { value: 'sla', label: 'SLA configuration' },
          { value: 'integrations', label: 'Integration center', count: state.integrations.length },
          { value: 'data', label: 'Workspace data' },
        ]}
      />
      </div>

      { tab === 'organization' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <Card>
              <CardHeader title="Organization profile" subtitle="Appears in report headers and exports" icon={<Building2 className="h-4 w-4 text-ink-400" /> } />
              <div className="p-4">
                {!isAdmin && (
                  <p className="mb-3 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-2 text-[11.5px] text-amber-800">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                    Read-only — only an Administrator can change the organization profile.
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Organization name">
                    <Input value={ orgName } onChange={ (e) => setOrgName(e.target.value) } disabled={ !isAdmin } />
                  </Field>
                  <Field label="Short code" hint="Used as the prefix on exported file names.">
                    <Input value={ orgCode } onChange={ (e) => setOrgCode(e.target.value.slice(0, 6).toUpperCase()) } disabled={ !isAdmin } />
                  </Field>
                  <Field label="Workspace plan" hint="Demo workspace — no billing is configured." className="sm:col-span-2">
                    <Input value={ state.organization.plan } readOnly disabled />
                  </Field>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-ink-100 pt-3">
                  <p className="text-[11px] text-ink-400">Changes apply to report headers and every export immediately.</p>
                  <Button
                    variant="primary"
                    disabled={ !isAdmin }
                    icon={ <Save className="h-3.5 w-3.5" /> }
                    onClick={ () =>
                      guardAdmin(() => {
                        if (!orgName.trim() || !orgCode.trim()) {
                          toast({ title: 'Organization name and code are required', tone: 'error' });
                          return;
                        }
                        updateOrganization({ name: orgName.trim(), code: orgCode.trim() });
                      })
                    }
                  >
                    Save profile
                  </Button>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Departments & teams" subtitle={ `${deptCounts.length } departments · ${ state.users.length } people`} />
              <div className="divide-y divide-ink-50">
                { deptCounts.map((d) => (
                  <div key={d.id } className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-800">
                        { d.name }
                        <span className="rounded bg-ink-100 px-1 text-[9.5px] font-semibold text-ink-500">{ d.code }</span>
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-ink-400">
                        Head: { d.head } · Cost centre { d.costCenter } · { d.teams.join(', ') }
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-ink-500"><strong className="tabular text-ink-800">{ d.users }</strong> people</span>
                      <span className="text-ink-500"><strong className="tabular text-ink-800">{ d.tasks }</strong> requests</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Workspace settings" subtitle="Behaviour of the automation engine" icon={ <Settings2 className="h-4 w-4 text-ink-400" /> } />
              <div className="space-y-3 p-3.5">
                <Field label={ `Deadline reminder threshold — ${state.settings.reminderThresholdPct }%`} hint="Used by the Deadline Reminder BOT.">
                  <input
                    type="range"
                    min={ 50 }
                    max={ 95 }
                    step={ 5 }
                    value={ state.settings.reminderThresholdPct }
                    onChange={ (e) => updateSettings({ reminderThresholdPct: Number(e.target.value) })}
                    className="w-full accent-brand-600"
                  />
                </Field>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[12px] font-medium text-ink-800">Automatic escalation</p>
                    <p className="text-[10.5px] text-ink-500">Allows the SLA BOT to mark breaches Overdue.</p>
                  </div>
                  <Switch checked={ state.settings.autoEscalation } onChange={ (v) => updateSettings({ autoEscalation: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[12px] font-medium text-ink-800">Demo mode banner</p>
                    <p className="text-[10.5px] text-ink-500">Show the demo-mode disclosure in the shell.</p>
                  </div>
                  <Switch checked={ state.settings.demoMode } onChange={ (v) => updateSettings({ demoMode: v })} />
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Environment" subtitle="Runtime configuration" />
              <div className="p-3.5">
                <KeyValue label="Persistence">localStorage (browser)</KeyValue>
                <KeyValue label="Version">v1.0 · schema v{ state.version }</KeyValue>
                <KeyValue label="Tasks">{ fmtNumber(state.tasks.length) }</KeyValue>
                <KeyValue label="Executions">{ fmtNumber(state.executions.length) }</KeyValue>
                <KeyValue label="Backend">None (standalone demo)</KeyValue>
                <p className="mt-2 rounded-md bg-ink-50 px-2 py-1.5 text-[10.5px] leading-snug text-ink-500">
                  This build is a standalone demonstration. It has no authentication, no server-side authorization and no external database. See the
                  README for the production integration path.
                </p>
              </div>
            </Card>
          </div>
        </div>
      )}

      { tab === 'users' && (
        <Card>
          <CardHeader
            title="User management"
            subtitle="People, roles, departments and availability"
            icon={<Users className="h-4 w-4 text-ink-400" /> }
            action={ <Button size="xs" variant="secondary" onClick={() => setEditUser({ id: `usr-${Date.now() }`, name: '', email: '', role: 'Staff', departmentId: 'dept-ops', title: '', availability: 'Available', active: true, avatarTone: 'emerald' })} disabled={ !isAdmin }>Add user</Button>}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="border-b border-ink-100 bg-ink-50/60">
                <tr>
                  <th className="th pl-4">Employee</th>
                  <th className="th">Role</th>
                  <th className="th">Department</th>
                  <th className="th">Availability</th>
                  <th className="th">Open tasks</th>
                  <th className="th">Status</th>
                  <th className="th pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                { state.users.map((u) => {
                  const open = state.tasks.filter((t) => t.assigneeId === u.id && ['New', 'Assigned', 'In Progress', 'Waiting Approval', 'Overdue'].includes(t.status)).length;
                  return (
                    <tr key={u.id } className={ cn('transition-colors hover:bg-ink-50/60', u.id === currentUser.id && 'bg-brand-50/25') }>
                      <td className="td pl-4">
                        <div className="flex items-center gap-2">
                          <Avatar name={ u.name } tone={ u.avatarTone } size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-medium text-ink-800">
                              { u.name }
                              { u.id === currentUser.id && <span className="ml-1 text-[9.5px] font-semibold text-brand-600">YOU</span> }
                            </p>
                            <p className="truncate text-[10px] text-ink-400">{ u.email }</p>
                          </div>
                        </div>
                      </td>
                      <td className="td"><Badge tone={ u.role === 'Administrator' ? 'violet' : u.role === 'Operations Manager' ? 'blue' : 'slate' }>{ u.role }</Badge></td>
                      <td className="td whitespace-nowrap text-[11px]">{ state.organization.departments.find((d) => d.id === u.departmentId)?.name }</td>
                      <td className="td"><Badge tone={ u.availability === 'Available' ? 'emerald' : u.availability === 'Busy' ? 'amber' : 'slate' } dot>{ u.availability }</Badge></td>
                      <td className="td tabular text-[11.5px]">{ open }</td>
                      <td className="td"><Badge tone={ u.active ? 'emerald' : 'slate' }>{ u.active ? 'Active' : 'Inactive' }</Badge></td>
                      <td className="td pr-4">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button size="xs" variant="ghost" onClick={ () => setEditUser(u) }>Edit</Button>
                          <Button size="xs" variant="ghost" onClick={ () => setCurrentUser(u.id) } disabled={ u.id === currentUser.id || !u.active }>Impersonate</Button>
                          <Tooltip content={ u.active ? 'Deactivate user' : 'Reactivate user' }>
                            <Button size="xs" variant="ghost" onClick={ () => guardAdmin(() => toggleUserActive(u.id)) } aria-label="Toggle active">
                              { u.active ? <XCircle className="h-3 w-3 text-red-500" /> : <CheckCircle2 className="h-3 w-3 text-emerald-600" /> }
                            </Button>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-ink-100 bg-ink-50/50 px-4 py-2">
            <p className="text-[10.5px] text-ink-500">
              Impersonating a user changes which role-based controls are available — use it to demonstrate the access model. The demo has no password
              authentication.
            </p>
          </div>
        </Card>
      )}

      { tab === 'roles' && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            {roles.map((r) => (
              <Card key={r.role } className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-ink-900">{ r.role }</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">{ r.description }</p>
                  </div>
                  <ShieldCheck className={ cn('h-4 w-4 shrink-0', r.role === 'Administrator' ? 'text-violet-500' : r.role === 'Operations Manager' ? 'text-sky-500' : 'text-ink-400') } />
                </div>
                <ul className="mt-2 space-y-1">
                  { r.permissions.map((p) => (
                    <li key={p } className="flex items-start gap-1.5 text-[11px] text-ink-600">
                      <CheckCircle2 className="mt-px h-3 w-3 shrink-0 text-brand-600" />
                      { p }
                    </li>
                  ))}
                </ul>
                <p className="mt-2 border-t border-ink-100 pt-2 text-[10.5px] text-ink-400">
                  { state.users.filter((u) => u.role === r.role).length } user(s) assigned
                </p>
              </Card>
            ))}
          </div>
          <InfoNote tone="warning">
            <strong>Demo-scope authorization.</strong> Role checks in this build are enforced in the UI only. A production deployment must enforce the
            same rules server-side (row-level security in Postgres/Supabase plus a signed session), because client-side checks are trivially bypassed.
          </InfoNote>
        </div>
      )}

      { tab === 'sla' && (
        <Card>
          <CardHeader title="SLA configuration" subtitle="Resolve targets in hours by category and priority" icon={<Timer className="h-4 w-4 text-ink-400" /> } />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="border-b border-ink-100 bg-ink-50/60">
                <tr>
                  <th className="th pl-4">Category</th>
                  <th className="th">Critical</th>
                  <th className="th">High</th>
                  <th className="th">Medium</th>
                  <th className="th">Low</th>
                  <th className="th">Auto escalate</th>
                  <th className="th pr-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                { state.slaConfigs.map((c) => (
                  <SlaRow key={c.id } config={ c } onSave={ (patch) => guardAdmin(() => updateSlaConfig(c.id, patch)) } canEdit={ isAdmin } />
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-ink-100 bg-ink-50/50 px-4 py-2.5">
            <p className="text-[10.5px] leading-relaxed text-ink-500">
              Rules used by intake to set deadlines, by the reminder BOT to decide when to notify, and by the escalation BOT to decide when a request is
              breached. Existing tasks keep their original SLA.
            </p>
          </div>
        </Card>
      )}

      { tab === 'integrations' && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {state.integrations.map((i) => {
              const tone =
                i.status === 'Connected' ? 'emerald' : i.status === 'Demo Mode' ? 'amber' : i.status === 'Configuration Required' ? 'violet' : 'slate';
              return (
                <Card key={i.id } className="flex flex-col p-3.5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                        <Plug className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-[12.5px] font-semibold text-ink-900">{ i.name }</p>
                        <p className="text-[10px] uppercase tracking-wide text-ink-400">{ i.category }</p>
                      </div>
                    </div>
                    <Badge tone={ tone } dot>{ i.status }</Badge>
                  </div>
                  <p className="mt-2 flex-1 text-[11px] leading-relaxed text-ink-500">{ i.description }</p>
                  <p className="mt-1.5 rounded-md bg-ink-50 px-2 py-1.5 text-[10.5px] leading-snug text-ink-500">{ i.note }</p>
                  <div className="mt-2 flex items-center justify-between border-t border-ink-100 pt-2">
                    <span className="text-[10px] text-ink-400">{ i.lastSync ? `Last sync ${fmtDateTime(i.lastSync) }` : 'Never synced'}</span>
                    <Button
                      size="xs"
                      variant="ghost"
                      icon={ <Link2 className="h-3 w-3" /> }
                      onClick={ () => toast({ title: `${i.name } is not connected`, description: i.note, tone: 'warning' })}
                    >
                      Configure
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
          <InfoNote tone="warning">
            <strong>No external integration is active.</strong> Statuses above are honest: nothing is connected, and no data leaves this browser.
            Production wiring requires server-side credentials supplied through environment variables (see <code>.env.example</code>) — secrets must
            never be embedded in a frontend bundle.
          </InfoNote>
        </div>
      )}

      { tab === 'data' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Workspace dataset" subtitle="What this demo workspace contains" icon={<Database className="h-4 w-4 text-ink-400" /> } />
            <div className="p-4">
              <div className="grid grid-cols-2 gap-2">
                { [
                  { label: 'Tasks', value: state.tasks.length },
                  { label: 'Users', value: state.users.length },
                  { label: 'Automation rules', value: state.automations.length },
                  { label: 'Executions', value: state.executions.length },
                  { label: 'Workflows', value: state.workflows.length },
                  { label: 'Workflow instances', value: state.workflows.reduce((a, w) => a + w.executions.length, 0) },
                  { label: 'Notifications', value: state.notifications.length },
                  { label: 'Activity records', value: state.activity.length },
                  { label: 'Reports', value: state.reports.length },
                  { label: 'Process baselines', value: state.baselines.length },
                ].map((s) => (
                  <div key={ s.label } className="rounded-lg border border-ink-200 p-2">
                    <p className="text-[10px] uppercase tracking-wide text-ink-400">{ s.label }</p>
                    <p className="text-[15px] font-semibold tabular text-ink-900">{ fmtNumber(s.value) }</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="sm" variant="secondary" icon={ <Download className="h-3.5 w-3.5" /> } onClick={ exportWorkspace }>Export JSON</Button>
                <Button size="sm" variant="secondary" icon={ <Upload className="h-3.5 w-3.5" /> } onClick={ () => setImportOpen(true) }>Import JSON</Button>
                <Button size="sm" variant="secondary" icon={ <RotateCcw className="h-3.5 w-3.5" /> } onClick={ () => setConfirmReset(true) }>Reset demo data</Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="About this build" subtitle="Honest capability statement" icon={ <FileJson className="h-4 w-4 text-ink-400" /> } />
            <div className="space-y-2 p-4 text-[11.5px] leading-relaxed text-ink-600">
              <p><strong className="text-ink-800">Functional:</strong> task CRUD, assignment, SLA clocks, BOT rule engine, execution history, workflow instances, notifications, analytics, ROI model, CSV export, localStorage persistence.</p>
              <p><strong className="text-ink-800">Simulated:</strong> scheduled BOT runs (triggered on demand), external integrations (email, Teams, Slack, Telegram, Sheets/Forms, Excel), impersonation-based access control.</p>
              <p><strong className="text-ink-800">Not implemented:</strong> authentication, multi-tenant isolation, server APIs, background workers, real PDF generation, audit immutability.</p>
              <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[10.5px] text-amber-900">
                All organisation names, people and metrics are synthetic demo data for { DEMO_ORG } and make no claim about any real company.
              </p>
            </div>
          </Card>
        </div>
      )}

      { /* user editor */ }
      <UserEditor user={ editUser } onClose={ () => setEditUser(null) } onSave={ (u) => { saveUser(u); setEditUser(null); }} />

      <Modal
        open={ importOpen }
        onClose={ () => setImportOpen(false) }
        title="Import workspace JSON"
        description="Paste a previously exported OpsFlow workspace snapshot."
        size="md"
        footer={ <>
            <Button variant="secondary" onClick={() => setImportOpen(false) }>Cancel</Button>
            <Button
              variant="primary"
              onClick={ () => {
                if (importState(importText)) setImportOpen(false); }}
            >
              Import &amp; replace
            </Button>
          </>
        }
      >
        <Textarea value={ importText } onChange={ (e) => setImportText(e.target.value) } className="min-h-[180px] font-mono text-[11px]" placeholder='{ "version":4, "tasks":[…] }' />
      </Modal>

      <ConfirmDialog
        open={ confirmReset }
        onClose={ () => setConfirmReset(false) }
        onConfirm={ resetDemo }
        title="Reset the demo workspace?"
        description="Every task, execution, notification and setting you created will be replaced by the original seeded dataset. Export first if you want to keep a copy."
        confirmLabel="Reset workspace"
      />
    </div>
  );
}

function SlaRow({
  config,
  onSave,
  canEdit,
}: {
  config: SlaConfiguration;
  onSave: (patch: Partial<SlaConfiguration>) => void;
  canEdit: boolean;
}) { const [draft, setDraft] = useState({ ...config });
  const dirty =
    draft.criticalHours !== config.criticalHours ||
    draft.highHours !== config.highHours ||
    draft.mediumHours !== config.mediumHours ||
    draft.lowHours !== config.lowHours ||
    draft.autoEscalate !== config.autoEscalate;

  return (
    <tr className={ cn(dirty && 'bg-brand-50/30') }>
      <td className="td pl-4 text-[11.5px] font-medium text-ink-700">{ config.category }</td>
      { (['criticalHours', 'highHours', 'mediumHours', 'lowHours'] as const).map((k) => (
        <td key={k } className="td">
          <Input
            type="number"
            min={ 1 }
            value={ draft[k] }
            onChange={ (e) => setDraft({ ...draft, [k]: Number(e.target.value) })}
            className="h-7 w-16 text-[11.5px] tabular"
            aria-label={ `${config.category } ${ k }`}
            disabled={ !canEdit }
          />
        </td>
      ))}
      <td className="td"><Switch checked={ draft.autoEscalate } onChange={ (v) => setDraft({ ...draft, autoEscalate: v })} disabled={ !canEdit } size="sm" /></td>
      <td className="td pr-4 text-right">
        <Button size="xs" variant={ dirty ? 'primary' : 'ghost' } disabled={ !dirty || !canEdit } onClick={ () => onSave(draft) }>
          Save
        </Button>
      </td>
    </tr>
  );
}

function UserEditor({ user, onClose, onSave }: { user: User | null; onClose: () => void; onSave: (u: User) => void }) { const { state } = useStore();
  const [draft, setDraft] = useState<User | null>(user);

  if (user && draft?.id !== user.id) setDraft(user);
  if (!user || !draft) return null;

  return (
    <Drawer
      open={ !!user }
      onClose={ onClose }
      title={ user.name ? `Edit ${user.name }` : 'Add employee'}
      subtitle="Role, department and availability determine BOT assignment behaviour"
      width="md"
      footer={ <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose }>Cancel</Button>
          <Button
            variant="primary"
            onClick={ () => {
              if (!draft.name.trim() || !EMAIL_RE.test(draft.email)) return;
              onSave(draft);
            }}
            disabled={ !draft.name.trim() || !EMAIL_RE.test(draft.email)}
          >
            Save employee
          </Button>
        </div>
      }
    >
      <div className="space-y-3 p-4">
        <Field label="Full name" required>
          <Input value={ draft.name } onChange={ (e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Email" required hint="Used as the notification address in production.">
          <Input type="email" value={ draft.email } onChange={ (e) => setDraft({ ...draft, email: e.target.value })} />
        </Field>
        <Field label="Job title">
          <Input value={ draft.title } onChange={ (e) => setDraft({ ...draft, title: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role">
            <Select value={ draft.role } onChange={ (e) => setDraft({ ...draft, role: e.target.value as Role })}>
              <option value="Administrator">Administrator</option>
              <option value="Operations Manager">Operations Manager</option>
              <option value="Staff">Staff</option>
            </Select>
          </Field>
          <Field label="Department">
            <Select value={ draft.departmentId } onChange={ (e) => setDraft({ ...draft, departmentId: e.target.value as DepartmentId })}>
              { state.organization.departments.map((d) => (
                <option key={d.id } value={ d.id }>{ d.name }</option>
              ))}
            </Select>
          </Field>
          <Field label="Availability">
            <Select value={ draft.availability } onChange={ (e) => setDraft({ ...draft, availability: e.target.value as User['availability'] })}>
              <option value="Available">Available</option>
              <option value="Busy">Busy</option>
              <option value="Away">Away</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={ draft.active ? 'active' : 'inactive' } onChange={ (e) => setDraft({ ...draft, active: e.target.value === 'active' })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>
        <p className="rounded-md bg-ink-50 px-2.5 py-1.5 text-[10.5px] leading-snug text-ink-500">
          The Smart Assignment BOT only selects <strong>active Staff</strong> members, preferring <em>Available</em> people with the lowest open task
          count.
        </p>
      </div>
    </Drawer>
  );
}

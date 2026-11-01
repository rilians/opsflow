import type {
  AppState,
  AutomationExecution,
  AutomationRule,
  Department,
  ProcessBaseline,
  SlaConfiguration,
  Task,
  TaskCategory,
  Priority,
  TaskStatus,
  RequestSource,
  User,
  Workflow,
  AppNotification,
  ActivityLog,
  ReportRecord,
  Integration,
  RoiInputs,
} from '@/types';
import { CATEGORIES, CATEGORY_DEPARTMENT } from '@/lib/catalog';
import { HOUR, seededRandom, startOfDay, dayKey } from '@/lib/utils';
import { reconcileTask, slaHoursForConfig, workflowIdForCategory } from '@/lib/domain';

const rng = seededRandom(20260214);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const rint = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
const chance = (p: number) => rng() < p;

const NOW = Date.now();
const daysAgo = (d: number, h = 0) => new Date(NOW - d * 24 * HOUR - h * HOUR).toISOString();

/* ------------------------------------------------------------------ organization */

const departments: Department[] = [
  {
    id: 'dept-it',
    name: 'IT Support',
    code: 'IT',
    head: 'Aditya Pratama',
    teams: ['Service Desk', 'Infrastructure', 'Application Support'],
    costCenter: 'CC-1100',
  },
  {
    id: 'dept-ops',
    name: 'Business Operations',
    code: 'OPS',
    head: 'Siti Rahmawati',
    teams: ['Process Excellence', 'PMO', 'Facilities'],
    costCenter: 'CC-1200',
  },
  {
    id: 'dept-hr',
    name: 'Human Resources',
    code: 'HR',
    head: 'Maya Lestari',
    teams: ['People Ops', 'Recruitment'],
    costCenter: 'CC-1300',
  },
  {
    id: 'dept-fin',
    name: 'Finance & Reporting',
    code: 'FIN',
    head: 'Fajar Nugroho',
    teams: ['Financial Reporting', 'Procurement'],
    costCenter: 'CC-1400',
  },
  {
    id: 'dept-cx',
    name: 'Customer Experience',
    code: 'CX',
    head: 'Dewi Anggraini',
    teams: ['Customer Support', 'Quality Assurance'],
    costCenter: 'CC-1500',
  },
];

const tone = ['emerald', 'blue', 'violet', 'amber', 'cyan', 'rose', 'indigo', 'teal'];

const users: User[] = (([
  { id: 'usr-01', name: 'Aulia Rahman', email: 'aulia.rahman@nusantararetail.co.id', role: 'Administrator', departmentId: 'dept-ops', title: 'Automation Administrator', availability: 'Available', active: true, avatarTone: 'emerald' },
  { id: 'usr-02', name: 'Siti Rahmawati', email: 'siti.rahmawati@nusantararetail.co.id', role: 'Operations Manager', departmentId: 'dept-ops', title: 'Head of Business Operations', availability: 'Busy', active: true, avatarTone: 'blue' },
  { id: 'usr-03', name: 'Aditya Pratama', email: 'aditya.pratama@nusantararetail.co.id', role: 'Operations Manager', departmentId: 'dept-it', title: 'IT Service Desk Manager', availability: 'Available', active: true, avatarTone: 'indigo' },
  { id: 'usr-04', name: 'Rizky Hidayat', email: 'rizky.hidayat@nusantararetail.co.id', role: 'Staff', departmentId: 'dept-it', title: 'Service Desk Engineer', availability: 'Available', active: true, avatarTone: 'teal' },
  { id: 'usr-05', name: 'Nadia Kusuma', email: 'nadia.kusuma@nusantararetail.co.id', role: 'Staff', departmentId: 'dept-it', title: 'Systems Analyst', availability: 'Busy', active: true, avatarTone: 'violet' },
  { id: 'usr-06', name: 'Bayu Santoso', email: 'bayu.santoso@nusantararetail.co.id', role: 'Staff', departmentId: 'dept-it', title: 'Infrastructure Engineer', availability: 'Away', active: true, avatarTone: 'amber' },
  { id: 'usr-07', name: 'Maya Lestari', email: 'maya.lestari@nusantararetail.co.id', role: 'Operations Manager', departmentId: 'dept-hr', title: 'HR Operations Manager', availability: 'Available', active: true, avatarTone: 'rose' },
  { id: 'usr-08', name: 'Andi Wijaya', email: 'andi.wijaya@nusantararetail.co.id', role: 'Staff', departmentId: 'dept-hr', title: 'People Operations Officer', availability: 'Available', active: true, avatarTone: 'cyan' },
  { id: 'usr-09', name: 'Fajar Nugroho', email: 'fajar.nugroho@nusantararetail.co.id', role: 'Operations Manager', departmentId: 'dept-fin', title: 'Finance Reporting Manager', availability: 'Busy', active: true, avatarTone: 'blue' },
  { id: 'usr-10', name: 'Rina Marlina', email: 'rina.marlina@nusantararetail.co.id', role: 'Staff', departmentId: 'dept-fin', title: 'Reporting Analyst', availability: 'Available', active: true, avatarTone: 'emerald' },
  { id: 'usr-11', name: 'Dimas Anggara', email: 'dimas.anggara@nusantararetail.co.id', role: 'Staff', departmentId: 'dept-ops', title: 'Process Analyst', availability: 'Available', active: true, avatarTone: 'indigo' },
  { id: 'usr-12', name: 'Putri Handayani', email: 'putri.handayani@nusantararetail.co.id', role: 'Staff', departmentId: 'dept-ops', title: 'Operations Coordinator', availability: 'Busy', active: true, avatarTone: 'teal' },
  { id: 'usr-13', name: 'Dewi Anggraini', email: 'dewi.anggraini@nusantararetail.co.id', role: 'Operations Manager', departmentId: 'dept-cx', title: 'CX Operations Manager', availability: 'Available', active: true, avatarTone: 'violet' },
  { id: 'usr-14', name: 'Yoga Pratama', email: 'yoga.pratama@nusantararetail.co.id', role: 'Staff', departmentId: 'dept-cx', title: 'Quality Assurance Officer', availability: 'Available', active: true, avatarTone: 'amber' },
  { id: 'usr-15', name: 'Intan Permata', email: 'intan.permata@nusantararetail.co.id', role: 'Staff', departmentId: 'dept-fin', title: 'Procurement Officer', availability: 'Away', active: true, avatarTone: 'rose' },
] as unknown as User[])).map((u, i) => ({ ...u, avatarTone: tone[i % tone.length] }));

/* ------------------------------------------------------------------ SLA configuration */

const SLA: Record<TaskCategory, [number, number, number, number]> = {
  'IT Support': [4, 8, 24, 48],
  'System Access Request': [4, 8, 24, 48],
  'Hardware Request': [8, 24, 48, 72],
  'Software Installation': [8, 24, 48, 72],
  'Data Update': [4, 12, 24, 48],
  'Administrative Request': [8, 24, 48, 72],
  'Reporting Request': [8, 24, 48, 96],
  'Project Support': [24, 48, 96, 120],
  'General Operations': [8, 24, 48, 72],
};

const slaConfigs: SlaConfiguration[] = CATEGORIES.map((category, i) => ({
  id: `sla-${i + 1}`,
  category,
  criticalHours: SLA[category][0],
  highHours: SLA[category][1],
  mediumHours: SLA[category][2],
  lowHours: SLA[category][3],
  reminderThresholdPct: 75,
  escalationThresholdPct: 100,
  autoEscalate: true,
}));

/**
 * Default inputs for the automation ROI calculator.
 *
 * Volume and handling time are taken from the baseline portfolio rather than chosen
 * freely: 1,870 transactions a month at the volume-weighted 32.4 → 7.5 minutes,
 * rounded to whole minutes so the calculator is editable in the UI. Keeping a single
 * source means the "Reset defaults" button cannot restore numbers the rest of the
 * report would contradict.
 */
export const ROI_DEFAULTS: RoiInputs = {
  monthlyTransactions: 1870,
  manualMinutes: 32,
  automatedMinutes: 7,
  hourlyCostIdr: 145_000,
  implementationCostIdr: 185_000_000,
  monthlyMaintenanceCostIdr: 12_500_000,
};

export const slaHoursFor = (category: TaskCategory, priority: Priority, configs = slaConfigs) =>
  slaHoursForConfig(configs, category, priority);

/* ------------------------------------------------------------------ task titles */

const TITLES: Record<TaskCategory, string[]> = {
  'IT Support': [
    'VPN connection drops for finance team',
    'Printer on 4th floor not responding',
    'Outlook calendar not syncing after update',
    'Shared drive access error for Jakarta office',
    'Laptop slow after Windows update',
    'Teams call audio issue in meeting room 3B',
    'Email delivery delay to external vendors',
    'POS terminal network timeout at store 12',
    'Wi-Fi unstable in warehouse zone B',
    'Password reset failed for regional manager',
  ],
  'System Access Request': [
    'Access to ERP procurement module',
    'Salesforce profile for new account executive',
    'Read-only access to finance dashboard',
    'VPN account for remote contractor',
    'Shared mailbox delegation request',
    'Admin rights for HRIS reporting module',
    'Access removal for offboarded employee',
    'GitHub repository access for data team',
    'Warehouse management system role update',
  ],
  'Hardware Request': [
    'Replacement laptop for design team',
    'Additional monitor for reporting analyst',
    'Barcode scanner replacement at store 08',
    'Docking station request for hot-desk area',
    'Headset for call centre onboarding',
    'Mobile device for field supervisor',
    'Spare keyboard and mouse set',
  ],
  'Software Installation': [
    'Install Power BI Desktop on analyst laptop',
    'Licence activation for Adobe Acrobat Pro',
    'Install Python environment for data team',
    'Deploy antivirus update to retail PCs',
    'Install SAP GUI for new finance hire',
    'Configure Zoom Rooms client in HQ',
  ],
  'Data Update': [
    'Correct duplicated vendor records in ERP',
    'Update customer master data for Q4',
    'Fix pricing table mismatch in POS system',
    'Bulk update employee cost centre codes',
    'Correct tax code mapping in invoice module',
    'Update product catalogue descriptions',
  ],
  'Administrative Request': [
    'Employment letter for visa application',
    'Reimbursement approval for client visit',
    'Update employee contract addendum',
    'Meeting room booking for board review',
    'Stationery restock for HQ floor 5',
    'Travel arrangement for regional audit',
  ],
  'Reporting Request': [
    'Monthly sales performance pack',
    'Weekly operational dashboard refresh',
    'Stock ageing report for warehouse',
    'Cost variance analysis for Q3',
    'Headcount movement report',
    'Customer complaint trend report',
  ],
  'Project Support': [
    'UAT coordination for ERP rollout',
    'Documentation update for SOP v3',
    'Stakeholder deck for automation roadmap',
    'Data migration rehearsal support',
    'Change request review for store launch',
  ],
  'General Operations': [
    'Badge access programming for new hires',
    'Fire drill coordination for HQ',
    'Courier booking for legal documents',
    'Visitor pass renewal for vendor',
    'Parking allocation review',
  ],
};

const REQUESTERS = [
  ['Hendra Gunawan', 'hendra.gunawan@nusantararetail.co.id'],
  ['Lina Halim', 'lina.halim@nusantararetail.co.id'],
  ['Rudi Hartono', 'rudi.hartono@nusantararetail.co.id'],
  ['Clara Wijaya', 'clara.wijaya@nusantararetail.co.id'],
  ['Agus Salim', 'agus.salim@nusantararetail.co.id'],
  ['Mega Puspita', 'mega.puspita@nusantararetail.co.id'],
  ['Yusuf Maulana', 'yusuf.maulana@nusantararetail.co.id'],
  ['Eka Saputra', 'eka.saputra@nusantararetail.co.id'],
  ['Nur Aini', 'nur.aini@nusantararetail.co.id'],
  ['Reza Fadillah', 'reza.fadillah@nusantararetail.co.id'],
];

const SOURCE_POOL: RequestSource[] = ['Email', 'Google Form', 'Teams', 'Portal', 'Portal', 'Phone', 'Walk-in', 'API'];
const PRIORITY_POOL: Priority[] = ['Critical', 'High', 'High', 'Medium', 'Medium', 'Medium', 'Low', 'Low'];
const CATEGORY_WEIGHTS: TaskCategory[] = [
  'IT Support', 'IT Support', 'IT Support', 'IT Support', 'IT Support',
  'System Access Request', 'System Access Request', 'System Access Request',
  'Hardware Request', 'Hardware Request',
  'Software Installation', 'Software Installation',
  'Data Update', 'Data Update',
  'Administrative Request', 'Administrative Request',
  'Reporting Request', 'Reporting Request',
  'Project Support',
  'General Operations',
];

const staffByDept = (deptId: string) =>
  users.filter((u) => u.departmentId === deptId && u.role === 'Staff' && u.active);

const pickAssignee = (deptId: string) => {
  const pool = staffByDept(deptId);
  if (!pool.length) return null;
  return pick(pool).id;
};

/* ------------------------------------------------------------------ tasks */

function makeTask(index: number, category: TaskCategory, createdDaysAgo: number, statusPlan: TaskStatus): Task {
  const priority = pick(PRIORITY_POOL);
  const departmentId = CATEGORY_DEPARTMENT[category];
  // Newer days get intraday timestamps; older days are pinned near the end of that day
  // so the SLA clock has genuinely elapsed.
  const createdMs =
    createdDaysAgo === 0
      ? NOW - rint(1, 9) * HOUR
      : +startOfDay(new Date(NOW - createdDaysAgo * 24 * HOUR)) + (15 + rint(0, 8)) * HOUR;
  const createdAt = new Date(createdMs).toISOString();
  const sla = slaHoursFor(category, priority);
  const deadline = new Date(createdMs + sla * HOUR).toISOString();
  const [reqName, reqEmail] = pick(REQUESTERS);
  const assigneeId = pickAssignee(departmentId);
  const title = `${pick(TITLES[category])}`;
  const elapsedHours = (NOW - createdMs) / HOUR;
  const breached = elapsedHours > sla;

  let status: TaskStatus = statusPlan;
  // An open item whose SLA window has elapsed is overdue — full stop. This used to
  // depend on a coin flip, which produced records flagged Overdue with a deadline
  // still in the future (a state the escalation BOT can never create).
  if (statusPlan !== 'Completed' && statusPlan !== 'Rejected' && breached) status = 'Overdue';

  let completedAt: string | null = null;
  if (status === 'Completed') {
    // Mix of on-time and late completions so SLA compliance is a real measurement
    // rather than a fixed 100%. Late work resolves past the deadline.
    const late = chance(0.07);
    const resolutionHours = late
      ? sla * (1.02 + rng() * 0.5)
      : Math.max(0.4, sla * (0.25 + rng() * 0.7));
    const cAt = Math.min(createdMs + resolutionHours * HOUR, NOW - rint(1, 30) * 60000);
    completedAt = new Date(Math.max(createdMs + 0.25 * HOUR, cAt)).toISOString();
  }

  // Only records that would actually pass validation may claim to be Validated.
  const passesValidation =
    title.trim().length >= 8 && sla > 0 && Boolean(reqEmail && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(reqEmail));
  const automationStatus: Task['automationStatus'] =
    status === 'Pending Validation'
      ? passesValidation
        ? chance(0.55)
          ? 'Validated'
          : 'Needs Review'
        : 'Needs Review'
      : status === 'Rejected'
        ? 'Needs Review'
        : passesValidation && chance(0.16)
          ? 'Validated'
          : 'Not Processed';

  const history: Task['history'] = [
    {
      id: `h-${index}-1`,
      at: createdAt,
      actor: reqName,
      action: 'Request submitted',
      to: `${pick(SOURCE_POOL)} intake`,
    },
  ];
  if (assigneeId && status !== 'New' && status !== 'Pending Validation') {
    // History must fall between submission and completion — a closed record cannot
    // contain an event that happened after it was closed.
    const closedAt = completedAt ? +new Date(completedAt) : NOW;
    const t1 = Math.min(createdMs + rint(1, 6) * 60000, closedAt - 2000);
    const t2 = Math.min(createdMs + rint(7, 20) * 60000, closedAt - 1000);
    history.push({
      id: `h-${index}-2`,
      at: new Date(Math.max(createdMs, t1)).toISOString(),
      actor: 'Data Validation BOT',
      action: 'Data validation passed',
      to: 'Validated',
    });
    history.push({
      id: `h-${index}-3`,
      at: new Date(Math.max(createdMs, t2)).toISOString(),
      actor: 'Smart Assignment BOT',
      action: 'Auto-assigned to department queue',
      to: departments.find((d) => d.id === departmentId)?.name ?? departmentId,
    });
  }
  if (completedAt) {
    history.push({
      id: `h-${index}-4`,
      at: completedAt,
      actor: users.find((u) => u.id === assigneeId)?.name ?? 'Assignee',
      action: 'Task completed',
      from: 'In Progress',
      to: 'Completed',
    });
  }

  const comments =
    chance(0.45)
      ? [
          {
            id: `c-${index}-1`,
            authorId: assigneeId ?? users[0].id,
            body: pick([
              'Investigating the request — will update the requester once root cause is confirmed.',
              'Waiting for confirmation from the requester on the exact asset tag.',
              'Already handled via the standard checklist, verifying with the user now.',
              'Escalated to the infrastructure queue for a deeper check.',
              'Documented the workaround in the knowledge base.',
            ]),
            createdAt: new Date(Math.min(createdMs + rint(1, 8) * HOUR, NOW - 30000)).toISOString(),
          },
        ]
      : [];

  return {
    id: `tsk-${String(index).padStart(4, '0')}`,
    code: `OPS-${2600 + index}`,
    title,
    description: `${title}. Submitted through the intake channel and routed to ${
      departments.find((d) => d.id === departmentId)?.name
    }. Standard operating procedure applies; requester expects confirmation once resolved.`,
    departmentId,
    category,
    priority,
    source: pick(SOURCE_POOL),
    requesterName: reqName,
    requesterEmail: reqEmail,
    assigneeId: status === 'New' || status === 'Pending Validation' ? null : assigneeId,
    createdAt,
    deadline,
    slaHours: sla,
    status,
    completedAt,
    automationStatus,
    tags: chance(0.3) ? [pick(['repeat-request', 'vip', 'store-ops', 'month-end', 'compliance'])] : [],
    workflowId: workflowIdForCategory({ workflows }, category),
    workflowStageIndex: status === 'Completed' ? 5 : status === 'Waiting Approval' ? 4 : 3,
    duplicateOf: null,
    escalated: status === 'Overdue' && chance(0.7),
    reminderSentAt:
      status !== 'Completed' && slaConsumedPctSeed(createdMs, deadline) >= 75
        ? new Date(Math.min(createdMs + sla * 0.78 * HOUR, NOW - 60000)).toISOString()
        : null,
    comments,
    history,
  };
}

function slaConsumedPctSeed(createdMs: number, deadlineIso: string) {
  const total = +new Date(deadlineIso) - createdMs;
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, ((NOW - createdMs) / total) * 100));
}

/** Requests the seed says were auto-handled; buildExecutions() backs them with real records. */
const SEEDED_INTAKE: Task[] = [];

function buildTasks(): Task[] {
  const tasks: Task[] = [];
  let i = 1;

  // 45 days of history. Volume is heavier in the last two weeks, which is what a
  // healthy ops queue looks like when automation is doing its job.
  for (let d = 44; d >= 0; d--) {
    const volume = d <= 13 ? rint(2, 4) : d <= 29 ? rint(1, 3) : rint(1, 2);
    for (let n = 0; n < volume; n++) {
      const category = pick(CATEGORY_WEIGHTS);
      const roll = rng();
      let planned: TaskStatus;
      if (d > 10) planned = roll < 0.9 ? 'Completed' : roll < 0.95 ? 'Rejected' : 'Completed';
      else if (roll < 0.38) planned = 'Completed';
      else if (roll < 0.52) planned = 'In Progress';
      else if (roll < 0.63) planned = 'Assigned';
      else if (roll < 0.72) planned = 'Waiting Approval';
      else if (roll < 0.82) planned = 'Pending Validation';
      else if (roll < 0.9) planned = 'New';
      else if (roll < 0.95) planned = 'Rejected';
      else planned = 'Completed';
      // Older open work is the exception, not the rule — closed items are the norm,
      // so a healthy queue shows a modest backlog rather than a graveyard.
      if (d > 2 && planned !== 'Completed' && planned !== 'Rejected' && !chance(0.16)) planned = 'Completed';
      tasks.push(makeTask(i, category, d, planned));
      i += 1;
    }
  }

  // Curated open work so every status and urgency bucket is represented.
  const curated: { cat: TaskCategory; hoursAgo: number; status: TaskStatus; priority: Priority }[] = [
    { cat: 'IT Support', hoursAgo: 3, status: 'In Progress', priority: 'Critical' },
    { cat: 'System Access Request', hoursAgo: 18, status: 'Pending Validation', priority: 'High' },
    { cat: 'Hardware Request', hoursAgo: 26, status: 'Waiting Approval', priority: 'Medium' },
    { cat: 'Reporting Request', hoursAgo: 22, status: 'Assigned', priority: 'High' },
    { cat: 'IT Support', hoursAgo: 6, status: 'In Progress', priority: 'High' },
    { cat: 'Software Installation', hoursAgo: 30, status: 'New', priority: 'Low' },
    { cat: 'Data Update', hoursAgo: 34, status: 'In Progress', priority: 'Medium' },
    { cat: 'IT Support', hoursAgo: 9, status: 'Assigned', priority: 'Critical' },
    { cat: 'Administrative Request', hoursAgo: 40, status: 'Pending Validation', priority: 'Medium' },
    { cat: 'Project Support', hoursAgo: 11, status: 'In Progress', priority: 'High' },
  ];

  for (const c of curated) {
    const t = makeTask(i, c.cat, 0, c.status);
    const createdMs = Date.now() - c.hoursAgo * HOUR;
    const sla = slaHoursFor(c.cat, c.priority);
    t.priority = c.priority;
    t.createdAt = new Date(createdMs).toISOString();
    t.deadline = new Date(createdMs + sla * HOUR).toISOString();
    t.slaHours = sla;
    t.status = c.status;
    t.assigneeId = c.status === 'New' || c.status === 'Pending Validation' ? null : pickAssignee(t.departmentId);
    t.completedAt = null;
    t.reminderSentAt = slaConsumedPctSeed(createdMs, t.deadline) >= 75 ? new Date(createdMs + sla * 0.8 * HOUR).toISOString() : null;
    tasks.push(reconcileTask(t));
    i += 1;
  }

  // A handful of genuinely-breached, low-priority requests so the escalation BOT
  // has real work without making the queue look abandoned.
  const breached: { cat: TaskCategory; hoursAgo: number; priority: Priority }[] = [
    { cat: 'IT Support', hoursAgo: 36, priority: 'Low' },
    { cat: 'General Operations', hoursAgo: 30, priority: 'Low' },
    { cat: 'Data Update', hoursAgo: 40, priority: 'Medium' },
    { cat: 'Reporting Request', hoursAgo: 60, priority: 'Low' },
  ];
  for (const b of breached) {
    const t = makeTask(i, b.cat, 0, 'Assigned');
    const createdMs = Date.now() - b.hoursAgo * HOUR;
    const sla = slaHoursFor(b.cat, b.priority);
    t.priority = b.priority;
    t.createdAt = new Date(createdMs).toISOString();
    t.deadline = new Date(createdMs + sla * HOUR).toISOString();
    t.slaHours = sla;
    t.status = 'Overdue';
    t.escalated = true;
    t.assigneeId = pickAssignee(t.departmentId);
    t.completedAt = null;
    tasks.push(reconcileTask(t));
    i += 1;
  }

  // Requests that were auto-handled must be able to point at the execution that
  // handled them — otherwise the UI shows "Auto-Assigned" with no automation
  // record behind it, which is exactly the kind of decorative claim this demo
  // promises not to make. The intake executions themselves are generated in
  // buildExecutions(), which reads this list.
  tasks
    .filter((t) => t.automationStatus === 'Not Processed' && t.assigneeId && t.createdAt)
    .slice(0, Math.round(tasks.length * 0.72))
    .forEach((t) => {
      t.automationStatus = 'Auto-Assigned';
    });

  // Every record claiming an automated verdict — whether it passed validation in
  // makeTask() or was auto-assigned above — must be covered by an execution record.
  tasks
    .filter((t) => t.automationStatus === 'Validated' || t.automationStatus === 'Auto-Assigned')
    .forEach((t) => SEEDED_INTAKE.push(t));

  return tasks.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

/* Tasks are materialised after the workflow definitions, because each request
   resolves its governing workflow by category. */

/* ------------------------------------------------------------------ automations */

const automations: AutomationRule[] = [
  {
    id: 'bot-01',
    name: 'Smart Task Assignment BOT',
    botKey: 'smart_assignment',
    description:
      'Reads the request category, resolves the owning department and routes the task to the least-loaded available staff member.',
    trigger: 'task.created',
    triggerLabel: 'When a new request is submitted',
    conditions: [{ id: 'c1', field: 'status', operator: 'equals', value: 'New' }],
    actions: [
      { id: 'a1', type: 'assign_department', params: { strategy: 'category-map' } },
      { id: 'a2', type: 'assign_user', params: { strategy: 'lowest-load' } },
      { id: 'a3', type: 'notify_assignee', params: { template: 'assignment' } },
      { id: 'a4', type: 'log_activity', params: {} },
    ],
    enabled: true,
    frequency: 'n/a',
    category: 'Assignment',
    lastRunAt: null,
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    recordsProcessed: 0,
    minutesSavedPerRecord: 6,
    builtIn: true,
  },
  {
    id: 'bot-02',
    name: 'Data Validation BOT',
    botKey: 'data_validation',
    description:
      'Checks mandatory fields, validates contact formats and detects duplicate submissions before a request reaches the department queue.',
    trigger: 'task.created',
    triggerLabel: 'When a new request is created or updated',
    conditions: [],
    actions: [
      { id: 'a1', type: 'flag_review', params: {} },
      { id: 'a2', type: 'log_activity', params: {} },
    ],
    enabled: true,
    frequency: 'n/a',
    category: 'Validation',
    lastRunAt: null,
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    recordsProcessed: 0,
    minutesSavedPerRecord: 4,
    builtIn: true,
  },
  {
    id: 'bot-03',
    name: 'Deadline Reminder BOT',
    botKey: 'deadline_reminder',
    description:
      'Scans open tasks that have consumed their configured SLA threshold and raises in-app reminders to the assignee and their manager.',
    trigger: 'sla.approaching',
    triggerLabel: 'When a task approaches its SLA deadline',
    conditions: [{ id: 'c1', field: 'hoursToDeadline', operator: 'less_than', value: '8' }],
    actions: [
      { id: 'a1', type: 'notify_assignee', params: { template: 'reminder' } },
      { id: 'a2', type: 'log_activity', params: {} },
    ],
    enabled: true,
    frequency: 'daily',
    threshold: 75,
    category: 'Notification',
    lastRunAt: null,
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    recordsProcessed: 0,
    minutesSavedPerRecord: 3,
    builtIn: true,
  },
  {
    id: 'bot-04',
    name: 'SLA Escalation BOT',
    botKey: 'sla_escalation',
    description:
      'Marks breached tasks as Overdue, notifies the operations manager and writes an audit record for each escalation.',
    trigger: 'sla.breached',
    triggerLabel: 'When a task exceeds its SLA',
    conditions: [{ id: 'c1', field: 'hoursToDeadline', operator: 'less_than', value: '0' }],
    actions: [
      { id: 'a1', type: 'set_status', params: { status: 'Overdue' } },
      { id: 'a2', type: 'escalate', params: {} },
      { id: 'a3', type: 'notify_role', params: { role: 'Operations Manager' } },
      { id: 'a4', type: 'log_activity', params: {} },
    ],
    enabled: true,
    frequency: 'daily',
    threshold: 0,
    category: 'Escalation',
    lastRunAt: null,
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    recordsProcessed: 0,
    minutesSavedPerRecord: 5,
    builtIn: true,
  },
  {
    id: 'bot-05',
    name: 'Automated Reporting BOT',
    botKey: 'auto_reporting',
    description:
      'Compiles task, SLA and automation statistics into a distributable operational report on a daily or weekly schedule.',
    trigger: 'schedule.daily',
    triggerLabel: 'Scheduled daily (simulated) or on demand',
    conditions: [],
    actions: [
      { id: 'a1', type: 'generate_report', params: { type: 'Daily Operations' } },
      { id: 'a2', type: 'log_activity', params: {} },
    ],
    enabled: true,
    frequency: 'daily',
    category: 'Reporting',
    lastRunAt: null,
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    recordsProcessed: 0,
    minutesSavedPerRecord: 45,
    builtIn: true,
  },
  {
    id: 'bot-06',
    name: 'Duplicate Detection BOT',
    botKey: 'duplicate_detection',
    description:
      'Compares new requests against open records by title similarity, requester and category to prevent duplicate submissions.',
    trigger: 'task.created',
    triggerLabel: 'When a new request enters the system',
    conditions: [{ id: 'c1', field: 'titleSimilarity', operator: 'greater_than', value: '0.6' }],
    actions: [
      { id: 'a1', type: 'flag_duplicate', params: {} },
      { id: 'a2', type: 'notify_role', params: { role: 'Administrator' } },
      { id: 'a3', type: 'log_activity', params: {} },
    ],
    enabled: false,
    frequency: 'n/a',
    threshold: 60,
    category: 'Data Quality',
    lastRunAt: null,
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    recordsProcessed: 0,
    minutesSavedPerRecord: 4,
    builtIn: true,
  },
];

/* ------------------------------------------------------------------ workflow */

const workflows: Workflow[] = [
  {
    id: 'wf-default',
    name: 'Standard Operational Request Process',
    description:
      'Default intake-to-completion process used by every request category. BOTs handle validation and assignment; supervisors approve before closure.',
    category: 'All',
    active: true,
    createdAt: daysAgo(120),
    stages: [
      { id: 'st-1', name: 'Request Submitted', description: 'Requester submits via portal, form or email.', owner: 'Human', departmentId: null, requiresApproval: false, slaHours: 1 },
      { id: 'st-2', name: 'Data Validation', description: 'Mandatory fields, formats and duplicates are validated.', owner: 'BOT', departmentId: null, requiresApproval: false, slaHours: 2, botKey: 'data_validation' },
      { id: 'st-3', name: 'Department Assignment', description: 'Smart routing selects the owning department and PIC.', owner: 'BOT', departmentId: null, requiresApproval: false, slaHours: 2, botKey: 'smart_assignment' },
      { id: 'st-4', name: 'Task Execution', description: 'Assignee performs the operational work.', owner: 'Human', departmentId: 'dept-it', requiresApproval: false, slaHours: 24 },
      { id: 'st-5', name: 'Supervisor Review', description: 'Department supervisor confirms quality before closure.', owner: 'Manager', departmentId: 'dept-it', requiresApproval: true, slaHours: 8 },
      { id: 'st-6', name: 'Completed', description: 'Task closed, SLA outcome recorded, requester notified.', owner: 'BOT', departmentId: null, requiresApproval: false, slaHours: 1 },
    ],
    executions: [],
  },
  {
    id: 'wf-access',
    name: 'Access Provisioning Workflow',
    description: 'Identity verification, manager approval and provisioning for system access requests.',
    category: 'System Access Request',
    active: true,
    createdAt: daysAgo(96),
    stages: [
      { id: 'st-1', name: 'Request Submitted', description: 'Access request captured with justification.', owner: 'Human', departmentId: null, requiresApproval: false, slaHours: 1 },
      { id: 'st-2', name: 'Identity Verification', description: 'BOT validates employee ID against HRIS.', owner: 'BOT', departmentId: null, requiresApproval: false, slaHours: 2, botKey: 'data_validation' },
      { id: 'st-3', name: 'Manager Approval', description: 'Line manager approves the access level.', owner: 'Manager', departmentId: null, requiresApproval: true, slaHours: 8 },
      { id: 'st-4', name: 'Provisioning', description: 'IT provisions the account and entitlements.', owner: 'Human', departmentId: 'dept-it', requiresApproval: false, slaHours: 8 },
      { id: 'st-5', name: 'Completed', description: 'Access granted and confirmed to requester.', owner: 'BOT', departmentId: null, requiresApproval: false, slaHours: 1 },
    ],
    executions: [],
  },
  {
    id: 'wf-hardware',
    name: 'Hardware Fulfilment Workflow',
    description: 'Availability check, budget approval and asset handover for hardware requests.',
    category: 'Hardware Request',
    active: true,
    createdAt: daysAgo(84),
    stages: [
      { id: 'st-1', name: 'Request Submitted', description: 'Hardware need captured with justification.', owner: 'Human', departmentId: null, requiresApproval: false, slaHours: 1 },
      { id: 'st-2', name: 'Stock Availability Check', description: 'BOT verifies asset inventory.', owner: 'BOT', departmentId: 'dept-it', requiresApproval: false, slaHours: 4, botKey: 'data_validation' },
      { id: 'st-3', name: 'Budget Approval', description: 'Finance manager approves spend.', owner: 'Manager', departmentId: 'dept-fin', requiresApproval: true, slaHours: 24 },
      { id: 'st-4', name: 'Asset Handover', description: 'Asset issued and tagged to employee.', owner: 'Human', departmentId: 'dept-it', requiresApproval: false, slaHours: 24 },
      { id: 'st-5', name: 'Completed', description: 'Handover acknowledged.', owner: 'BOT', departmentId: null, requiresApproval: false, slaHours: 1 },
    ],
    executions: [],
  },
  {
    id: 'wf-reporting',
    name: 'Monthly Reporting Cycle',
    description: 'Data extraction, validation and distribution of the monthly management report.',
    category: 'Reporting Request',
    active: true,
    createdAt: daysAgo(60),
    stages: [
      { id: 'st-1', name: 'Data Extraction', description: 'BOT pulls source data from ERP and CRM exports.', owner: 'BOT', departmentId: 'dept-fin', requiresApproval: false, slaHours: 4, botKey: 'auto_reporting' },
      { id: 'st-2', name: 'Data Validation', description: 'Figures reconciled against control totals.', owner: 'BOT', departmentId: 'dept-fin', requiresApproval: false, slaHours: 4, botKey: 'data_validation' },
      { id: 'st-3', name: 'Analyst Review', description: 'Analyst comments on variances.', owner: 'Human', departmentId: 'dept-fin', requiresApproval: false, slaHours: 24 },
      { id: 'st-4', name: 'Manager Sign-off', description: 'Finance manager signs off the pack.', owner: 'Manager', departmentId: 'dept-fin', requiresApproval: true, slaHours: 24 },
      { id: 'st-5', name: 'Distribution', description: 'Report distributed to stakeholders.', owner: 'BOT', departmentId: null, requiresApproval: false, slaHours: 2 },
    ],
    executions: [],
  },
  {
    id: 'wf-onboarding',
    name: 'Employee Onboarding Workflow',
    description: 'Cross-department onboarding covering HR paperwork, IT provisioning and facilities.',
    category: 'Administrative Request',
    active: false,
    createdAt: daysAgo(40),
    stages: [
      { id: 'st-1', name: 'Onboarding Request', description: 'HR raises the onboarding case.', owner: 'Human', departmentId: 'dept-hr', requiresApproval: false, slaHours: 2 },
      { id: 'st-2', name: 'Document Checklist', description: 'BOT validates completeness of documents.', owner: 'BOT', departmentId: 'dept-hr', requiresApproval: false, slaHours: 4, botKey: 'data_validation' },
      { id: 'st-3', name: 'IT Provisioning', description: 'Accounts and devices prepared.', owner: 'Human', departmentId: 'dept-it', requiresApproval: false, slaHours: 16 },
      { id: 'st-4', name: 'Facilities Setup', description: 'Desk, badge and access configured.', owner: 'Human', departmentId: 'dept-ops', requiresApproval: false, slaHours: 16 },
      { id: 'st-5', name: 'Day-1 Confirmation', description: 'Manager confirms readiness.', owner: 'Manager', departmentId: null, requiresApproval: true, slaHours: 8 },
    ],
    executions: [],
  },
];

/* ------------------------------------------------------------------ baselines */

const baselines: ProcessBaseline[] = [
  { id: 'base-01', process: 'IT Service Desk Ticket Triage', category: 'IT Support', departmentId: 'dept-it', monthlyVolume: 620, manualMinutes: 15, automatedMinutes: 2, manualSteps: 7, automatedSteps: 2, manualErrorRatePct: 8.4, automatedErrorRatePct: 1.2, automationCoveragePct: 92, hourlyCostIdr: 145000, botId: 'bot-01' },
  { id: 'base-02', process: 'System Access Provisioning', category: 'System Access Request', departmentId: 'dept-it', monthlyVolume: 280, manualMinutes: 42, automatedMinutes: 12, manualSteps: 11, automatedSteps: 4, manualErrorRatePct: 11.2, automatedErrorRatePct: 2.5, automationCoveragePct: 78, hourlyCostIdr: 165000, botId: 'bot-02' },
  { id: 'base-03', process: 'Hardware Request Fulfilment', category: 'Hardware Request', departmentId: 'dept-it', monthlyVolume: 145, manualMinutes: 55, automatedMinutes: 18, manualSteps: 12, automatedSteps: 5, manualErrorRatePct: 9.6, automatedErrorRatePct: 3.1, automationCoveragePct: 64, hourlyCostIdr: 145000, botId: 'bot-01' },
  { id: 'base-04', process: 'Master Data Correction', category: 'Data Update', departmentId: 'dept-ops', monthlyVolume: 210, manualMinutes: 25, automatedMinutes: 4, manualSteps: 8, automatedSteps: 2, manualErrorRatePct: 14.5, automatedErrorRatePct: 2.8, automationCoveragePct: 85, hourlyCostIdr: 135000, botId: 'bot-02' },
  { id: 'base-05', process: 'HR Administrative Letters', category: 'Administrative Request', departmentId: 'dept-hr', monthlyVolume: 180, manualMinutes: 30, automatedMinutes: 9, manualSteps: 9, automatedSteps: 3, manualErrorRatePct: 6.8, automatedErrorRatePct: 1.9, automationCoveragePct: 58, hourlyCostIdr: 125000, botId: 'bot-01' },
  { id: 'base-06', process: 'Monthly Management Reporting', category: 'Reporting Request', departmentId: 'dept-fin', monthlyVolume: 45, manualMinutes: 240, automatedMinutes: 35, manualSteps: 18, automatedSteps: 5, manualErrorRatePct: 12.7, automatedErrorRatePct: 2.2, automationCoveragePct: 88, hourlyCostIdr: 185000, botId: 'bot-05' },
  { id: 'base-07', process: 'Project Status Consolidation', category: 'Project Support', departmentId: 'dept-ops', monthlyVolume: 70, manualMinutes: 90, automatedMinutes: 25, manualSteps: 13, automatedSteps: 5, manualErrorRatePct: 10.1, automatedErrorRatePct: 3.4, automationCoveragePct: 55, hourlyCostIdr: 155000, botId: 'bot-05' },
  { id: 'base-08', process: 'Customer Complaint Logging', category: 'General Operations', departmentId: 'dept-cx', monthlyVolume: 320, manualMinutes: 12, automatedMinutes: 3, manualSteps: 6, automatedSteps: 2, manualErrorRatePct: 7.3, automatedErrorRatePct: 1.6, automationCoveragePct: 74, hourlyCostIdr: 115000, botId: 'bot-01' },
];

const tasks = buildTasks();

/* ------------------------------------------------------------------ executions */

const BOT_BY_KEY = Object.fromEntries(automations.map((a) => [a.botKey, a]));

function buildExecutions() {
  const list: AutomationExecution[] = [];
  const openTasks = tasks.filter((t) => t.status !== 'Completed');
  const completedTasks = tasks.filter((t) => t.status === 'Completed');
  let n = 1;

  const push = (
    botKey: string,
    startedAt: string,
    status: AutomationExecution['status'],
    records: number,
    summary: string,
    affected: string[],
    metrics: AutomationExecution['metrics'],
    error?: string,
    mode: AutomationExecution['mode'] = 'Scheduled simulation',
  ) => {
    const rule = BOT_BY_KEY[botKey];
    // Duration must look like work: a per-record cost plus a fixed overhead. The
    // old rint(420, 3600) produced implausible pairs such as 3,206ms for a single
    // record while a 263-record report claimed 12ms.
    const durationMs = rint(180, 320) + rint(35, 90) * Math.max(1, records);
    list.push({
      id: `exe-${String(n).padStart(4, '0')}`,
      ruleId: rule.id,
      ruleName: rule.name,
      botKey,
      trigger: rule.trigger,
      mode,
      startedAt,
      endedAt: new Date(new Date(startedAt).getTime() + durationMs).toISOString(),
      durationMs,
      status,
      recordsProcessed: records,
      resultSummary: summary,
      error: error ?? null,
      affectedTaskIds: affected,
      metrics,
    });
    n += 1;
    rule.totalExecutions += 1;
    if (status === 'Success') rule.successfulExecutions += 1;
    if (status === 'Failed' || status === 'Partial') rule.failedExecutions += 1;
    rule.recordsProcessed += records;
    rule.lastRunAt = startedAt;
  };

  // Back the seeded automation statuses with real execution records. Every task the
  // seed claims was auto-handled appears in an intake execution for its own day, so
  // "Auto-Assigned"/"Validated" always has a corresponding audit record.
  const intakeByDay = new Map<string, Task[]>();
  SEEDED_INTAKE.forEach((t) => {
    const key = dayKey(t.createdAt);
    intakeByDay.set(key, [...(intakeByDay.get(key) ?? []), t]);
  });
  for (const [key, group] of intakeByDay) {
    const at = new Date(+new Date(`${key}T09:00:00.000Z`) + rint(0, 90) * 60000).toISOString();
    const validated = group.filter((t) => t.automationStatus === 'Validated');
    const autoAssigned = group.filter((t) => t.automationStatus === 'Auto-Assigned');
    if (validated.length) {
      push(
        'data_validation',
        at,
        'Success',
        validated.length,
        `${validated.length} request(s) passed mandatory-field, format and duplicate validation.`,
        validated.map((t) => t.id),
        { validated: validated.length, minutesSaved: validated.length * 4 },
      );
    }
    if (autoAssigned.length) {
      push(
        'smart_assignment',
        at,
        'Success',
        autoAssigned.length,
        `${autoAssigned.length} request(s) routed to the owning department and assigned to the least-loaded available PIC.`,
        autoAssigned.map((t) => t.id),
        { assigned: autoAssigned.length, notifications: autoAssigned.length, minutesSaved: autoAssigned.length * 6 },
      );
    }
  }

  // History over the last 14 days.
  for (let d = 13; d >= 0; d--) {
    const base = daysAgo(d, rint(1, 8));
    const dayTasks = tasks.filter((t) => dayKey(t.createdAt) === dayKey(base));
    const assigned = dayTasks.filter((t) => t.assigneeId);
    if (assigned.length) {
      push('smart_assignment', base, 'Success', assigned.length, `${assigned.length} request(s) routed to the owning department and assigned to an available PIC.`, assigned.map((t) => t.id), {
        assigned: assigned.length,
        notifications: assigned.length,
        minutesSaved: assigned.length * 6,
      });
    }
    if (dayTasks.length) {
      const flagged = dayTasks.filter((t) => t.automationStatus === 'Needs Review');
      push('data_validation', base, flagged.length ? 'Partial' : 'Success', dayTasks.length, flagged.length
        ? `${dayTasks.length - flagged.length} request(s) passed validation; ${flagged.length} flagged for manual review.`
        : `All ${dayTasks.length} request(s) passed mandatory-field and format validation.`, dayTasks.map((t) => t.id), {
        validated: dayTasks.length - flagged.length,
        flagged: flagged.length,
        minutesSaved: dayTasks.length * 4,
      });
    }
    if (d % 2 === 0) {
      const reminding = openTasks.filter((t) => {
        const hoursLeft = (new Date(t.deadline).getTime() - NOW) / HOUR;
        return hoursLeft > 0 && hoursLeft < 24 && dayKey(t.deadline) >= dayKey(base);
      }).slice(0, 6);
      push('deadline_reminder', daysAgo(d, 4), 'Success', reminding.length, `${reminding.length} task(s) within the reminder threshold received in-app reminders.`, reminding.map((t) => t.id), {
        reminded: reminding.length,
        notifications: reminding.length,
        minutesSaved: reminding.length * 3,
      });
    }
    if (d % 3 === 0) {
      // Only records whose deadline had actually passed by that day can appear in an
      // escalation history entry.
      const cut = +new Date(daysAgo(d, 0));
      const breached = tasks
        .filter((t) => +new Date(t.deadline) <= cut && t.status !== 'Completed' && t.status !== 'Rejected')
        .slice(0, 4);
      push('sla_escalation', daysAgo(d, 6), d === 9 ? 'Failed' : 'Success', breached.length, d === 9
        ? 'Escalation aborted — notification service returned an error while resolving the manager role.'
        : `${breached.length} breached task(s) escalated to the operations manager and marked Overdue.`, breached.map((t) => t.id), {
        escalated: breached.length,
        notifications: breached.length,
        minutesSaved: breached.length * 5,
      }, d === 9 ? 'NOTIFY_ROLE_RESOLVE_FAILED: no active Operations Manager found for dept-ops at execution time.' : undefined);
    }
    if (d % 5 === 0) {
      // Reporting saves a fixed block of analyst time per report run, not a
      // per-record amount — but it must be at least the per-record floor so the
      // rule's own minutesSavedPerRecord stays the honest lower bound.
      push('auto_reporting', daysAgo(d, 9), 'Success', completedTasks.length, `Daily operational report generated with ${completedTasks.length} completed task record(s) in scope.`, [], {
        minutesSaved: Math.max(45, completedTasks.length * 1),
      });
    }
  }
  // Duplicate detection was recently trialled then disabled.
  push('duplicate_detection', daysAgo(11, 3), 'Success', 12, '2 potential duplicate request(s) flagged for administrator review.', tasks.slice(0, 2).map((t) => t.id), {
    duplicates: 2,
    notifications: 2,
    minutesSaved: 12 * BOT_BY_KEY.duplicate_detection.minutesSavedPerRecord,
  });
  push('duplicate_detection', daysAgo(10, 5), 'Failed', 8, 'Duplicate scan aborted — title normalisation library unavailable.', [], {}, 'SIMILARITY_ENGINE_UNAVAILABLE');
  return list.sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt));
}

const executions = buildExecutions();

/* ------------------------------------------------------------------ workflow executions */

function buildWorkflowExecutions() {
  // Use the same resolver the runtime uses, so an instance can never live in a
  // different workflow than the task record that owns it.
  const recent = tasks.slice(0, 26);
  recent.forEach((t, i) => {
    const wf = workflows.find((w) => w.id === t.workflowId) ?? workflows[0];
    t.workflowId = wf.id;
    const startedAt = t.createdAt;
    const stageIdx = t.status === 'Completed' ? wf.stages.length - 1 : t.status === 'Waiting Approval' ? Math.min(wf.stages.length - 2, 3) : Math.min(2 + (i % 2), wf.stages.length - 2);
    const history = wf.stages.slice(0, stageIdx + 1).map((s, si) => ({
      stage: s.name,
      at: new Date(new Date(startedAt).getTime() + si * rint(20, 200) * 60000).toISOString(),
      by: s.owner === 'BOT' ? 'Automation Engine' : s.owner === 'Manager' ? 'Supervisor' : users.find((u) => u.id === t.assigneeId)?.name ?? 'Requester',
      outcome: s.owner === 'BOT' ? 'Passed automatically' : 'Completed',
    }));
    wf.executions.push({
      id: `wfx-${String(i + 1).padStart(3, '0')}`,
      workflowId: wf.id,
      taskId: t.id,
      taskCode: t.code,
      startedAt,
      completedAt: t.status === 'Completed' ? t.completedAt : null,
      currentStageIndex: stageIdx,
      // Overdue work is still running; only rejection counts as a failed instance.
      status: t.status === 'Completed' ? 'Completed' : t.status === 'Rejected' ? 'Failed' : t.status === 'Waiting Approval' ? 'Awaiting Approval' : 'Running',
      history,
    });
  });
  return workflows;
}

buildWorkflowExecutions();

/* ------------------------------------------------------------------ notifications */

/**
 * Notifications are NOT pre-baked. The previous version hand-wrote them, which
 * meant the same fact was recorded twice: once here and once by the BOT that ran
 * during boot, producing duplicate notices. They are now generated by the same
 * engine the user drives, so every entry has an execution record behind it.
 * `prepareInitialState()` prefixes this array with the engine's output.
 */
const notifications: AppNotification[] = [];

/* ------------------------------------------------------------------ activity */

const activity: ActivityLog[] = [];
{
  tasks.slice(0, 24).forEach((t, i) => {
    const u = users.find((x) => x.id === t.assigneeId);
    activity.push({
      id: `act-t${i}`,
      at: t.createdAt,
      type: 'task.created',
      actor: t.requesterName,
      message: `Created ${t.code} — “${t.title}” via ${t.source}`,
      taskId: t.id,
    });
    if (t.assigneeId) {
      activity.push({
        id: `act-a${i}`,
        at: new Date(new Date(t.createdAt).getTime() + rint(2, 25) * 60000).toISOString(),
        type: 'task.assigned',
        actor: 'Smart Task Assignment BOT',
        message: `Assigned ${t.code} to ${u?.name ?? 'unassigned'} (${t.category})`,
        taskId: t.id,
        ruleId: 'bot-01',
      });
    }
  });
  executions.slice(0, 10).forEach((e, i) => {
    activity.push({
      id: `act-e${i}`,
      at: e.startedAt,
      type: 'bot.execution',
      actor: 'Automation Engine',
      message: `${e.ruleName} run ${e.id} — ${e.status.toLowerCase()} · ${e.recordsProcessed} record(s) processed`,
      ruleId: e.ruleId,
    });
  });
  workflows[0].executions.slice(0, 5).forEach((w, i) => {
    if (w.status === 'Completed') {
      activity.push({
        id: `act-w${i}`,
        at: w.completedAt ?? w.startedAt,
        type: 'workflow.completed',
        actor: 'Workflow Engine',
        message: `Workflow instance ${w.id} completed for ${w.taskCode}`,
        workflowId: w.workflowId,
        taskId: w.taskId,
      });
    }
  });
  activity.push({
    id: 'act-s1',
    at: daysAgo(0, 2),
    type: 'sla.warning',
    actor: 'Deadline Reminder BOT',
    message: '6 tasks entered the SLA warning window (75% of resolve time consumed).',
    ruleId: 'bot-03',
  });
  activity.push({
    id: 'act-s2',
    at: daysAgo(0, 4),
    type: 'sla.escalation',
    actor: 'SLA Escalation BOT',
    message: '2 breached tasks escalated to the operations manager.',
    ruleId: 'bot-04',
  });
  activity.push({
    id: 'act-r1',
    at: daysAgo(0, 9),
    type: 'report.generated',
    actor: 'Automated Reporting BOT',
    message: 'Daily operations report generated (CSV + preview).',
    ruleId: 'bot-05',
  });
}

/* ------------------------------------------------------------------ reports */

const summaryFor = (from: number, to: number, departmentId: string) => {
  const scoped = tasks.filter((t) => {
    const c = +new Date(t.createdAt);
    return c >= from && c <= to && (departmentId === 'all' || t.departmentId === departmentId);
  });
  const completed = scoped.filter((t) => t.status === 'Completed');
  const overdue = scoped.filter((t) => t.status === 'Overdue');
  const onTime = completed.filter((t) => t.completedAt && +new Date(t.completedAt) <= +new Date(t.deadline));
  const automated = scoped.filter((t) => t.automationStatus === 'Auto-Assigned' || t.automationStatus === 'Validated');
  return {
    tasks: scoped.length,
    completed: completed.length,
    overdue: overdue.length,
    slaCompliance: completed.length ? Math.round((onTime.length / completed.length) * 1000) / 10 : 0,
    automationRate: scoped.length ? Math.round((automated.length / scoped.length) * 1000) / 10 : 0,
  };
};

const reports: ReportRecord[] = [
  {
    id: 'rpt-01',
    code: 'RPT-0142',
    type: 'Daily Operations',
    title: 'Daily Operations Report',
    periodFrom: startOfDay(daysAgo(1)).toISOString(),
    periodTo: startOfDay(daysAgo(0)).toISOString(),
    departmentId: 'all',
    generatedAt: daysAgo(0, 9),
    generatedBy: 'Automated Reporting BOT',
    format: 'CSV',
    summary: summaryFor(+startOfDay(daysAgo(1)), +startOfDay(daysAgo(0)), 'all'),
  },
  {
    id: 'rpt-02',
    code: 'RPT-0141',
    type: 'Weekly Operations',
    title: 'Weekly Operations Report',
    periodFrom: daysAgo(7),
    periodTo: daysAgo(0),
    departmentId: 'all',
    generatedAt: daysAgo(0, 11),
    generatedBy: 'Aulia Rahman',
    format: 'CSV',
    summary: summaryFor(+new Date(daysAgo(7)), NOW, 'all'),
  },
  {
    id: 'rpt-03',
    code: 'RPT-0140',
    type: 'SLA Performance',
    title: 'SLA Performance Report — IT Support',
    periodFrom: daysAgo(30),
    periodTo: daysAgo(0),
    departmentId: 'dept-it',
    generatedAt: daysAgo(1, 3),
    generatedBy: 'Siti Rahmawati',
    format: 'Preview',
    summary: summaryFor(+new Date(daysAgo(30)), NOW, 'dept-it'),
  },
  {
    id: 'rpt-04',
    code: 'RPT-0139',
    type: 'BOT Execution',
    title: 'BOT Execution Report',
    periodFrom: daysAgo(14),
    periodTo: daysAgo(0),
    departmentId: 'all',
    generatedAt: daysAgo(2, 6),
    generatedBy: 'Aulia Rahman',
    format: 'CSV',
    summary: summaryFor(+new Date(daysAgo(14)), NOW, 'all'),
  },
  {
    id: 'rpt-05',
    code: 'RPT-0138',
    type: 'Department Workload',
    title: 'Department Workload Report',
    periodFrom: daysAgo(30),
    periodTo: daysAgo(0),
    departmentId: 'all',
    generatedAt: daysAgo(3, 8),
    generatedBy: 'Siti Rahmawati',
    format: 'CSV',
    summary: summaryFor(+new Date(daysAgo(30)), NOW, 'all'),
  },
];

/* ------------------------------------------------------------------ integrations */

const integrations: Integration[] = [
  { id: 'int-01', name: 'Google Sheets', category: 'Data', status: 'Demo Mode', description: 'Two-way sync of request registers with the operational spreadsheet.', lastSync: daysAgo(0, 3), note: 'Simulated with local demo data — no OAuth credentials configured.' },
  { id: 'int-02', name: 'Google Forms', category: 'Intake', status: 'Demo Mode', description: 'Public request intake form that creates tasks in OpsFlow.', lastSync: daysAgo(0, 6), note: 'Form submissions are simulated by the request intake panel.' },
  { id: 'int-03', name: 'Microsoft Excel', category: 'Data', status: 'Configuration Required', description: 'Import/export of task registers and reporting packs.', lastSync: null, note: 'Requires a Microsoft 365 app registration with Files.ReadWrite scope.' },
  { id: 'int-04', name: 'Microsoft Teams', category: 'Notification', status: 'Not Connected', description: 'Deliver assignment and escalation cards to operational channels.', lastSync: null, note: 'Requires an incoming webhook URL per channel.' },
  { id: 'int-05', name: 'Email (SMTP)', category: 'Notification', status: 'Not Connected', description: 'Email reminders and report distribution.', lastSync: null, note: 'SMTP credentials are intentionally not stored in the frontend bundle.' },
  { id: 'int-06', name: 'Telegram', category: 'Notification', status: 'Not Connected', description: 'Ops alerting for the on-call rotation.', lastSync: null, note: 'Requires a bot token and chat ID stored server-side.' },
  { id: 'int-07', name: 'Slack', category: 'Notification', status: 'Configuration Required', description: 'Post automation results into #opsflow-alerts.', lastSync: null, note: 'Requires a Slack app with chat:write scope.' },
];

const state: AppState = {
  version: 3,
  organization: {
    name: 'Nusantara Retail Group',
    code: 'NRG',
    plan: 'Enterprise demo workspace',
    departments,
  },
  currentUserId: 'usr-01',
  users,
  tasks,
  automations,
  executions,
  workflows,
  notifications: notifications.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
  activity: activity.sort((a, b) => +new Date(b.at) - +new Date(a.at)),
  slaConfigs,
  baselines,
  reports,
  integrations,
  roiInputs: ROI_DEFAULTS,
  settings: {
    reminderThresholdPct: 75,
    escalationAfterHours: 0,
    autoEscalation: true,
    demoMode: true,
    notificationChannels: { inApp: true, email: false, teams: false, telegram: false, slack: false },
  },
};

export function createSeedState(): AppState {
  // Deep clone so mutations never touch the module-level template.
  return JSON.parse(JSON.stringify(state)) as AppState;
}

export const SEED_HINT = { taskCount: tasks.length };

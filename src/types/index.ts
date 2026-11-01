/**
 * OpsFlow — Domain model
 * ----------------------
 * These types mirror the documented database schema (see docs/SCHEMA.md).
 * The demo persistence layer stores this state in localStorage, but the
 * service layer is written so it can be swapped for Supabase/Postgres.
 */

export type Role = 'Administrator' | 'Operations Manager' | 'Staff';

export type DepartmentId =
  | 'dept-it'
  | 'dept-hr'
  | 'dept-fin'
  | 'dept-ops'
  | 'dept-cx';

export type Availability = 'Available' | 'Busy' | 'Away';

export interface Department {
  id: DepartmentId;
  name: string;
  code: string;
  head: string;
  teams: string[];
  costCenter: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  departmentId: DepartmentId;
  title: string;
  availability: Availability;
  active: boolean;
  activeTaskCount?: number; // derived
  avatarTone: string;
}

export type TaskCategory =
  | 'IT Support'
  | 'System Access Request'
  | 'Hardware Request'
  | 'Software Installation'
  | 'Data Update'
  | 'Administrative Request'
  | 'Reporting Request'
  | 'Project Support'
  | 'General Operations';

export type Priority = 'Critical' | 'High' | 'Medium' | 'Low';

export type TaskStatus =
  | 'New'
  | 'Pending Validation'
  | 'Assigned'
  | 'In Progress'
  | 'Waiting Approval'
  | 'Completed'
  | 'Rejected'
  | 'Overdue';

export type RequestSource =
  | 'Email'
  | 'Google Form'
  | 'Teams'
  | 'Portal'
  | 'Walk-in'
  | 'Phone'
  | 'API';

export type AutomationStatus =
  | 'Not Processed'
  | 'Validated'
  | 'Auto-Assigned'
  | 'Needs Review'
  | 'Duplicate Flagged';

export interface Task {
  id: string;
  code: string;
  title: string;
  description: string;
  departmentId: DepartmentId;
  category: TaskCategory;
  priority: Priority;
  source: RequestSource;
  requesterName: string;
  requesterEmail: string;
  assigneeId: string | null;
  createdAt: string; // ISO
  deadline: string; // ISO
  slaHours: number;
  status: TaskStatus;
  completedAt: string | null;
  automationStatus: AutomationStatus;
  tags: string[];
  workflowId: string | null;
  workflowStageIndex: number;
  duplicateOf?: string | null;
  escalated?: boolean;
  reminderSentAt?: string | null;
  comments: TaskComment[];
  history: TaskHistoryEntry[];
}

export interface TaskComment {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface TaskHistoryEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  from?: string;
  to?: string;
}

export type TriggerType =
  | 'task.created'
  | 'task.updated'
  | 'schedule.daily'
  | 'schedule.weekly'
  | 'sla.approaching'
  | 'sla.breached'
  | 'manual';

export type ConditionField =
  | 'category'
  | 'priority'
  | 'department'
  | 'source'
  | 'status'
  | 'hoursToDeadline'
  | 'titleSimilarity'
  | 'assignee'
  | 'completeness';

export type Operator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'greater_than'
  | 'less_than'
  | 'is_empty'
  | 'in';

export interface AutomationCondition {
  id: string;
  field: ConditionField;
  operator: Operator;
  value: string;
}

export type ActionType =
  | 'assign_department'
  | 'assign_user'
  | 'set_status'
  | 'notify_assignee'
  | 'notify_role'
  | 'log_activity'
  | 'flag_review'
  | 'flag_duplicate'
  | 'escalate'
  | 'generate_report'
  | 'set_automation_status';

export interface AutomationAction {
  id: string;
  type: ActionType;
  params: Record<string, string>;
}

export type ExecutionStatus = 'Success' | 'Partial' | 'Failed' | 'Skipped';

export interface AutomationRule {
  id: string;
  name: string;
  botKey: string; // stable identifier used by the engine
  description: string;
  trigger: TriggerType;
  triggerLabel: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  enabled: boolean;
  frequency?: 'daily' | 'weekly' | 'n/a';
  threshold?: number; // e.g. hours before deadline
  category: 'Assignment' | 'Validation' | 'Notification' | 'Escalation' | 'Reporting' | 'Data Quality';
  lastRunAt: string | null;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  recordsProcessed: number;
  minutesSavedPerRecord: number;
  builtIn?: boolean;
}

export interface AutomationExecution {
  id: string;
  ruleId: string;
  ruleName: string;
  botKey: string;
  trigger: TriggerType;
  mode: 'Manual' | 'Simulated trigger' | 'Scheduled simulation';
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: ExecutionStatus;
  recordsProcessed: number;
  resultSummary: string;
  error?: string | null;
  affectedTaskIds: string[];
  metrics?: {
    assigned?: number;
    validated?: number;
    flagged?: number;
    reminded?: number;
    escalated?: number;
    duplicates?: number;
    notifications?: number;
    minutesSaved?: number;
    reportId?: string;
  };
}

export interface WorkflowStage {
  id: string;
  name: string;
  description: string;
  owner: 'BOT' | 'Human' | 'Manager';
  departmentId: DepartmentId | null;
  requiresApproval: boolean;
  slaHours: number;
  botKey?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  category: TaskCategory | 'All';
  stages: WorkflowStage[];
  active: boolean;
  createdAt: string;
  executions: WorkflowExecution[];
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  taskId: string;
  taskCode: string;
  startedAt: string;
  completedAt: string | null;
  currentStageIndex: number;
  status: 'Running' | 'Completed' | 'Failed' | 'Awaiting Approval';
  history: { stage: string; at: string; by: string; outcome: string }[];
}

export type NotificationType =
  | 'Task Assignment'
  | 'Missing Information'
  | 'Upcoming Deadline'
  | 'SLA Warning'
  | 'SLA Escalation'
  | 'Workflow Approval'
  | 'Automation Failure'
  | 'Report Generated'
  | 'Duplicate Flagged'
  | 'Task Completed';

export type Severity = 'info' | 'warning' | 'critical' | 'success';

export interface AppNotification {
  id: string;
  type: NotificationType;
  severity: Severity;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  taskId?: string | null;
  workflowId?: string | null;
  ruleId?: string | null;
  actor: string;
  expiresAt?: string | null;
}

export type ActivityType =
  | 'task.created'
  | 'task.assigned'
  | 'task.status'
  | 'task.comment'
  | 'bot.execution'
  | 'workflow.completed'
  | 'sla.warning'
  | 'sla.escalation'
  | 'report.generated'
  | 'settings.updated'
  | 'user.updated';

export interface ActivityLog {
  id: string;
  at: string;
  type: ActivityType;
  actor: string;
  message: string;
  taskId?: string | null;
  ruleId?: string | null;
  workflowId?: string | null;
}

export interface SlaConfiguration {
  id: string;
  category: TaskCategory;
  criticalHours: number;
  highHours: number;
  mediumHours: number;
  lowHours: number;
  reminderThresholdPct: number; // % of SLA elapsed before reminder
  escalationThresholdPct: number;
  autoEscalate: boolean;
}

export interface ProcessBaseline {
  id: string;
  process: string;
  category: TaskCategory;
  departmentId: DepartmentId;
  monthlyVolume: number;
  manualMinutes: number;
  automatedMinutes: number;
  manualSteps: number;
  automatedSteps: number;
  manualErrorRatePct: number;
  automatedErrorRatePct: number;
  automationCoveragePct: number;
  hourlyCostIdr: number;
  botId: string;
}

export interface ReportRecord {
  id: string;
  code: string;
  type: ReportType;
  title: string;
  periodFrom: string;
  periodTo: string;
  departmentId: DepartmentId | 'all';
  generatedAt: string;
  generatedBy: string;
  format: 'CSV' | 'Preview';
  summary: {
    tasks: number;
    completed: number;
    overdue: number;
    slaCompliance: number;
    automationRate: number;
  };
  rows?: { label: string; value: string }[];
}

export type ReportType =
  | 'Daily Operations'
  | 'Weekly Operations'
  | 'Monthly Operations'
  | 'SLA Performance'
  | 'BOT Execution'
  | 'Department Workload'
  | 'Automation Impact';

export type IntegrationStatus = 'Connected' | 'Not Connected' | 'Demo Mode' | 'Configuration Required';

export interface Integration {
  id: string;
  name: string;
  category: string;
  status: IntegrationStatus;
  description: string;
  lastSync: string | null;
  note: string;
}

export interface RoiInputs {
  monthlyTransactions: number;
  manualMinutes: number;
  automatedMinutes: number;
  hourlyCostIdr: number;
  implementationCostIdr: number;
  monthlyMaintenanceCostIdr: number;
}

export interface AppState {
  version: number;
  organization: {
    name: string;
    code: string;
    plan: string;
    departments: Department[];
  };
  currentUserId: string;
  users: User[];
  tasks: Task[];
  automations: AutomationRule[];
  executions: AutomationExecution[];
  workflows: Workflow[];
  notifications: AppNotification[];
  activity: ActivityLog[];
  slaConfigs: SlaConfiguration[];
  baselines: ProcessBaseline[];
  reports: ReportRecord[];
  integrations: Integration[];
  roiInputs: RoiInputs;
  settings: {
    reminderThresholdPct: number;
    escalationAfterHours: number;
    autoEscalation: boolean;
    demoMode: boolean;
    notificationChannels: Record<string, boolean>;
  };
}

import type { Priority, TaskCategory, TaskStatus, DepartmentId, RequestSource } from '@/types';

export const CATEGORIES: TaskCategory[] = [
  'IT Support',
  'System Access Request',
  'Hardware Request',
  'Software Installation',
  'Data Update',
  'Administrative Request',
  'Reporting Request',
  'Project Support',
  'General Operations',
];

/** Default owning department per request category (used by the assignment BOT). */
export const CATEGORY_DEPARTMENT: Record<TaskCategory, DepartmentId> = {
  'IT Support': 'dept-it',
  'System Access Request': 'dept-it',
  'Hardware Request': 'dept-it',
  'Software Installation': 'dept-it',
  'Data Update': 'dept-ops',
  'Administrative Request': 'dept-hr',
  'Reporting Request': 'dept-fin',
  'Project Support': 'dept-ops',
  'General Operations': 'dept-ops',
};

export const PRIORITIES: Priority[] = ['Critical', 'High', 'Medium', 'Low'];

export const STATUSES: TaskStatus[] = [
  'New',
  'Pending Validation',
  'Assigned',
  'In Progress',
  'Waiting Approval',
  'Completed',
  'Rejected',
  'Overdue',
];

export const OPEN_STATUSES: TaskStatus[] = [
  'New',
  'Pending Validation',
  'Assigned',
  'In Progress',
  'Waiting Approval',
  'Overdue',
];

export const SOURCES: RequestSource[] = ['Email', 'Google Form', 'Teams', 'Portal', 'Walk-in', 'Phone', 'API'];

export const PRIORITY_ORDER: Record<Priority, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export const DEPARTMENTS_META: Record<DepartmentId, { name: string; code: string; tone: string }> = {
  'dept-it': { name: 'IT Support', code: 'IT', tone: 'blue' },
  'dept-hr': { name: 'Human Resources', code: 'HR', tone: 'violet' },
  'dept-fin': { name: 'Finance & Reporting', code: 'FIN', tone: 'amber' },
  'dept-ops': { name: 'Business Operations', code: 'OPS', tone: 'emerald' },
  'dept-cx': { name: 'Customer Experience', code: 'CX', tone: 'cyan' },
};

export const STATUS_STYLES: Record<TaskStatus, { badge: string; dot: string }> = {
  New: { badge: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400' },
  'Pending Validation': { badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  Assigned: { badge: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500' },
  'In Progress': { badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500' },
  'Waiting Approval': { badge: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
  Completed: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  Rejected: { badge: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
  Overdue: { badge: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
};

export const PRIORITY_STYLES: Record<Priority, string> = {
  Critical: 'bg-red-50 text-red-700 border-red-200',
  High: 'bg-orange-50 text-orange-700 border-orange-200',
  Medium: 'bg-sky-50 text-sky-700 border-sky-200',
  Low: 'bg-slate-100 text-slate-600 border-slate-200',
};

export const SEVERITY_STYLES = {
  info: { badge: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500', ring: 'ring-sky-100' },
  warning: { badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', ring: 'ring-amber-100' },
  critical: { badge: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500', ring: 'ring-red-100' },
  success: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', ring: 'ring-emerald-100' },
} as const;

export const CATEGORY_TONE: Record<TaskCategory, string> = {
  'IT Support': 'bg-blue-50 text-blue-700 border-blue-200',
  'System Access Request': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Hardware Request': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  'Software Installation': 'bg-teal-50 text-teal-700 border-teal-200',
  'Data Update': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Administrative Request': 'bg-violet-50 text-violet-700 border-violet-200',
  'Reporting Request': 'bg-amber-50 text-amber-700 border-amber-200',
  'Project Support': 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  'General Operations': 'bg-slate-100 text-slate-700 border-slate-200',
};

export const CHART_COLORS = ['#10b981', '#3b82f6', '#6366f1', '#f59e0b', '#ef4444', '#14b8a6', '#8b5cf6', '#0ea5e9'];

export const DEMO_PREFIX = '[DEMO]';

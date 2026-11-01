import {
  LayoutDashboard,
  ListChecks,
  Workflow,
  Timer,
  Bot,
  ChartNoAxesCombined,
  FileBarChart,
  BellRing,
  Settings2,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  description: string;
  badgeKey?: 'tasks' | 'notifications' | 'overdue' | 'automation';
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Main',
    items: [
      {
        to: '/dashboard',
        label: 'Executive Overview',
        icon: LayoutDashboard,
        description: 'Operational command centre with live BAU performance indicators',
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/tasks', label: 'Tasks & Requests', icon: ListChecks, description: 'Centralised operational work management', badgeKey: 'tasks' },
      { to: '/workflows', label: 'Workflow Management', icon: Workflow, description: 'Visual process definitions and instances' },
      { to: '/sla', label: 'SLA Monitoring', icon: Timer, description: 'Deadline health, escalations and bottlenecks', badgeKey: 'overdue' },
    ],
  },
  {
    label: 'Automation',
    items: [
      { to: '/automation', label: 'Automation Center', icon: Bot, description: 'BOT catalogue, execution history and configuration', badgeKey: 'automation' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { to: '/analytics', label: 'Analytics & BI', icon: ChartNoAxesCombined, description: 'Before/after impact, ROI and efficiency ranking' },
      { to: '/reports', label: 'Report Center', icon: FileBarChart, description: 'Operational reporting and exports' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/notifications', label: 'Notification Center', icon: BellRing, description: 'Event stream raised by the platform and BOTs', badgeKey: 'notifications' },
      { to: '/settings', label: 'Settings', icon: Settings2, description: 'Organization, users, roles, SLA and integrations' },
    ],
  },
];

export const PAGE_META: Record<string, { title: string; group: string; description: string }> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) =>
    g.items.map((i) => [i.to, { title: i.label, group: g.label, description: i.description }]),
  ),
);

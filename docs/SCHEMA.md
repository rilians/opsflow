# OpsFlow — Database schema

The demo persists a single JSON document (`AppState`) in `localStorage`. This document describes the
equivalent relational schema so the same domain can be hosted on Postgres / Supabase without changing
the application types in `src/types/index.ts`.

Design notes
- Every table carries `id uuid primary key default gen_random_uuid()`.
- All timestamps are `timestamptz`.
- Enumerations are implemented as Postgres `enum` types (or check constraints) for integrity.
- `organization_id` is included on every table so multi-tenancy can be enforced with row-level security.

---

## Enumerations

```sql
create type user_role         as enum ('Administrator', 'Operations Manager', 'Staff');
create type availability      as enum ('Available', 'Busy', 'Away');
create type task_category     as enum (
  'IT Support', 'System Access Request', 'Hardware Request', 'Software Installation',
  'Data Update', 'Administrative Request', 'Reporting Request', 'Project Support', 'General Operations');
create type task_priority     as enum ('Critical', 'High', 'Medium', 'Low');
create type task_status       as enum (
  'New', 'Pending Validation', 'Assigned', 'In Progress', 'Waiting Approval',
  'Completed', 'Rejected', 'Overdue');
create type request_source    as enum ('Email', 'Google Form', 'Teams', 'Portal', 'Walk-in', 'Phone', 'API');
create type automation_status as enum ('Not Processed', 'Validated', 'Auto-Assigned', 'Needs Review', 'Duplicate Flagged');
create type trigger_type      as enum ('task.created','task.updated','schedule.daily','schedule.weekly','sla.approaching','sla.breached','manual');
create type execution_status  as enum ('Success','Partial','Failed','Skipped');
create type stage_owner       as enum ('BOT','Human','Manager');
create type workflow_state    as enum ('Running','Completed','Failed','Awaiting Approval');
create type notification_type as enum (
  'Task Assignment','Missing Information','Upcoming Deadline','SLA Warning','SLA Escalation',
  'Workflow Approval','Automation Failure','Report Generated','Duplicate Flagged','Task Completed');
create type severity          as enum ('info','warning','critical','success');
create type report_type       as enum (
  'Daily Operations','Weekly Operations','Monthly Operations','SLA Performance',
  'BOT Execution','Department Workload','Automation Impact');
create type integration_state as enum ('Connected','Not Connected','Demo Mode','Configuration Required');
```

---

## Core tables

```sql
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  plan text,
  created_at timestamptz not null default now()
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  code text not null,
  head text,
  cost_center text,
  teams text[] not null default '{}'
);

create table users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  department_id uuid references departments(id),
  name text not null,
  email text not null,
  role user_role not null default 'Staff',
  title text,
  availability availability not null default 'Available',
  active boolean not null default true,
  avatar_tone text,
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,                                  -- OPS-2601
  title text not null check (length(title) >= 8),
  description text not null default '',
  department_id uuid not null references departments(id),
  category task_category not null,
  priority task_priority not null default 'Medium',
  source request_source not null default 'Portal',
  requester_name text not null,
  requester_email text not null check (requester_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  assignee_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  deadline timestamptz not null,
  sla_hours integer not null check (sla_hours > 0),
  status task_status not null default 'New',
  completed_at timestamptz,
  automation_status automation_status not null default 'Not Processed',
  tags text[] not null default '{}',
  workflow_id uuid references workflows(id) on delete set null,
  workflow_stage_index integer not null default 0,
  duplicate_of uuid references tasks(id) on delete set null,
  escalated boolean not null default false,
  reminder_sent_at timestamptz,
  unique (organization_id, code)
);

create index tasks_open_idx      on tasks (organization_id, status) where status not in ('Completed','Rejected');
create index tasks_deadline_idx  on tasks (organization_id, deadline);
create index tasks_assignee_idx  on tasks (assignee_id);

create table task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid not null references users(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  from_value text,
  to_value text
);

create table sla_configurations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  category task_category not null,
  critical_hours integer not null,
  high_hours integer not null,
  medium_hours integer not null,
  low_hours integer not null,
  reminder_threshold_pct integer not null default 75,
  escalation_threshold_pct integer not null default 100,
  auto_escalate boolean not null default true,
  unique (organization_id, category)
);
```

---

## Automation

```sql
create table automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  bot_key text not null,                     -- engine implementation key
  description text,
  trigger trigger_type not null,
  trigger_label text,
  conditions jsonb not null default '[]',    -- [{ id, field, operator, value }]
  actions jsonb not null default '[]',       -- [{ id, type, params }]
  enabled boolean not null default true,
  frequency text,
  threshold integer,
  category text,
  last_run_at timestamptz,
  total_executions integer not null default 0,
  successful_executions integer not null default 0,
  failed_executions integer not null default 0,
  records_processed integer not null default 0,
  minutes_saved_per_record integer not null default 0
);

create table automation_executions (
  id text primary key,                       -- EXE-0001-AB12
  organization_id uuid not null references organizations(id) on delete cascade,
  rule_id uuid not null references automation_rules(id) on delete cascade,
  bot_key text not null,
  trigger trigger_type not null,
  mode text not null,                        -- Manual | Simulated trigger | Scheduled simulation
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_ms integer not null,
  status execution_status not null,
  records_processed integer not null default 0,
  result_summary text,
  error text,
  affected_task_ids uuid[] not null default '{}',
  metrics jsonb not null default '{}'
);

create index executions_rule_idx on automation_executions (rule_id, started_at desc);
```

---

## Workflow

```sql
create table workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  category text,                             -- task_category or 'All'
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table workflow_stages (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  position integer not null,
  name text not null,
  description text,
  owner stage_owner not null,
  department_id uuid references departments(id),
  requires_approval boolean not null default false,
  sla_hours integer not null default 8,
  bot_key text,
  unique (workflow_id, position)
);

create table workflow_executions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  current_stage_index integer not null default 0,
  status workflow_state not null default 'Running'
);

create table workflow_stage_history (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references workflow_executions(id) on delete cascade,
  stage_name text not null,
  at timestamptz not null default now(),
  by_actor text,
  outcome text
);
```

---

## Events, reporting, configuration

```sql
create table notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  type notification_type not null,
  severity severity not null,
  title text not null,
  body text,
  created_at timestamptz not null default now(),
  read boolean not null default false,
  task_id uuid references tasks(id) on delete cascade,
  workflow_id uuid references workflows(id) on delete set null,
  rule_id uuid references automation_rules(id) on delete set null,
  actor text
);

create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  at timestamptz not null default now(),
  type text not null,
  actor text not null,
  message text not null,
  task_id uuid references tasks(id) on delete cascade,
  rule_id uuid references automation_rules(id) on delete set null,
  workflow_id uuid references workflows(id) on delete set null
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  type report_type not null,
  title text not null,
  period_from timestamptz not null,
  period_to timestamptz not null,
  department_id uuid references departments(id),
  generated_at timestamptz not null default now(),
  generated_by text not null,
  format text not null default 'CSV',
  summary jsonb not null default '{}'
);

create table process_baselines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  process text not null,
  category task_category not null,
  department_id uuid references departments(id),
  monthly_volume integer not null,
  manual_minutes integer not null,
  automated_minutes integer not null,
  manual_steps integer not null,
  automated_steps integer not null,
  manual_error_rate_pct numeric(5,2) not null,
  automated_error_rate_pct numeric(5,2) not null,
  automation_coverage_pct integer not null,
  hourly_cost_idr bigint not null,
  bot_id uuid references automation_rules(id) on delete set null
);

create table integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  category text,
  status integration_state not null default 'Not Connected',
  description text,
  last_sync timestamptz,
  note text
);
```

---

## Multi-tenancy and access

```sql
alter table tasks enable row level security;

create policy tasks_read on tasks for select
  using (organization_id = current_setting('app.organization_id')::uuid);

create policy tasks_write on tasks for all
  using (
    organization_id = current_setting('app.organization_id')::uuid
    and current_setting('app.user_role') in ('Administrator', 'Operations Manager')
  );
```

Role intent in the demo (must be enforced server-side in production):

| Capability | Administrator | Operations Manager | Staff |
| --- | --- | --- | --- |
| Configure automation / workflows / SLA | ✓ | — | — |
| Manage users and roles | ✓ | — | — |
| Delete tasks and reports | ✓ | ✓ | — |
| Approve workflow stages | ✓ | ✓ | — |
| Update own tasks, comment | ✓ | ✓ | ✓ |
| Run automation manually | ✓ | ✓ | — |

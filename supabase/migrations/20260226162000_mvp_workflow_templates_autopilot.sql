-- MVP retention loop schema:
-- - template library + version history + user favorites
-- - weekly autopilot schedules + idempotent run ledger
-- - product instrumentation event sink

create extension if not exists "pgcrypto";

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  workflow_pack_id text not null,
  title text not null,
  description text,
  body_md text not null,
  input_schema jsonb not null default '[]'::jsonb,
  is_system boolean not null default false,
  system_key text,
  workspace_use_count bigint not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_tsv tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(body_md, '')
    )
  ) stored
);

create index if not exists idx_templates_workspace_pack_updated
  on public.templates (workspace_id, workflow_pack_id, updated_at desc);

create index if not exists idx_templates_workspace_updated
  on public.templates (workspace_id, updated_at desc);

create index if not exists idx_templates_search_tsv_gin
  on public.templates using gin (search_tsv);

create unique index if not exists idx_templates_system_key
  on public.templates (workspace_id, system_key)
  where system_key is not null;

create table if not exists public.template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version_number integer not null,
  title text not null,
  description text,
  body_md text not null,
  input_schema jsonb not null default '[]'::jsonb,
  change_note text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (template_id, version_number)
);

create index if not exists idx_template_versions_template_created
  on public.template_versions (template_id, created_at desc);

create index if not exists idx_template_versions_workspace_created
  on public.template_versions (workspace_id, created_at desc);

create table if not exists public.template_favorites (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references public.templates(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id, template_id)
);

create index if not exists idx_template_favorites_user_recent
  on public.template_favorites (workspace_id, user_id, created_at desc);

create table if not exists public.autopilot_schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  workflow_pack_id text not null,
  name text not null,
  template_id uuid references public.templates(id) on delete set null,
  prompt_override text,
  input_snapshot jsonb not null default '{}'::jsonb,
  timezone text not null,
  weekday smallint not null check (weekday between 0 and 6),
  hour smallint not null check (hour between 0 and 23),
  minute smallint not null check (minute between 0 and 59),
  status text not null default 'active' check (status in ('active', 'paused', 'disabled')),
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  max_retries smallint not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_autopilot_schedules_due
  on public.autopilot_schedules (status, next_run_at);

create index if not exists idx_autopilot_schedules_workspace_status
  on public.autopilot_schedules (workspace_id, status);

create table if not exists public.autopilot_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.autopilot_schedules(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  idempotency_key text not null,
  scheduled_for timestamptz not null,
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'skipped')),
  attempt_count smallint not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  asset_template_id uuid references public.templates(id) on delete set null,
  summary_md text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_autopilot_runs_idempotency
  on public.autopilot_runs (idempotency_key);

create index if not exists idx_autopilot_runs_schedule_time
  on public.autopilot_runs (schedule_id, scheduled_for desc);

create index if not exists idx_autopilot_runs_workspace_status
  on public.autopilot_runs (workspace_id, status, created_at desc);

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  event_name text not null,
  event_version smallint not null default 1,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  ingested_at timestamptz not null default now()
);

create index if not exists idx_product_events_name_time
  on public.product_events (event_name, occurred_at desc);

create index if not exists idx_product_events_workspace_time
  on public.product_events (workspace_id, occurred_at desc);

create index if not exists idx_product_events_user_time
  on public.product_events (user_id, occurred_at desc);

drop trigger if exists templates_set_updated_at on public.templates;
create trigger templates_set_updated_at
before update on public.templates
for each row execute function public.set_updated_at();

drop trigger if exists autopilot_schedules_set_updated_at on public.autopilot_schedules;
create trigger autopilot_schedules_set_updated_at
before update on public.autopilot_schedules
for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.templates to authenticated;
grant select, insert, update, delete on public.template_versions to authenticated;
grant select, insert, update, delete on public.template_favorites to authenticated;
grant select, insert, update, delete on public.autopilot_schedules to authenticated;
grant select, insert, update, delete on public.autopilot_runs to authenticated;
grant select, insert on public.product_events to authenticated;

alter table public.templates enable row level security;
alter table public.template_versions enable row level security;
alter table public.template_favorites enable row level security;
alter table public.autopilot_schedules enable row level security;
alter table public.autopilot_runs enable row level security;
alter table public.product_events enable row level security;

drop policy if exists "templates_select_accessible" on public.templates;
create policy "templates_select_accessible"
on public.templates
for select
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists "templates_insert_accessible" on public.templates;
create policy "templates_insert_accessible"
on public.templates
for insert
to authenticated
with check (
  public.user_has_workspace_access(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists "templates_update_accessible" on public.templates;
create policy "templates_update_accessible"
on public.templates
for update
to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists "templates_delete_accessible" on public.templates;
create policy "templates_delete_accessible"
on public.templates
for delete
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists "template_versions_select_accessible" on public.template_versions;
create policy "template_versions_select_accessible"
on public.template_versions
for select
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists "template_versions_insert_accessible" on public.template_versions;
create policy "template_versions_insert_accessible"
on public.template_versions
for insert
to authenticated
with check (
  public.user_has_workspace_access(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists "template_versions_update_accessible" on public.template_versions;
create policy "template_versions_update_accessible"
on public.template_versions
for update
to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists "template_versions_delete_accessible" on public.template_versions;
create policy "template_versions_delete_accessible"
on public.template_versions
for delete
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists "template_favorites_select_accessible" on public.template_favorites;
create policy "template_favorites_select_accessible"
on public.template_favorites
for select
to authenticated
using (
  public.user_has_workspace_access(workspace_id)
  and user_id = auth.uid()
);

drop policy if exists "template_favorites_insert_own" on public.template_favorites;
create policy "template_favorites_insert_own"
on public.template_favorites
for insert
to authenticated
with check (
  public.user_has_workspace_access(workspace_id)
  and user_id = auth.uid()
);

drop policy if exists "template_favorites_delete_own" on public.template_favorites;
create policy "template_favorites_delete_own"
on public.template_favorites
for delete
to authenticated
using (
  public.user_has_workspace_access(workspace_id)
  and user_id = auth.uid()
);

drop policy if exists "autopilot_schedules_select_accessible" on public.autopilot_schedules;
create policy "autopilot_schedules_select_accessible"
on public.autopilot_schedules
for select
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists "autopilot_schedules_insert_accessible" on public.autopilot_schedules;
create policy "autopilot_schedules_insert_accessible"
on public.autopilot_schedules
for insert
to authenticated
with check (
  public.user_has_workspace_access(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists "autopilot_schedules_update_accessible" on public.autopilot_schedules;
create policy "autopilot_schedules_update_accessible"
on public.autopilot_schedules
for update
to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists "autopilot_schedules_delete_accessible" on public.autopilot_schedules;
create policy "autopilot_schedules_delete_accessible"
on public.autopilot_schedules
for delete
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists "autopilot_runs_select_accessible" on public.autopilot_runs;
create policy "autopilot_runs_select_accessible"
on public.autopilot_runs
for select
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists "autopilot_runs_insert_accessible" on public.autopilot_runs;
create policy "autopilot_runs_insert_accessible"
on public.autopilot_runs
for insert
to authenticated
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists "autopilot_runs_update_accessible" on public.autopilot_runs;
create policy "autopilot_runs_update_accessible"
on public.autopilot_runs
for update
to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists "autopilot_runs_delete_accessible" on public.autopilot_runs;
create policy "autopilot_runs_delete_accessible"
on public.autopilot_runs
for delete
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists "product_events_select_accessible" on public.product_events;
create policy "product_events_select_accessible"
on public.product_events
for select
to authenticated
using (
  workspace_id is null
  or public.user_has_workspace_access(workspace_id)
);

drop policy if exists "product_events_insert_authenticated" on public.product_events;
create policy "product_events_insert_authenticated"
on public.product_events
for insert
to authenticated
with check (
  (workspace_id is null or public.user_has_workspace_access(workspace_id))
  and (user_id is null or user_id = auth.uid())
);

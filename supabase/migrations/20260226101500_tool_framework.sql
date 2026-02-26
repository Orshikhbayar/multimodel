-- Tool framework core schema + project-scoped tooling data model

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Tool Registry + Runs
-- -----------------------------------------------------------------------------

create table if not exists public.tool_registry (
  tool_name text not null,
  tool_version text not null,
  description text not null,
  input_schema jsonb not null,
  output_schema jsonb not null,
  permissions text[] not null default '{}',
  estimated_cost jsonb not null default '{}'::jsonb,
  changelog text,
  deprecated_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (tool_name, tool_version)
);

create table if not exists public.tool_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  caller_user_id uuid not null references auth.users(id) on delete cascade,
  tool_name text not null,
  tool_version text not null,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'cancelled')),
  idempotency_key text,
  input_hash text not null,
  output_hash text,
  input_payload_redacted jsonb,
  output_payload_redacted jsonb,
  estimated_cost jsonb,
  actual_cost jsonb,
  metadata jsonb,
  error_code text,
  error_message text,
  duration_ms integer,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists tool_runs_project_started_idx
  on public.tool_runs (project_id, started_at desc);

create index if not exists tool_runs_user_started_idx
  on public.tool_runs (caller_user_id, started_at desc);

create index if not exists tool_runs_tool_started_idx
  on public.tool_runs (tool_name, started_at desc);

create unique index if not exists tool_runs_idempotency_key_unique
  on public.tool_runs (caller_user_id, project_id, tool_name, idempotency_key)
  where idempotency_key is not null;

-- -----------------------------------------------------------------------------
-- Web Cache
-- -----------------------------------------------------------------------------

create table if not exists public.web_search_cache (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  query_hash text not null,
  query text not null,
  params jsonb not null default '{}'::jsonb,
  results jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create unique index if not exists web_search_cache_query_unique
  on public.web_search_cache (workspace_id, project_id, query_hash);

create index if not exists web_search_cache_expires_idx
  on public.web_search_cache (expires_at);

create table if not exists public.web_pages_cache (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  url text not null,
  canonical_url text,
  metadata jsonb not null default '{}'::jsonb,
  headings jsonb not null default '[]'::jsonb,
  clean_text text not null,
  detected_date date,
  content_hash text not null,
  word_count integer not null default 0,
  http_status integer,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create unique index if not exists web_pages_cache_unique
  on public.web_pages_cache (workspace_id, project_id, url, content_hash);

create index if not exists web_pages_cache_url_idx
  on public.web_pages_cache (url);

create index if not exists web_pages_cache_expires_idx
  on public.web_pages_cache (expires_at);

create index if not exists web_pages_cache_fts_idx
  on public.web_pages_cache using gin (to_tsvector('english', coalesce(clean_text, '')));

-- -----------------------------------------------------------------------------
-- Deep Research persistence
-- -----------------------------------------------------------------------------

create table if not exists public.research_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  goals text[] not null default '{}',
  constraints text[] not null default '{}',
  audience text,
  recency_days integer,
  max_sources integer,
  depth_level text,
  objective text not null,
  scope_boundaries jsonb not null default '[]'::jsonb,
  key_questions jsonb not null default '[]'::jsonb,
  success_criteria jsonb not null default '[]'::jsonb,
  report_markdown text not null,
  what_changed_recently text,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists research_reports_project_created_idx
  on public.research_reports (project_id, created_at desc);

create table if not exists public.research_sources (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.research_reports(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  citation_id text not null,
  url text not null,
  title text not null,
  publisher text,
  published_date date,
  accessed_at timestamptz not null default now(),
  content_hash text,
  extracted_text_ref text,
  authority_score numeric(6,3),
  relevance_score numeric(6,3),
  recency_score numeric(6,3),
  redundancy_score numeric(6,3),
  final_score numeric(6,3),
  notes text,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists research_sources_report_citation_unique
  on public.research_sources (report_id, citation_id);

create index if not exists research_sources_report_idx
  on public.research_sources (report_id);

create table if not exists public.research_traces (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.research_reports(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  plan jsonb not null,
  queries jsonb not null,
  selected_sources jsonb not null,
  scoring jsonb not null,
  tool_call_log jsonb not null,
  conflicts jsonb not null default '[]'::jsonb,
  uncertainty_notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (report_id)
);

-- -----------------------------------------------------------------------------
-- Files + Retrieval
-- -----------------------------------------------------------------------------

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  original_name text not null,
  file_type text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  content_hash text,
  parsed_text text,
  metadata jsonb not null default '{}'::jsonb,
  extraction_warnings jsonb not null default '[]'::jsonb,
  pages integer,
  word_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists files_workspace_project_path_unique
  on public.files (workspace_id, project_id, storage_path);

create index if not exists files_project_created_idx
  on public.files (project_id, created_at desc);

create index if not exists files_fts_idx
  on public.files using gin (to_tsvector('english', coalesce(parsed_text, '')));

create table if not exists public.file_chunks (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  chunk_id text not null,
  chunk_index integer not null,
  chunk_text text not null,
  reference jsonb not null default '{}'::jsonb,
  token_count integer,
  created_at timestamptz not null default now()
);

create unique index if not exists file_chunks_file_chunk_id_unique
  on public.file_chunks (file_id, chunk_id);

create index if not exists file_chunks_project_file_idx
  on public.file_chunks (project_id, file_id, chunk_index);

create index if not exists file_chunks_fts_idx
  on public.file_chunks using gin (to_tsvector('english', coalesce(chunk_text, '')));

create table if not exists public.file_embeddings (
  id uuid primary key default gen_random_uuid(),
  file_chunk_id uuid not null references public.file_chunks(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  model text not null,
  embedding double precision[] not null,
  created_at timestamptz not null default now(),
  unique (file_chunk_id, model)
);

create index if not exists file_embeddings_project_idx
  on public.file_embeddings (project_id, model);

-- -----------------------------------------------------------------------------
-- Artifacts (export + images)
-- -----------------------------------------------------------------------------

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  artifact_type text not null,
  title text not null,
  mime_type text not null,
  storage_path text not null,
  byte_size bigint,
  metadata jsonb not null default '{}'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  cost_estimate jsonb,
  created_at timestamptz not null default now()
);

create index if not exists artifacts_project_created_idx
  on public.artifacts (project_id, created_at desc);

create unique index if not exists artifacts_workspace_path_unique
  on public.artifacts (workspace_id, storage_path);

-- -----------------------------------------------------------------------------
-- Integrations + GitHub Repo Indexing
-- -----------------------------------------------------------------------------

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  integration_type text not null,
  encrypted_access_token bytea not null,
  encrypted_refresh_token bytea,
  token_expires_at timestamptz,
  enabled_scopes text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, integration_type)
);

create table if not exists public.repos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  owner text not null,
  name text not null,
  default_branch text not null,
  installation_id text,
  enabled_scopes text[] not null default '{}',
  protected_branches text[] not null default '{main,master}',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, owner, name)
);

create table if not exists public.repo_files_cache (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.repos(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  branch text not null,
  path text not null,
  sha text not null,
  size_bytes bigint,
  language text,
  is_binary boolean not null default false,
  content text,
  content_hash text,
  indexed_at timestamptz not null default now(),
  unique (repo_id, branch, path)
);

create index if not exists repo_files_cache_repo_branch_idx
  on public.repo_files_cache (repo_id, branch);

create index if not exists repo_files_cache_fts_idx
  on public.repo_files_cache using gin (to_tsvector('english', coalesce(content, '')));

create table if not exists public.repo_index_jobs (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references public.repos(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  branch text,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  last_indexed_commit text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists repo_index_jobs_repo_created_idx
  on public.repo_index_jobs (repo_id, created_at desc);

create table if not exists public.repo_embeddings (
  id uuid primary key default gen_random_uuid(),
  repo_file_cache_id uuid not null references public.repo_files_cache(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  model text not null,
  chunk_id text not null,
  chunk_text text not null,
  embedding double precision[] not null,
  created_at timestamptz not null default now(),
  unique (repo_file_cache_id, model, chunk_id)
);

create index if not exists repo_embeddings_project_model_idx
  on public.repo_embeddings (project_id, model);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

drop trigger if exists research_reports_set_updated_at on public.research_reports;
create trigger research_reports_set_updated_at
before update on public.research_reports
for each row execute function public.set_updated_at();

drop trigger if exists files_set_updated_at on public.files;
create trigger files_set_updated_at
before update on public.files
for each row execute function public.set_updated_at();

drop trigger if exists integrations_set_updated_at on public.integrations;
create trigger integrations_set_updated_at
before update on public.integrations
for each row execute function public.set_updated_at();

drop trigger if exists repos_set_updated_at on public.repos;
create trigger repos_set_updated_at
before update on public.repos
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Grants + RLS
-- -----------------------------------------------------------------------------

grant select, insert, update, delete on public.tool_registry to authenticated;
grant select, insert, update, delete on public.tool_runs to authenticated;
grant select, insert, update, delete on public.web_search_cache to authenticated;
grant select, insert, update, delete on public.web_pages_cache to authenticated;
grant select, insert, update, delete on public.research_reports to authenticated;
grant select, insert, update, delete on public.research_sources to authenticated;
grant select, insert, update, delete on public.research_traces to authenticated;
grant select, insert, update, delete on public.files to authenticated;
grant select, insert, update, delete on public.file_chunks to authenticated;
grant select, insert, update, delete on public.file_embeddings to authenticated;
grant select, insert, update, delete on public.artifacts to authenticated;
grant select, insert, update, delete on public.integrations to authenticated;
grant select, insert, update, delete on public.repos to authenticated;
grant select, insert, update, delete on public.repo_files_cache to authenticated;
grant select, insert, update, delete on public.repo_index_jobs to authenticated;
grant select, insert, update, delete on public.repo_embeddings to authenticated;

alter table public.tool_registry enable row level security;
alter table public.tool_runs enable row level security;
alter table public.web_search_cache enable row level security;
alter table public.web_pages_cache enable row level security;
alter table public.research_reports enable row level security;
alter table public.research_sources enable row level security;
alter table public.research_traces enable row level security;
alter table public.files enable row level security;
alter table public.file_chunks enable row level security;
alter table public.file_embeddings enable row level security;
alter table public.artifacts enable row level security;
alter table public.integrations enable row level security;
alter table public.repos enable row level security;
alter table public.repo_files_cache enable row level security;
alter table public.repo_index_jobs enable row level security;
alter table public.repo_embeddings enable row level security;

-- tool_registry is readable for all authenticated users; writes only by service role in app layer.
drop policy if exists tool_registry_read_all on public.tool_registry;
create policy tool_registry_read_all
on public.tool_registry
for select
to authenticated
using (true);

drop policy if exists tool_registry_no_direct_writes on public.tool_registry;
create policy tool_registry_no_direct_writes
on public.tool_registry
for all
to authenticated
using (false)
with check (false);

-- Workspace-scoped helper policy pattern

drop policy if exists tool_runs_select_accessible on public.tool_runs;
create policy tool_runs_select_accessible
on public.tool_runs
for select
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists tool_runs_insert_accessible on public.tool_runs;
create policy tool_runs_insert_accessible
on public.tool_runs
for insert
to authenticated
with check (
  public.user_has_workspace_access(workspace_id)
  and caller_user_id = auth.uid()
);

drop policy if exists tool_runs_update_accessible on public.tool_runs;
create policy tool_runs_update_accessible
on public.tool_runs
for update
to authenticated
using (
  public.user_has_workspace_access(workspace_id)
  and caller_user_id = auth.uid()
)
with check (
  public.user_has_workspace_access(workspace_id)
  and caller_user_id = auth.uid()
);

drop policy if exists tool_runs_delete_accessible on public.tool_runs;
create policy tool_runs_delete_accessible
on public.tool_runs
for delete
to authenticated
using (
  public.user_has_workspace_access(workspace_id)
  and caller_user_id = auth.uid()
);

-- Reusable RLS for workspace-scoped tables

-- web_search_cache
drop policy if exists web_search_cache_select_accessible on public.web_search_cache;
create policy web_search_cache_select_accessible
on public.web_search_cache
for select
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists web_search_cache_insert_accessible on public.web_search_cache;
create policy web_search_cache_insert_accessible
on public.web_search_cache
for insert
to authenticated
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists web_search_cache_update_accessible on public.web_search_cache;
create policy web_search_cache_update_accessible
on public.web_search_cache
for update
to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists web_search_cache_delete_accessible on public.web_search_cache;
create policy web_search_cache_delete_accessible
on public.web_search_cache
for delete
to authenticated
using (public.user_has_workspace_access(workspace_id));

-- web_pages_cache
drop policy if exists web_pages_cache_select_accessible on public.web_pages_cache;
create policy web_pages_cache_select_accessible
on public.web_pages_cache
for select
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists web_pages_cache_insert_accessible on public.web_pages_cache;
create policy web_pages_cache_insert_accessible
on public.web_pages_cache
for insert
to authenticated
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists web_pages_cache_update_accessible on public.web_pages_cache;
create policy web_pages_cache_update_accessible
on public.web_pages_cache
for update
to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists web_pages_cache_delete_accessible on public.web_pages_cache;
create policy web_pages_cache_delete_accessible
on public.web_pages_cache
for delete
to authenticated
using (public.user_has_workspace_access(workspace_id));

-- research_reports
drop policy if exists research_reports_select_accessible on public.research_reports;
create policy research_reports_select_accessible
on public.research_reports
for select
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists research_reports_insert_accessible on public.research_reports;
create policy research_reports_insert_accessible
on public.research_reports
for insert
to authenticated
with check (
  public.user_has_workspace_access(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists research_reports_update_accessible on public.research_reports;
create policy research_reports_update_accessible
on public.research_reports
for update
to authenticated
using (
  public.user_has_workspace_access(workspace_id)
  and created_by = auth.uid()
)
with check (
  public.user_has_workspace_access(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists research_reports_delete_accessible on public.research_reports;
create policy research_reports_delete_accessible
on public.research_reports
for delete
to authenticated
using (
  public.user_has_workspace_access(workspace_id)
  and created_by = auth.uid()
);

-- research_sources
drop policy if exists research_sources_select_accessible on public.research_sources;
create policy research_sources_select_accessible
on public.research_sources
for select
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists research_sources_insert_accessible on public.research_sources;
create policy research_sources_insert_accessible
on public.research_sources
for insert
to authenticated
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists research_sources_update_accessible on public.research_sources;
create policy research_sources_update_accessible
on public.research_sources
for update
to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists research_sources_delete_accessible on public.research_sources;
create policy research_sources_delete_accessible
on public.research_sources
for delete
to authenticated
using (public.user_has_workspace_access(workspace_id));

-- research_traces
drop policy if exists research_traces_select_accessible on public.research_traces;
create policy research_traces_select_accessible
on public.research_traces
for select
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists research_traces_insert_accessible on public.research_traces;
create policy research_traces_insert_accessible
on public.research_traces
for insert
to authenticated
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists research_traces_update_accessible on public.research_traces;
create policy research_traces_update_accessible
on public.research_traces
for update
to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists research_traces_delete_accessible on public.research_traces;
create policy research_traces_delete_accessible
on public.research_traces
for delete
to authenticated
using (public.user_has_workspace_access(workspace_id));

-- files
drop policy if exists files_select_accessible on public.files;
create policy files_select_accessible
on public.files
for select
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists files_insert_accessible on public.files;
create policy files_insert_accessible
on public.files
for insert
to authenticated
with check (
  public.user_has_workspace_access(workspace_id)
  and uploaded_by = auth.uid()
);

drop policy if exists files_update_accessible on public.files;
create policy files_update_accessible
on public.files
for update
to authenticated
using (
  public.user_has_workspace_access(workspace_id)
  and uploaded_by = auth.uid()
)
with check (
  public.user_has_workspace_access(workspace_id)
  and uploaded_by = auth.uid()
);

drop policy if exists files_delete_accessible on public.files;
create policy files_delete_accessible
on public.files
for delete
to authenticated
using (
  public.user_has_workspace_access(workspace_id)
  and uploaded_by = auth.uid()
);

-- file_chunks
drop policy if exists file_chunks_select_accessible on public.file_chunks;
create policy file_chunks_select_accessible
on public.file_chunks
for select
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists file_chunks_insert_accessible on public.file_chunks;
create policy file_chunks_insert_accessible
on public.file_chunks
for insert
to authenticated
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists file_chunks_update_accessible on public.file_chunks;
create policy file_chunks_update_accessible
on public.file_chunks
for update
to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists file_chunks_delete_accessible on public.file_chunks;
create policy file_chunks_delete_accessible
on public.file_chunks
for delete
to authenticated
using (public.user_has_workspace_access(workspace_id));

-- file_embeddings
drop policy if exists file_embeddings_select_accessible on public.file_embeddings;
create policy file_embeddings_select_accessible
on public.file_embeddings
for select
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists file_embeddings_insert_accessible on public.file_embeddings;
create policy file_embeddings_insert_accessible
on public.file_embeddings
for insert
to authenticated
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists file_embeddings_update_accessible on public.file_embeddings;
create policy file_embeddings_update_accessible
on public.file_embeddings
for update
to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists file_embeddings_delete_accessible on public.file_embeddings;
create policy file_embeddings_delete_accessible
on public.file_embeddings
for delete
to authenticated
using (public.user_has_workspace_access(workspace_id));

-- artifacts
drop policy if exists artifacts_select_accessible on public.artifacts;
create policy artifacts_select_accessible
on public.artifacts
for select
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists artifacts_insert_accessible on public.artifacts;
create policy artifacts_insert_accessible
on public.artifacts
for insert
to authenticated
with check (
  public.user_has_workspace_access(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists artifacts_update_accessible on public.artifacts;
create policy artifacts_update_accessible
on public.artifacts
for update
to authenticated
using (
  public.user_has_workspace_access(workspace_id)
  and created_by = auth.uid()
)
with check (
  public.user_has_workspace_access(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists artifacts_delete_accessible on public.artifacts;
create policy artifacts_delete_accessible
on public.artifacts
for delete
to authenticated
using (
  public.user_has_workspace_access(workspace_id)
  and created_by = auth.uid()
);

-- integrations
drop policy if exists integrations_select_own on public.integrations;
create policy integrations_select_own
on public.integrations
for select
to authenticated
using (
  public.user_has_workspace_access(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists integrations_insert_own on public.integrations;
create policy integrations_insert_own
on public.integrations
for insert
to authenticated
with check (
  public.user_has_workspace_access(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists integrations_update_own on public.integrations;
create policy integrations_update_own
on public.integrations
for update
to authenticated
using (
  public.user_has_workspace_access(workspace_id)
  and created_by = auth.uid()
)
with check (
  public.user_has_workspace_access(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists integrations_delete_own on public.integrations;
create policy integrations_delete_own
on public.integrations
for delete
to authenticated
using (
  public.user_has_workspace_access(workspace_id)
  and created_by = auth.uid()
);

-- repos
drop policy if exists repos_select_accessible on public.repos;
create policy repos_select_accessible
on public.repos
for select
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists repos_insert_accessible on public.repos;
create policy repos_insert_accessible
on public.repos
for insert
to authenticated
with check (
  public.user_has_workspace_access(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists repos_update_accessible on public.repos;
create policy repos_update_accessible
on public.repos
for update
to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists repos_delete_accessible on public.repos;
create policy repos_delete_accessible
on public.repos
for delete
to authenticated
using (
  public.user_has_workspace_access(workspace_id)
  and created_by = auth.uid()
);

-- repo_files_cache
drop policy if exists repo_files_cache_select_accessible on public.repo_files_cache;
create policy repo_files_cache_select_accessible
on public.repo_files_cache
for select
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists repo_files_cache_insert_accessible on public.repo_files_cache;
create policy repo_files_cache_insert_accessible
on public.repo_files_cache
for insert
to authenticated
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists repo_files_cache_update_accessible on public.repo_files_cache;
create policy repo_files_cache_update_accessible
on public.repo_files_cache
for update
to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists repo_files_cache_delete_accessible on public.repo_files_cache;
create policy repo_files_cache_delete_accessible
on public.repo_files_cache
for delete
to authenticated
using (public.user_has_workspace_access(workspace_id));

-- repo_index_jobs
drop policy if exists repo_index_jobs_select_accessible on public.repo_index_jobs;
create policy repo_index_jobs_select_accessible
on public.repo_index_jobs
for select
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists repo_index_jobs_insert_accessible on public.repo_index_jobs;
create policy repo_index_jobs_insert_accessible
on public.repo_index_jobs
for insert
to authenticated
with check (
  public.user_has_workspace_access(workspace_id)
  and requested_by = auth.uid()
);

drop policy if exists repo_index_jobs_update_accessible on public.repo_index_jobs;
create policy repo_index_jobs_update_accessible
on public.repo_index_jobs
for update
to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists repo_index_jobs_delete_accessible on public.repo_index_jobs;
create policy repo_index_jobs_delete_accessible
on public.repo_index_jobs
for delete
to authenticated
using (
  public.user_has_workspace_access(workspace_id)
  and requested_by = auth.uid()
);

-- repo_embeddings
drop policy if exists repo_embeddings_select_accessible on public.repo_embeddings;
create policy repo_embeddings_select_accessible
on public.repo_embeddings
for select
to authenticated
using (public.user_has_workspace_access(workspace_id));

drop policy if exists repo_embeddings_insert_accessible on public.repo_embeddings;
create policy repo_embeddings_insert_accessible
on public.repo_embeddings
for insert
to authenticated
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists repo_embeddings_update_accessible on public.repo_embeddings;
create policy repo_embeddings_update_accessible
on public.repo_embeddings
for update
to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));

drop policy if exists repo_embeddings_delete_accessible on public.repo_embeddings;
create policy repo_embeddings_delete_accessible
on public.repo_embeddings
for delete
to authenticated
using (public.user_has_workspace_access(workspace_id));

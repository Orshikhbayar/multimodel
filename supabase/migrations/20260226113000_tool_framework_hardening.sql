-- Tool framework hardening:
-- - idempotency uniqueness includes tool_version + null-safe project scope
-- - web cache scope consistency across reads/upserts

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tool_runs'
      and column_name = 'project_scope_key'
  ) then
    execute 'alter table public.tool_runs add column project_scope_key text generated always as (coalesce(project_id::text, ''**null**'')) stored';
  end if;
end
$$;

drop index if exists public.tool_runs_idempotency_key_unique;
create unique index if not exists tool_runs_idempotency_key_unique
  on public.tool_runs (caller_user_id, project_scope_key, tool_name, tool_version, idempotency_key)
  where idempotency_key is not null;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'web_search_cache'
      and column_name = 'project_scope_key'
  ) then
    execute 'alter table public.web_search_cache add column project_scope_key text generated always as (coalesce(project_id::text, ''**null**'')) stored';
  end if;
end
$$;

with ranked as (
  select
    id,
    row_number() over (
      partition by workspace_id, project_scope_key, query_hash
      order by fetched_at desc, id desc
    ) as rn
  from public.web_search_cache
)
delete from public.web_search_cache cache
using ranked
where cache.id = ranked.id
  and ranked.rn > 1;

drop index if exists public.web_search_cache_query_unique;
create unique index if not exists web_search_cache_query_unique
  on public.web_search_cache (workspace_id, project_scope_key, query_hash);

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'web_pages_cache'
      and column_name = 'project_scope_key'
  ) then
    execute 'alter table public.web_pages_cache add column project_scope_key text generated always as (coalesce(project_id::text, ''**null**'')) stored';
  end if;
end
$$;

with ranked as (
  select
    id,
    row_number() over (
      partition by workspace_id, project_scope_key, url
      order by fetched_at desc, id desc
    ) as rn
  from public.web_pages_cache
)
delete from public.web_pages_cache cache
using ranked
where cache.id = ranked.id
  and ranked.rn > 1;

drop index if exists public.web_pages_cache_unique;
create unique index if not exists web_pages_cache_unique
  on public.web_pages_cache (workspace_id, project_scope_key, url);

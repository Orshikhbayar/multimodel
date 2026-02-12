-- Supabase schema for workspace chat persistence + auth-scoped RLS.
-- Run with: supabase db push OR supabase migration up

create extension if not exists "pgcrypto";

-- Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workspace_role') THEN
    CREATE TYPE public.workspace_role AS ENUM ('owner', 'member');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_role') THEN
    CREATE TYPE public.message_role AS ENUM ('user', 'assistant', 'system');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'run_status') THEN
    CREATE TYPE public.run_status AS ENUM ('running', 'completed', 'failed');
  END IF;
END $$;

-- Core tables
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint workspaces_name_not_empty check (char_length(trim(name)) > 0)
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role public.message_role not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.model_runs (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete set null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  model text not null,
  provider text not null,
  status public.run_status not null default 'running',
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(12, 6),
  latency_ms integer,
  output_text text,
  error_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists conversations_workspace_updated_idx
  on public.conversations (workspace_id, updated_at desc);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

create index if not exists model_runs_conversation_created_idx
  on public.model_runs (conversation_id, created_at);

create index if not exists model_runs_message_idx
  on public.model_runs (message_id);

-- Timestamp helpers
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.touch_conversation_timestamp()
returns trigger
language plpgsql
as $$
declare
  target_conversation_id uuid;
begin
  target_conversation_id = coalesce(new.conversation_id, old.conversation_id);

  if target_conversation_id is not null then
    update public.conversations
      set updated_at = now()
      where id = target_conversation_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

drop trigger if exists model_runs_set_updated_at on public.model_runs;
create trigger model_runs_set_updated_at
before update on public.model_runs
for each row execute function public.set_updated_at();

drop trigger if exists messages_touch_conversation_ts on public.messages;
create trigger messages_touch_conversation_ts
after insert or update or delete on public.messages
for each row execute function public.touch_conversation_timestamp();

drop trigger if exists model_runs_touch_conversation_ts on public.model_runs;
create trigger model_runs_touch_conversation_ts
after insert or update or delete on public.model_runs
for each row execute function public.touch_conversation_timestamp();

-- Auto-profile + default workspace bootstrap
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_name text;
  created_workspace_id uuid;
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email;

  workspace_name := concat(
    coalesce(nullif(split_part(new.email, '@', 1), ''), 'My'),
    ' workspace'
  );

  insert into public.workspaces (owner_id, name)
  values (new.id, workspace_name)
  returning id into created_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (created_workspace_id, new.id, 'owner')
  on conflict (workspace_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Access helper used by policies
create or replace function public.user_has_workspace_access(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = target_workspace_id
      and w.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

grant usage on schema public to authenticated;
grant execute on function public.user_has_workspace_access(uuid) to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.model_runs to authenticated;

-- RLS
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.model_runs enable row level security;

-- Profiles
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Workspaces
DROP POLICY IF EXISTS "workspaces_select_accessible" ON public.workspaces;
create policy "workspaces_select_accessible"
on public.workspaces
for select
to authenticated
using (public.user_has_workspace_access(id));

DROP POLICY IF EXISTS "workspaces_insert_owner" ON public.workspaces;
create policy "workspaces_insert_owner"
on public.workspaces
for insert
to authenticated
with check (owner_id = auth.uid());

DROP POLICY IF EXISTS "workspaces_update_owner" ON public.workspaces;
create policy "workspaces_update_owner"
on public.workspaces
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

DROP POLICY IF EXISTS "workspaces_delete_owner" ON public.workspaces;
create policy "workspaces_delete_owner"
on public.workspaces
for delete
to authenticated
using (owner_id = auth.uid());

-- Workspace members
DROP POLICY IF EXISTS "workspace_members_select_accessible" ON public.workspace_members;
create policy "workspace_members_select_accessible"
on public.workspace_members
for select
to authenticated
using (public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "workspace_members_insert_owner" ON public.workspace_members;
create policy "workspace_members_insert_owner"
on public.workspace_members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspaces w
    where w.id = workspace_members.workspace_id
      and w.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "workspace_members_update_owner" ON public.workspace_members;
create policy "workspace_members_update_owner"
on public.workspace_members
for update
to authenticated
using (
  exists (
    select 1
    from public.workspaces w
    where w.id = workspace_members.workspace_id
      and w.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workspaces w
    where w.id = workspace_members.workspace_id
      and w.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "workspace_members_delete_owner" ON public.workspace_members;
create policy "workspace_members_delete_owner"
on public.workspace_members
for delete
to authenticated
using (
  exists (
    select 1
    from public.workspaces w
    where w.id = workspace_members.workspace_id
      and w.owner_id = auth.uid()
  )
);

-- Conversations
DROP POLICY IF EXISTS "conversations_select_accessible" ON public.conversations;
create policy "conversations_select_accessible"
on public.conversations
for select
to authenticated
using (public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "conversations_insert_accessible" ON public.conversations;
create policy "conversations_insert_accessible"
on public.conversations
for insert
to authenticated
with check (public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "conversations_update_accessible" ON public.conversations;
create policy "conversations_update_accessible"
on public.conversations
for update
to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "conversations_delete_accessible" ON public.conversations;
create policy "conversations_delete_accessible"
on public.conversations
for delete
to authenticated
using (public.user_has_workspace_access(workspace_id));

-- Messages
DROP POLICY IF EXISTS "messages_select_accessible" ON public.messages;
create policy "messages_select_accessible"
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and public.user_has_workspace_access(c.workspace_id)
  )
);

DROP POLICY IF EXISTS "messages_insert_accessible" ON public.messages;
create policy "messages_insert_accessible"
on public.messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and public.user_has_workspace_access(c.workspace_id)
  )
);

DROP POLICY IF EXISTS "messages_update_accessible" ON public.messages;
create policy "messages_update_accessible"
on public.messages
for update
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and public.user_has_workspace_access(c.workspace_id)
  )
)
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and public.user_has_workspace_access(c.workspace_id)
  )
);

DROP POLICY IF EXISTS "messages_delete_accessible" ON public.messages;
create policy "messages_delete_accessible"
on public.messages
for delete
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and public.user_has_workspace_access(c.workspace_id)
  )
);

-- Model runs
DROP POLICY IF EXISTS "model_runs_select_accessible" ON public.model_runs;
create policy "model_runs_select_accessible"
on public.model_runs
for select
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = model_runs.conversation_id
      and public.user_has_workspace_access(c.workspace_id)
  )
);

DROP POLICY IF EXISTS "model_runs_insert_accessible" ON public.model_runs;
create policy "model_runs_insert_accessible"
on public.model_runs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = model_runs.conversation_id
      and public.user_has_workspace_access(c.workspace_id)
  )
);

DROP POLICY IF EXISTS "model_runs_update_accessible" ON public.model_runs;
create policy "model_runs_update_accessible"
on public.model_runs
for update
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = model_runs.conversation_id
      and public.user_has_workspace_access(c.workspace_id)
  )
)
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = model_runs.conversation_id
      and public.user_has_workspace_access(c.workspace_id)
  )
);

DROP POLICY IF EXISTS "model_runs_delete_accessible" ON public.model_runs;
create policy "model_runs_delete_accessible"
on public.model_runs
for delete
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = model_runs.conversation_id
      and public.user_has_workspace_access(c.workspace_id)
  )
);

-- Module 1: sign-in, roles, users and teams.
-- Tables: profiles, teams, audit_log. RLS on all three with a default deny.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('superadmin', 'admin', 'team_lead', 'agent', 'analyst');
create type public.team_color as enum ('cyan', 'coral', 'pink', 'lemon', 'sky', 'lilac');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 40),
  -- Exactly one Team Lead per team. Kept in step with profiles by triggers below.
  team_lead_id uuid not null unique,
  color public.team_color not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index teams_name_unique on public.teams (lower(btrim(name)));

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 80),
  phone text unique check (phone ~ '^\+92[1-9][0-9]{9}$'),
  email text not null unique check (email = lower(email)),
  role public.app_role not null,
  team_id uuid references public.teams (id),
  photo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Agents always belong to a team. Team Leads get theirs when a team is created.
  -- Admins, the Superadmin and analysts sit outside teams.
  constraint profiles_team_by_role check (
    (role = 'agent' and team_id is not null)
    or role = 'team_lead'
    or (role in ('superadmin', 'admin', 'analyst') and team_id is null)
  )
);

-- At most one Team Lead row per team.
create unique index profiles_one_lead_per_team on public.profiles (team_id) where role = 'team_lead';
create index profiles_team_id_idx on public.profiles (team_id);

alter table public.teams
  add constraint teams_team_lead_fk foreign key (team_lead_id) references public.profiles (id);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references public.profiles (id),
  action text not null,
  entity text not null,
  entity_id text,
  meta jsonb not null default '{}'::jsonb,
  ip inet
);
create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_user_idx on public.audit_log (user_id, created_at desc);
create index audit_log_action_idx on public.audit_log (action, created_at desc);

-- ---------------------------------------------------------------------------
-- Helper functions (private schema, not exposed through the API)
-- ---------------------------------------------------------------------------
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- Role of the signed-in user, or null when signed out or disabled.
create function private.current_app_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) and p.is_active
$$;

create function private.current_team_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.team_id from public.profiles p where p.id = (select auth.uid()) and p.is_active
$$;

-- Admin rights need the second sign-in step (TOTP). A password alone is aal1.
create function private.has_aal2()
returns boolean
language sql stable set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
$$;

create function private.is_superadmin()
returns boolean
language sql stable set search_path = ''
as $$
  select private.current_app_role() = 'superadmin' and private.has_aal2()
$$;

create function private.is_admin_or_superadmin()
returns boolean
language sql stable set search_path = ''
as $$
  select private.current_app_role() in ('admin', 'superadmin') and private.has_aal2()
$$;

-- True for trusted server contexts (service role key, migrations, seed).
create function private.is_trusted_backend()
returns boolean
language sql stable set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'role', '') = 'service_role'
      or current_user in ('postgres', 'supabase_admin', 'service_role')
$$;

grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Triggers: column rights, Team Lead integrity, append-only audit log
-- ---------------------------------------------------------------------------

-- Only the Superadmin changes name, role, team, email, phone or status.
-- Everyone else may change only their own photo.
create function private.profiles_guard_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  if private.is_trusted_backend() or private.is_superadmin() then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.full_name is distinct from old.full_name
     or new.phone is distinct from old.phone
     or new.email is distinct from old.email
     or new.role is distinct from old.role
     or new.team_id is distinct from old.team_id
     or new.is_active is distinct from old.is_active
     or new.created_at is distinct from old.created_at then
    raise exception 'Only the Superadmin can change name, role or team.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function private.profiles_guard_update();

-- A Team Lead cannot leave their team, change role or be disabled while the
-- team still points at them. Change the Team Lead first.
create function private.profiles_protect_lead()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.role = 'team_lead' and old.team_id is not null
     and (new.team_id is distinct from old.team_id or new.role <> 'team_lead' or not new.is_active)
     and exists (select 1 from public.teams t where t.id = old.team_id and t.team_lead_id = old.id) then
    raise exception 'This person leads a team. Change the Team Lead first.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_lead
  before update on public.profiles
  for each row execute function private.profiles_protect_lead();

-- A team's lead must be an active Team Lead who does not lead another team.
create function private.teams_validate_lead()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  lead public.profiles;
begin
  if tg_op = 'UPDATE' and new.team_lead_id is not distinct from old.team_lead_id then
    return new;
  end if;
  select * into lead from public.profiles p where p.id = new.team_lead_id;
  if lead.id is null or lead.role <> 'team_lead' or not lead.is_active
     or (lead.team_id is not null and lead.team_id <> new.id) then
    raise exception 'Choose an active Team Lead who does not lead another team.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger teams_validate_lead
  before insert or update of team_lead_id on public.teams
  for each row execute function private.teams_validate_lead();

-- Point the lead's profile at the team. On a change, release the old lead first.
create function private.teams_sync_lead()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.team_lead_id is not distinct from old.team_lead_id then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    update public.profiles set team_id = null where id = old.team_lead_id and team_id = new.id;
  end if;
  update public.profiles set team_id = new.id where id = new.team_lead_id and team_id is distinct from new.id;
  return null;
end;
$$;

create trigger teams_sync_lead
  after insert or update of team_lead_id on public.teams
  for each row execute function private.teams_sync_lead();

-- Audit rows are permanent. This holds even for the service role.
create function private.audit_log_immutable()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'Audit log rows cannot be changed or deleted.' using errcode = '42501';
end;
$$;

create trigger audit_log_no_update
  before update or delete on public.audit_log
  for each row execute function private.audit_log_immutable();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function private.audit_log_immutable();

-- ---------------------------------------------------------------------------
-- Row-level security: default deny, then grant what section 3 allows
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.profiles, public.teams, public.audit_log from anon;

-- profiles: you see yourself; a Team Lead sees their team; Admin and Superadmin see everyone.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_admin_or_superadmin())
    or (
      (select private.current_app_role()) = 'team_lead'
      and team_id = (select private.current_team_id())
    )
  );

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check ((select private.is_superadmin()));

-- Own row (photo only, enforced by trigger) or Superadmin.
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select private.is_superadmin()))
  with check (id = (select auth.uid()) or (select private.is_superadmin()));

-- teams: names and colours are public inside the company (the Arena shows them).
create policy teams_select on public.teams
  for select to authenticated
  using (true);

create policy teams_insert on public.teams
  for insert to authenticated
  with check ((select private.is_superadmin()));

create policy teams_update on public.teams
  for update to authenticated
  using ((select private.is_superadmin()))
  with check ((select private.is_superadmin()));

-- audit_log: Superadmin reads. Rows are written by the server with the service role.
create policy audit_log_select on public.audit_log
  for select to authenticated
  using ((select private.is_superadmin()));

-- ---------------------------------------------------------------------------
-- Public profile view: only what boards and lists may show about a colleague
-- ---------------------------------------------------------------------------
create view public.profiles_public
with (security_invoker = false)
as
  select id, full_name, photo_url, role, team_id from public.profiles;

revoke all on public.profiles_public from anon;
grant select on public.profiles_public to authenticated;

-- ---------------------------------------------------------------------------
-- Server-only helper: end every session of a user at once (used on disable)
-- ---------------------------------------------------------------------------
create function public.admin_end_sessions(target uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from auth.sessions where user_id = target;
$$;

revoke execute on function public.admin_end_sessions(uuid) from public, anon, authenticated;
grant execute on function public.admin_end_sessions(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Storage: public avatars bucket, each user writes only their own folder
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Owner decision (8 Oct 2026): the Admin manages teams and their people.
-- Admin may create and edit teams, and add, edit, move or disable Team Leads and agents.
-- Only the Superadmin creates or changes Admins, analysts and the Superadmin.

-- Roles an Admin may manage.
create function private.admin_managed_role(r public.app_role)
returns boolean
language sql immutable set search_path = ''
as $$
  select r in ('team_lead', 'agent')
$$;

grant execute on function private.admin_managed_role(public.app_role) to authenticated, service_role;

-- profiles: insert and update widen to the Admin for Team Leads and agents.
drop policy profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (
    (select private.is_superadmin())
    or ((select private.is_admin_or_superadmin()) and private.admin_managed_role(role))
  );

drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_superadmin())
    or ((select private.is_admin_or_superadmin()) and private.admin_managed_role(role))
  )
  with check (
    id = (select auth.uid())
    or (select private.is_superadmin())
    or ((select private.is_admin_or_superadmin()) and private.admin_managed_role(role))
  );

-- Column rights: the Admin may change Team Leads and agents (never their email, never into another role group).
create or replace function private.profiles_guard_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  if private.is_trusted_backend() or private.is_superadmin() then
    return new;
  end if;
  if private.is_admin_or_superadmin()
     and private.admin_managed_role(old.role)
     and private.admin_managed_role(new.role)
     and new.id = old.id
     and new.email = old.email
     and new.created_at = old.created_at then
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

-- teams: the Admin creates and edits teams too.
drop policy teams_insert on public.teams;
create policy teams_insert on public.teams
  for insert to authenticated
  with check ((select private.is_admin_or_superadmin()));

drop policy teams_update on public.teams;
create policy teams_update on public.teams
  for update to authenticated
  using ((select private.is_admin_or_superadmin()))
  with check ((select private.is_admin_or_superadmin()));

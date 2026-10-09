-- Module 4: distribution and assignment. Leads reach agents fairly, and everyone sees only their own.

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id),
  type text not null check (type ~ '^[a-z_]{3,40}$'),
  message text not null check (char_length(message) between 1 and 300),
  link text check (link is null or link ~ '^/[A-Za-z0-9/_\-?=&.%]*$'),
  read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

-- You may only mark your own notifications read. A trigger stops any other change.
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create function private.notifications_read_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if private.is_trusted_backend() then
    return new;
  end if;
  if new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.type is distinct from old.type
     or new.message is distinct from old.message or new.link is distinct from old.link
     or new.created_at is distinct from old.created_at then
    raise exception 'Only the read time of a notification can change.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger notifications_read_only
  before update on public.notifications
  for each row execute function private.notifications_read_only();

-- Notifications are written by the system after an allowed action, never directly by users.
create function private.notify(p_user uuid, p_type text, p_message text, p_link text default null)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.notifications (user_id, type, message, link) values (p_user, p_type, p_message, p_link);
$$;

grant execute on function private.notify(uuid, text, text, text) to authenticated, service_role;

-- Live updates for the bell.
alter publication supabase_realtime add table public.notifications;

-- ---------------------------------------------------------------------------
-- assignments: append-only history of every move
-- ---------------------------------------------------------------------------
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.leads (id),
  from_user uuid references public.profiles (id),
  to_user uuid references public.profiles (id),
  from_team uuid references public.teams (id),
  to_team uuid references public.teams (id),
  assigned_by uuid references public.profiles (id),
  reason text check (reason is null or char_length(reason) <= 300)
);
create index assignments_lead_idx on public.assignments (lead_id, created_at desc);
create index assignments_to_team_idx on public.assignments (to_team, created_at desc);

create function private.assignments_immutable()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'Assignment history cannot be changed or deleted.' using errcode = '42501';
end;
$$;

create trigger assignments_no_change
  before update or delete on public.assignments
  for each row execute function private.assignments_immutable();
create trigger assignments_no_truncate
  before truncate on public.assignments
  for each statement execute function private.assignments_immutable();

alter table public.assignments enable row level security;
revoke all on public.assignments from anon;

create policy assignments_select on public.assignments
  for select to authenticated
  using (
    (select private.is_admin_or_superadmin())
    or (
      (select private.current_app_role()) = 'team_lead'
      and (from_team = (select private.current_team_id()) or to_team = (select private.current_team_id()))
    )
    or from_user = (select auth.uid())
    or to_user = (select auth.uid())
  );

-- Written by the assignment functions below, as the person doing the move.
create policy assignments_insert on public.assignments
  for insert to authenticated
  with check (
    assigned_by = (select auth.uid())
    and (
      (select private.is_admin_or_superadmin())
      or (
        (select private.current_app_role()) = 'team_lead'
        and to_team = (select private.current_team_id())
        and from_team = (select private.current_team_id())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- leads: row-level security for all five roles (BUILD.md section 3)
-- ---------------------------------------------------------------------------
drop policy leads_select_admins on public.leads;

-- Analysts get "referred only" access in Module 6.
create policy leads_select on public.leads
  for select to authenticated
  using (
    (select private.is_admin_or_superadmin())
    or (
      (select private.current_app_role()) = 'team_lead'
      and team_id = (select private.current_team_id())
    )
    or (
      (select private.current_app_role()) in ('agent', 'team_lead')
      and agent_id = (select auth.uid())
    )
  );

create policy leads_update on public.leads
  for update to authenticated
  using (
    (select private.is_admin_or_superadmin())
    or (
      (select private.current_app_role()) = 'team_lead'
      and team_id = (select private.current_team_id())
    )
    or (
      (select private.current_app_role()) in ('agent', 'team_lead')
      and agent_id = (select auth.uid())
    )
  )
  with check (
    (select private.is_admin_or_superadmin())
    or (
      (select private.current_app_role()) = 'team_lead'
      and team_id = (select private.current_team_id())
    )
    or (
      (select private.current_app_role()) in ('agent', 'team_lead')
      and agent_id = (select auth.uid())
      and team_id = (select private.current_team_id())
    )
  );

-- Who may change which columns. Admins change anything; Team Leads never move a lead out of
-- their team; agents never change ownership. Lead identity (name, phone, source, creator) is fixed.
create function private.leads_guard_update()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  role public.app_role := private.current_app_role();
begin
  if private.is_trusted_backend() or private.is_admin_or_superadmin() then
    return new;
  end if;
  if new.id is distinct from old.id or new.phone is distinct from old.phone or new.source is distinct from old.source
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
     or new.full_name is distinct from old.full_name then
    raise exception 'Only an Admin can change a lead''s name, phone or source.' using errcode = '42501';
  end if;
  if new.team_id is distinct from old.team_id then
    raise exception 'Only an Admin can move a lead to another team.' using errcode = '42501';
  end if;
  if role = 'agent' and new.agent_id is distinct from old.agent_id then
    raise exception 'Only a Team Lead or Admin can reassign a lead.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger leads_guard_update
  before update on public.leads
  for each row execute function private.leads_guard_update();

-- Stages a lead is still being worked in. Closed and verified leads are not "open".
create function private.is_open_stage(s public.lead_stage)
returns boolean
language sql immutable set search_path = ''
as $$
  select s in ('assigned', 'no_answer', 'follow_up', 'interested', 'with_analyst', 'post_session',
               'documents_pending', 'deposit_recorded')
$$;
grant execute on function private.is_open_stage(public.lead_stage) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Assignment functions. Security invoker: the caller's row-level security applies to every write.
-- Each call is one transaction, so a batch moves completely or not at all.
-- ---------------------------------------------------------------------------

-- Pool to team, or team to team (a move needs a reason). The receiving Team Lead is notified.
create function public.assign_leads_to_team(p_lead_ids uuid[], p_team_id uuid, p_reason text default null)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  me uuid := auth.uid();
  team public.teams;
  lead public.leads;
  moved integer := 0;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not private.is_admin_or_superadmin() then
    raise exception 'Only an Admin can send leads to teams.' using errcode = '42501';
  end if;
  select * into team from public.teams t where t.id = p_team_id and t.is_active;
  if team.id is null then
    raise exception 'Choose an active team.' using errcode = 'P0001';
  end if;

  for lead in select * from public.leads l where l.id = any(p_lead_ids) order by l.created_at, l.id for update loop
    if lead.team_id = p_team_id then
      continue;
    end if;
    if lead.team_id is not null and reason is null then
      raise exception 'Give a reason for moving a lead to another team.' using errcode = 'P0001';
    end if;
    if lead.team_id is null and lead.stage <> 'new' then
      raise exception 'Only new leads can go from the pool to a team.' using errcode = 'P0001';
    end if;
    update public.leads
       set team_id = p_team_id,
           agent_id = null,
           agent_assigned_at = null,
           returned_to_lead = false,
           stage = case when stage = 'new' then 'assigned'::public.lead_stage else stage end
     where id = lead.id;
    insert into public.assignments (lead_id, from_user, to_user, from_team, to_team, assigned_by, reason)
    values (lead.id, lead.agent_id, null, lead.team_id, p_team_id, me, reason);
    moved := moved + 1;
  end loop;

  if moved > 0 then
    perform private.notify(
      team.team_lead_id,
      'leads_to_assign',
      format('%s new %s for %s. Assign them to your agents.', moved, case when moved = 1 then 'lead' else 'leads' end, team.name),
      '/team/assign'
    );
  end if;
  return moved;
end;
$$;

-- Team to agent (or to the Team Lead themself). Reassigning needs a reason. The agent is notified.
create function public.assign_leads_to_agent(p_lead_ids uuid[], p_agent_id uuid, p_reason text default null)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  me uuid := auth.uid();
  agent public.profiles;
  lead public.leads;
  first_call integer;
  moved integer := 0;
  one_name text;
  one_source text;
  one_id uuid;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into agent from public.profiles p where p.id = p_agent_id;
  if agent.id is null or not agent.is_active or agent.role not in ('agent', 'team_lead') or agent.team_id is null then
    raise exception 'Choose an active agent or Team Lead.' using errcode = 'P0001';
  end if;
  if not private.is_admin_or_superadmin()
     and not (private.current_app_role() = 'team_lead' and private.current_team_id() = agent.team_id) then
    raise exception 'You can assign leads only within your own team.' using errcode = '42501';
  end if;

  select coalesce((value)::int, 24) into first_call from public.settings where key = 'first_call_deadline_hours';

  for lead in select * from public.leads l where l.id = any(p_lead_ids) order by l.created_at, l.id for update loop
    if lead.team_id is distinct from agent.team_id then
      raise exception 'A lead can only go to someone in its own team. Move it to that team first.' using errcode = 'P0001';
    end if;
    if lead.agent_id = p_agent_id then
      continue;
    end if;
    if lead.agent_id is not null and reason is null then
      raise exception 'Give a reason for reassigning a lead.' using errcode = 'P0001';
    end if;
    if not private.is_open_stage(lead.stage) then
      raise exception 'Closed leads cannot be assigned.' using errcode = 'P0001';
    end if;
    update public.leads
       set agent_id = p_agent_id,
           agent_assigned_at = now(),
           returned_to_lead = false
     where id = lead.id;
    insert into public.assignments (lead_id, from_user, to_user, from_team, to_team, assigned_by, reason)
    values (lead.id, lead.agent_id, p_agent_id, lead.team_id, lead.team_id, me, reason);
    moved := moved + 1;
    one_id := lead.id;
    one_name := split_part(lead.full_name, ' ', 1);
    one_source := lead.source;
  end loop;

  if moved = 1 and p_agent_id <> me then
    perform private.notify(
      p_agent_id, 'lead_assigned',
      format('New lead: %s, from %s. First call due in %s hours.', one_name, one_source, first_call),
      '/lead/' || one_id::text
    );
  elsif moved > 1 and p_agent_id <> me then
    perform private.notify(
      p_agent_id, 'lead_assigned',
      format('%s new leads assigned to you. First calls due in %s hours.', moved, first_call),
      '/today'
    );
  end if;
  return moved;
end;
$$;

-- When someone is disabled, their open leads go back to their Team Lead's unassigned list.
create function public.return_open_leads(p_user uuid, p_reason text)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  me uuid := auth.uid();
  lead public.leads;
  moved integer := 0;
  lead_of_team uuid;
begin
  if not private.is_admin_or_superadmin() then
    raise exception 'Only an Admin can return a person''s leads.' using errcode = '42501';
  end if;
  for lead in select * from public.leads l where l.agent_id = p_user and private.is_open_stage(l.stage) for update loop
    update public.leads
       set agent_id = null, agent_assigned_at = null, returned_to_lead = true
     where id = lead.id;
    insert into public.assignments (lead_id, from_user, to_user, from_team, to_team, assigned_by, reason)
    values (lead.id, p_user, null, lead.team_id, lead.team_id, me, p_reason);
    moved := moved + 1;
    lead_of_team := lead.team_id;
  end loop;
  if moved > 0 then
    perform private.notify(
      (select t.team_lead_id from public.teams t where t.id = lead_of_team),
      'leads_returned',
      format('%s %s came back to you to reassign.', moved, case when moved = 1 then 'lead' else 'leads' end),
      '/team/assign'
    );
  end if;
  return moved;
end;
$$;

revoke execute on function public.assign_leads_to_team(uuid[], uuid, text) from public, anon;
revoke execute on function public.assign_leads_to_agent(uuid[], uuid, text) from public, anon;
revoke execute on function public.return_open_leads(uuid, text) from public, anon;
grant execute on function public.assign_leads_to_team(uuid[], uuid, text) to authenticated;
grant execute on function public.assign_leads_to_agent(uuid[], uuid, text) to authenticated;
grant execute on function public.return_open_leads(uuid, text) to authenticated;

-- Module 4 fix: a Team Lead cannot read other teams' profiles, so assign_leads_to_agent looked up
-- the target person through row-level security and gave the wrong refusal. Read the three facts it
-- needs (role, team, active) through a narrow private helper instead, then check scope first.

create function private.person_brief(p_id uuid)
returns table (role public.app_role, team_id uuid, is_active boolean)
language sql stable security definer set search_path = ''
as $$
  select p.role, p.team_id, p.is_active from public.profiles p where p.id = p_id
$$;

grant execute on function private.person_brief(uuid) to authenticated, service_role;

create or replace function public.assign_leads_to_agent(p_lead_ids uuid[], p_agent_id uuid, p_reason text default null)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  me uuid := auth.uid();
  agent record;
  lead public.leads;
  first_call integer;
  moved integer := 0;
  one_name text;
  one_source text;
  one_id uuid;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into agent from private.person_brief(p_agent_id);
  if agent.role is null then
    raise exception 'Choose an active agent or Team Lead.' using errcode = 'P0001';
  end if;
  if not private.is_admin_or_superadmin()
     and not (private.current_app_role() = 'team_lead' and private.current_team_id() = agent.team_id) then
    raise exception 'You can assign leads only within your own team.' using errcode = '42501';
  end if;
  if not agent.is_active or agent.role not in ('agent', 'team_lead') or agent.team_id is null then
    raise exception 'Choose an active agent or Team Lead.' using errcode = 'P0001';
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

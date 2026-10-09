-- Module 5: lead page, calls and follow-ups.

-- ---------------------------------------------------------------------------
-- Who may work a lead (section 3: log calls and follow-ups)
-- ---------------------------------------------------------------------------
create function private.can_work_lead(p_lead_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.leads l
     where l.id = p_lead_id
       and (
         private.is_admin_or_superadmin()
         or (private.current_app_role() = 'team_lead' and l.team_id = private.current_team_id())
         or (private.current_app_role() in ('agent', 'team_lead') and l.agent_id = auth.uid())
       )
  )
$$;
grant execute on function private.can_work_lead(uuid) to authenticated, service_role;

-- Audit rows from inside the database (same table, same append-only rules).
create function private.audit(p_action text, p_entity text, p_entity_id text, p_meta jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.audit_log (user_id, action, entity, entity_id, meta) values (auth.uid(), p_action, p_entity, p_entity_id, p_meta);
$$;
grant execute on function private.audit(text, text, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- activities: the append-only timeline
-- ---------------------------------------------------------------------------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.leads (id),
  user_id uuid references public.profiles (id),
  type text not null check (type in ('call', 'whatsapp', 'note', 'stage_change', 'system')),
  outcome text check (outcome is null or outcome in ('no_answer', 'follow_up', 'interested', 'not_interested', 'invalid')),
  from_stage public.lead_stage,
  to_stage public.lead_stage,
  notes text check (notes is null or char_length(notes) <= 2000)
);
create index activities_lead_idx on public.activities (lead_id, created_at desc);
create index activities_user_day_idx on public.activities (user_id, created_at desc);

create function private.activities_immutable()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'Activities cannot be changed or deleted.' using errcode = '42501';
end;
$$;
create trigger activities_no_change before update or delete on public.activities
  for each row execute function private.activities_immutable();
create trigger activities_no_truncate before truncate on public.activities
  for each statement execute function private.activities_immutable();

alter table public.activities enable row level security;
revoke all on public.activities from anon;

-- You see the timeline of the leads you can see. Writes go through record_lead_event only.
create policy activities_select on public.activities
  for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));

-- ---------------------------------------------------------------------------
-- follow_ups: drives Today's calls and the streak
-- ---------------------------------------------------------------------------
create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.leads (id),
  -- Who was responsible when it was booked (for streaks). The lead's current agent gets the reminders.
  agent_id uuid references public.profiles (id),
  due_at timestamptz not null,
  done_at timestamptz,
  status text not null default 'open' check (status in ('open', 'done', 'missed')),
  due_soon_notified_at timestamptz,
  overdue_notified_at timestamptz
);
create index follow_ups_lead_idx on public.follow_ups (lead_id, created_at desc);
create index follow_ups_open_due_idx on public.follow_ups (due_at) where status = 'open';
create index follow_ups_agent_idx on public.follow_ups (agent_id, due_at);

alter table public.follow_ups enable row level security;
revoke all on public.follow_ups from anon;

create policy follow_ups_select on public.follow_ups
  for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));

-- ---------------------------------------------------------------------------
-- Stage rules in the database (mirror of lib/leads/stage-machine.ts)
-- ---------------------------------------------------------------------------
create function private.allowed_transition(p_from public.lead_stage, p_to public.lead_stage)
returns boolean
language sql immutable set search_path = ''
as $$
  select case p_from
    when 'new' then p_to in ('assigned')
    when 'assigned' then p_to in ('no_answer', 'follow_up', 'interested', 'not_interested', 'invalid')
    when 'no_answer' then p_to in ('no_answer', 'follow_up', 'interested', 'not_interested', 'invalid')
    when 'follow_up' then p_to in ('no_answer', 'follow_up', 'interested', 'not_interested', 'invalid')
    when 'interested' then p_to in ('with_analyst', 'documents_pending', 'follow_up', 'not_interested')
    when 'with_analyst' then p_to in ('post_session', 'interested')
    when 'post_session' then p_to in ('documents_pending', 'with_analyst', 'not_interested')
    when 'documents_pending' then p_to in ('deposit_recorded', 'not_interested')
    when 'deposit_recorded' then p_to in ('deposit_verified', 'documents_pending')
    when 'deposit_verified' then false
    when 'not_interested' then p_to in ('new')
    when 'invalid' then p_to in ('follow_up')
  end
$$;
grant execute on function private.allowed_transition(public.lead_stage, public.lead_stage) to authenticated, service_role;

-- Stages a lead may only be in with a booked follow-up.
create function private.needs_follow_up(s public.lead_stage)
returns boolean
language sql immutable set search_path = ''
as $$
  select s in ('no_answer', 'follow_up', 'interested', 'with_analyst', 'post_session', 'documents_pending')
$$;

create function private.leads_stage_guard()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  cooling integer;
begin
  if new.stage is not distinct from old.stage then
    return new;
  end if;
  -- Fixtures, migrations and server jobs (no signed-in user, or the service role) are trusted.
  if auth.uid() is null or coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;
  if not private.allowed_transition(old.stage, new.stage) then
    raise exception 'A lead cannot move from % to %.', old.stage, new.stage using errcode = 'P0001';
  end if;
  if private.needs_follow_up(new.stage) and new.next_follow_up_at is null then
    raise exception 'Book the next follow-up before saving.' using errcode = 'P0001';
  end if;
  if new.stage in ('not_interested', 'invalid') and nullif(btrim(coalesce(new.close_reason, '')), '') is null then
    raise exception 'Choose a reason.' using errcode = 'P0001';
  end if;
  if old.stage = 'invalid' and not (
       private.is_admin_or_superadmin()
       or (private.current_app_role() = 'team_lead' and old.team_id = private.current_team_id())) then
    raise exception 'Only the Team Lead can reject an Invalid mark.' using errcode = '42501';
  end if;
  if old.stage = 'not_interested' and new.stage = 'new' then
    if not private.is_admin_or_superadmin() then
      raise exception 'Only an Admin can return a lead to the pool.' using errcode = '42501';
    end if;
    select coalesce((value)::int, 90) into cooling from public.settings where key = 'cooling_off_days';
    if coalesce(old.last_activity_at, old.created_at) > now() - make_interval(days => cooling) then
      raise exception 'This lead is still in its cooling-off period.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger leads_stage_guard
  before update of stage on public.leads
  for each row execute function private.leads_stage_guard();

-- ---------------------------------------------------------------------------
-- record_lead_event: one call, note or stage move, applied atomically.
-- The server decides the change with the stage machine; this checks access, applies it,
-- writes the activity and audit rows, books follow-ups and sends notifications.
-- ---------------------------------------------------------------------------
create function public.record_lead_event(
  p_lead_id uuid,
  p_expected_stage public.lead_stage,
  p_type text,
  p_new_stage public.lead_stage default null,
  p_outcome text default null,
  p_notes text default null,
  p_next_follow_up_at timestamptz default null,
  p_close_reason text default null,
  p_no_answer_increment integer default 0,
  p_release_agent boolean default false
)
returns public.leads
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  lead public.leads;
  updated public.leads;
  target public.lead_stage;
  team_lead uuid;
  my_name text;
  first_name text;
begin
  if me is null or not private.can_work_lead(p_lead_id) then
    raise exception 'This lead belongs to another team.' using errcode = '42501';
  end if;
  if p_type not in ('call', 'whatsapp', 'note', 'stage_change') then
    raise exception 'Unknown activity type.' using errcode = 'P0001';
  end if;

  select * into lead from public.leads where id = p_lead_id for update;
  if lead.stage <> p_expected_stage then
    raise exception 'This lead changed while you were working on it. Refresh and try again.' using errcode = 'P0001';
  end if;
  if p_next_follow_up_at is not null and (p_next_follow_up_at < now() - interval '1 minute' or p_next_follow_up_at > now() + interval '120 days') then
    raise exception 'Choose a follow-up time in the future, within 120 days.' using errcode = 'P0001';
  end if;

  target := coalesce(p_new_stage, lead.stage);
  first_name := split_part(lead.full_name, ' ', 1);
  select split_part(full_name, ' ', 1) into my_name from public.profiles where id = me;

  -- The stage trigger re-checks the transition, follow-up and reason rules.
  update public.leads l
     set stage = target,
         next_follow_up_at = case
           when p_next_follow_up_at is not null then p_next_follow_up_at
           when target in ('not_interested', 'invalid', 'deposit_verified', 'new') then null
           else l.next_follow_up_at end,
         close_reason = case
           when target in ('not_interested', 'invalid') then nullif(btrim(coalesce(p_close_reason, '')), '')
           when target <> l.stage then null
           else l.close_reason end,
         invalid_confirmed_by = case when target = 'invalid' and l.stage <> 'invalid' then null else l.invalid_confirmed_by end,
         no_answer_count = l.no_answer_count + greatest(p_no_answer_increment, 0),
         last_activity_at = case when p_type in ('call', 'whatsapp', 'stage_change') then now() else l.last_activity_at end,
         agent_id = case when p_release_agent then null else l.agent_id end,
         agent_assigned_at = case when p_release_agent then null else l.agent_assigned_at end,
         returned_to_lead = case when p_release_agent then true else l.returned_to_lead end
   where l.id = p_lead_id
   returning * into updated;

  -- Follow-ups: anything open is now done; book the next one.
  if p_type in ('call', 'stage_change') or p_next_follow_up_at is not null then
    update public.follow_ups set status = 'done', done_at = now() where lead_id = p_lead_id and status = 'open';
  end if;
  if p_next_follow_up_at is not null then
    insert into public.follow_ups (lead_id, agent_id, due_at) values (p_lead_id, coalesce(lead.agent_id, me), p_next_follow_up_at);
  end if;

  insert into public.activities (lead_id, user_id, type, outcome, from_stage, to_stage, notes)
  values (p_lead_id, me, p_type, p_outcome,
          case when target <> lead.stage then lead.stage end,
          case when target <> lead.stage then target end,
          nullif(btrim(coalesce(p_notes, '')), ''));

  perform private.audit(
    case when target <> lead.stage then 'lead.stage_change' else 'lead.' || p_type end,
    'lead', p_lead_id::text,
    jsonb_build_object('type', p_type, 'outcome', p_outcome, 'from', lead.stage, 'to', target,
                       'next_follow_up_at', p_next_follow_up_at, 'released', p_release_agent)
  );

  select t.team_lead_id into team_lead from public.teams t where t.id = lead.team_id;

  if p_release_agent then
    insert into public.assignments (lead_id, from_user, to_user, from_team, to_team, assigned_by, reason)
    values (p_lead_id, lead.agent_id, null, lead.team_id, lead.team_id, me, 'Maximum call tries reached');
    if team_lead is not null then
      perform private.notify(team_lead, 'lead_returned',
        format('%s: no answer %s times. Back with you to reassign.', first_name, updated.no_answer_count),
        '/lead/' || p_lead_id::text);
    end if;
  end if;
  if target = 'invalid' and lead.stage <> 'invalid' and team_lead is not null and team_lead <> me then
    perform private.notify(team_lead, 'invalid_to_confirm',
      format('%s marked %s invalid: %s. Confirm or reject.', coalesce(my_name, 'An agent'), first_name, updated.close_reason),
      '/lead/' || p_lead_id::text);
  end if;
  if lead.stage = 'invalid' and target = 'follow_up' and lead.agent_id is not null and lead.agent_id <> me then
    perform private.notify(lead.agent_id, 'invalid_rejected',
      format('%s is not invalid. Call again.', first_name), '/lead/' || p_lead_id::text);
  end if;
  if p_type = 'note' and lead.agent_id is not null and lead.agent_id <> me then
    perform private.notify(lead.agent_id, 'lead_note',
      format('Note from %s on %s: %s', coalesce(my_name, 'your Team Lead'), first_name, left(btrim(coalesce(p_notes, '')), 140)),
      '/lead/' || p_lead_id::text);
  end if;

  return updated;
end;
$$;

revoke execute on function public.record_lead_event(uuid, public.lead_stage, text, public.lead_stage, text, text, timestamptz, text, integer, boolean) from public, anon;
grant execute on function public.record_lead_event(uuid, public.lead_stage, text, public.lead_stage, text, text, timestamptz, text, integer, boolean) to authenticated;

-- The Team Lead (or Admin) confirms an agent's Invalid mark. The lead stays closed.
create function public.confirm_invalid(p_lead_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  lead public.leads;
begin
  select * into lead from public.leads where id = p_lead_id for update;
  if lead.id is null or not (
       private.is_admin_or_superadmin()
       or (private.current_app_role() = 'team_lead' and lead.team_id = private.current_team_id())) then
    raise exception 'Only the Team Lead can confirm an Invalid mark.' using errcode = '42501';
  end if;
  if lead.stage <> 'invalid' or lead.invalid_confirmed_by is not null then
    raise exception 'This lead is not waiting for confirmation.' using errcode = 'P0001';
  end if;
  update public.leads set invalid_confirmed_by = auth.uid() where id = p_lead_id;
  insert into public.activities (lead_id, user_id, type, notes) values (p_lead_id, auth.uid(), 'system', 'Invalid mark confirmed.');
  perform private.audit('lead.invalid_confirmed', 'lead', p_lead_id::text, '{}'::jsonb);
end;
$$;
revoke execute on function public.confirm_invalid(uuid) from public, anon;
grant execute on function public.confirm_invalid(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Follow-up sweep: mark missed follow-ups, send "due soon" and "overdue" reminders.
-- Runs every 5 minutes through pg_cron; also callable by the server with the service role.
-- ---------------------------------------------------------------------------
create function public.run_follow_up_sweep()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  soon integer := 0;
  late integer := 0;
  missed integer := 0;
  f record;
begin
  -- Due within 30 minutes: one reminder.
  for f in
    select fu.id, fu.due_at, l.id as lead_id, l.full_name, l.agent_id
      from public.follow_ups fu join public.leads l on l.id = fu.lead_id
     where fu.status = 'open' and fu.due_soon_notified_at is null
       and fu.due_at > now() and fu.due_at <= now() + interval '30 minutes'
       and l.agent_id is not null
  loop
    perform private.notify(f.agent_id, 'follow_up_due_soon',
      format('Follow-up with %s due at %s.', split_part(f.full_name, ' ', 1),
             lower(to_char(f.due_at at time zone 'Asia/Karachi', 'FMHH12:MI am'))),
      '/lead/' || f.lead_id::text);
    update public.follow_ups set due_soon_notified_at = now() where id = f.id;
    soon := soon + 1;
  end loop;

  -- Past due: one overdue reminder.
  for f in
    select fu.id, l.id as lead_id, l.full_name, l.agent_id
      from public.follow_ups fu join public.leads l on l.id = fu.lead_id
     where fu.status = 'open' and fu.overdue_notified_at is null and fu.due_at <= now() and l.agent_id is not null
  loop
    perform private.notify(f.agent_id, 'follow_up_overdue',
      format('Follow-up with %s is overdue. Call now.', split_part(f.full_name, ' ', 1)),
      '/lead/' || f.lead_id::text);
    update public.follow_ups set overdue_notified_at = now() where id = f.id;
    late := late + 1;
  end loop;

  -- More than 15 minutes past due and still open: missed (counts against the streak).
  update public.follow_ups set status = 'missed'
   where status = 'open' and due_at < now() - interval '15 minutes';
  get diagnostics missed = row_count;

  return jsonb_build_object('due_soon', soon, 'overdue', late, 'missed', missed);
end;
$$;
revoke execute on function public.run_follow_up_sweep() from public, anon, authenticated;
grant execute on function public.run_follow_up_sweep() to service_role;

create extension if not exists pg_cron;
select cron.schedule('follow-up-sweep', '*/5 * * * *', $$select public.run_follow_up_sweep()$$);

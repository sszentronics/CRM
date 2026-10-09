-- Module 6: analyst sessions. The optional hand-off to Technical Analysis, and crediting the analyst.

create type public.session_mode as enum ('office', 'video', 'phone');
create type public.session_outcome as enum ('attended', 'no_show', 'rescheduled');

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.leads (id),
  -- Null means "any available": the first analyst to accept takes it.
  analyst_id uuid references public.profiles (id),
  referred_by uuid not null references public.profiles (id),
  referral_note text not null check (char_length(btrim(referral_note)) between 3 and 1000),
  preferred_at timestamptz,
  scheduled_at timestamptz,
  mode public.session_mode not null default 'office',
  accepted_at timestamptz,
  outcome public.session_outcome,
  client_level text check (client_level is null or client_level in ('beginner', 'some_experience', 'experienced')),
  interest_level text check (interest_level is null or interest_level in ('low', 'medium', 'high')),
  notes text check (notes is null or char_length(notes) <= 3000),
  next_step text check (next_step is null or char_length(next_step) <= 300),
  handed_back_at timestamptz,
  cancelled_at timestamptz,
  deadline_alerted_at timestamptz
);
create index sessions_lead_idx on public.sessions (lead_id, created_at desc);
create index sessions_open_analyst_idx on public.sessions (analyst_id) where handed_back_at is null and cancelled_at is null;
-- One open session per lead at a time.
create unique index sessions_one_open_per_lead on public.sessions (lead_id) where handed_back_at is null and cancelled_at is null;

create function private.is_open_session(s public.sessions)
returns boolean
language sql immutable set search_path = ''
as $$
  select s.handed_back_at is null and s.cancelled_at is null
$$;

-- The analyst holding an open session on this lead (row-level security on leads uses this).
create function private.analyst_has_open_session(p_lead_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.sessions s
     where s.lead_id = p_lead_id and s.analyst_id = auth.uid()
       and s.handed_back_at is null and s.cancelled_at is null
  )
$$;
grant execute on function private.analyst_has_open_session(uuid) to authenticated, service_role;

alter table public.sessions enable row level security;
revoke all on public.sessions from anon;

-- Sessions on leads you can see; your own sessions; and unclaimed referrals for analysts to pick up.
create policy sessions_select on public.sessions
  for select to authenticated
  using (
    exists (select 1 from public.leads l where l.id = lead_id)
    or analyst_id = (select auth.uid())
    or (
      (select private.current_app_role()) = 'analyst'
      and analyst_id is null and handed_back_at is null and cancelled_at is null
    )
  );

-- ---------------------------------------------------------------------------
-- Leads: "referred only" for analysts (section 3)
-- ---------------------------------------------------------------------------
drop policy leads_select on public.leads;
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
    or (
      (select private.current_app_role()) = 'analyst'
      and private.analyst_has_open_session(id)
    )
  );

-- Analysts may log calls and notes on leads they hold a session for.
create or replace function private.can_work_lead(p_lead_id uuid)
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
         or (private.current_app_role() = 'analyst' and private.analyst_has_open_session(l.id))
       )
  )
$$;

-- Who may refer, cancel or see a lead's sessions as its owner: Admin, the team's Team Lead, the agent.
create function private.owns_lead(p_lead_id uuid)
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
grant execute on function private.owns_lead(uuid) to authenticated, service_role;

-- A lead's stage change made inside these functions, with its timeline and audit rows.
create function private.session_stage(p_lead public.leads, p_to public.lead_stage, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_lead.stage = p_to then
    return;
  end if;
  update public.leads set stage = p_to, last_activity_at = now() where id = p_lead.id;
  insert into public.activities (lead_id, user_id, type, from_stage, to_stage, notes)
  values (p_lead.id, auth.uid(), 'stage_change', p_lead.stage, p_to, p_note);
  perform private.audit('lead.stage_change', 'lead', p_lead.id::text,
    jsonb_build_object('from', p_lead.stage, 'to', p_to, 'via', 'session'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Refer
-- ---------------------------------------------------------------------------
create function public.refer_to_analyst(
  p_lead_id uuid,
  p_analyst_id uuid,
  p_preferred_at timestamptz,
  p_mode public.session_mode,
  p_note text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  lead public.leads;
  sid uuid;
  analyst public.profiles;
  a record;
  first_name text;
begin
  if me is null or not private.owns_lead(p_lead_id) then
    raise exception 'This lead belongs to another team.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null or char_length(btrim(p_note)) < 3 then
    raise exception 'Add a note for the analyst: what does the client want to know?' using errcode = 'P0001';
  end if;
  select * into lead from public.leads where id = p_lead_id for update;
  if lead.stage not in ('interested', 'post_session', 'with_analyst') then
    raise exception 'Only interested clients can be referred to Technical Analysis.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.sessions s where s.lead_id = p_lead_id and s.handed_back_at is null and s.cancelled_at is null) then
    raise exception 'This client already has an open referral.' using errcode = 'P0001';
  end if;
  if p_preferred_at is not null and p_preferred_at < now() - interval '1 minute' then
    raise exception 'Choose a preferred time in the future.' using errcode = 'P0001';
  end if;
  if p_analyst_id is not null then
    select * into analyst from public.profiles where id = p_analyst_id;
    if analyst.id is null or analyst.role <> 'analyst' or not analyst.is_active then
      raise exception 'Choose an active analyst, or Any available.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.sessions (lead_id, analyst_id, referred_by, referral_note, preferred_at, mode)
  values (p_lead_id, p_analyst_id, me, btrim(p_note), p_preferred_at, p_mode)
  returning id into sid;

  insert into public.activities (lead_id, user_id, type, notes)
  values (p_lead_id, me, 'system', 'Referred to Technical Analysis: ' || btrim(p_note));
  perform private.session_stage(lead, 'with_analyst', null);
  perform private.audit('session.refer', 'session', sid::text, jsonb_build_object('lead_id', p_lead_id, 'analyst_id', p_analyst_id));

  first_name := split_part(lead.full_name, ' ', 1);
  if p_analyst_id is not null then
    perform private.notify(p_analyst_id, 'referral_new',
      format('New referral: %s, from %s. Accept it and book a time.', first_name, lead.source), '/sessions');
  else
    for a in select id from public.profiles where role = 'analyst' and is_active loop
      perform private.notify(a.id, 'referral_new',
        format('New referral: %s. Any analyst can take it.', first_name), '/sessions');
    end loop;
  end if;
  return sid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accept: one conditional update, so two analysts racing for "any available" cannot both win.
-- ---------------------------------------------------------------------------
create function public.accept_referral(p_session_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  s public.sessions;
  lead public.leads;
  my_name text;
begin
  if private.current_app_role() is distinct from 'analyst' then
    raise exception 'Only analysts accept referrals.' using errcode = '42501';
  end if;
  update public.sessions
     set analyst_id = me, accepted_at = now()
   where id = p_session_id
     and handed_back_at is null and cancelled_at is null and accepted_at is null
     and (analyst_id is null or analyst_id = me)
  returning * into s;
  if s.id is null then
    raise exception 'Another analyst already took this referral.' using errcode = 'P0001';
  end if;
  select * into lead from public.leads where id = s.lead_id;
  select split_part(full_name, ' ', 1) into my_name from public.profiles where id = me;
  insert into public.activities (lead_id, user_id, type, notes) values (s.lead_id, me, 'system', 'Referral accepted by ' || coalesce(my_name, 'an analyst') || '.');
  perform private.audit('session.accept', 'session', s.id::text, '{}'::jsonb);
  if lead.agent_id is not null then
    perform private.notify(lead.agent_id, 'referral_accepted',
      format('%s is taking the session with %s.', coalesce(my_name, 'An analyst'), split_part(lead.full_name, ' ', 1)),
      '/lead/' || lead.id::text);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Schedule (or reschedule)
-- ---------------------------------------------------------------------------
create function public.schedule_session(p_session_id uuid, p_scheduled_at timestamptz, p_mode public.session_mode)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  s public.sessions;
  lead public.leads;
  was timestamptz;
begin
  select * into s from public.sessions where id = p_session_id for update;
  if s.id is null or not private.is_open_session(s) or not (s.analyst_id = me or private.is_admin_or_superadmin()) then
    raise exception 'Only the analyst holding this session can book it.' using errcode = '42501';
  end if;
  if s.accepted_at is null then
    raise exception 'Accept the referral first.' using errcode = 'P0001';
  end if;
  if p_scheduled_at is null or p_scheduled_at < now() - interval '1 minute' then
    raise exception 'Choose a session time in the future.' using errcode = 'P0001';
  end if;
  was := s.scheduled_at;
  update public.sessions
     set scheduled_at = p_scheduled_at, mode = p_mode,
         outcome = case when was is not null then 'rescheduled'::public.session_outcome else outcome end
   where id = p_session_id;
  select * into lead from public.leads where id = s.lead_id;
  insert into public.activities (lead_id, user_id, type, notes)
  values (s.lead_id, me, 'system', format('Session %s for %s (%s).',
    case when was is null then 'booked' else 'moved' end,
    lower(to_char(p_scheduled_at at time zone 'Asia/Karachi', 'Dy DD Mon, FMHH12:MI am')), p_mode));
  perform private.audit(case when was is null then 'session.schedule' else 'session.reschedule' end, 'session', s.id::text,
    jsonb_build_object('old', was, 'new', p_scheduled_at, 'mode', p_mode));
  if lead.agent_id is not null then
    perform private.notify(lead.agent_id, 'session_booked',
      format('Session with %s %s for %s.', split_part(lead.full_name, ' ', 1),
        case when was is null then 'booked' else 'moved' end,
        lower(to_char(p_scheduled_at at time zone 'Asia/Karachi', 'Dy DD Mon, FMHH12:MI am'))),
      '/lead/' || lead.id::text);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Outcome and hand-back. Attended: post_session and the analyst is credited.
-- No-show: the stage stays with_analyst. Either way the analyst's access ends.
-- ---------------------------------------------------------------------------
create function public.record_session_outcome(
  p_session_id uuid,
  p_outcome public.session_outcome,
  p_client_level text,
  p_interest_level text,
  p_notes text,
  p_next_step text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  s public.sessions;
  lead public.leads;
  first_name text;
begin
  select * into s from public.sessions where id = p_session_id for update;
  if s.id is null or not private.is_open_session(s) or not (s.analyst_id = me or private.is_admin_or_superadmin()) then
    raise exception 'Only the analyst holding this session can record it.' using errcode = '42501';
  end if;
  if p_outcome not in ('attended', 'no_show') then
    raise exception 'Choose Attended or No-show. To move the session, book a new time.' using errcode = 'P0001';
  end if;
  if p_outcome = 'attended' and (nullif(btrim(coalesce(p_notes, '')), '') is null or p_client_level is null or p_interest_level is null) then
    raise exception 'Add the client level, interest and your notes before handing back.' using errcode = 'P0001';
  end if;

  select * into lead from public.leads where id = s.lead_id for update;
  first_name := split_part(lead.full_name, ' ', 1);

  update public.sessions
     set outcome = p_outcome, client_level = p_client_level, interest_level = p_interest_level,
         notes = nullif(btrim(coalesce(p_notes, '')), ''), next_step = nullif(btrim(coalesce(p_next_step, '')), ''),
         handed_back_at = now()
   where id = p_session_id;

  if p_outcome = 'attended' then
    update public.leads set credited_analyst_id = s.analyst_id where id = lead.id;
    perform private.session_stage(lead, 'post_session', 'Session attended. ' || coalesce(nullif(btrim(p_next_step), ''), ''));
    if lead.agent_id is not null then
      perform private.notify(lead.agent_id, 'session_attended',
        format('Session with %s done. The analyst''s notes are on the lead.', first_name), '/lead/' || lead.id::text);
    end if;
  else
    insert into public.activities (lead_id, user_id, type, notes)
    values (lead.id, me, 'system', 'Client did not attend the session.');
    if lead.agent_id is not null then
      perform private.notify(lead.agent_id, 'session_no_show',
        format('%s did not attend the session. Call to rebook or move on.', first_name), '/lead/' || lead.id::text);
    end if;
  end if;
  perform private.audit('session.hand_back', 'session', s.id::text,
    jsonb_build_object('outcome', p_outcome, 'credited_analyst_id', case when p_outcome = 'attended' then s.analyst_id end));
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancel before the session: the lead goes back to interested.
-- ---------------------------------------------------------------------------
create function public.cancel_referral(p_session_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  s public.sessions;
  lead public.leads;
begin
  select * into s from public.sessions where id = p_session_id for update;
  if s.id is null or not private.owns_lead(s.lead_id) then
    raise exception 'This lead belongs to another team.' using errcode = '42501';
  end if;
  if not private.is_open_session(s) then
    raise exception 'This referral is already closed.' using errcode = 'P0001';
  end if;
  update public.sessions set cancelled_at = now() where id = p_session_id;
  select * into lead from public.leads where id = s.lead_id for update;
  insert into public.activities (lead_id, user_id, type, notes)
  values (lead.id, me, 'system', 'Referral cancelled. ' || coalesce(nullif(btrim(p_reason), ''), ''));
  if lead.stage = 'with_analyst' then
    perform private.session_stage(lead, 'interested', null);
  end if;
  perform private.audit('session.cancel', 'session', s.id::text, jsonb_build_object('reason', p_reason));
  if s.analyst_id is not null and s.analyst_id <> me then
    perform private.notify(s.analyst_id, 'referral_cancelled',
      format('The referral for %s was cancelled.', split_part(lead.full_name, ' ', 1)), '/sessions');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Queue helpers
-- ---------------------------------------------------------------------------

-- Unclaimed referrals and ones sent to me, with only what an analyst needs before accepting.
create function public.open_referrals()
returns table (
  session_id uuid, created_at timestamptz, first_name text, source text, city text, referral_note text,
  preferred_at timestamptz, mode public.session_mode, referred_by text, for_me boolean
)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.created_at, split_part(l.full_name, ' ', 1), l.source, l.city, s.referral_note,
         s.preferred_at, s.mode, split_part(p.full_name, ' ', 1), s.analyst_id is not null
    from public.sessions s
    join public.leads l on l.id = s.lead_id
    join public.profiles p on p.id = s.referred_by
   where private.current_app_role() = 'analyst'
     and s.handed_back_at is null and s.cancelled_at is null and s.accepted_at is null
     and (s.analyst_id is null or s.analyst_id = auth.uid())
   order by s.created_at
$$;

-- Open sessions per active analyst, for the referral drawer.
create function public.analyst_load()
returns table (analyst_id uuid, full_name text, open_sessions bigint)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.full_name,
         (select count(*) from public.sessions s
           where s.analyst_id = p.id and s.handed_back_at is null and s.cancelled_at is null)
    from public.profiles p
   where p.role = 'analyst' and p.is_active and auth.uid() is not null
   order by p.full_name
$$;

-- The analyst's own credit: clients credited to them (verified deposit totals arrive in Module 8).
create function public.my_analyst_credit()
returns table (credited_clients bigint, sessions_held bigint)
language sql stable security definer set search_path = ''
as $$
  select (select count(*) from public.leads l where l.credited_analyst_id = auth.uid()),
         (select count(*) from public.sessions s where s.analyst_id = auth.uid() and s.outcome = 'attended')
$$;

-- ---------------------------------------------------------------------------
-- Referral deadline: alert the Admins once when a referral has no session date in time.
-- ---------------------------------------------------------------------------
create function public.run_referral_sweep()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  hours integer;
  r record;
  a record;
  alerted integer := 0;
begin
  select coalesce((value)::int, 24) into hours from public.settings where key = 'referral_deadline_hours';
  for r in
    select s.id, l.id as lead_id, l.full_name
      from public.sessions s join public.leads l on l.id = s.lead_id
     where s.handed_back_at is null and s.cancelled_at is null and s.scheduled_at is null
       and s.deadline_alerted_at is null and s.created_at < now() - make_interval(hours => hours)
  loop
    for a in select id from public.profiles where role in ('admin', 'superadmin') and is_active loop
      perform private.notify(a.id, 'referral_overdue',
        format('The referral for %s has no session date after %s hours.', split_part(r.full_name, ' ', 1), hours),
        '/lead/' || r.lead_id::text);
    end loop;
    update public.sessions set deadline_alerted_at = now() where id = r.id;
    alerted := alerted + 1;
  end loop;
  return alerted;
end;
$$;

revoke execute on function public.refer_to_analyst(uuid, uuid, timestamptz, public.session_mode, text) from public, anon;
revoke execute on function public.accept_referral(uuid) from public, anon;
revoke execute on function public.schedule_session(uuid, timestamptz, public.session_mode) from public, anon;
revoke execute on function public.record_session_outcome(uuid, public.session_outcome, text, text, text, text) from public, anon;
revoke execute on function public.cancel_referral(uuid, text) from public, anon;
revoke execute on function public.open_referrals() from public, anon;
revoke execute on function public.analyst_load() from public, anon;
revoke execute on function public.my_analyst_credit() from public, anon;
revoke execute on function public.run_referral_sweep() from public, anon, authenticated;
grant execute on function public.refer_to_analyst(uuid, uuid, timestamptz, public.session_mode, text) to authenticated;
grant execute on function public.accept_referral(uuid) to authenticated;
grant execute on function public.schedule_session(uuid, timestamptz, public.session_mode) to authenticated;
grant execute on function public.record_session_outcome(uuid, public.session_outcome, text, text, text, text) to authenticated;
grant execute on function public.cancel_referral(uuid, text) to authenticated;
grant execute on function public.open_referrals() to authenticated;
grant execute on function public.analyst_load() to authenticated;
grant execute on function public.my_analyst_credit() to authenticated;
grant execute on function public.run_referral_sweep() to service_role;

select cron.schedule('referral-sweep', '*/15 * * * *', $$select public.run_referral_sweep()$$);

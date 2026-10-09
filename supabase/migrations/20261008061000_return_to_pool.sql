-- Module 5: an Admin may return a Not interested lead to the pool after the cooling-off period
-- (section 4). The lead leaves its team and agent, and its no-answer count starts again.

create or replace function public.record_lead_event(
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
         last_activity_at = case when p_type in ('call', 'whatsapp', 'stage_change') then now() else l.last_activity_at end,
         agent_id = case when p_release_agent or target = 'new' then null else l.agent_id end,
         agent_assigned_at = case when p_release_agent or target = 'new' then null else l.agent_assigned_at end,
         team_id = case when target = 'new' then null else l.team_id end,
         no_answer_count = case when target = 'new' then 0 else l.no_answer_count + greatest(p_no_answer_increment, 0) end,
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

  if target = 'new' and lead.stage <> 'new' then
    insert into public.assignments (lead_id, from_user, to_user, from_team, to_team, assigned_by, reason)
    values (p_lead_id, lead.agent_id, null, lead.team_id, null, me, 'Back to the pool after cooling-off');
  end if;

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


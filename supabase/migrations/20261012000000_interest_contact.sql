-- Module 13: interest level and contact tracking.
-- Each lead carries how willing the person is to invest (hot, warm or cold), set by the agent,
-- and when and how they were last contacted (call, WhatsApp, message or email).

alter table public.leads
  add column temperature text check (temperature is null or temperature in ('hot', 'warm', 'cold')),
  add column last_contacted_at timestamptz,
  add column last_contact_channel text check (last_contact_channel is null or last_contact_channel in ('call', 'whatsapp', 'message', 'email'));

create index leads_temperature_idx on public.leads (temperature) where temperature is not null;
create index leads_last_contacted_idx on public.leads (last_contacted_at);

-- Two more ways to reach a lead on the timeline.
alter table public.activities drop constraint activities_type_check;
alter table public.activities add constraint activities_type_check
  check (type in ('call', 'whatsapp', 'message', 'email', 'note', 'stage_change', 'system'));

-- Every contact activity stamps the lead, so the time is always the server's and cannot be backdated.
create function private.stamp_last_contact()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.leads
     set last_contacted_at = new.created_at,
         last_contact_channel = new.type,
         last_activity_at = greatest(coalesce(last_activity_at, new.created_at), new.created_at)
   where id = new.lead_id
     and (last_contacted_at is null or last_contacted_at <= new.created_at);
  return new;
end;
$$;

create trigger activities_stamp_last_contact
  after insert on public.activities
  for each row
  when (new.type in ('call', 'whatsapp', 'message', 'email'))
  execute function private.stamp_last_contact();

-- Leads that already have calls or WhatsApp taps start with the right last contact.
update public.leads l
   set last_contacted_at = a.created_at,
       last_contact_channel = a.type
  from (
    select distinct on (lead_id) lead_id, created_at, type
      from public.activities
     where type in ('call', 'whatsapp')
     order by lead_id, created_at desc
  ) a
 where a.lead_id = l.id;

-- ---------------------------------------------------------------------------
-- set_lead_temperature: the agent (or Team Lead or Admin) sets Hot, Warm or Cold.
-- ---------------------------------------------------------------------------
create function public.set_lead_temperature(p_lead_id uuid, p_temperature text)
returns public.leads
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  lead public.leads;
  updated public.leads;
begin
  if me is null or not private.can_work_lead(p_lead_id) then
    raise exception 'This lead belongs to another team.' using errcode = '42501';
  end if;
  if p_temperature is null or p_temperature not in ('hot', 'warm', 'cold') then
    raise exception 'Choose Hot, Warm or Cold.' using errcode = 'P0001';
  end if;

  select * into lead from public.leads where id = p_lead_id for update;
  if lead.temperature is not distinct from p_temperature then
    return lead;
  end if;

  update public.leads set temperature = p_temperature where id = p_lead_id returning * into updated;

  insert into public.activities (lead_id, user_id, type, notes)
  values (p_lead_id, me, 'system',
          case when lead.temperature is null
               then format('Interest set to %s.', initcap(p_temperature))
               else format('Interest changed from %s to %s.', initcap(lead.temperature), initcap(p_temperature)) end);

  perform private.audit('lead.interest_change', 'lead', p_lead_id::text,
    jsonb_build_object('from', lead.temperature, 'to', p_temperature));
  return updated;
end;
$$;

revoke execute on function public.set_lead_temperature(uuid, text) from public, anon;
grant execute on function public.set_lead_temperature(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- log_contact: a WhatsApp, message or email to the lead. Calls go through record_lead_event.
-- ---------------------------------------------------------------------------
create function public.log_contact(p_lead_id uuid, p_channel text, p_notes text default null)
returns public.leads
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  updated public.leads;
begin
  if me is null or not private.can_work_lead(p_lead_id) then
    raise exception 'This lead belongs to another team.' using errcode = '42501';
  end if;
  if p_channel is null or p_channel not in ('whatsapp', 'message', 'email') then
    raise exception 'Choose WhatsApp, Message or Email.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_notes, '')) > 2000 then
    raise exception 'Keep the note under 2,000 characters.' using errcode = 'P0001';
  end if;

  insert into public.activities (lead_id, user_id, type, notes)
  values (p_lead_id, me, p_channel, nullif(btrim(coalesce(p_notes, '')), ''));

  perform private.audit('lead.contact', 'lead', p_lead_id::text, jsonb_build_object('channel', p_channel));

  select * into updated from public.leads where id = p_lead_id;
  return updated;
end;
$$;

revoke execute on function public.log_contact(uuid, text, text) from public, anon;
grant execute on function public.log_contact(uuid, text, text) to authenticated;

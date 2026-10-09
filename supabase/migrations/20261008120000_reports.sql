-- Module 11: reports, exports and audit log helpers.
-- Reports and exports are for Admin and Superadmin and checked in the database. Money is verified-only.

-- ---------------------------------------------------------------------------
-- Seven reports. Filters: period, team, broker. Each returns an array of rows.
-- ---------------------------------------------------------------------------
create function public.report_data(p_report text, p_from timestamptz, p_to timestamptz, p_team uuid default null, p_broker uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  res jsonb;
begin
  if not private.is_admin_or_superadmin() then
    raise exception 'Only an Admin opens reports.' using errcode = '42501';
  end if;

  if p_report = 'funnel' then
    with scope as (
      select l.id, l.created_at from public.leads l
       where (p_team is null or l.team_id = p_team)
         and (p_broker is null or exists (select 1 from public.kyc_profiles k where k.lead_id = l.id and k.broker_id = p_broker))
    ), moved as (
      select a.lead_id, a.to_stage from public.activities a join scope s on s.id = a.lead_id
       where a.to_stage is not null and a.created_at >= p_from and a.created_at < p_to
    )
    select jsonb_build_array(
      jsonb_build_object('step', 'Added', 'n', (select count(*) from scope where created_at >= p_from and created_at < p_to)),
      jsonb_build_object('step', 'Assigned to an agent', 'n', (select count(distinct lead_id) from moved where to_stage = 'assigned')),
      jsonb_build_object('step', 'Interested', 'n', (select count(distinct lead_id) from moved where to_stage = 'interested')),
      jsonb_build_object('step', 'Documents started', 'n', (select count(distinct lead_id) from moved where to_stage = 'documents_pending')),
      jsonb_build_object('step', 'Deposit recorded', 'n', (select count(distinct lead_id) from moved where to_stage = 'deposit_recorded')),
      jsonb_build_object('step', 'Deposit verified', 'n', (select count(distinct lead_id) from moved where to_stage = 'deposit_verified'))
    ) into res;

  elsif p_report = 'sources' then
    select coalesce(jsonb_agg(x order by x.verified_pkr desc, x.leads desc, x.source), '[]'::jsonb) into res from (
      select s.source as source,
             (select count(*) from public.leads l where l.source = s.source and l.created_at >= p_from and l.created_at < p_to
                 and (p_team is null or l.team_id = p_team)
                 and (p_broker is null or exists (select 1 from public.kyc_profiles k where k.lead_id = l.id and k.broker_id = p_broker))) as leads,
             (select count(distinct a.lead_id) from public.activities a join public.leads l on l.id = a.lead_id
               where l.source = s.source and a.type = 'call' and a.created_at >= p_from and a.created_at < p_to
                 and (p_team is null or l.team_id = p_team)) as contacted,
             (select count(distinct d.lead_id) from public.deposits d join public.leads l on l.id = d.lead_id
               where l.source = s.source and d.status = 'verified' and d.type = 'first' and d.verified_at >= p_from and d.verified_at < p_to
                 and (p_team is null or d.team_id = p_team) and (p_broker is null or d.broker_id = p_broker)) as funded,
             coalesce((select sum(d.amount_pkr) from public.deposits d join public.leads l on l.id = d.lead_id
               where l.source = s.source and d.status = 'verified' and d.verified_at >= p_from and d.verified_at < p_to
                 and (p_team is null or d.team_id = p_team) and (p_broker is null or d.broker_id = p_broker)), 0)::bigint as verified_pkr
        from (select distinct source from public.leads) s) x;

  elsif p_report = 'agents' then
    -- Each measure is grouped once, then joined to the agents, so the report stays fast with many agents.
    with calls as (
      select a.user_id, count(*) filter (where a.type = 'call') as calls, count(*) filter (where a.to_stage = 'interested') as interested
        from public.activities a
       where a.created_at >= p_from and a.created_at < p_to and (a.type = 'call' or a.to_stage = 'interested')
       group by a.user_id
    ), dep as (
      select d.agent_id, count(*) as deposits, sum(d.amount_pkr)::bigint as total
        from public.deposits d
       where d.status = 'verified' and d.verified_at >= p_from and d.verified_at < p_to and (p_broker is null or d.broker_id = p_broker)
       group by d.agent_id
    ), late as (
      select l.agent_id, count(*) as overdue from public.leads l
       where l.agent_id is not null and private.is_open_stage(l.stage) and l.next_follow_up_at < now()
       group by l.agent_id
    )
    select coalesce(jsonb_agg(x order by x.verified_pkr desc, x.calls desc, x.name), '[]'::jsonb) into res from (
      select p.full_name as name, coalesce(t.name, 'No team') as team,
             coalesce(c.calls, 0) as calls, coalesce(c.interested, 0) as interested,
             coalesce(dp.deposits, 0) as deposits, coalesce(dp.total, 0)::bigint as verified_pkr, coalesce(lt.overdue, 0) as overdue
        from public.profiles p
        left join public.teams t on t.id = p.team_id
        left join calls c on c.user_id = p.id
        left join dep dp on dp.agent_id = p.id
        left join late lt on lt.agent_id = p.id
       where p.role = 'agent' and p.is_active and (p_team is null or p.team_id = p_team)) x;

  elsif p_report = 'deposits' then
    select coalesce(jsonb_agg(x order by x.verified_pkr desc, x.team), '[]'::jsonb) into res from (
      select t.name as team,
             count(d.id) as deposits,
             count(d.id) filter (where d.type = 'first') as first,
             count(d.id) filter (where d.type = 'top_up') as top_ups,
             coalesce(sum(d.amount_pkr), 0)::bigint as verified_pkr,
             coalesce(avg(d.amount_pkr), 0)::bigint as average_pkr
        from public.teams t
        left join public.deposits d on d.team_id = t.id and d.status = 'verified' and d.verified_at >= p_from and d.verified_at < p_to
                                    and (p_broker is null or d.broker_id = p_broker)
       where t.is_active and (p_team is null or t.id = p_team)
       group by t.id, t.name) x;

  elsif p_report = 'analysts' then
    select coalesce(jsonb_agg(x order by x.verified_pkr desc, x.sessions desc, x.name), '[]'::jsonb) into res from (
      select p.full_name as name,
             (select count(*) from public.sessions s where s.analyst_id = p.id and s.created_at >= p_from and s.created_at < p_to) as referrals,
             (select count(*) from public.sessions s where s.analyst_id = p.id and s.outcome = 'attended' and s.scheduled_at >= p_from and s.scheduled_at < p_to) as sessions,
             (select count(*) from public.sessions s where s.analyst_id = p.id and s.outcome = 'no_show' and s.scheduled_at >= p_from and s.scheduled_at < p_to) as no_shows,
             (select count(distinct d.lead_id) from public.deposits d where d.credited_analyst_id = p.id and d.status = 'verified' and d.type = 'first'
                 and d.verified_at >= p_from and d.verified_at < p_to and (p_team is null or d.team_id = p_team) and (p_broker is null or d.broker_id = p_broker)) as funded,
             coalesce((select sum(d.amount_pkr) from public.deposits d where d.credited_analyst_id = p.id and d.status = 'verified'
                 and d.verified_at >= p_from and d.verified_at < p_to and (p_team is null or d.team_id = p_team) and (p_broker is null or d.broker_id = p_broker)), 0)::bigint as verified_pkr
        from public.profiles p where p.role = 'analyst' and p.is_active) x;

  elsif p_report = 'aging' then
    select coalesce(jsonb_agg(x order by x.ord), '[]'::jsonb) into res from (
      select l.stage::text as stage, array_position(enum_range(null::public.lead_stage), l.stage) as ord,
             count(*) filter (where age < interval '1 day') as under_1_day,
             count(*) filter (where age >= interval '1 day' and age < interval '3 days') as days_1_to_3,
             count(*) filter (where age >= interval '3 days' and age < interval '7 days') as days_3_to_7,
             count(*) filter (where age >= interval '7 days') as over_7_days,
             count(*) as total
        from (select l.*, now() - coalesce(l.last_activity_at, l.created_at) as age from public.leads l
               where private.is_open_stage(l.stage) and (p_team is null or l.team_id = p_team)
                 and (p_broker is null or exists (select 1 from public.kyc_profiles k where k.lead_id = l.id and k.broker_id = p_broker))) l
       group by l.stage) x;

  elsif p_report = 'quality' then
    select coalesce(jsonb_agg(x order by x.invalid_pct desc, x.leads desc, x.source), '[]'::jsonb) into res from (
      select s.source,
             count(l.id) as leads,
             count(l.id) filter (where l.stage = 'invalid') as invalid,
             count(l.id) filter (where l.stage = 'not_interested') as not_interested,
             case when count(l.id) = 0 then 0 else round(100.0 * count(l.id) filter (where l.stage = 'invalid') / count(l.id))::int end as invalid_pct
        from (select distinct source from public.leads) s
        left join public.leads l on l.source = s.source and l.created_at >= p_from and l.created_at < p_to
                                 and (p_team is null or l.team_id = p_team)
                                 and (p_broker is null or exists (select 1 from public.kyc_profiles k where k.lead_id = l.id and k.broker_id = p_broker))
       group by s.source) x;

  else
    raise exception 'Unknown report.' using errcode = 'P0001';
  end if;
  return res;
end;
$$;

-- ---------------------------------------------------------------------------
-- Exports. History is kept in a table; every export also writes an audit row.
-- CNIC and IBAN may leave only in the Superadmin's export.
-- ---------------------------------------------------------------------------
create table public.export_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id),
  kind text not null check (kind in ('leads', 'calls', 'deposits')),
  filters jsonb not null default '{}'::jsonb,
  row_count integer not null,
  includes_sensitive boolean not null default false
);
create index export_history_created_idx on public.export_history (created_at desc);
alter table public.export_history enable row level security;
revoke all on public.export_history from anon;
revoke insert, update, delete on public.export_history from authenticated;
grant select on public.export_history to authenticated;
create policy export_history_select on public.export_history for select to authenticated
  using (private.is_admin_or_superadmin());

create function public.export_data(p_kind text, p_from timestamptz, p_to timestamptz, p_team uuid default null, p_include_sensitive boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  rows_json jsonb;
  n integer;
  hid uuid;
  limit_rows constant integer := 20000;
begin
  if not private.is_admin_or_superadmin() then
    raise exception 'Only an Admin exports data.' using errcode = '42501';
  end if;
  if p_include_sensitive and not private.is_superadmin() then
    raise exception 'Only the Superadmin can export CNIC and IBAN numbers.' using errcode = '42501';
  end if;

  if p_kind = 'leads' then
    select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb) into rows_json from (
      select l.full_name as name, l.phone, l.city, l.source, l.campaign, l.stage::text as stage,
             t.name as team, a.full_name as agent, l.created_at, l.last_activity_at,
             case when p_include_sensitive then k.cnic_number end as cnic,
             case when p_include_sensitive then k.iban end as iban
        from public.leads l
        left join public.teams t on t.id = l.team_id
        left join public.profiles a on a.id = l.agent_id
        left join public.kyc_profiles k on k.lead_id = l.id
       where l.created_at >= p_from and l.created_at < p_to and (p_team is null or l.team_id = p_team)
       order by l.created_at desc limit limit_rows + 1) r;
  elsif p_kind = 'calls' then
    select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb) into rows_json from (
      select ac.created_at, p.full_name as agent, t.name as team, l.full_name as lead, l.phone,
             ac.outcome, ac.from_stage::text as from_stage, ac.to_stage::text as to_stage
        from public.activities ac
        join public.leads l on l.id = ac.lead_id
        left join public.profiles p on p.id = ac.user_id
        left join public.teams t on t.id = p.team_id
       where ac.type = 'call' and ac.created_at >= p_from and ac.created_at < p_to and (p_team is null or p.team_id = p_team)
       order by ac.created_at desc limit limit_rows + 1) r;
  elsif p_kind = 'deposits' then
    select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb) into rows_json from (
      select d.created_at, d.deposit_date, d.reference_no as reference, l.full_name as client, d.amount_pkr, d.type, d.method,
             d.status, t.name as team, a.full_name as agent, b.name as broker, d.verified_at
        from public.deposits d
        join public.leads l on l.id = d.lead_id
        left join public.teams t on t.id = d.team_id
        left join public.profiles a on a.id = d.agent_id
        left join public.brokers b on b.id = d.broker_id
       where d.created_at >= p_from and d.created_at < p_to and (p_team is null or d.team_id = p_team)
       order by d.created_at desc limit limit_rows + 1) r;
  else
    raise exception 'Choose leads, calls or deposits.' using errcode = 'P0001';
  end if;

  n := jsonb_array_length(rows_json);
  if n > limit_rows then
    raise exception 'That is more than % rows. Narrow the dates or pick a team.', limit_rows using errcode = 'P0001';
  end if;

  insert into public.export_history (user_id, kind, filters, row_count, includes_sensitive)
  values (auth.uid(), p_kind, jsonb_build_object('from', p_from, 'to', p_to, 'team_id', p_team), n, p_include_sensitive)
  returning id into hid;
  perform private.audit('export.create', 'export', hid::text,
    jsonb_build_object('kind', p_kind, 'from', p_from, 'to', p_to, 'team_id', p_team, 'rows', n, 'includes_sensitive', p_include_sensitive));
  return jsonb_build_object('id', hid, 'rows', rows_json);
end;
$$;

-- The distinct actions in the audit log, for its filter. Superadmin only.
create function public.audit_actions()
returns table (action text)
language sql stable security definer set search_path = ''
as $$
  select distinct a.action from public.audit_log a where private.is_superadmin() order by a.action
$$;

revoke execute on function public.report_data(text, timestamptz, timestamptz, uuid, uuid) from public, anon;
revoke execute on function public.export_data(text, timestamptz, timestamptz, uuid, boolean) from public, anon;
revoke execute on function public.audit_actions() from public, anon;
grant execute on function public.report_data(text, timestamptz, timestamptz, uuid, uuid) to authenticated;
grant execute on function public.export_data(text, timestamptz, timestamptz, uuid, boolean) to authenticated;
grant execute on function public.audit_actions() to authenticated;

-- Module 10: dashboards. Each function checks the caller's role inside the database and returns counts and totals
-- only. Money is verified-only, over the same bounds the boards use, so the figures match the Arena.

create function private.setting_int(p_key text, p_default integer)
returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce((select (value)::integer from public.settings where key = p_key), p_default)
$$;

create function private.karachi_day_start()
returns timestamptz
language sql stable set search_path = ''
as $$
  select date_trunc('day', now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi'
$$;

create function private.month_start_ts()
returns timestamptz
language sql stable set search_path = ''
as $$
  select private.karachi_month_start()::timestamp at time zone 'Asia/Karachi'
$$;

grant execute on function private.setting_int(text, integer), private.karachi_day_start(), private.month_start_ts()
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Team dashboard: a Team Lead sees their own team; an Admin names the team.
-- ---------------------------------------------------------------------------
create function public.team_overview(p_team uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  t uuid;
  m_from timestamptz := private.month_start_ts();
  d_from timestamptz := private.karachi_day_start();
  result jsonb;
begin
  if private.current_app_role() = 'team_lead' then
    t := private.current_team_id();
  elsif private.is_admin_or_superadmin() then
    t := p_team;
  else
    raise exception 'Only a Team Lead or an Admin opens a team dashboard.' using errcode = '42501';
  end if;
  if t is null then
    return null;
  end if;

  select jsonb_build_object(
    'calls_today', (select count(*) from public.activities a
                     where a.type = 'call' and a.created_at >= d_from
                       and a.user_id in (select id from public.profiles where team_id = t)),
    'overdue', (select count(*) from public.leads l
                 where l.team_id = t and l.agent_id is not null and private.is_open_stage(l.stage)
                   and l.next_follow_up_at < now()),
    'unassigned', (select count(*) from public.leads l
                    where l.team_id = t and l.agent_id is null and private.is_open_stage(l.stage)),
    'returned', (select count(*) from public.leads l
                  where l.team_id = t and l.agent_id is null and l.returned_to_lead and private.is_open_stage(l.stage)),
    'new_funded', (select count(distinct d.lead_id) from public.deposits d
                    where d.team_id = t and d.status = 'verified' and d.type = 'first' and d.verified_at >= m_from),
    'pending_deposits', (select count(*) from public.deposits d where d.team_id = t and d.status = 'pending'),
    'stages', coalesce((select jsonb_object_agg(s.stage, s.n) from (
                  select l.stage::text as stage, count(*) as n from public.leads l where l.team_id = t group by l.stage) s), '{}'::jsonb),
    'agents', coalesce((select jsonb_agg(x order by x.total desc, x.name) from (
        select p.id as id, p.full_name as name, p.photo_url as photo,
               (select count(*) from public.leads l where l.agent_id = p.id and private.is_open_stage(l.stage)) as open_leads,
               (select count(*) from public.activities a where a.user_id = p.id and a.type = 'call' and a.created_at >= d_from) as calls_today,
               (select count(*) from public.leads l where l.agent_id = p.id and private.is_open_stage(l.stage) and l.next_follow_up_at < now()) as overdue,
               coalesce((select sum(d.amount_pkr) from public.deposits d
                          where d.agent_id = p.id and d.status = 'verified' and d.verified_at >= m_from), 0)::bigint as total,
               private.agent_streak(p.id) as streak
          from public.profiles p
         where p.team_id = t and p.role = 'agent' and p.is_active) x), '[]'::jsonb)
  ) into result;
  return result || jsonb_build_object('team_id', t);
end;
$$;

-- ---------------------------------------------------------------------------
-- Work queue (Admin): what is waiting, how long, and what needs a look.
-- ---------------------------------------------------------------------------
create function public.work_queue()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  d_from timestamptz := private.karachi_day_start();
  referral_hours integer := private.setting_int('referral_deadline_hours', 24);
  first_call_hours integer := private.setting_int('first_call_deadline_hours', 24);
begin
  if not private.is_admin_or_superadmin() then
    raise exception 'Only an Admin opens the work queue.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'deposits', (select jsonb_build_object('count', count(*), 'oldest', min(created_at)) from public.deposits where status = 'pending'),
    'documents', (select jsonb_build_object('count', count(*), 'oldest', min(collected_at)) from public.documents where status = 'collected'),
    'pool', (select jsonb_build_object('count', count(*), 'oldest', min(created_at)) from public.leads where stage = 'new' and team_id is null),
    'alerts', jsonb_build_object(
      'cash_flagged', (select count(*) from public.deposits where status = 'pending' and cash_flag),
      'referrals_overdue', (select count(*) from public.sessions s
                             where s.handed_back_at is null and s.cancelled_at is null and s.scheduled_at is null
                               and s.created_at < now() - make_interval(hours => referral_hours)),
      'invalid_waiting', (select count(*) from public.leads where stage = 'invalid' and invalid_confirmed_by is null),
      'returned_unassigned', (select count(*) from public.leads
                               where agent_id is null and returned_to_lead and private.is_open_stage(stage)),
      'first_calls_late', (select count(*) from public.leads
                            where stage = 'assigned' and agent_id is not null
                              and agent_assigned_at < now() - make_interval(hours => first_call_hours))
    ),
    'today', jsonb_build_object(
      'verified_count', (select count(*) from public.deposits where status = 'verified' and verified_at >= d_from),
      'verified_pkr', (select coalesce(sum(amount_pkr), 0) from public.deposits where status = 'verified' and verified_at >= d_from),
      'documents_reviewed', (select count(*) from public.documents where reviewed_at >= d_from),
      'leads_added', (select count(*) from public.leads where created_at >= d_from)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Company dashboard (Superadmin): headline numbers, funnel, sources, brokers, attention.
-- ---------------------------------------------------------------------------
create function public.company_dashboard(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  first_call_hours integer := private.setting_int('first_call_deadline_hours', 24);
  referral_hours integer := private.setting_int('referral_deadline_hours', 24);
begin
  if not private.is_superadmin() then
    raise exception 'Only the Superadmin opens the company dashboard.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'headline', jsonb_build_object(
      'verified_pkr', (select coalesce(sum(amount_pkr), 0) from public.deposits
                        where status = 'verified' and verified_at >= p_from and verified_at < p_to),
      'deposits', (select count(*) from public.deposits where status = 'verified' and verified_at >= p_from and verified_at < p_to),
      'new_funded', (select count(distinct lead_id) from public.deposits
                      where status = 'verified' and type = 'first' and verified_at >= p_from and verified_at < p_to),
      'leads_added', (select count(*) from public.leads where created_at >= p_from and created_at < p_to),
      'active_leads', (select count(*) from public.leads where private.is_open_stage(stage))
    ),
    -- Leads that moved into each step during the period, so the funnel shows flow, not a snapshot.
    'funnel', jsonb_build_array(
      jsonb_build_object('step', 'Added', 'n', (select count(*) from public.leads where created_at >= p_from and created_at < p_to)),
      jsonb_build_object('step', 'Assigned to an agent', 'n', (select count(distinct lead_id) from public.activities where to_stage = 'assigned' and created_at >= p_from and created_at < p_to)),
      jsonb_build_object('step', 'Interested', 'n', (select count(distinct lead_id) from public.activities where to_stage = 'interested' and created_at >= p_from and created_at < p_to)),
      jsonb_build_object('step', 'Documents started', 'n', (select count(distinct lead_id) from public.activities where to_stage = 'documents_pending' and created_at >= p_from and created_at < p_to)),
      jsonb_build_object('step', 'Deposit recorded', 'n', (select count(distinct lead_id) from public.activities where to_stage = 'deposit_recorded' and created_at >= p_from and created_at < p_to)),
      jsonb_build_object('step', 'Deposit verified', 'n', (select count(distinct lead_id) from public.activities where to_stage = 'deposit_verified' and created_at >= p_from and created_at < p_to))
    ),
    'sources', coalesce((select jsonb_agg(x order by x.verified_pkr desc, x.leads desc) from (
        select s.source as source,
               (select count(*) from public.leads l where l.source = s.source and l.created_at >= p_from and l.created_at < p_to) as leads,
               coalesce((select sum(d.amount_pkr) from public.deposits d join public.leads l on l.id = d.lead_id
                          where l.source = s.source and d.status = 'verified' and d.verified_at >= p_from and d.verified_at < p_to), 0)::bigint as verified_pkr,
               (select count(distinct d.lead_id) from public.deposits d join public.leads l on l.id = d.lead_id
                 where l.source = s.source and d.status = 'verified' and d.type = 'first' and d.verified_at >= p_from and d.verified_at < p_to) as funded
          from (select distinct source from public.leads) s) x), '[]'::jsonb),
    'brokers', coalesce((select jsonb_agg(x order by x.verified_pkr desc, x.name) from (
        select b.name as name,
               coalesce(sum(d.amount_pkr), 0)::bigint as verified_pkr,
               count(d.id) as deposits
          from public.brokers b
          left join public.deposits d on d.broker_id = b.id and d.status = 'verified' and d.verified_at >= p_from and d.verified_at < p_to
         where b.is_active
         group by b.id, b.name) x), '[]'::jsonb),
    'attention', jsonb_build_object(
      'deposits_late', (select count(*) from public.deposits where status = 'pending' and created_at < now() - interval '24 hours'),
      'documents_late', (select count(*) from public.documents where status = 'collected' and collected_at < now() - interval '2 days'),
      'referrals_overdue', (select count(*) from public.sessions s
                             where s.handed_back_at is null and s.cancelled_at is null and s.scheduled_at is null
                               and s.created_at < now() - make_interval(hours => referral_hours)),
      'first_calls_late', (select count(*) from public.leads
                            where stage = 'assigned' and agent_id is not null
                              and agent_assigned_at < now() - make_interval(hours => first_call_hours)),
      'pool', (select count(*) from public.leads where stage = 'new' and team_id is null)
    )
  );
end;
$$;

revoke execute on function public.team_overview(uuid) from public, anon;
revoke execute on function public.work_queue() from public, anon;
revoke execute on function public.company_dashboard(timestamptz, timestamptz) from public, anon;
revoke execute on function private.setting_int(text, integer), private.karachi_day_start(), private.month_start_ts() from public, anon;
grant execute on function public.team_overview(uuid) to authenticated;
grant execute on function public.work_queue() to authenticated;
grant execute on function public.company_dashboard(timestamptz, timestamptz) to authenticated;

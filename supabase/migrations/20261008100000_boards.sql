-- Module 9: leaderboards, the Arena, team prizes.
-- Boards count deposits with status = 'verified' and nothing else. A reversed deposit is not verified,
-- so it leaves every board at once. No board function returns a lead id, client name or phone.

-- ---------------------------------------------------------------------------
-- Team prizes: one per team per month, won by the whole team (owner decision, 8 Oct 2026)
-- ---------------------------------------------------------------------------
create table public.team_prizes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  team_id uuid not null references public.teams (id),
  month date not null check (extract(day from month) = 1),
  prize text not null check (char_length(btrim(prize)) between 2 and 80),
  set_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  unique (team_id, month)
);

create function private.team_prizes_lock_past()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (tg_op in ('UPDATE', 'DELETE') and old.month < private.karachi_month_start())
     or (tg_op in ('INSERT', 'UPDATE') and new.month < private.karachi_month_start()) then
    raise exception 'Prizes for past months are locked.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger team_prizes_lock_past before insert or update or delete on public.team_prizes
  for each row execute function private.team_prizes_lock_past();

alter table public.team_prizes enable row level security;
revoke all on public.team_prizes from anon;
create policy team_prizes_select on public.team_prizes
  for select to authenticated using (private.current_app_role() is not null);
create policy team_prizes_write on public.team_prizes
  for all to authenticated
  using (private.is_admin_or_superadmin()) with check (private.is_admin_or_superadmin());

-- ---------------------------------------------------------------------------
-- Nightly rank snapshots: they power the rank arrows
-- ---------------------------------------------------------------------------
create table public.rank_snapshots (
  id uuid primary key default gen_random_uuid(),
  board text not null check (board in ('teams', 'agents', 'analysts')),
  subject_id uuid not null,
  rank integer not null check (rank >= 1),
  total_pkr bigint not null,
  snapshot_date date not null,
  unique (board, subject_id, snapshot_date)
);
create index rank_snapshots_lookup on public.rank_snapshots (board, snapshot_date desc);
alter table public.rank_snapshots enable row level security;
revoke all on public.rank_snapshots from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Streak: consecutive working days (Monday to Friday, Karachi) with no missed follow-up
-- ---------------------------------------------------------------------------
create function private.agent_streak(p_agent uuid)
returns integer
language plpgsql stable security definer set search_path = ''
as $$
declare
  d date := (now() at time zone 'Asia/Karachi')::date;
  started date;
  n integer := 0;
  i integer := 0;
begin
  select (created_at at time zone 'Asia/Karachi')::date into started from public.profiles where id = p_agent;
  if started is null then
    return 0;
  end if;
  while d >= started and i < 120 loop
    if extract(isodow from d) <= 5 then
      if exists (
        select 1 from public.follow_ups f
         where f.agent_id = p_agent and f.status = 'missed' and (f.due_at at time zone 'Asia/Karachi')::date = d
      ) then
        exit;
      end if;
      n := n + 1;
    end if;
    d := d - 1;
    i := i + 1;
  end loop;
  return n;
end;
$$;

-- Yesterday's rank for the arrow: the latest snapshot this month, before today.
create function private.previous_rank(p_board text, p_subject uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select s.rank from public.rank_snapshots s
   where s.board = p_board and s.subject_id = p_subject
     and s.snapshot_date < (now() at time zone 'Asia/Karachi')::date
     and s.snapshot_date >= private.karachi_month_start()
   order by s.snapshot_date desc limit 1
$$;

-- ---------------------------------------------------------------------------
-- Board functions. Totals only. Every signed-in role may call them.
-- Ties: whoever reached the total first (the latest verified_at that makes it up) ranks higher.
-- ---------------------------------------------------------------------------
create function public.board_teams(p_from timestamptz, p_to timestamptz)
returns table (
  rank integer, prev_rank integer, team_id uuid, team_name text, color text,
  lead_name text, lead_photo text, total_pkr bigint, deposits bigint, reached_at timestamptz,
  target_pkr bigint, prize text
)
language sql stable security definer set search_path = ''
as $$
  with sums as (
    select d.team_id, sum(d.amount_pkr)::bigint as total, count(*) as n, max(d.verified_at) as reached
      from public.deposits d
     where d.status = 'verified' and d.verified_at >= p_from and d.verified_at < p_to
     group by d.team_id
  ), month_now as (select private.karachi_month_start() as m)
  select (row_number() over (order by coalesce(s.total, 0) desc, s.reached asc nulls last, t.name))::integer,
         private.previous_rank('teams', t.id),
         t.id, t.name, t.color::text, l.full_name, l.photo_url,
         coalesce(s.total, 0)::bigint, coalesce(s.n, 0)::bigint, s.reached,
         (select tg.amount_pkr from public.targets tg, month_now where tg.team_id = t.id and tg.month = month_now.m),
         (select pz.prize from public.team_prizes pz, month_now where pz.team_id = t.id and pz.month = month_now.m)
    from public.teams t
    join public.profiles l on l.id = t.team_lead_id
    left join sums s on s.team_id = t.id
   where t.is_active and private.current_app_role() is not null
$$;

create function private.agent_board(p_from timestamptz, p_to timestamptz, p_team uuid)
returns table (
  rank integer, prev_rank integer, agent_id uuid, full_name text, photo_url text, team_id uuid, team_name text,
  color text, total_pkr bigint, deposits bigint, reached_at timestamptz, streak integer
)
language sql stable security definer set search_path = ''
as $$
  with sums as (
    select d.agent_id, sum(d.amount_pkr)::bigint as total, count(*) as n, max(d.verified_at) as reached
      from public.deposits d
     where d.status = 'verified' and d.verified_at >= p_from and d.verified_at < p_to
     group by d.agent_id
  )
  select (row_number() over (order by coalesce(s.total, 0) desc, s.reached asc nulls last, p.full_name))::integer,
         private.previous_rank('agents', p.id),
         p.id, p.full_name, p.photo_url, t.id, t.name, t.color::text,
         coalesce(s.total, 0)::bigint, coalesce(s.n, 0)::bigint, s.reached, private.agent_streak(p.id)
    from public.profiles p
    left join public.teams t on t.id = p.team_id
    left join sums s on s.agent_id = p.id
   where private.current_app_role() is not null
     and (p_team is null or p.team_id = p_team)
     and ((p.role = 'agent' and p.is_active) or s.total is not null)
$$;

create function public.board_agents(p_from timestamptz, p_to timestamptz)
returns table (
  rank integer, prev_rank integer, agent_id uuid, full_name text, photo_url text, team_id uuid, team_name text,
  color text, total_pkr bigint, deposits bigint, reached_at timestamptz, streak integer
)
language sql stable security definer set search_path = ''
as $$
  select * from private.agent_board(p_from, p_to, null)
$$;

-- Only the caller's own team. Anyone without a team gets nothing.
create function public.board_my_team(p_from timestamptz, p_to timestamptz)
returns table (
  rank integer, prev_rank integer, agent_id uuid, full_name text, photo_url text, team_id uuid, team_name text,
  color text, total_pkr bigint, deposits bigint, reached_at timestamptz, streak integer
)
language sql stable security definer set search_path = ''
as $$
  select * from private.agent_board(p_from, p_to, private.current_team_id())
   where private.current_team_id() is not null
$$;

create function public.board_analysts(p_from timestamptz, p_to timestamptz)
returns table (
  rank integer, prev_rank integer, analyst_id uuid, full_name text, photo_url text,
  total_pkr bigint, deposits bigint, reached_at timestamptz, sessions_held bigint
)
language sql stable security definer set search_path = ''
as $$
  with sums as (
    select d.credited_analyst_id as analyst_id, sum(d.amount_pkr)::bigint as total, count(*) as n, max(d.verified_at) as reached
      from public.deposits d
     where d.status = 'verified' and d.credited_analyst_id is not null
       and d.verified_at >= p_from and d.verified_at < p_to
     group by d.credited_analyst_id
  )
  select (row_number() over (order by coalesce(s.total, 0) desc, s.reached asc nulls last, p.full_name))::integer,
         private.previous_rank('analysts', p.id),
         p.id, p.full_name, p.photo_url, coalesce(s.total, 0)::bigint, coalesce(s.n, 0)::bigint, s.reached,
         (select count(*) from public.sessions x
           where x.analyst_id = p.id and x.outcome = 'attended' and x.scheduled_at >= p_from and x.scheduled_at < p_to)
    from public.profiles p
    left join sums s on s.analyst_id = p.id
   where private.current_app_role() is not null and p.role = 'analyst' and (p.is_active or s.total is not null)
$$;

-- The month strip: total verified this month, new funded clients, biggest deposit this week, days left.
create function public.arena_month_strip()
returns table (month_total bigint, new_funded bigint, biggest_week bigint, days_left integer)
language sql stable security definer set search_path = ''
as $$
  with bounds as (
    select private.karachi_month_start()::timestamp at time zone 'Asia/Karachi' as m_from,
           (private.karachi_month_start() + interval '1 month')::timestamp at time zone 'Asia/Karachi' as m_to,
           date_trunc('week', now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi' as w_from
  )
  select coalesce((select sum(d.amount_pkr) from public.deposits d, bounds b
                    where d.status = 'verified' and d.verified_at >= b.m_from and d.verified_at < b.m_to), 0)::bigint,
         (select count(distinct d.lead_id) from public.deposits d, bounds b
           where d.status = 'verified' and d.type = 'first' and d.verified_at >= b.m_from and d.verified_at < b.m_to),
         coalesce((select max(d.amount_pkr) from public.deposits d, bounds b
                    where d.status = 'verified' and d.verified_at >= b.w_from), 0)::bigint,
         ((select (m_to at time zone 'Asia/Karachi')::date from bounds) - (now() at time zone 'Asia/Karachi')::date)
   where private.current_app_role() is not null
$$;

-- Nightly snapshot of this month's ranks, for the arrows.
create function public.take_rank_snapshot()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Karachi')::date;
  m_from timestamptz := private.karachi_month_start()::timestamp at time zone 'Asia/Karachi';
  n integer := 0;
  c integer;
begin
  delete from public.rank_snapshots where snapshot_date = today;
  insert into public.rank_snapshots (board, subject_id, rank, total_pkr, snapshot_date)
  select 'teams', t.id, t.rank, t.total_pkr, today
    from (select team_id as id, rank, total_pkr from (
      select (row_number() over (order by coalesce(s.total, 0) desc, s.reached asc nulls last, tm.name))::integer as rank,
             tm.id as team_id, coalesce(s.total, 0)::bigint as total_pkr
        from public.teams tm
        left join (select team_id, sum(amount_pkr) as total, max(verified_at) as reached from public.deposits
                    where status = 'verified' and verified_at >= m_from group by team_id) s on s.team_id = tm.id
       where tm.is_active) x) t;
  get diagnostics c = row_count; n := n + c;
  insert into public.rank_snapshots (board, subject_id, rank, total_pkr, snapshot_date)
  select 'agents', x.id, x.rank, x.total, today from (
    select (row_number() over (order by coalesce(s.total, 0) desc, s.reached asc nulls last, p.full_name))::integer as rank,
           p.id, coalesce(s.total, 0)::bigint as total
      from public.profiles p
      left join (select agent_id, sum(amount_pkr) as total, max(verified_at) as reached from public.deposits
                  where status = 'verified' and verified_at >= m_from group by agent_id) s on s.agent_id = p.id
     where (p.role = 'agent' and p.is_active) or s.total is not null) x;
  get diagnostics c = row_count; n := n + c;
  insert into public.rank_snapshots (board, subject_id, rank, total_pkr, snapshot_date)
  select 'analysts', x.id, x.rank, x.total, today from (
    select (row_number() over (order by coalesce(s.total, 0) desc, s.reached asc nulls last, p.full_name))::integer as rank,
           p.id, coalesce(s.total, 0)::bigint as total
      from public.profiles p
      left join (select credited_analyst_id as aid, sum(amount_pkr) as total, max(verified_at) as reached from public.deposits
                  where status = 'verified' and credited_analyst_id is not null and verified_at >= m_from group by credited_analyst_id) s on s.aid = p.id
     where p.role = 'analyst' and (p.is_active or s.total is not null)) x;
  get diagnostics c = row_count; n := n + c;
  return n;
end;
$$;

-- 23:55 in Karachi (UTC+5) is 18:55 UTC.
select cron.schedule('rank-snapshot', '55 18 * * *', $$select public.take_rank_snapshot()$$);

revoke execute on function public.board_teams(timestamptz, timestamptz) from public, anon;
revoke execute on function public.board_agents(timestamptz, timestamptz) from public, anon;
revoke execute on function public.board_my_team(timestamptz, timestamptz) from public, anon;
revoke execute on function public.board_analysts(timestamptz, timestamptz) from public, anon;
revoke execute on function public.arena_month_strip() from public, anon;
revoke execute on function public.take_rank_snapshot() from public, anon, authenticated;
revoke execute on function private.agent_board(timestamptz, timestamptz, uuid) from public, anon;
revoke execute on function private.agent_streak(uuid) from public, anon;
revoke execute on function private.previous_rank(text, uuid) from public, anon;
grant execute on function public.board_teams(timestamptz, timestamptz) to authenticated;
grant execute on function public.board_agents(timestamptz, timestamptz) to authenticated;
grant execute on function public.board_my_team(timestamptz, timestamptz) to authenticated;
grant execute on function public.board_analysts(timestamptz, timestamptz) to authenticated;
grant execute on function public.arena_month_strip() to authenticated;
grant execute on function private.agent_board(timestamptz, timestamptz, uuid) to authenticated, service_role;
grant execute on function private.agent_streak(uuid) to authenticated, service_role;
grant execute on function private.previous_rank(text, uuid) to authenticated, service_role;

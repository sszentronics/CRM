-- Module 9: board functions, prizes, snapshots, streaks.
begin;
select plan(25);

create function pg_temp.make_user(uid uuid, mail text) returns void language sql as $$
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', mail, '', now(), now());
$$;

create function pg_temp.act_as(uid uuid, aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
  execute 'set local role authenticated';
end;
$$;

create function pg_temp.dep(ref text, lead uuid, agent uuid, team uuid, amount bigint, st text, typ text, analyst uuid, ago interval)
returns void language sql as $$
  insert into public.deposits (lead_id, broker_id, type, agent_id, team_id, credited_analyst_id, amount_pkr, deposit_date,
                               method, reference_no, status, verified_at, created_by)
  values (lead, 'e4000000-0000-0000-0000-000000000001', typ, agent, team, analyst, amount, current_date, 'bank_transfer', ref, st,
          case when st in ('verified', 'reversed') then now() - ago end, agent);
$$;

select pg_temp.make_user('e6000000-0000-0000-0000-000000000001', 'admin10@test.local');
select pg_temp.make_user('e6000000-0000-0000-0000-00000000000a', 'leada10@test.local');
select pg_temp.make_user('e6000000-0000-0000-0000-00000000000b', 'leadb10@test.local');
select pg_temp.make_user('e6000000-0000-0000-0000-0000000000a1', 'agenta110@test.local');
select pg_temp.make_user('e6000000-0000-0000-0000-0000000000a2', 'agenta210@test.local');
select pg_temp.make_user('e6000000-0000-0000-0000-0000000000b1', 'agentb110@test.local');
select pg_temp.make_user('e6000000-0000-0000-0000-0000000000c1', 'analyst10@test.local');
insert into public.profiles (id, full_name, email, role) values
  ('e6000000-0000-0000-0000-000000000001', 'Admin Ten', 'admin10@test.local', 'admin'),
  ('e6000000-0000-0000-0000-00000000000a', 'Lead A Ten', 'leada10@test.local', 'team_lead'),
  ('e6000000-0000-0000-0000-00000000000b', 'Lead B Ten', 'leadb10@test.local', 'team_lead'),
  ('e6000000-0000-0000-0000-0000000000c1', 'Analyst Ten', 'analyst10@test.local', 'analyst');
insert into public.teams (id, name, color, team_lead_id) values
  ('e5000000-0000-0000-0000-00000000000a', 'Ten A', 'cyan', 'e6000000-0000-0000-0000-00000000000a'),
  ('e5000000-0000-0000-0000-00000000000b', 'Ten B', 'pink', 'e6000000-0000-0000-0000-00000000000b');
-- a2 sorts before a1 by name, so a tie can only be broken by who got there first.
insert into public.profiles (id, full_name, email, role, team_id, created_at) values
  ('e6000000-0000-0000-0000-0000000000a1', 'Zed Agent', 'agenta110@test.local', 'agent', 'e5000000-0000-0000-0000-00000000000a', now() - interval '10 days'),
  ('e6000000-0000-0000-0000-0000000000a2', 'Aaron Agent', 'agenta210@test.local', 'agent', 'e5000000-0000-0000-0000-00000000000a', now() - interval '10 days'),
  ('e6000000-0000-0000-0000-0000000000b1', 'Bella Agent', 'agentb110@test.local', 'agent', 'e5000000-0000-0000-0000-00000000000b', now() - interval '10 days');
insert into public.brokers (id, name, market, kyc_checklist) values
  ('e4000000-0000-0000-0000-000000000001', 'Ten Securities', 'psx', '["cnic_front"]');
insert into public.leads (id, full_name, phone, source, stage, team_id, agent_id, created_by) values
  ('e7000000-0000-0000-0000-000000000001', 'Ten Client One', '+923601000001', 'PR', 'deposit_verified', 'e5000000-0000-0000-0000-00000000000a', 'e6000000-0000-0000-0000-0000000000a1', 'e6000000-0000-0000-0000-000000000001'),
  ('e7000000-0000-0000-0000-000000000002', 'Ten Client Two', '+923601000002', 'PR', 'deposit_verified', 'e5000000-0000-0000-0000-00000000000a', 'e6000000-0000-0000-0000-0000000000a2', 'e6000000-0000-0000-0000-000000000001'),
  ('e7000000-0000-0000-0000-000000000003', 'Ten Client Three', '+923601000003', 'PR', 'deposit_verified', 'e5000000-0000-0000-0000-00000000000b', 'e6000000-0000-0000-0000-0000000000b1', 'e6000000-0000-0000-0000-000000000001');

-- One deposit of every status. Only the verified ones may count.
select pg_temp.dep('T10-D1', 'e7000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-0000000000a1', 'e5000000-0000-0000-0000-00000000000a', 100000, 'verified', 'first', 'e6000000-0000-0000-0000-0000000000c1', interval '3 seconds');
select pg_temp.dep('T10-D2', 'e7000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-0000000000a1', 'e5000000-0000-0000-0000-00000000000a', 500000, 'pending', 'top_up', null, interval '0');
select pg_temp.dep('T10-D3', 'e7000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-0000000000a1', 'e5000000-0000-0000-0000-00000000000a', 700000, 'rejected', 'top_up', null, interval '0');
select pg_temp.dep('T10-D4', 'e7000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-0000000000a1', 'e5000000-0000-0000-0000-00000000000a', 900000, 'reversed', 'top_up', 'e6000000-0000-0000-0000-0000000000c1', interval '4 seconds');
select pg_temp.dep('T10-D5', 'e7000000-0000-0000-0000-000000000002', 'e6000000-0000-0000-0000-0000000000a2', 'e5000000-0000-0000-0000-00000000000a', 100000, 'verified', 'first', null, interval '2 seconds');
select pg_temp.dep('T10-D6', 'e7000000-0000-0000-0000-000000000003', 'e6000000-0000-0000-0000-0000000000b1', 'e5000000-0000-0000-0000-00000000000b', 40000, 'verified', 'first', null, interval '1 second');

select ok((select relrowsecurity from pg_class where oid = 'public.team_prizes'::regclass), 'RLS is enabled on team_prizes');
select ok((select relrowsecurity from pg_class where oid = 'public.rank_snapshots'::regclass), 'RLS is enabled on rank_snapshots');

select pg_temp.act_as('e6000000-0000-0000-0000-0000000000a1');
select is((select total_pkr from public.board_teams(now() - interval '1 day', now() + interval '1 day') where team_id = 'e5000000-0000-0000-0000-00000000000a'),
  200000::bigint, 'team total is the sum of verified rows only');
select is((select total_pkr from public.board_teams(now() - interval '1 day', now() + interval '1 day') where team_id = 'e5000000-0000-0000-0000-00000000000b'),
  40000::bigint, 'another team''s total counts only its verified row');
select is((select rank from public.board_agents(now() - interval '1 day', now() + interval '1 day') where agent_id = 'e6000000-0000-0000-0000-0000000000a1'),
  (select rank from public.board_agents(now() - interval '1 day', now() + interval '1 day') where agent_id = 'e6000000-0000-0000-0000-0000000000a2') - 1,
  'on equal totals the earlier verified_at ranks first');
select is((select total_pkr from public.board_agents(now() - interval '1 day', now() + interval '1 day') where agent_id = 'e6000000-0000-0000-0000-0000000000a1'),
  100000::bigint, 'a reversed, a pending and a rejected deposit are not in the agent''s total');
select is((select total_pkr from public.board_analysts(now() - interval '1 day', now() + interval '1 day') where analyst_id = 'e6000000-0000-0000-0000-0000000000c1'),
  100000::bigint, 'the credited analyst''s total leaves out the reversed deposit');

-- A top-up raises the agent, the team and the credited analyst by its amount.
reset role;
select pg_temp.dep('T10-D7', 'e7000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-0000000000a1', 'e5000000-0000-0000-0000-00000000000a', 50000, 'verified', 'top_up', 'e6000000-0000-0000-0000-0000000000c1', interval '0');
select pg_temp.act_as('e6000000-0000-0000-0000-0000000000a1');
select is((select total_pkr from public.board_agents(now() - interval '1 day', now() + interval '1 day') where agent_id = 'e6000000-0000-0000-0000-0000000000a1'), 150000::bigint, 'a top-up raises the agent''s total');
select is((select total_pkr from public.board_teams(now() - interval '1 day', now() + interval '1 day') where team_id = 'e5000000-0000-0000-0000-00000000000a'), 250000::bigint, 'and the team''s total');
select is((select total_pkr from public.board_analysts(now() - interval '1 day', now() + interval '1 day') where analyst_id = 'e6000000-0000-0000-0000-0000000000c1'), 150000::bigint, 'and the credited analyst''s total');

-- Totals only: no lead id, client name or phone is ever returned.
reset role;
select is(
  (select count(*)::int from pg_proc p, unnest(p.proargnames) as n
    where p.pronamespace = 'public'::regnamespace and p.proname in ('board_teams', 'board_agents', 'board_my_team', 'board_analysts', 'arena_month_strip')
      and n ~* '(lead_id|client|phone|cnic)'),
  0, 'the board functions return no column that holds a lead id, client name or phone');

-- board_my_team never leaks another team.
select pg_temp.act_as('e6000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.board_my_team(now() - interval '1 day', now() + interval '1 day') where team_id <> 'e5000000-0000-0000-0000-00000000000a'),
  0, 'board_my_team for an agent of team A never returns team B''s agents');
select is((select count(*)::int from public.board_my_team(now() - interval '1 day', now() + interval '1 day')), 2, 'and returns both of team A''s agents');
reset role;
select pg_temp.act_as('e6000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.board_my_team(now() - interval '1 day', now() + interval '1 day')), 0, 'someone without a team gets an empty my-team board');
select is((select month_total from public.arena_month_strip()) >= 290000, true, 'the month strip counts verified money this month');
select is((select new_funded from public.arena_month_strip()) >= 3, true, 'new funded clients counts first deposits');
select is((select biggest_week from public.arena_month_strip()) >= 100000, true, 'the biggest deposit this week ignores reversed ones');
reset role;
select pg_temp.act_as('e6000000-0000-0000-0000-0000000000c1');
select lives_ok($$ select * from public.board_teams(now() - interval '1 day', now() + interval '1 day') $$, 'every role can read the Arena boards, an analyst included');

-- Prizes: Admin sets them, agents cannot.
reset role;
select pg_temp.act_as('e6000000-0000-0000-0000-0000000000a1');
select throws_ok($$ insert into public.team_prizes (team_id, month, prize) values ('e5000000-0000-0000-0000-00000000000a', private.karachi_month_start(), 'Trip') $$,
  '42501', null, 'an agent cannot set a prize');
reset role;
select pg_temp.act_as('e6000000-0000-0000-0000-000000000001', 'aal2');
select lives_ok($$ insert into public.team_prizes (team_id, month, prize, set_by) values ('e5000000-0000-0000-0000-00000000000a', private.karachi_month_start(), 'Team dinner', 'e6000000-0000-0000-0000-000000000001') $$,
  'an Admin sets a team prize');
select is((select prize from public.board_teams(now() - interval '1 day', now() + interval '1 day') where team_id = 'e5000000-0000-0000-0000-00000000000a'),
  'Team dinner', 'the prize shows on the team''s board row');
reset role;

-- Snapshots and arrows.
select cmp_ok(public.take_rank_snapshot(), '>', 0, 'the nightly job writes rank snapshots');
update public.rank_snapshots set snapshot_date = private.karachi_month_start(), rank = 9
 where board = 'agents' and subject_id = 'e6000000-0000-0000-0000-0000000000a1';
select is(private.previous_rank('agents', 'e6000000-0000-0000-0000-0000000000a1'),
  case when (now() at time zone 'Asia/Karachi')::date > private.karachi_month_start() then 9 end,
  'the previous rank comes from the latest earlier snapshot this month');

-- Streaks: a missed follow-up on the latest working day resets the count.
insert into public.follow_ups (lead_id, agent_id, due_at, status)
select 'e7000000-0000-0000-0000-000000000002', 'e6000000-0000-0000-0000-0000000000a2', d.day::timestamp at time zone 'Asia/Karachi' + interval '10 hours', 'missed'
  from (select max(g::date) as day from generate_series((now() at time zone 'Asia/Karachi')::date - 6, (now() at time zone 'Asia/Karachi')::date, interval '1 day') g
         where extract(isodow from g) <= 5) d;
select is(private.agent_streak('e6000000-0000-0000-0000-0000000000a2'), 0, 'a missed follow-up on the latest working day ends the streak');
select cmp_ok(private.agent_streak('e6000000-0000-0000-0000-0000000000a1'), '>=', 7, 'ten clean days make a streak of working days');

select * from finish();
rollback;

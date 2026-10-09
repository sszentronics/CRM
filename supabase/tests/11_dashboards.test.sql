-- Module 10: dashboard functions are scoped by role and match direct counts.
begin;
select plan(18);

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

select pg_temp.make_user('f6000000-0000-0000-0000-000000000001', 'super11@test.local');
select pg_temp.make_user('f6000000-0000-0000-0000-000000000002', 'admin11@test.local');
select pg_temp.make_user('f6000000-0000-0000-0000-00000000000a', 'leada11@test.local');
select pg_temp.make_user('f6000000-0000-0000-0000-00000000000b', 'leadb11@test.local');
select pg_temp.make_user('f6000000-0000-0000-0000-0000000000a1', 'agenta11@test.local');
select pg_temp.make_user('f6000000-0000-0000-0000-0000000000b1', 'agentb11@test.local');
insert into public.profiles (id, full_name, email, role) values
  ('f6000000-0000-0000-0000-000000000001', 'Super Eleven', 'super11@test.local', 'superadmin'),
  ('f6000000-0000-0000-0000-000000000002', 'Admin Eleven', 'admin11@test.local', 'admin'),
  ('f6000000-0000-0000-0000-00000000000a', 'Lead A Eleven', 'leada11@test.local', 'team_lead'),
  ('f6000000-0000-0000-0000-00000000000b', 'Lead B Eleven', 'leadb11@test.local', 'team_lead');
insert into public.teams (id, name, color, team_lead_id) values
  ('f5000000-0000-0000-0000-00000000000a', 'Eleven A', 'cyan', 'f6000000-0000-0000-0000-00000000000a'),
  ('f5000000-0000-0000-0000-00000000000b', 'Eleven B', 'pink', 'f6000000-0000-0000-0000-00000000000b');
insert into public.profiles (id, full_name, email, role, team_id) values
  ('f6000000-0000-0000-0000-0000000000a1', 'Agent A Eleven', 'agenta11@test.local', 'agent', 'f5000000-0000-0000-0000-00000000000a'),
  ('f6000000-0000-0000-0000-0000000000b1', 'Agent B Eleven', 'agentb11@test.local', 'agent', 'f5000000-0000-0000-0000-00000000000b');
insert into public.brokers (id, name, market, kyc_checklist) values
  ('f4000000-0000-0000-0000-000000000001', 'Eleven Securities', 'psx', '["cnic_front"]');
insert into public.leads (id, full_name, phone, source, stage, team_id, agent_id, next_follow_up_at, created_by) values
  ('f7000000-0000-0000-0000-000000000001', 'Eleven One', '+923611000001', 'Eleven Source', 'follow_up', 'f5000000-0000-0000-0000-00000000000a', 'f6000000-0000-0000-0000-0000000000a1', now() - interval '2 hours', 'f6000000-0000-0000-0000-000000000002'),
  ('f7000000-0000-0000-0000-000000000002', 'Eleven Two', '+923611000002', 'Eleven Source', 'deposit_verified', 'f5000000-0000-0000-0000-00000000000b', 'f6000000-0000-0000-0000-0000000000b1', null, 'f6000000-0000-0000-0000-000000000002'),
  ('f7000000-0000-0000-0000-000000000003', 'Eleven Three', '+923611000003', 'Eleven Source', 'new', null, null, null, 'f6000000-0000-0000-0000-000000000002');
insert into public.leads (id, full_name, phone, source, stage, team_id, agent_id, returned_to_lead, created_by) values
  ('f7000000-0000-0000-0000-000000000004', 'Eleven Four', '+923611000004', 'Eleven Source', 'follow_up', 'f5000000-0000-0000-0000-00000000000a', null, true, 'f6000000-0000-0000-0000-000000000002');
-- A pending deposit 25 hours old, a verified one on team B.
insert into public.deposits (lead_id, broker_id, type, agent_id, team_id, amount_pkr, deposit_date, method, reference_no, status, created_by, created_at) values
  ('f7000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000001', 'first', 'f6000000-0000-0000-0000-0000000000a1', 'f5000000-0000-0000-0000-00000000000a', 70000, current_date, 'cash', 'T11-PENDING', 'pending', 'f6000000-0000-0000-0000-0000000000a1', now() - interval '25 hours');
update public.deposits set cash_flag = true where reference_no = 'T11-PENDING';
insert into public.deposits (lead_id, broker_id, type, agent_id, team_id, amount_pkr, deposit_date, method, reference_no, status, verified_at, created_by) values
  ('f7000000-0000-0000-0000-000000000002', 'f4000000-0000-0000-0000-000000000001', 'first', 'f6000000-0000-0000-0000-0000000000b1', 'f5000000-0000-0000-0000-00000000000b', 90000, current_date, 'bank_transfer', 'T11-VERIFIED', 'verified', now(), 'f6000000-0000-0000-0000-0000000000b1');

-- ---------------------------------------------------------------------------
-- Team dashboard
-- ---------------------------------------------------------------------------
select pg_temp.act_as('f6000000-0000-0000-0000-00000000000a');
select is((public.team_overview() ->> 'team_id')::uuid, 'f5000000-0000-0000-0000-00000000000a'::uuid, 'a Team Lead gets their own team');
select is((public.team_overview('f5000000-0000-0000-0000-00000000000b') ->> 'team_id')::uuid, 'f5000000-0000-0000-0000-00000000000a'::uuid,
  'naming another team changes nothing for a Team Lead');
select is(jsonb_array_length(public.team_overview() -> 'agents'), 1, 'only their own agent is listed');
select is((public.team_overview() -> 'agents' -> 0 ->> 'name'), 'Agent A Eleven', 'and it is the right agent');
select is((public.team_overview() ->> 'overdue')::int, 1, 'the overdue count matches a direct count');
select is((public.team_overview() ->> 'unassigned')::int, 1, 'unassigned leads are counted');
select is((public.team_overview() ->> 'returned')::int, 1, 'returned leads are counted');
select is((public.team_overview() ->> 'pending_deposits')::int, 1, 'and only this team''s pending deposit');
select is((public.team_overview() -> 'stages' ->> 'deposit_verified'), null, 'the other team''s funded client is not in this stage strip');
reset role;
select pg_temp.act_as('f6000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.team_overview() $$, '42501', 'Only a Team Lead or an Admin opens a team dashboard.', 'an agent cannot open a team dashboard');

-- ---------------------------------------------------------------------------
-- Work queue
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('f6000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.work_queue() $$, '42501', 'Only an Admin opens the work queue.', 'a Team Lead cannot open the work queue');
reset role;
select pg_temp.act_as('f6000000-0000-0000-0000-000000000002', 'aal2');
select cmp_ok((public.work_queue() -> 'deposits' ->> 'count')::int, '=', (select count(*)::int from public.deposits where status = 'pending'),
  'the deposits tile equals a direct count');
select cmp_ok((public.work_queue() -> 'pool' ->> 'count')::int, '=', (select count(*)::int from public.leads where stage = 'new' and team_id is null),
  'the pool tile equals a direct count');
select is((public.work_queue() -> 'alerts' ->> 'cash_flagged')::int >= 1, true, 'pending cash above the limit is an alert');
select is(((public.work_queue() -> 'deposits' ->> 'oldest')::timestamptz) < now() - interval '24 hours', true, 'the oldest pending deposit is more than 24 hours old');

-- ---------------------------------------------------------------------------
-- Company dashboard
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.company_dashboard(now() - interval '1 day', now() + interval '1 day') $$, '42501',
  'Only the Superadmin opens the company dashboard.', 'an Admin cannot open the company dashboard');
reset role;
select pg_temp.act_as('f6000000-0000-0000-0000-000000000001', 'aal2');
select is((public.company_dashboard(now() - interval '1 day', now() + interval '1 day') -> 'headline' ->> 'verified_pkr')::bigint,
  (select sum(amount_pkr)::bigint from public.deposits where status = 'verified' and verified_at >= now() - interval '1 day' and verified_at < now() + interval '1 day'),
  'the headline total is the sum of verified deposits only (the pending Rs 70,000 is left out)');
select is((select (e ->> 'verified_pkr')::bigint from jsonb_array_elements(public.company_dashboard(now() - interval '1 day', now() + interval '1 day') -> 'sources') e
            where e ->> 'source' = 'Eleven Source'),
  90000::bigint, 'by source: the verified money belongs to the lead''s source');

select * from finish();
rollback;

-- Fix round 1 (A15): every active Admin gets one alert when a referral has no session date in time.
begin;
select plan(9);

create function pg_temp.make_user(uid uuid, mail text) returns void language sql as $$
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', mail, '', now(), now());
$$;

select pg_temp.make_user('b8000000-0000-0000-0000-000000000001', 'admin15a@test.local');
select pg_temp.make_user('b8000000-0000-0000-0000-000000000002', 'admin15b@test.local');
select pg_temp.make_user('b8000000-0000-0000-0000-000000000003', 'owner15@test.local');
select pg_temp.make_user('b8000000-0000-0000-0000-000000000004', 'off15@test.local');
select pg_temp.make_user('b8000000-0000-0000-0000-00000000000a', 'lead15@test.local');
select pg_temp.make_user('b8000000-0000-0000-0000-0000000000a1', 'agent15@test.local');
insert into public.profiles (id, full_name, email, role, is_active) values
  ('b8000000-0000-0000-0000-000000000001', 'Admin Fifteen A', 'admin15a@test.local', 'admin', true),
  ('b8000000-0000-0000-0000-000000000002', 'Admin Fifteen B', 'admin15b@test.local', 'admin', true),
  ('b8000000-0000-0000-0000-000000000003', 'Owner Fifteen', 'owner15@test.local', 'superadmin', true),
  ('b8000000-0000-0000-0000-000000000004', 'Disabled Admin', 'off15@test.local', 'admin', false),
  ('b8000000-0000-0000-0000-00000000000a', 'Lead Fifteen', 'lead15@test.local', 'team_lead', true);
insert into public.teams (id, name, color, team_lead_id)
values ('b8100000-0000-0000-0000-00000000000a', 'Fifteen Team', 'sky', 'b8000000-0000-0000-0000-00000000000a');
insert into public.profiles (id, full_name, email, role, team_id)
values ('b8000000-0000-0000-0000-0000000000a1', 'Agent Fifteen', 'agent15@test.local', 'agent', 'b8100000-0000-0000-0000-00000000000a');

-- Four clients with an open referral: 30 hours old (overdue), 30 hours old but with a date, 2 hours old, 2 hours old.
insert into public.leads (id, full_name, phone, source, stage, team_id, agent_id, created_by)
select ('b8200000-0000-0000-0000-00000000000' || n)::uuid, 'Client ' || n, '+9235810000' || lpad(n::text, 2, '0'), 'PR', 'with_analyst',
       'b8100000-0000-0000-0000-00000000000a', 'b8000000-0000-0000-0000-0000000000a1', 'b8000000-0000-0000-0000-000000000001'
  from generate_series(1, 4) n;
insert into public.sessions (lead_id, referred_by, referral_note, scheduled_at, created_at) values
  ('b8200000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-0000000000a1', 'Overdue, no date', null, now() - interval '30 hours'),
  ('b8200000-0000-0000-0000-000000000002', 'b8000000-0000-0000-0000-0000000000a1', 'Old but booked', now() + interval '1 day', now() - interval '30 hours'),
  ('b8200000-0000-0000-0000-000000000003', 'b8000000-0000-0000-0000-0000000000a1', 'Fresh, no date', null, now() - interval '2 hours'),
  ('b8200000-0000-0000-0000-000000000004', 'b8000000-0000-0000-0000-0000000000a1', 'Fresh, no date too', null, now() - interval '2 hours');

create function pg_temp.alerts(lead uuid, who uuid) returns integer language sql as $$
  select count(*)::int from public.notifications
   where user_id = who and type = 'referral_overdue' and link = '/lead/' || lead::text
$$;

select public.run_referral_sweep();

select is(pg_temp.alerts('b8200000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-000000000001'), 1,
  'Admin A is alerted about the overdue referral');
select is(pg_temp.alerts('b8200000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-000000000002'), 1,
  'Admin B is alerted too');
select is(pg_temp.alerts('b8200000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-000000000003'), 1,
  'the Superadmin is alerted too');
select is(pg_temp.alerts('b8200000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-000000000004'), 0,
  'a disabled Admin is not alerted');
select is(pg_temp.alerts('b8200000-0000-0000-0000-000000000002', 'b8000000-0000-0000-0000-000000000001')
        + pg_temp.alerts('b8200000-0000-0000-0000-000000000003', 'b8000000-0000-0000-0000-000000000001'), 0,
  'a referral with a session date, or one inside the deadline, raises no alert');

select public.run_referral_sweep();
select is(pg_temp.alerts('b8200000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-000000000001'), 1,
  'a second sweep does not alert twice');

-- Lowering the deadline to 1 hour makes the 2-hour-old referral overdue.
update public.settings set value = '1'::jsonb where key = 'referral_deadline_hours';
select public.run_referral_sweep();
select is(pg_temp.alerts('b8200000-0000-0000-0000-000000000003', 'b8000000-0000-0000-0000-000000000001'), 1,
  'with a 1 hour deadline, a 2 hour old referral alerts Admin A');
select is(pg_temp.alerts('b8200000-0000-0000-0000-000000000003', 'b8000000-0000-0000-0000-000000000002'), 1,
  'and Admin B');
select is(pg_temp.alerts('b8200000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-000000000001'), 1,
  'and the first referral still has just one alert');

select * from finish();
rollback;

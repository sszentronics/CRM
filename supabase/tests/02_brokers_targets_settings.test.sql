-- Module 2: brokers, targets, settings.
begin;
select plan(31);

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

create function pg_temp.reset_role() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Five assertions per role: no insert or update on brokers, targets or settings.
create function pg_temp.cannot_configure(who text) returns setof text language plpgsql as $$
begin
  return next throws_ok(
    $q$ insert into public.brokers (name, market, kyc_checklist) values ('Rogue Broker', 'psx', '["cnic_front"]') $q$,
    '42501', null, who || ' cannot add a broker');
  return next is_empty(
    $q$ update public.brokers set name = 'Renamed' returning id $q$,
    who || ' cannot change a broker');
  return next throws_ok(
    $q$ insert into public.targets (team_id, month, amount_pkr)
        values ('c0000000-0000-0000-0000-00000000000a', (date_trunc('month', now()) + interval '2 months')::date, 1) $q$,
    '42501', null, who || ' cannot add a target');
  return next is_empty(
    $q$ update public.targets set amount_pkr = 1 returning id $q$,
    who || ' cannot change a target');
  return next is_empty(
    $q$ update public.settings set value = '99' where key = 'max_call_tries' returning key $q$,
    who || ' cannot change a setting');
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
select pg_temp.make_user('c1000000-0000-0000-0000-000000000001', 'super2@test.local');
select pg_temp.make_user('c1000000-0000-0000-0000-000000000002', 'admin2@test.local');
select pg_temp.make_user('c1000000-0000-0000-0000-000000000003', 'lead2@test.local');
select pg_temp.make_user('c1000000-0000-0000-0000-000000000004', 'agent2@test.local');
select pg_temp.make_user('c1000000-0000-0000-0000-000000000005', 'analyst2@test.local');

insert into public.profiles (id, full_name, email, role) values
  ('c1000000-0000-0000-0000-000000000001', 'Super Two', 'super2@test.local', 'superadmin'),
  ('c1000000-0000-0000-0000-000000000002', 'Admin Two', 'admin2@test.local', 'admin'),
  ('c1000000-0000-0000-0000-000000000003', 'Lead Two', 'lead2@test.local', 'team_lead'),
  ('c1000000-0000-0000-0000-000000000005', 'Analyst Two', 'analyst2@test.local', 'analyst');
insert into public.teams (id, name, color, team_lead_id)
values ('c0000000-0000-0000-0000-00000000000a', 'Module Two Team', 'sky', 'c1000000-0000-0000-0000-000000000003');
insert into public.profiles (id, full_name, email, role, team_id)
values ('c1000000-0000-0000-0000-000000000004', 'Agent Two', 'agent2@test.local', 'agent', 'c0000000-0000-0000-0000-00000000000a');

insert into public.brokers (id, name, market, kyc_checklist, is_active) values
  ('c2000000-0000-0000-0000-000000000001', 'Test PSX Broker', 'psx', '["cnic_front","cnic_back"]', true),
  ('c2000000-0000-0000-0000-000000000002', 'Old PMEX Broker', 'pmex', '["cnic_front"]', false);

-- A past-month target, written around the lock as the database owner would have done back then.
alter table public.targets disable trigger targets_lock_past;
insert into public.targets (id, team_id, month, amount_pkr) values
  ('c3000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a',
   (private.karachi_month_start() - interval '1 month')::date, 1000000);
alter table public.targets enable trigger targets_lock_past;
insert into public.targets (id, team_id, month, amount_pkr) values
  ('c3000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000a', private.karachi_month_start(), 2000000);

-- ---------------------------------------------------------------------------
-- Structure and defaults
-- ---------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.brokers'::regclass), 'RLS is enabled on brokers');
select ok((select relrowsecurity from pg_class where oid = 'public.targets'::regclass), 'RLS is enabled on targets');
select ok((select relrowsecurity from pg_class where oid = 'public.settings'::regclass), 'RLS is enabled on settings');
select set_eq(
  $$ select key from public.settings $$,
  array['first_call_deadline_hours', 'max_call_tries', 'stale_days', 'cooling_off_days', 'referral_deadline_hours',
        'reversal_window_days', 'cash_flag_limit_pkr', 'idle_signout_minutes', 'lead_sources',
        'not_interested_reasons', 'invalid_reasons'],
  'every default setting from BUILD.md section 6 exists'
);

-- ---------------------------------------------------------------------------
-- Only the Superadmin writes
-- ---------------------------------------------------------------------------
select pg_temp.act_as('c1000000-0000-0000-0000-000000000002', 'aal2');
select * from pg_temp.cannot_configure('an admin');
select pg_temp.reset_role();
select pg_temp.act_as('c1000000-0000-0000-0000-000000000003');
select * from pg_temp.cannot_configure('a team_lead');
select pg_temp.reset_role();
select pg_temp.act_as('c1000000-0000-0000-0000-000000000004');
select * from pg_temp.cannot_configure('an agent');
select pg_temp.reset_role();
select pg_temp.act_as('c1000000-0000-0000-0000-000000000005');
select * from pg_temp.cannot_configure('an analyst');

-- Everyone signed in reads active brokers, targets and settings.
select is(
  (select array_agg(name) from public.brokers where id in ('c2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002')),
  array['Test PSX Broker'],
  'an analyst sees active brokers only'
);
select is((select (value)::int from public.settings where key = 'max_call_tries'), 5, 'an analyst can read settings');

-- ---------------------------------------------------------------------------
-- Superadmin: writes, sees switched-off brokers, but cannot touch past targets or delete
-- ---------------------------------------------------------------------------
select pg_temp.reset_role();
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001', 'aal2');
select is(
  (select count(*)::int from public.brokers where id in ('c2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002')),
  2,
  'the Superadmin also sees switched-off brokers'
);
select lives_ok(
  $$ update public.targets set amount_pkr = 2500000 where id = 'c3000000-0000-0000-0000-000000000002' $$,
  'the Superadmin can change this month''s target'
);
select throws_ok(
  $$ update public.targets set amount_pkr = 5 where id = 'c3000000-0000-0000-0000-000000000001' $$,
  'P0001', 'Targets for past months are locked.',
  'a target for a past month cannot be changed'
);
select throws_ok(
  $$ insert into public.targets (team_id, month, amount_pkr)
     values ('c0000000-0000-0000-0000-00000000000a', (private.karachi_month_start() - interval '2 months')::date, 1) $$,
  'P0001', 'Targets for past months are locked.',
  'a target cannot be added for a past month'
);
select is_empty(
  $$ delete from public.brokers where id = 'c2000000-0000-0000-0000-000000000002' returning id $$,
  'nobody removes a broker, not even the Superadmin'
);

select pg_temp.reset_role();
select * from finish();
rollback;

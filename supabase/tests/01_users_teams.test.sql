-- Module 1: profiles, teams, audit_log.
begin;
select plan(21);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres, so RLS does not apply while setting up)
-- ---------------------------------------------------------------------------
create function pg_temp.make_user(uid uuid, mail text) returns void language sql as $$
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', mail, '', now(), now());
$$;

-- Act as a signed-in user. aal2 means the TOTP step is done.
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

select pg_temp.make_user('a0000000-0000-0000-0000-000000000001', 'super@test.local');
select pg_temp.make_user('a0000000-0000-0000-0000-000000000002', 'admin@test.local');
select pg_temp.make_user('a0000000-0000-0000-0000-000000000003', 'leadA@test.local');
select pg_temp.make_user('a0000000-0000-0000-0000-000000000004', 'leadB@test.local');
select pg_temp.make_user('a0000000-0000-0000-0000-000000000005', 'agentA@test.local');
select pg_temp.make_user('a0000000-0000-0000-0000-000000000006', 'agentB@test.local');
select pg_temp.make_user('a0000000-0000-0000-0000-000000000007', 'spare@test.local');
select pg_temp.make_user('a0000000-0000-0000-0000-000000000008', 'leadC@test.local');

insert into public.profiles (id, full_name, email, phone, role) values
  ('a0000000-0000-0000-0000-000000000001', 'Sara Super', 'super@test.local', '+923000000001', 'superadmin'),
  ('a0000000-0000-0000-0000-000000000002', 'Adil Admin', 'admin@test.local', '+923000000002', 'admin'),
  ('a0000000-0000-0000-0000-000000000003', 'Lena Lead', 'leada@test.local', '+923000000003', 'team_lead'),
  ('a0000000-0000-0000-0000-000000000004', 'Bilal Lead', 'leadb@test.local', '+923000000004', 'team_lead'),
  ('a0000000-0000-0000-0000-000000000007', 'Spare Lead', 'spare@test.local', null, 'team_lead'),
  ('a0000000-0000-0000-0000-000000000008', 'Cara Lead', 'leadc@test.local', null, 'team_lead');

insert into public.teams (id, name, color, team_lead_id) values
  ('b0000000-0000-0000-0000-00000000000a', 'Test Falcons', 'cyan', 'a0000000-0000-0000-0000-000000000003'),
  ('b0000000-0000-0000-0000-00000000000b', 'Test Markhors', 'coral', 'a0000000-0000-0000-0000-000000000004');

insert into public.profiles (id, full_name, email, phone, role, team_id) values
  ('a0000000-0000-0000-0000-000000000005', 'Ali Agent', 'agenta@test.local', '+923000000005', 'agent', 'b0000000-0000-0000-0000-00000000000a'),
  ('a0000000-0000-0000-0000-000000000006', 'Beena Agent', 'agentb@test.local', '+923000000006', 'agent', 'b0000000-0000-0000-0000-00000000000b');

insert into public.audit_log (user_id, action, entity, entity_id)
values ('a0000000-0000-0000-0000-000000000001', 'user.create', 'profile', 'a0000000-0000-0000-0000-000000000005');

-- ---------------------------------------------------------------------------
-- RLS is on
-- ---------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS is enabled on profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.teams'::regclass), 'RLS is enabled on teams');
select ok((select relrowsecurity from pg_class where oid = 'public.audit_log'::regclass), 'RLS is enabled on audit_log');

-- ---------------------------------------------------------------------------
-- Agents: own profile only; colleagues through profiles_public
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a0000000-0000-0000-0000-000000000005');

select is(
  (select count(*)::int from public.profiles where id = 'a0000000-0000-0000-0000-000000000006'),
  0,
  'an agent cannot read another user''s profile row (phone, email)'
);
select is(
  (select phone from public.profiles where id = 'a0000000-0000-0000-0000-000000000005'),
  '+923000000005',
  'an agent can read their own phone'
);
select is(
  (select full_name from public.profiles_public where id = 'a0000000-0000-0000-0000-000000000006'),
  'Beena Agent',
  'an agent can read a colleague through profiles_public'
);
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles_public' and column_name in ('phone', 'email')),
  0,
  'profiles_public exposes no phone or email column'
);
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'a0000000-0000-0000-0000-000000000005' $$,
  '42501',
  'Only the Superadmin can change name, role or team.',
  'an agent cannot change their own role'
);
select lives_ok(
  $$ update public.profiles set photo_url = 'https://example.test/me.png' where id = 'a0000000-0000-0000-0000-000000000005' $$,
  'an agent can change their own photo'
);

-- ---------------------------------------------------------------------------
-- Team Lead sees their own team only
-- ---------------------------------------------------------------------------
select pg_temp.reset_role();
select pg_temp.act_as('a0000000-0000-0000-0000-000000000003');
select is(
  (select array_agg(full_name order by full_name) from public.profiles),
  array['Ali Agent', 'Lena Lead'],
  'a Team Lead reads their own team''s profiles only'
);

-- ---------------------------------------------------------------------------
-- audit_log: Superadmin reads; nobody changes or deletes
-- ---------------------------------------------------------------------------
select pg_temp.reset_role();
select pg_temp.act_as('a0000000-0000-0000-0000-000000000002', 'aal2');
select is((select count(*)::int from public.audit_log), 0, 'an admin cannot read the audit log');

select pg_temp.reset_role();
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001', 'aal1');
select is((select count(*)::int from public.audit_log), 0, 'a superadmin without the TOTP step cannot read the audit log');

select pg_temp.reset_role();
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001', 'aal2');
select is(
  (select count(*)::int from public.audit_log where entity_id = 'a0000000-0000-0000-0000-000000000005'),
  1,
  'a superadmin with the TOTP step can read the audit log'
);
select is_empty($$ update public.audit_log set action = 'tampered' returning id $$, 'a superadmin cannot update an audit row');
select is_empty($$ delete from public.audit_log returning id $$, 'a superadmin cannot delete an audit row');

select pg_temp.reset_role();
select throws_ok(
  $$ update public.audit_log set action = 'tampered' $$,
  '42501', 'Audit log rows cannot be changed or deleted.',
  'even the database owner cannot update an audit row'
);
select throws_ok(
  $$ delete from public.audit_log $$,
  '42501', 'Audit log rows cannot be changed or deleted.',
  'even the database owner cannot delete an audit row'
);

-- ---------------------------------------------------------------------------
-- Exactly one Team Lead per team
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001', 'aal2');
select throws_ok(
  $$ update public.profiles set team_id = 'b0000000-0000-0000-0000-00000000000a'
       where id = 'a0000000-0000-0000-0000-000000000007' $$,
  '23505', null,
  'a second Team Lead on the same team is rejected'
);
select throws_ok(
  $$ update public.profiles set role = 'agent' where id = 'a0000000-0000-0000-0000-000000000003' $$,
  'P0001', 'This person leads a team. Change the Team Lead first.',
  'a leading Team Lead cannot change role before the team gets a new lead'
);

-- Changing the lead is one update; triggers move both people.
update public.teams set team_lead_id = 'a0000000-0000-0000-0000-000000000007'
 where id = 'b0000000-0000-0000-0000-00000000000a';
select results_eq(
  $$ select id::text, team_id::text from public.profiles
      where id in ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000007') order by id $$,
  $$ values ('a0000000-0000-0000-0000-000000000003', null::text),
            ('a0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-00000000000a') $$,
  'changing the Team Lead releases the old lead and attaches the new one'
);

select pg_temp.reset_role();
select pg_temp.act_as('a0000000-0000-0000-0000-000000000002', 'aal2');
-- Owner decision (8 Oct 2026): the Admin manages teams. Detailed scope tests are in 03_admin_manages_teams.
select isnt_empty(
  $$ update public.teams set color = 'pink' where id = 'b0000000-0000-0000-0000-00000000000b' returning id $$,
  'an admin with the TOTP step can change a team'
);

select pg_temp.reset_role();
select * from finish();
rollback;

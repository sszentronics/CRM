-- Module 3: lead intake.
begin;
select plan(15);

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

-- Insert a lead as the current user. Phone and other columns vary per check.
create function pg_temp.add_lead(phone text, creator uuid, stage text default 'new', team uuid default null)
returns void language plpgsql as $$
begin
  insert into public.leads (full_name, phone, source, stage, team_id, created_by)
  values ('Test Lead', phone, 'Facebook', stage::public.lead_stage, team, creator);
end;
$$;

select pg_temp.make_user('e1000000-0000-0000-0000-000000000001', 'super4@test.local');
select pg_temp.make_user('e1000000-0000-0000-0000-000000000002', 'admin4@test.local');
select pg_temp.make_user('e1000000-0000-0000-0000-000000000003', 'lead4@test.local');
select pg_temp.make_user('e1000000-0000-0000-0000-000000000004', 'agent4@test.local');
select pg_temp.make_user('e1000000-0000-0000-0000-000000000005', 'analyst4@test.local');
insert into public.profiles (id, full_name, email, role) values
  ('e1000000-0000-0000-0000-000000000001', 'Super Four', 'super4@test.local', 'superadmin'),
  ('e1000000-0000-0000-0000-000000000002', 'Admin Four', 'admin4@test.local', 'admin'),
  ('e1000000-0000-0000-0000-000000000003', 'Lead Four', 'lead4@test.local', 'team_lead'),
  ('e1000000-0000-0000-0000-000000000005', 'Analyst Four', 'analyst4@test.local', 'analyst');
insert into public.teams (id, name, color, team_lead_id)
values ('e0000000-0000-0000-0000-00000000000a', 'Module Four Team', 'lemon', 'e1000000-0000-0000-0000-000000000003');
insert into public.profiles (id, full_name, email, role, team_id)
values ('e1000000-0000-0000-0000-000000000004', 'Agent Four', 'agent4@test.local', 'agent', 'e0000000-0000-0000-0000-00000000000a');

select ok((select relrowsecurity from pg_class where oid = 'public.leads'::regclass), 'RLS is enabled on leads');

-- Who may add leads
select pg_temp.act_as('e1000000-0000-0000-0000-000000000001', 'aal2');
select lives_ok($$ select pg_temp.add_lead('+923411000001', 'e1000000-0000-0000-0000-000000000001') $$,
  'the Superadmin can add a lead');
reset role;
select pg_temp.act_as('e1000000-0000-0000-0000-000000000002', 'aal2');
select lives_ok($$ select pg_temp.add_lead('+923411000002', 'e1000000-0000-0000-0000-000000000002') $$,
  'an Admin can add a lead');
reset role;
select pg_temp.act_as('e1000000-0000-0000-0000-000000000002', 'aal1');
select throws_ok($$ select pg_temp.add_lead('+923411000003', 'e1000000-0000-0000-0000-000000000002') $$,
  '42501', null, 'an Admin without the TOTP step cannot add a lead');
reset role;
select pg_temp.act_as('e1000000-0000-0000-0000-000000000003');
select throws_ok($$ select pg_temp.add_lead('+923411000004', 'e1000000-0000-0000-0000-000000000003') $$,
  '42501', null, 'a team_lead cannot add a lead');
select is((select count(*)::int from public.leads), 0, 'a team_lead sees no pool leads yet (Module 4 adds team scope)');
reset role;
select pg_temp.act_as('e1000000-0000-0000-0000-000000000004');
select throws_ok($$ select pg_temp.add_lead('+923411000005', 'e1000000-0000-0000-0000-000000000004') $$,
  '42501', null, 'an agent cannot add a lead');
reset role;
select pg_temp.act_as('e1000000-0000-0000-0000-000000000005');
select throws_ok($$ select pg_temp.add_lead('+923411000006', 'e1000000-0000-0000-0000-000000000005') $$,
  '42501', null, 'an analyst cannot add a lead');

-- What a new lead must look like
reset role;
select pg_temp.act_as('e1000000-0000-0000-0000-000000000002', 'aal2');
select throws_ok($$ select pg_temp.add_lead('+923411000002', 'e1000000-0000-0000-0000-000000000002') $$,
  '23505', null, 'two leads with the same phone cannot exist');
select throws_ok($$ select pg_temp.add_lead('+923411000007', 'e1000000-0000-0000-0000-000000000002', 'assigned') $$,
  '42501', null, 'a new lead must start in stage new');
select throws_ok(
  $$ select pg_temp.add_lead('+923411000008', 'e1000000-0000-0000-0000-000000000002', 'new',
                             'e0000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'a new lead starts with no team');
select throws_ok($$ select pg_temp.add_lead('+923411000009', 'e1000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'a lead records who really added it');
select throws_ok($$ select pg_temp.add_lead('03001234567', 'e1000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'a phone that is not normalised is rejected');
select is((select count(*)::int from public.leads where phone like '+92341100000%'), 2,
  'an Admin sees every lead in the pool');

-- The duplicate-check function is for the server only
select throws_ok($$ select public.existing_lead_phones(array['+923411000001']) $$,
  '42501', null, 'signed-in users cannot call the server-only duplicate check');

reset role;
select * from finish();
rollback;

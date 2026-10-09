-- Owner decision (8 Oct 2026): the Admin manages teams, Team Leads and agents. Nothing else.
begin;
select plan(9);

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

select pg_temp.make_user('d1000000-0000-0000-0000-000000000001', 'admin3@test.local');
select pg_temp.make_user('d1000000-0000-0000-0000-000000000002', 'lead3@test.local');
select pg_temp.make_user('d1000000-0000-0000-0000-000000000003', 'agent3@test.local');
select pg_temp.make_user('d1000000-0000-0000-0000-000000000004', 'analyst3@test.local');
select pg_temp.make_user('d1000000-0000-0000-0000-000000000005', 'newagent3@test.local');
select pg_temp.make_user('d1000000-0000-0000-0000-000000000006', 'newanalyst3@test.local');
select pg_temp.make_user('d1000000-0000-0000-0000-000000000007', 'lead3b@test.local');

insert into public.profiles (id, full_name, email, role) values
  ('d1000000-0000-0000-0000-000000000001', 'Admin Three', 'admin3@test.local', 'admin'),
  ('d1000000-0000-0000-0000-000000000002', 'Lead Three', 'lead3@test.local', 'team_lead'),
  ('d1000000-0000-0000-0000-000000000004', 'Analyst Three', 'analyst3@test.local', 'analyst'),
  ('d1000000-0000-0000-0000-000000000007', 'Lead Three B', 'lead3b@test.local', 'team_lead');
insert into public.teams (id, name, color, team_lead_id)
values ('d0000000-0000-0000-0000-00000000000a', 'Module Three Team', 'pink', 'd1000000-0000-0000-0000-000000000002');
insert into public.profiles (id, full_name, email, role, team_id)
values ('d1000000-0000-0000-0000-000000000003', 'Agent Three', 'agent3@test.local', 'agent', 'd0000000-0000-0000-0000-00000000000a');

select pg_temp.act_as('d1000000-0000-0000-0000-000000000001', 'aal2');

select lives_ok(
  $$ insert into public.profiles (id, full_name, email, role, team_id)
     values ('d1000000-0000-0000-0000-000000000005', 'New Agent', 'newagent3@test.local', 'agent',
             'd0000000-0000-0000-0000-00000000000a') $$,
  'an admin can add an agent'
);
select throws_ok(
  $$ insert into public.profiles (id, full_name, email, role)
     values ('d1000000-0000-0000-0000-000000000006', 'New Analyst', 'newanalyst3@test.local', 'analyst') $$,
  '42501', null,
  'an admin cannot add an analyst'
);
select isnt_empty(
  $$ update public.profiles set full_name = 'Agent Three Renamed', phone = '+923000000033'
      where id = 'd1000000-0000-0000-0000-000000000003' returning id $$,
  'an admin can edit an agent'
);
select is_empty(
  $$ update public.profiles set full_name = 'Renamed' where id = 'd1000000-0000-0000-0000-000000000004' returning id $$,
  'an admin cannot edit an analyst'
);
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'd1000000-0000-0000-0000-000000000003' $$,
  '42501', null,
  'an admin cannot turn an agent into an admin'
);
select throws_ok(
  $$ update public.profiles set role = 'superadmin' where id = 'd1000000-0000-0000-0000-000000000001' $$,
  '42501', 'Only the Superadmin can change name, role or team.',
  'an admin cannot change their own role'
);
select isnt_empty(
  $$ update public.profiles set is_active = false where id = 'd1000000-0000-0000-0000-000000000005' returning id $$,
  'an admin can disable an agent'
);
select lives_ok(
  $$ update public.teams set team_lead_id = 'd1000000-0000-0000-0000-000000000007'
      where id = 'd0000000-0000-0000-0000-00000000000a' $$,
  'an admin can change a team''s Team Lead'
);

reset role;
select pg_temp.act_as('d1000000-0000-0000-0000-000000000001', 'aal1');
select is_empty(
  $$ update public.profiles set full_name = 'No code' where id = 'd1000000-0000-0000-0000-000000000003' returning id $$,
  'an admin without the TOTP step cannot edit anyone'
);

reset role;
select * from finish();
rollback;

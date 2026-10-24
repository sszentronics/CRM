-- Workspaces: two companies in one database never see or change each other's rows.
begin;
select plan(20);

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

-- Trading Labs (the seeded client workspace) and a second, demo workspace.
insert into public.workspaces (id, name, plan, trial_ends_at)
values ('a0000000-0000-4000-8000-000000000002', 'Demo Co', 'trial', now() + interval '14 days'),
       ('a0000000-0000-4000-8000-000000000003', 'Expired Co', 'trial', now() - interval '1 day');

select pg_temp.make_user('f1000000-0000-0000-0000-000000000001', 'tl-super@test.local');
select pg_temp.make_user('f1000000-0000-0000-0000-000000000002', 'demo-super@test.local');
select pg_temp.make_user('f1000000-0000-0000-0000-000000000003', 'old-super@test.local');
select pg_temp.make_user('f1000000-0000-0000-0000-000000000004', 'tl-lead@test.local');
insert into public.profiles (id, full_name, email, role, workspace_id) values
  ('f1000000-0000-0000-0000-000000000004', 'TL Lead Person', 'tl-lead@test.local', 'team_lead', '00000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-0000-0000-000000000001', 'TL Super', 'tl-super@test.local', 'superadmin', '00000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-0000-0000-000000000002', 'Demo Super', 'demo-super@test.local', 'superadmin', 'a0000000-0000-4000-8000-000000000002'),
  ('f1000000-0000-0000-0000-000000000003', 'Old Super', 'old-super@test.local', 'superadmin', 'a0000000-0000-4000-8000-000000000003');

-- The same phone number may be a lead in two workspaces.
insert into public.leads (full_name, phone, source, created_by, workspace_id) values
  ('TL Lead', '+923411999001', 'Facebook', 'f1000000-0000-0000-0000-000000000001', '00000000-0000-4000-8000-000000000001'),
  ('Demo Lead', '+923411999001', 'Facebook', 'f1000000-0000-0000-0000-000000000002', 'a0000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.leads where phone = '+923411999001'), 2,
  'the same phone number can be a lead in two workspaces');

insert into public.teams (id, name, color, team_lead_id, workspace_id) values (
  'f0000000-0000-0000-0000-0000000000a1', 'Falcons', 'cyan', 'f1000000-0000-0000-0000-000000000004', '00000000-0000-4000-8000-000000000001');

-- A demo owner sees only their own workspace.
select pg_temp.act_as('f1000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.workspaces), 1, 'a demo owner sees one workspace');
select is((select name from public.workspaces), 'Demo Co', 'and it is their own');
select is((select count(*)::int from public.leads), 1, 'a demo owner sees only their own leads');
select is((select full_name from public.leads), 'Demo Lead', 'and the lead is theirs');
select is((select count(*)::int from public.profiles), 1, 'a demo owner sees only people in their workspace');
select is((select count(*)::int from public.teams), 0, 'a demo owner does not see Trading Labs teams');
select is((select count(*)::int from public.profiles_public), 1, 'the public people view is scoped too');

-- Writes into another workspace are refused, even by naming it.
select throws_ok($$ insert into public.leads (full_name, phone, source, created_by, workspace_id)
  values ('Sneaky', '+923411999002', 'Facebook', 'f1000000-0000-0000-0000-000000000002', '00000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'a demo owner cannot add a lead to Trading Labs');
select is((select count(*)::int from public.leads where phone = '+923411999001' and full_name = 'TL Lead'), 0,
  'and still cannot read it');

-- Rows take the caller's workspace by default.
select lives_ok($$ insert into public.leads (full_name, phone, source, created_by)
  values ('Default Lead', '+923411999003', 'Facebook', 'f1000000-0000-0000-0000-000000000002') $$,
  'a demo owner can add a lead');
select is((select workspace_id from public.leads where phone = '+923411999003'), 'a0000000-0000-4000-8000-000000000002'::uuid,
  'it lands in their own workspace');

-- Demo workspaces skip the authenticator step; client workspaces do not.
select is(private.has_aal2(), true, 'a demo owner passes without the authenticator step');
reset role;
select pg_temp.act_as('f1000000-0000-0000-0000-000000000001', 'aal1');
select is(private.has_aal2(), false, 'a client Superadmin still needs the authenticator step');
reset role;

-- Board functions that read across the company stay inside one workspace.
select pg_temp.act_as('f1000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.board_teams(now() - interval '30 days', now() + interval '1 day')), 0,
  'the team board in a demo workspace does not list Trading Labs teams');
reset role;
select pg_temp.act_as('f1000000-0000-0000-0000-000000000001', 'aal2');
select is((select count(*)::int from public.board_teams(now() - interval '30 days', now() + interval '1 day')), 1,
  'the team board in Trading Labs lists its own team');
reset role;

-- An ended demo can still be read but not written.
select pg_temp.act_as('f1000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.workspaces), 1, 'an ended demo can still open its workspace');
select throws_ok($$ insert into public.leads (full_name, phone, source, created_by)
  values ('Late', '+923411999004', 'Facebook', 'f1000000-0000-0000-0000-000000000003') $$,
  '42501', null, 'an ended demo cannot add leads');
reset role;

-- Only a client workspace can set colours.
select pg_temp.act_as('f1000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.update_workspace_branding('Demo Co', '{"primary":"#057940","rail":"#08150f"}'::jsonb) $$,
  '42501', null, 'a demo workspace cannot set custom colours');
reset role;
select pg_temp.act_as('f1000000-0000-0000-0000-000000000001', 'aal2');
select lives_ok($$ select public.update_workspace_branding('Trading Labs', '{"primary":"#5b2ec9","rail":"#220b47"}'::jsonb) $$,
  'a client Superadmin can set custom colours');
reset role;

select * from finish();
rollback;

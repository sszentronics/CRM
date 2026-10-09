-- Module 4: distribution, assignment and lead visibility for every role.
begin;
select plan(24);

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

-- People: admin, two teams each with a lead and an agent, an analyst.
select pg_temp.make_user('f1000000-0000-0000-0000-000000000001', 'admin5@test.local');
select pg_temp.make_user('f1000000-0000-0000-0000-00000000000a', 'leadA5@test.local');
select pg_temp.make_user('f1000000-0000-0000-0000-00000000000b', 'leadB5@test.local');
select pg_temp.make_user('f1000000-0000-0000-0000-0000000000a1', 'agentA5@test.local');
select pg_temp.make_user('f1000000-0000-0000-0000-0000000000a2', 'agentA5b@test.local');
select pg_temp.make_user('f1000000-0000-0000-0000-0000000000b1', 'agentB5@test.local');
select pg_temp.make_user('f1000000-0000-0000-0000-0000000000c1', 'analyst5@test.local');
insert into public.profiles (id, full_name, email, role) values
  ('f1000000-0000-0000-0000-000000000001', 'Admin Five', 'admin5@test.local', 'admin'),
  ('f1000000-0000-0000-0000-00000000000a', 'Lead A Five', 'leada5@test.local', 'team_lead'),
  ('f1000000-0000-0000-0000-00000000000b', 'Lead B Five', 'leadb5@test.local', 'team_lead'),
  ('f1000000-0000-0000-0000-0000000000c1', 'Analyst Five', 'analyst5@test.local', 'analyst');
insert into public.teams (id, name, color, team_lead_id) values
  ('f0000000-0000-0000-0000-00000000000a', 'Five A', 'cyan', 'f1000000-0000-0000-0000-00000000000a'),
  ('f0000000-0000-0000-0000-00000000000b', 'Five B', 'coral', 'f1000000-0000-0000-0000-00000000000b');
insert into public.profiles (id, full_name, email, role, team_id) values
  ('f1000000-0000-0000-0000-0000000000a1', 'Agent A Five', 'agenta5@test.local', 'agent', 'f0000000-0000-0000-0000-00000000000a'),
  ('f1000000-0000-0000-0000-0000000000a2', 'Agent A2 Five', 'agenta5b@test.local', 'agent', 'f0000000-0000-0000-0000-00000000000a'),
  ('f1000000-0000-0000-0000-0000000000b1', 'Agent B Five', 'agentb5@test.local', 'agent', 'f0000000-0000-0000-0000-00000000000b');

-- Leads, written as the database owner: four in the pool, then distributed below.
insert into public.leads (id, full_name, phone, source, created_by) values
  ('f2000000-0000-0000-0000-000000000001', 'Pool One', '+923551000001', 'Facebook', 'f1000000-0000-0000-0000-000000000001'),
  ('f2000000-0000-0000-0000-000000000002', 'Pool Two', '+923551000002', 'Facebook', 'f1000000-0000-0000-0000-000000000001'),
  ('f2000000-0000-0000-0000-000000000003', 'Pool Three', '+923551000003', 'PR', 'f1000000-0000-0000-0000-000000000001'),
  ('f2000000-0000-0000-0000-000000000004', 'Pool Four', '+923551000004', 'PR', 'f1000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- Admin sends leads to teams
-- ---------------------------------------------------------------------------
select pg_temp.act_as('f1000000-0000-0000-0000-000000000001', 'aal2');
select is(
  public.assign_leads_to_team(array['f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000002',
                                    'f2000000-0000-0000-0000-000000000003']::uuid[],
                              'f0000000-0000-0000-0000-00000000000a'),
  3, 'an Admin sends 3 pool leads to team A');
select is(
  public.assign_leads_to_team(array['f2000000-0000-0000-0000-000000000004']::uuid[], 'f0000000-0000-0000-0000-00000000000b'),
  1, 'and 1 to team B');
select is(
  (select array_agg(distinct stage::text) from public.leads where id::text like 'f2000000%'),
  array['assigned'], 'leads that reach a team move from new to assigned');
select is(
  (select count(*)::int from public.assignments where lead_id::text like 'f2000000%'),
  4, 'every move writes one assignments row');
select throws_ok(
  $$ select public.assign_leads_to_team(array['f2000000-0000-0000-0000-000000000004']::uuid[],
                                        'f0000000-0000-0000-0000-00000000000a') $$,
  'P0001', 'Give a reason for moving a lead to another team.',
  'moving a lead between teams needs a reason');

-- ---------------------------------------------------------------------------
-- Team Lead assigns within the team only
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('f1000000-0000-0000-0000-00000000000a');
select is(
  (select count(*)::int from public.leads where id::text like 'f2000000%'),
  3, 'a team_lead sees only their team''s leads');
select throws_ok(
  $$ select public.assign_leads_to_team(array['f2000000-0000-0000-0000-000000000001']::uuid[],
                                        'f0000000-0000-0000-0000-00000000000b', 'try') $$,
  '42501', null, 'a team_lead cannot send leads to another team');
select throws_ok(
  $$ update public.leads set team_id = 'f0000000-0000-0000-0000-00000000000b'
      where id = 'f2000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'a team_lead cannot set team_id to another team');
select is(
  public.assign_leads_to_agent(array['f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000002']::uuid[],
                               'f1000000-0000-0000-0000-0000000000a1'),
  2, 'a team_lead assigns two leads to their agent');
select is(
  public.assign_leads_to_agent(array['f2000000-0000-0000-0000-000000000003']::uuid[], 'f1000000-0000-0000-0000-00000000000a'),
  1, 'a team_lead can assign a lead to themself');
select throws_ok(
  $$ select public.assign_leads_to_agent(array['f2000000-0000-0000-0000-000000000003']::uuid[],
                                         'f1000000-0000-0000-0000-0000000000b1', 'swap') $$,
  '42501', null, 'a team_lead cannot assign to an agent in another team');
select throws_ok(
  $$ select public.assign_leads_to_agent(array['f2000000-0000-0000-0000-000000000001']::uuid[],
                                         'f1000000-0000-0000-0000-0000000000a2') $$,
  'P0001', 'Give a reason for reassigning a lead.',
  'reassigning without a reason is refused');
select isnt(
  (select agent_assigned_at from public.leads where id = 'f2000000-0000-0000-0000-000000000001'),
  null, 'assigning to an agent starts the first-call countdown');

-- ---------------------------------------------------------------------------
-- Agents see only their own leads, and cannot reassign
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('f1000000-0000-0000-0000-0000000000a1');
select set_eq(
  $$ select id::text from public.leads $$,
  array['f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000002'],
  'an agent selecting from leads gets only rows where agent_id is their id');
select throws_ok(
  $$ update public.leads set agent_id = 'f1000000-0000-0000-0000-0000000000a2'
      where id = 'f2000000-0000-0000-0000-000000000001' $$,
  '42501', 'Only a Team Lead or Admin can reassign a lead.',
  'an agent cannot reassign their lead');
select is(
  (select count(*)::int from public.notifications where type = 'lead_assigned'),
  1, 'the agent got one "Lead assigned" notification for the batch');
select is(
  (select count(*)::int from public.notifications where user_id <> 'f1000000-0000-0000-0000-0000000000a1'),
  0, 'nobody reads anyone else''s notifications');
select throws_ok(
  $$ update public.notifications set message = 'edited' $$,
  '42501', 'Only the read time of a notification can change.',
  'a notification''s text cannot be changed');

reset role;
select pg_temp.act_as('f1000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.leads where id::text like 'f2000000%'), 0,
  'an analyst sees no leads until Module 6 adds referrals');

-- ---------------------------------------------------------------------------
-- Disabling a person returns their open leads to the Team Lead
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('f1000000-0000-0000-0000-000000000001', 'aal2');
select is(public.return_open_leads('f1000000-0000-0000-0000-0000000000a1', 'Person disabled'), 2,
  'both of the agent''s open leads go back');
select results_eq(
  $$ select agent_id, returned_to_lead from public.leads where id = 'f2000000-0000-0000-0000-000000000001' $$,
  $$ values (null::uuid, true) $$,
  'a returned lead has no agent and is flagged for the Team Lead');

-- ---------------------------------------------------------------------------
-- History is append-only
-- ---------------------------------------------------------------------------
select is_empty($$ update public.assignments set reason = 'edited' returning id $$,
  'an Admin cannot update assignments (no policy)');
reset role;
select throws_ok($$ update public.assignments set reason = 'edited' $$, '42501',
  'Assignment history cannot be changed or deleted.', 'nobody can update assignments');
select throws_ok($$ delete from public.assignments $$, '42501',
  'Assignment history cannot be changed or deleted.', 'nobody can delete assignments');

select * from finish();
rollback;

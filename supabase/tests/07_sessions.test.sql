-- Module 6: analyst sessions.
begin;
select plan(22);

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

create function pg_temp.session_of(lead uuid) returns uuid language sql as $$
  select id from public.sessions where lead_id = lead order by created_at desc limit 1
$$;

select pg_temp.make_user('b6000000-0000-0000-0000-000000000001', 'admin7@test.local');
select pg_temp.make_user('b6000000-0000-0000-0000-00000000000a', 'lead7@test.local');
select pg_temp.make_user('b6000000-0000-0000-0000-0000000000a1', 'agent7@test.local');
select pg_temp.make_user('b6000000-0000-0000-0000-0000000000c1', 'omar7@test.local');
select pg_temp.make_user('b6000000-0000-0000-0000-0000000000c2', 'nida7@test.local');
insert into public.profiles (id, full_name, email, role) values
  ('b6000000-0000-0000-0000-000000000001', 'Admin Seven', 'admin7@test.local', 'admin'),
  ('b6000000-0000-0000-0000-00000000000a', 'Lead Seven', 'lead7@test.local', 'team_lead'),
  ('b6000000-0000-0000-0000-0000000000c1', 'Omar Analyst', 'omar7@test.local', 'analyst'),
  ('b6000000-0000-0000-0000-0000000000c2', 'Nida Analyst', 'nida7@test.local', 'analyst');
insert into public.teams (id, name, color, team_lead_id)
values ('b5000000-0000-0000-0000-00000000000a', 'Seven Team', 'lilac', 'b6000000-0000-0000-0000-00000000000a');
insert into public.profiles (id, full_name, email, role, team_id)
values ('b6000000-0000-0000-0000-0000000000a1', 'Agent Seven', 'agent7@test.local', 'agent', 'b5000000-0000-0000-0000-00000000000a');

-- Three interested leads owned by the agent.
insert into public.leads (id, full_name, phone, source, stage, team_id, agent_id, next_follow_up_at, created_by)
select ('b7000000-0000-0000-0000-00000000000' || n)::uuid, 'Client ' || n, '+9235710000' || lpad(n::text, 2, '0'), 'PR', 'interested',
       'b5000000-0000-0000-0000-00000000000a', 'b6000000-0000-0000-0000-0000000000a1', now() + interval '1 day',
       'b6000000-0000-0000-0000-000000000001'
  from generate_series(1, 3) n;

select ok((select relrowsecurity from pg_class where oid = 'public.sessions'::regclass), 'RLS is enabled on sessions');

-- ---------------------------------------------------------------------------
-- The agent refers lead 1 to anyone, lead 2 to Omar, lead 3 to anyone (to cancel)
-- ---------------------------------------------------------------------------
select pg_temp.act_as('b6000000-0000-0000-0000-0000000000a1');
select throws_ok(
  $$ select public.refer_to_analyst('b7000000-0000-0000-0000-000000000001', null, null, 'office', '') $$,
  'P0001', 'Add a note for the analyst: what does the client want to know?', 'a referral needs a note');
select lives_ok(
  $$ select public.refer_to_analyst('b7000000-0000-0000-0000-000000000001', null, null, 'office', 'Wants to understand PSX risk') $$,
  'the agent refers a client to any analyst');
select results_eq(
  $$ select stage::text, agent_id from public.leads where id = 'b7000000-0000-0000-0000-000000000001' $$,
  $$ values ('with_analyst', 'b6000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'referral moves the lead to with_analyst and the agent stays the owner');
select lives_ok(
  $$ select public.refer_to_analyst('b7000000-0000-0000-0000-000000000002', 'b6000000-0000-0000-0000-0000000000c1',
                                    now() + interval '2 days', 'video', 'Asks about commodities') $$,
  'the agent refers a client to a named analyst');
select lives_ok(
  $$ select public.refer_to_analyst('b7000000-0000-0000-0000-000000000003', null, null, 'phone', 'Second opinion') $$,
  'and a third, to cancel later');

-- ---------------------------------------------------------------------------
-- Analysts: no access before accepting; exactly one wins "any available"
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('b6000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.leads where id = 'b7000000-0000-0000-0000-000000000001'), 0,
  'an analyst cannot read an unaccepted any-available lead');
select lives_ok($$ select public.accept_referral(pg_temp.session_of('b7000000-0000-0000-0000-000000000001')) $$,
  'Omar accepts the any-available referral first');
reset role;
select pg_temp.act_as('b6000000-0000-0000-0000-0000000000c2');
select throws_ok($$ select public.accept_referral(pg_temp.session_of('b7000000-0000-0000-0000-000000000001')) $$,
  'P0001', 'Another analyst already took this referral.', 'Nida accepting the same referral fails');
select is((select count(*)::int from public.leads where id::text like 'b7000000%'), 0,
  'Nida reads none of these leads');
select throws_ok($$ select public.accept_referral(pg_temp.session_of('b7000000-0000-0000-0000-000000000002')) $$,
  'P0001', 'Another analyst already took this referral.', 'nor can she take one sent to Omar');

reset role;
select pg_temp.act_as('b6000000-0000-0000-0000-0000000000c1');
-- A named referral is assigned to Omar before he accepts it (section 3: "an open session assigned to that analyst").
select set_eq($$ select id::text from public.leads where id::text like 'b7000000%' $$,
  array['b7000000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-000000000002'],
  'Omar reads only the leads with an open session assigned to him');
select throws_ok($$ select public.refer_to_analyst('b7000000-0000-0000-0000-000000000001', null, null, 'office', 'self') $$,
  '42501', 'This lead belongs to another team.', 'an analyst cannot refer clients');

-- Attended: post_session, credit, and hand-back ends access.
select lives_ok($$ select public.schedule_session(pg_temp.session_of('b7000000-0000-0000-0000-000000000001'),
                                                    now() + interval '3 hours', 'video') $$, 'Omar books the session');
select lives_ok($$ select public.record_session_outcome(pg_temp.session_of('b7000000-0000-0000-0000-000000000001'),
                                                          'attended', 'beginner', 'high', 'Explained PSX basics', 'Ready to open an account') $$,
  'Omar records Attended and hands back');
select is((select count(*)::int from public.leads where id = 'b7000000-0000-0000-0000-000000000001'), 0,
  'an analyst loses access after hand-back');
reset role;
select results_eq(
  $$ select stage::text, credited_analyst_id from public.leads where id = 'b7000000-0000-0000-0000-000000000001' $$,
  $$ values ('post_session', 'b6000000-0000-0000-0000-0000000000c1'::uuid) $$,
  'Attended moves the lead to post_session and credits the analyst');

-- No-show on lead 2: stage and credit unchanged.
select pg_temp.act_as('b6000000-0000-0000-0000-0000000000c1');
select lives_ok($$ select public.accept_referral(pg_temp.session_of('b7000000-0000-0000-0000-000000000002')) $$,
  'Omar accepts the referral sent to him');
select lives_ok($$ select public.record_session_outcome(pg_temp.session_of('b7000000-0000-0000-0000-000000000002'),
                                                          'no_show', null, null, null, null) $$, 'Omar records a no-show');
reset role;
select results_eq(
  $$ select stage::text, credited_analyst_id from public.leads where id = 'b7000000-0000-0000-0000-000000000002' $$,
  $$ values ('with_analyst', null::uuid) $$,
  'No-show changes neither the stage nor the credit');

-- Cancel lead 3 before any session: back to interested.
select pg_temp.act_as('b6000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select public.cancel_referral(pg_temp.session_of('b7000000-0000-0000-0000-000000000003'), 'Client busy') $$,
  'the agent cancels the third referral');
reset role;
select is((select stage::text from public.leads where id = 'b7000000-0000-0000-0000-000000000003'), 'interested',
  'cancelling a referral returns the lead to interested');

select * from finish();
rollback;

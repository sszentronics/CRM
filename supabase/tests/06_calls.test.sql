-- Module 5: calls, follow-ups, the timeline and the stage rules in the database.
begin;
select plan(29);

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

-- An agent's call on their lead.
create function pg_temp.call(lead uuid, expected text, outcome text, follow_up timestamptz,
                             reason text default null, inc int default 0, release boolean default false)
returns public.leads language sql as $$
  select public.record_lead_event(lead, expected::public.lead_stage, 'call', outcome::public.lead_stage, outcome, 'note',
                                  follow_up, reason, inc, release);
$$;

select pg_temp.make_user('a6000000-0000-0000-0000-000000000001', 'admin6@test.local');
select pg_temp.make_user('a6000000-0000-0000-0000-00000000000a', 'lead6@test.local');
select pg_temp.make_user('a6000000-0000-0000-0000-0000000000a1', 'agentA6@test.local');
select pg_temp.make_user('a6000000-0000-0000-0000-0000000000a2', 'agentB6@test.local');
insert into public.profiles (id, full_name, email, role) values
  ('a6000000-0000-0000-0000-000000000001', 'Admin Six', 'admin6@test.local', 'admin'),
  ('a6000000-0000-0000-0000-00000000000a', 'Lead Six', 'lead6@test.local', 'team_lead');
insert into public.teams (id, name, color, team_lead_id)
values ('a5000000-0000-0000-0000-00000000000a', 'Six Team', 'sky', 'a6000000-0000-0000-0000-00000000000a');
insert into public.profiles (id, full_name, email, role, team_id) values
  ('a6000000-0000-0000-0000-0000000000a1', 'Agent A Six', 'agenta6@test.local', 'agent', 'a5000000-0000-0000-0000-00000000000a'),
  ('a6000000-0000-0000-0000-0000000000a2', 'Agent B Six', 'agentb6@test.local', 'agent', 'a5000000-0000-0000-0000-00000000000a');

-- Agent A has leads 1 to 3; agent B has lead 4. All assigned.
insert into public.leads (id, full_name, phone, source, stage, team_id, agent_id, created_by) values
  ('a7000000-0000-0000-0000-000000000001', 'Call One', '+923561000001', 'PR', 'assigned', 'a5000000-0000-0000-0000-00000000000a', 'a6000000-0000-0000-0000-0000000000a1', 'a6000000-0000-0000-0000-000000000001'),
  ('a7000000-0000-0000-0000-000000000002', 'Call Two', '+923561000002', 'PR', 'assigned', 'a5000000-0000-0000-0000-00000000000a', 'a6000000-0000-0000-0000-0000000000a1', 'a6000000-0000-0000-0000-000000000001'),
  ('a7000000-0000-0000-0000-000000000003', 'Call Three', '+923561000003', 'PR', 'assigned', 'a5000000-0000-0000-0000-00000000000a', 'a6000000-0000-0000-0000-0000000000a1', 'a6000000-0000-0000-0000-000000000001'),
  ('a7000000-0000-0000-0000-000000000004', 'Call Four', '+923561000004', 'PR', 'assigned', 'a5000000-0000-0000-0000-00000000000a', 'a6000000-0000-0000-0000-0000000000a2', 'a6000000-0000-0000-0000-000000000001');

select ok((select relrowsecurity from pg_class where oid = 'public.activities'::regclass), 'RLS is enabled on activities');
select ok((select relrowsecurity from pg_class where oid = 'public.follow_ups'::regclass), 'RLS is enabled on follow_ups');

-- ---------------------------------------------------------------------------
-- Agent A works their leads
-- ---------------------------------------------------------------------------
select pg_temp.act_as('a6000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select pg_temp.call('a7000000-0000-0000-0000-000000000001', 'assigned', 'no_answer', now() + interval '2 hours', null, 1) $$,
  'an agent logs a No answer with a follow-up');
select is((select stage::text from public.leads where id = 'a7000000-0000-0000-0000-000000000001'), 'no_answer', 'the stage moves');
select is((select no_answer_count from public.leads where id = 'a7000000-0000-0000-0000-000000000001'), 1, 'the no-answer count goes up');
select is((select count(*)::int from public.activities where lead_id = 'a7000000-0000-0000-0000-000000000001'), 1,
  'the call writes exactly one activity');
select is((select user_id from public.activities where lead_id = 'a7000000-0000-0000-0000-000000000001'),
  'a6000000-0000-0000-0000-0000000000a1'::uuid, 'the server sets who logged it');
select is((select count(*)::int from public.follow_ups where lead_id = 'a7000000-0000-0000-0000-000000000001' and status = 'open'), 1,
  'the next follow-up is booked');

select throws_ok($$ select pg_temp.call('a7000000-0000-0000-0000-000000000002', 'assigned', 'follow_up', null) $$,
  'P0001', 'Book the next follow-up before saving.', 'an open stage without a follow-up is refused');
select throws_ok($$ select pg_temp.call('a7000000-0000-0000-0000-000000000002', 'assigned', 'not_interested', null) $$,
  'P0001', 'Choose a reason.', 'Not interested without a reason is refused');
select throws_ok(
  $$ select public.record_lead_event('a7000000-0000-0000-0000-000000000002', 'assigned', 'stage_change', 'documents_pending',
                                     null, null, now() + interval '1 day') $$,
  'P0001', 'A lead cannot move from assigned to documents_pending.', 'a move the stage table forbids is refused');
select throws_ok($$ select pg_temp.call('a7000000-0000-0000-0000-000000000002', 'follow_up', 'no_answer', now() + interval '1 hour') $$,
  'P0001', 'This lead changed while you were working on it. Refresh and try again.', 'a stale stage is refused');
select throws_ok($$ select pg_temp.call('a7000000-0000-0000-0000-000000000004', 'assigned', 'no_answer', now() + interval '1 hour') $$,
  '42501', 'This lead belongs to another team.', 'an agent cannot log a call on another agent''s lead');

-- The fifth no answer returns the lead to the Team Lead.
select lives_ok($$ select pg_temp.call('a7000000-0000-0000-0000-000000000003', 'assigned', 'no_answer', now() + interval '1 hour', null, 5, true) $$,
  'the last allowed No answer is saved');
reset role;
select results_eq(
  $$ select agent_id, returned_to_lead, team_id from public.leads where id = 'a7000000-0000-0000-0000-000000000003' $$,
  $$ values (null::uuid, true, 'a5000000-0000-0000-0000-00000000000a'::uuid) $$,
  'it keeps its team, loses its agent and is flagged for the Team Lead');
select is((select count(*)::int from public.notifications where user_id = 'a6000000-0000-0000-0000-00000000000a' and type = 'lead_returned'), 1,
  'the Team Lead is told');

-- Invalid needs the Team Lead.
select pg_temp.act_as('a6000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select pg_temp.call('a7000000-0000-0000-0000-000000000002', 'assigned', 'invalid', null, 'Wrong number') $$,
  'an agent marks a lead invalid with a reason');
select throws_ok($$ select public.confirm_invalid('a7000000-0000-0000-0000-000000000002') $$,
  '42501', 'Only the Team Lead can confirm an Invalid mark.', 'the agent cannot confirm it');
select throws_ok(
  $$ select public.record_lead_event('a7000000-0000-0000-0000-000000000002', 'invalid', 'stage_change', 'follow_up',
                                     null, null, now() + interval '1 day') $$,
  '42501', 'Only the Team Lead can reject an Invalid mark.', 'nor reject it');
reset role;
select pg_temp.act_as('a6000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$ select public.record_lead_event('a7000000-0000-0000-0000-000000000002', 'invalid', 'stage_change', 'follow_up',
                                     null, 'Number works', now() + interval '1 day') $$,
  'the Team Lead rejects the mark');
select is((select stage::text from public.leads where id = 'a7000000-0000-0000-0000-000000000002'), 'follow_up',
  'the lead returns to follow_up');

-- ---------------------------------------------------------------------------
-- Privacy and history
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('a6000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.activities where lead_id::text like 'a7000000%'), 0,
  'agent B cannot read agent A''s activities');
select is((select count(*)::int from public.follow_ups where lead_id::text like 'a7000000%'), 0,
  'agent B cannot read agent A''s follow-ups');

reset role;
select pg_temp.act_as('a6000000-0000-0000-0000-000000000001', 'aal2');
select is_empty($$ update public.activities set notes = 'edited' returning id $$, 'an Admin cannot edit activities');
reset role;
select throws_ok($$ update public.activities set notes = 'edited' $$, '42501', 'Activities cannot be changed or deleted.',
  'nobody can update activities');
select throws_ok($$ delete from public.activities $$, '42501', 'Activities cannot be changed or deleted.',
  'nobody can delete activities');

-- ---------------------------------------------------------------------------
-- The follow-up sweep
-- ---------------------------------------------------------------------------
update public.follow_ups set due_at = now() - interval '1 hour' where lead_id = 'a7000000-0000-0000-0000-000000000001';
select ok((public.run_follow_up_sweep() ->> 'missed')::int >= 1, 'the sweep reports missed follow-ups');
select is((select status from public.follow_ups where lead_id = 'a7000000-0000-0000-0000-000000000001'), 'missed',
  'a follow-up more than 15 minutes overdue is marked missed');
select is(
  (select count(*)::int from public.notifications
    where user_id = 'a6000000-0000-0000-0000-0000000000a1' and type = 'follow_up_overdue'),
  1, 'the agent gets one overdue reminder');

select * from finish();
rollback;

-- Module 8: deposits and verification (by reference number, no proof file).
begin;
select plan(41);

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

-- A complete KYC profile with one collected document, so the profile is "submitted".
create function pg_temp.kyc(p_lead uuid, p_cnic text) returns void language plpgsql as $$
declare pid uuid;
begin
  insert into public.kyc_profiles (lead_id, broker_id, checklist, cnic_number, cnic_expiry, mother_name, email, bank_name,
    iban, income_band, sim_in_own_name, consent_at, risk_level, is_pep)
  values (p_lead, 'd4000000-0000-0000-0000-000000000001', '["cnic_front"]', p_cnic, current_date + 365, 'Amina', 'k@test.local',
    'Test Bank', 'PK36SCBL0000001123456702', '50k_150k', true, now(), 'low', false)
  returning id into pid;
  insert into public.documents (kyc_profile_id, type, status) values (pid, 'cnic_front', 'collected');
end;
$$;

select pg_temp.make_user('d6000000-0000-0000-0000-000000000001', 'admin9@test.local');
select pg_temp.make_user('d6000000-0000-0000-0000-000000000002', 'admin9b@test.local');
select pg_temp.make_user('d6000000-0000-0000-0000-00000000000a', 'leada9@test.local');
select pg_temp.make_user('d6000000-0000-0000-0000-00000000000b', 'leadb9@test.local');
select pg_temp.make_user('d6000000-0000-0000-0000-0000000000a1', 'agenta9@test.local');
select pg_temp.make_user('d6000000-0000-0000-0000-0000000000b1', 'agentb9@test.local');
select pg_temp.make_user('d6000000-0000-0000-0000-0000000000c1', 'analyst9@test.local');
insert into public.profiles (id, full_name, email, role) values
  ('d6000000-0000-0000-0000-000000000001', 'Admin Nine', 'admin9@test.local', 'admin'),
  ('d6000000-0000-0000-0000-000000000002', 'Admin Nine B', 'admin9b@test.local', 'admin'),
  ('d6000000-0000-0000-0000-00000000000a', 'Lead A Nine', 'leada9@test.local', 'team_lead'),
  ('d6000000-0000-0000-0000-00000000000b', 'Lead B Nine', 'leadb9@test.local', 'team_lead'),
  ('d6000000-0000-0000-0000-0000000000c1', 'Analyst Nine', 'analyst9@test.local', 'analyst');
insert into public.teams (id, name, color, team_lead_id) values
  ('d5000000-0000-0000-0000-00000000000a', 'Nine A', 'cyan', 'd6000000-0000-0000-0000-00000000000a'),
  ('d5000000-0000-0000-0000-00000000000b', 'Nine B', 'pink', 'd6000000-0000-0000-0000-00000000000b');
insert into public.profiles (id, full_name, email, role, team_id) values
  ('d6000000-0000-0000-0000-0000000000a1', 'Agent A Nine', 'agenta9@test.local', 'agent', 'd5000000-0000-0000-0000-00000000000a'),
  ('d6000000-0000-0000-0000-0000000000b1', 'Agent B Nine', 'agentb9@test.local', 'agent', 'd5000000-0000-0000-0000-00000000000b');
insert into public.brokers (id, name, market, kyc_checklist) values
  ('d4000000-0000-0000-0000-000000000001', 'Nine Securities', 'psx', '["cnic_front"]');
insert into public.leads (id, full_name, phone, source, stage, team_id, agent_id, next_follow_up_at, credited_analyst_id, created_by) values
  ('d7000000-0000-0000-0000-000000000001', 'Deposit Client', '+923591000001', 'PR', 'documents_pending',
   'd5000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-0000000000a1', now() + interval '1 day',
   'd6000000-0000-0000-0000-0000000000c1', 'd6000000-0000-0000-0000-000000000001'),
  ('d7000000-0000-0000-0000-000000000002', 'No Kyc Client', '+923591000002', 'PR', 'documents_pending',
   'd5000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-0000000000a1', now() + interval '1 day',
   null, 'd6000000-0000-0000-0000-000000000001'),
  ('d7000000-0000-0000-0000-000000000003', 'Admin Recorded', '+923591000003', 'PR', 'documents_pending',
   'd5000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-0000000000a1', now() + interval '1 day',
   null, 'd6000000-0000-0000-0000-000000000001'),
  ('d7000000-0000-0000-0000-000000000004', 'Rejected Client', '+923591000004', 'PR', 'documents_pending',
   'd5000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-0000000000a1', now() + interval '1 day',
   null, 'd6000000-0000-0000-0000-000000000001');
select pg_temp.kyc('d7000000-0000-0000-0000-000000000001', '3591000000011');
select pg_temp.kyc('d7000000-0000-0000-0000-000000000003', '3591000000033');
select pg_temp.kyc('d7000000-0000-0000-0000-000000000004', '3591000000044');
update public.documents set status = 'approved'
 where kyc_profile_id in (select id from public.kyc_profiles where lead_id in
   ('d7000000-0000-0000-0000-000000000003', 'd7000000-0000-0000-0000-000000000004'));

select ok((select relrowsecurity from pg_class where oid = 'public.deposits'::regclass), 'RLS is enabled on deposits');
select ok((select relrowsecurity from pg_class where oid = 'public.feed_events'::regclass), 'RLS is enabled on feed_events');
select hasnt_column('public', 'deposits', 'proof_path', 'deposits hold no proof file: they are checked by reference number');
select hasnt_column('public', 'feed_events', 'lead_id', 'a feed row carries no lead reference');

-- ---------------------------------------------------------------------------
-- The agent records
-- ---------------------------------------------------------------------------
select pg_temp.act_as('d6000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.record_deposit('d7000000-0000-0000-0000-000000000002', 30000, current_date, 'bank_transfer', 'REF-NOKYC') $$,
  'P0001', 'Complete every document and detail before recording a deposit.', 'a deposit needs the KYC details and documents first');
select throws_ok($$ select public.record_deposit('d7000000-0000-0000-0000-000000000001', 30000, current_date + 2, 'cash', 'REF-0001') $$,
  'P0001', 'The deposit date cannot be in the future.', 'a future date is rejected');
select throws_ok($$ select public.record_deposit('d7000000-0000-0000-0000-000000000001', 30000, current_date, 'cash', '  ') $$,
  'P0001', 'Enter the bank or transaction reference number.', 'a missing reference is rejected');
select lives_ok($$ select public.record_deposit('d7000000-0000-0000-0000-000000000001', 30000, current_date, 'cash', 'REF-0001') $$,
  'the agent records Rs 30,000 by cash');
select is((select cash_flag from public.deposits where reference_no = 'REF-0001'), true, 'Rs 30,000 by cash sets cash_flag');
select is((select type from public.deposits where reference_no = 'REF-0001'), 'first', 'the first deposit is a first');
select is((select stage::text from public.leads where id = 'd7000000-0000-0000-0000-000000000001'), 'deposit_recorded', 'recording moves the lead to deposit_recorded');
select is((select credited_analyst_id from public.deposits where reference_no = 'REF-0001'), 'd6000000-0000-0000-0000-0000000000c1'::uuid,
  'the credited analyst is copied onto the deposit');
select throws_ok($$ select public.record_deposit('d7000000-0000-0000-0000-000000000001', 5000, current_date, 'bank_transfer', ' ref-0001 ') $$,
  'P0001', 'That reference number has already been used.', 'a reference can be used once, ignoring case and spaces');
select throws_ok($$ update public.deposits set status = 'verified' where reference_no = 'REF-0001' $$,
  '42501', null, 'an agent cannot set a deposit to verified');
select throws_ok($$ select public.verify_deposit((select id from public.deposits where reference_no = 'REF-0001'), true) $$,
  '42501', 'Only an Admin verifies deposits.', 'an agent cannot verify through the function either');

reset role;
select pg_temp.act_as('d6000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.verify_deposit((select id from public.deposits where reference_no = 'REF-0001'), true) $$,
  '42501', 'Only an Admin verifies deposits.', 'a Team Lead cannot verify');
select is((select count(*)::int from public.deposits), 1, 'the Team Lead sees their team''s deposit');

reset role;
select pg_temp.act_as('d6000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.deposits), 0, 'an agent from another team sees no deposits');
reset role;
select pg_temp.act_as('d6000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.deposits), 0, 'an analyst cannot read deposits');

-- ---------------------------------------------------------------------------
-- The Admin verifies
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('d6000000-0000-0000-0000-000000000001', 'aal2');
select throws_ok($$ select public.verify_deposit((select id from public.deposits where reference_no = 'REF-0001'), true) $$,
  'P0001', 'The client''s KYC is not approved yet.', 'verification fails while KYC is not approved');
reset role;
update public.documents set status = 'approved'
 where kyc_profile_id = (select id from public.kyc_profiles where lead_id = 'd7000000-0000-0000-0000-000000000001');
select pg_temp.act_as('d6000000-0000-0000-0000-000000000001', 'aal2');
select throws_ok($$ select public.verify_deposit((select id from public.deposits where reference_no = 'REF-0001'), false) $$,
  'P0001', 'Confirm the reference, amount and date match the statement first.', 'the statement check is required');

-- An Admin who recorded a deposit cannot verify it.
select lives_ok($$ select public.record_deposit('d7000000-0000-0000-0000-000000000003', 12000, current_date, 'bank_transfer', 'REF-ADMIN') $$,
  'an Admin can record a deposit');
select throws_ok($$ select public.verify_deposit((select id from public.deposits where reference_no = 'REF-ADMIN'), true) $$,
  '42501', 'You recorded this deposit, so another Admin must verify it.', 'an Admin cannot verify a deposit they recorded');

select lives_ok($$ select public.verify_deposit((select id from public.deposits where reference_no = 'REF-0001'), true) $$,
  'another Admin verifies the deposit');
reset role;
select is((select stage::text from public.leads where id = 'd7000000-0000-0000-0000-000000000001'), 'deposit_verified', 'verifying moves the lead to deposit_verified');
select is((select count(*)::int from public.feed_events where agent_id = 'd6000000-0000-0000-0000-0000000000a1'), 1,
  'verifying inserts exactly one feed_events row');
select is(
  (select count(*)::int from public.notifications where type = 'deposit_verified'
     and user_id in ('d6000000-0000-0000-0000-0000000000a1', 'd6000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-0000000000c1')),
  3, 'the agent, the Team Lead and the credited analyst are told');
select is((select message from public.notifications where type = 'deposit_verified' and user_id = 'd6000000-0000-0000-0000-0000000000c1'),
  'A client you saw has a verified deposit of Rs 30,000. You are credited.', 'the analyst''s message names no client');
select is((select count(*)::int from public.audit_log where action = 'deposit.verified'
     and entity_id = (select id::text from public.deposits where reference_no = 'REF-0001')), 1, 'verifying writes an audit row');

-- A top-up on a verified client leaves the stage alone.
select pg_temp.act_as('d6000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select public.record_deposit('d7000000-0000-0000-0000-000000000001', 5000, current_date, 'bank_transfer', 'REF-0002') $$,
  'a top-up is recorded on a verified client');
select is((select type from public.deposits where reference_no = 'REF-0002'), 'top_up', 'the next deposit is a top-up');
select is((select stage::text from public.leads where id = 'd7000000-0000-0000-0000-000000000001'), 'deposit_verified', 'a top-up leaves the stage alone');

-- The deposit keeps its team after the agent moves.
reset role;
update public.leads set team_id = 'd5000000-0000-0000-0000-00000000000b', agent_id = 'd6000000-0000-0000-0000-0000000000b1'
 where id = 'd7000000-0000-0000-0000-000000000001';
select is((select team_id from public.deposits where reference_no = 'REF-0001'), 'd5000000-0000-0000-0000-00000000000a'::uuid,
  'after the lead moves teams, the deposit''s team_id is unchanged');

-- ---------------------------------------------------------------------------
-- Reject, ask, reverse
-- ---------------------------------------------------------------------------
select pg_temp.act_as('d6000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select public.record_deposit('d7000000-0000-0000-0000-000000000004', 20000, current_date, 'bank_transfer', 'REF-REJ') $$,
  'a deposit is recorded on a second client');
reset role;
select pg_temp.act_as('d6000000-0000-0000-0000-000000000002', 'aal2');
select lives_ok($$ select public.ask_agent_about_deposit((select id from public.deposits where reference_no = 'REF-REJ'), 'Which bank is this from?') $$,
  'the Admin asks the agent a question');
select throws_ok($$ select public.reject_deposit((select id from public.deposits where reference_no = 'REF-REJ'), '') $$,
  'P0001', 'Give a reason so the agent knows what to fix.', 'rejecting needs a reason');
select lives_ok($$ select public.reject_deposit((select id from public.deposits where reference_no = 'REF-REJ'), 'Amount does not match the statement') $$,
  'the Admin rejects the deposit');
reset role;
select is((select stage::text from public.leads where id = 'd7000000-0000-0000-0000-000000000004'), 'documents_pending',
  'rejecting a first deposit returns the lead to documents_pending');

select pg_temp.act_as('d6000000-0000-0000-0000-000000000002', 'aal2');
select throws_ok($$ select public.reverse_deposit((select id from public.deposits where reference_no = 'REF-0001'), '') $$,
  'P0001', 'Give a reason for the reversal.', 'reversing needs a reason');
select lives_ok($$ select public.reverse_deposit((select id from public.deposits where reference_no = 'REF-0001'), 'Client withdrew the money') $$,
  'the Admin reverses the verified deposit');
reset role;
select is((select coalesce(sum(amount_pkr), 0)::int from public.deposits where lead_id = 'd7000000-0000-0000-0000-000000000001' and status = 'verified'), 0,
  'a reversed deposit counts in no verified total');

select * from finish();
rollback;

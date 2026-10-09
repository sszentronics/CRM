-- Module 7: KYC details and the document checklist (no files are stored).
begin;
select plan(23);

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

create function pg_temp.doc(t text) returns uuid language sql as $$
  select id from public.documents where kyc_profile_id = 'c8000000-0000-0000-0000-000000000001' and type = t
$$;

select pg_temp.make_user('c6000000-0000-0000-0000-000000000001', 'admin8@test.local');
select pg_temp.make_user('c6000000-0000-0000-0000-00000000000a', 'leadA8@test.local');
select pg_temp.make_user('c6000000-0000-0000-0000-00000000000b', 'leadB8@test.local');
select pg_temp.make_user('c6000000-0000-0000-0000-0000000000a1', 'agentA8@test.local');
select pg_temp.make_user('c6000000-0000-0000-0000-0000000000b1', 'agentB8@test.local');
select pg_temp.make_user('c6000000-0000-0000-0000-0000000000c1', 'analyst8@test.local');
insert into public.profiles (id, full_name, email, role) values
  ('c6000000-0000-0000-0000-000000000001', 'Admin Eight', 'admin8@test.local', 'admin'),
  ('c6000000-0000-0000-0000-00000000000a', 'Lead A Eight', 'leada8@test.local', 'team_lead'),
  ('c6000000-0000-0000-0000-00000000000b', 'Lead B Eight', 'leadb8@test.local', 'team_lead'),
  ('c6000000-0000-0000-0000-0000000000c1', 'Analyst Eight', 'analyst8@test.local', 'analyst');
insert into public.teams (id, name, color, team_lead_id) values
  ('c5000000-0000-0000-0000-00000000000a', 'Eight A', 'cyan', 'c6000000-0000-0000-0000-00000000000a'),
  ('c5000000-0000-0000-0000-00000000000b', 'Eight B', 'pink', 'c6000000-0000-0000-0000-00000000000b');
insert into public.profiles (id, full_name, email, role, team_id) values
  ('c6000000-0000-0000-0000-0000000000a1', 'Agent A Eight', 'agenta8@test.local', 'agent', 'c5000000-0000-0000-0000-00000000000a'),
  ('c6000000-0000-0000-0000-0000000000b1', 'Agent B Eight', 'agentb8@test.local', 'agent', 'c5000000-0000-0000-0000-00000000000b');
insert into public.brokers (id, name, market, kyc_checklist) values
  ('c4000000-0000-0000-0000-000000000001', 'Eight Securities', 'psx', '["cnic_front", "cnic_back"]'),
  ('c4000000-0000-0000-0000-000000000002', 'Eight Commodities', 'pmex', '["cnic_front"]');
insert into public.leads (id, full_name, phone, source, stage, team_id, agent_id, next_follow_up_at, created_by) values
  ('c7000000-0000-0000-0000-000000000001', 'Kyc Client', '+923581000001', 'PR', 'documents_pending',
   'c5000000-0000-0000-0000-00000000000a', 'c6000000-0000-0000-0000-0000000000a1', now() + interval '1 day', 'c6000000-0000-0000-0000-000000000001'),
  ('c7000000-0000-0000-0000-000000000002', 'Other Client', '+923581000002', 'PR', 'documents_pending',
   'c5000000-0000-0000-0000-00000000000a', 'c6000000-0000-0000-0000-0000000000a1', now() + interval '1 day', 'c6000000-0000-0000-0000-000000000001');
-- The analyst holds an open session on the client, which must still not reveal KYC.
insert into public.sessions (lead_id, analyst_id, referred_by, referral_note, accepted_at)
values ('c7000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-0000000000c1', 'c6000000-0000-0000-0000-0000000000a1', 'Check', now());

select ok((select relrowsecurity from pg_class where oid = 'public.kyc_profiles'::regclass), 'RLS is enabled on kyc_profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.documents'::regclass), 'RLS is enabled on documents');
select hasnt_column('public', 'documents', 'storage_path', 'documents hold no file path: nothing is stored');

-- ---------------------------------------------------------------------------
-- The agent starts KYC and ticks a document
-- ---------------------------------------------------------------------------
select pg_temp.act_as('c6000000-0000-0000-0000-0000000000a1');
select lives_ok($$
  insert into public.kyc_profiles (id, lead_id, broker_id, checklist, cnic_number)
  values ('c8000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001',
          'c4000000-0000-0000-0000-000000000001', '["cnic_front", "cnic_back"]', '3520212345671') $$,
  'the agent starts KYC on their client');
select throws_ok($$
  insert into public.kyc_profiles (lead_id, broker_id, checklist, cnic_number)
  values ('c7000000-0000-0000-0000-000000000002', 'c4000000-0000-0000-0000-000000000001', '["cnic_front"]', '3520212345671') $$,
  '23505', null, 'a duplicate CNIC number is rejected');
select lives_ok($$ select public.set_document_collected('c8000000-0000-0000-0000-000000000001', 'cnic_front', true) $$,
  'the agent marks CNIC front collected');
select throws_ok($$ select public.set_document_collected('c8000000-0000-0000-0000-000000000001', 'nominee_cnic', true) $$,
  'P0001', 'That document is not on this broker''s checklist.', 'only checklist items can be ticked');
select throws_ok($$ select public.review_document(pg_temp.doc('cnic_front'), true, null) $$,
  '42501', 'Only an Admin reviews documents.', 'an agent cannot approve their own document');

-- ---------------------------------------------------------------------------
-- Nobody outside the client's team, and no analyst, can read it
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('c6000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.kyc_profiles where lead_id::text like 'c7000000%'), 0, 'an agent from another team cannot read the KYC profile');
select is((select count(*)::int from public.documents where kyc_profile_id = 'c8000000-0000-0000-0000-000000000001'), 0, 'nor its documents');
reset role;
select pg_temp.act_as('c6000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.leads where id = 'c7000000-0000-0000-0000-000000000001'), 1, 'the analyst can see the lead they hold a session for');
select is((select count(*)::int from public.kyc_profiles), 0, 'but an analyst cannot read kyc_profiles');
select is((select count(*)::int from public.documents), 0, 'and an analyst cannot read documents');

-- ---------------------------------------------------------------------------
-- Admin review
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.act_as('c6000000-0000-0000-0000-000000000001', 'aal2');
select throws_ok($$ select public.review_document(pg_temp.doc('cnic_front'), false, '') $$,
  'P0001', 'Give a reason so the agent knows what to fix.', 'rejecting needs a reason');
select lives_ok($$ select public.review_document(pg_temp.doc('cnic_front'), true, null) $$, 'the Admin approves CNIC front');
-- Read as the database owner: only the Superadmin may read the audit log in the app.
reset role;
select is(
  (select count(*)::int from public.audit_log where action = 'document.approved' and entity_id = pg_temp.doc('cnic_front')::text),
  1, 'reviewing a document writes an audit row with the document id');

select pg_temp.act_as('c6000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.set_document_collected('c8000000-0000-0000-0000-000000000001', 'cnic_front', true) $$,
  '42501', 'This document is approved and locked. Ask an Admin to unlock it.', 'an agent cannot replace an approved document');
select throws_ok($$ update public.kyc_profiles set broker_id = 'c4000000-0000-0000-0000-000000000002', checklist = '["cnic_front"]'
                    where id = 'c8000000-0000-0000-0000-000000000001' $$,
  'P0001', 'Some documents are already approved for this broker. Ask an Admin to unlock them first.',
  'the broker cannot change once a document is approved');
select lives_ok($$ select public.set_document_collected('c8000000-0000-0000-0000-000000000001', 'cnic_back', true) $$,
  'the agent ticks the second document');

reset role;
select pg_temp.act_as('c6000000-0000-0000-0000-000000000001', 'aal2');
select lives_ok($$ select public.review_document(pg_temp.doc('cnic_back'), false, 'Blurry') $$, 'the Admin rejects CNIC back');
reset role;
select is(
  (select count(*)::int from public.notifications where user_id = 'c6000000-0000-0000-0000-0000000000a1' and type = 'document_rejected'),
  1, 'the agent is told why');

-- Complete the fields, approve everything: status becomes approved and the fields lock for the agent.
update public.kyc_profiles set cnic_expiry = current_date + 365, mother_name = 'Amina', email = 'kyc@test.local',
  bank_name = 'Test Bank', iban = 'PK36SCBL0000001123456702', income_band = '50k_150k', sim_in_own_name = true,
  consent_at = now(), risk_level = 'low', is_pep = false
 where id = 'c8000000-0000-0000-0000-000000000001';
update public.documents set status = 'approved' where kyc_profile_id = 'c8000000-0000-0000-0000-000000000001';
select is((select status from public.kyc_profiles where id = 'c8000000-0000-0000-0000-000000000001'), 'approved',
  'every item approved and every field filled makes the profile approved');
select pg_temp.act_as('c6000000-0000-0000-0000-0000000000a1');
select throws_ok($$ update public.kyc_profiles set mother_name = 'Changed' where id = 'c8000000-0000-0000-0000-000000000001' $$,
  '42501', 'These KYC details are approved. Ask an Admin to change them.', 'approved details are locked for the agent');

reset role;
select * from finish();
rollback;

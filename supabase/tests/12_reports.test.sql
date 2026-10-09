-- Module 11: reports and exports.
begin;
select plan(16);

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

select pg_temp.make_user('a6000000-0000-0000-0000-000000000001', 'super12@test.local');
select pg_temp.make_user('a6000000-0000-0000-0000-000000000002', 'admin12@test.local');
select pg_temp.make_user('a6000000-0000-0000-0000-00000000000a', 'leada12@test.local');
select pg_temp.make_user('a6000000-0000-0000-0000-0000000000a1', 'agenta12@test.local');
select pg_temp.make_user('a6000000-0000-0000-0000-0000000000c1', 'analyst12@test.local');
insert into public.profiles (id, full_name, email, role) values
  ('a6000000-0000-0000-0000-000000000001', 'Super Twelve', 'super12@test.local', 'superadmin'),
  ('a6000000-0000-0000-0000-000000000002', 'Admin Twelve', 'admin12@test.local', 'admin'),
  ('a6000000-0000-0000-0000-00000000000a', 'Lead Twelve', 'leada12@test.local', 'team_lead'),
  ('a6000000-0000-0000-0000-0000000000c1', 'Analyst Twelve', 'analyst12@test.local', 'analyst');
insert into public.teams (id, name, color, team_lead_id) values
  ('a5000000-0000-0000-0000-00000000000a', 'Twelve A', 'cyan', 'a6000000-0000-0000-0000-00000000000a');
insert into public.profiles (id, full_name, email, role, team_id) values
  ('a6000000-0000-0000-0000-0000000000a1', 'Agent Twelve', 'agenta12@test.local', 'agent', 'a5000000-0000-0000-0000-00000000000a');
insert into public.brokers (id, name, market, kyc_checklist) values
  ('a4000000-0000-0000-0000-000000000001', 'Twelve Securities', 'psx', '["cnic_front"]');
insert into public.leads (id, full_name, phone, source, stage, team_id, agent_id, created_by) values
  ('a7000000-0000-0000-0000-000000000001', 'Twelve Client', '+923621000001', 'Twelve Source', 'deposit_verified',
   'a5000000-0000-0000-0000-00000000000a', 'a6000000-0000-0000-0000-0000000000a1', 'a6000000-0000-0000-0000-000000000002');
insert into public.kyc_profiles (lead_id, broker_id, checklist, cnic_number, iban)
values ('a7000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', '["cnic_front"]', '3621000000011', 'PK36SCBL0000001123456702');
insert into public.deposits (lead_id, broker_id, type, agent_id, team_id, amount_pkr, deposit_date, method, reference_no, status, verified_at, created_by) values
  ('a7000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'first', 'a6000000-0000-0000-0000-0000000000a1', 'a5000000-0000-0000-0000-00000000000a', 120000, current_date, 'bank_transfer', 'T12-OK', 'verified', now(), 'a6000000-0000-0000-0000-0000000000a1'),
  ('a7000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'top_up', 'a6000000-0000-0000-0000-0000000000a1', 'a5000000-0000-0000-0000-00000000000a', 999999, current_date, 'bank_transfer', 'T12-PENDING', 'pending', null, 'a6000000-0000-0000-0000-0000000000a1');

-- Only Admins and the Superadmin.
select pg_temp.act_as('a6000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.export_data('deposits', now() - interval '1 day', now() + interval '1 day') $$, '42501', 'Only an Admin exports data.', 'a Team Lead cannot export');
select throws_ok($$ select public.report_data('funnel', now() - interval '1 day', now() + interval '1 day') $$, '42501', 'Only an Admin opens reports.', 'a Team Lead cannot open reports');
reset role;
select pg_temp.act_as('a6000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.export_data('leads', now() - interval '1 day', now() + interval '1 day') $$, '42501', 'Only an Admin exports data.', 'an agent cannot export');
reset role;
select pg_temp.act_as('a6000000-0000-0000-0000-0000000000c1');
select throws_ok($$ select public.export_data('calls', now() - interval '1 day', now() + interval '1 day') $$, '42501', 'Only an Admin exports data.', 'an analyst cannot export');

-- Admin: no CNIC or IBAN.
reset role;
select pg_temp.act_as('a6000000-0000-0000-0000-000000000002', 'aal2');
select throws_ok($$ select public.export_data('leads', now() - interval '1 day', now() + interval '1 day', null, true) $$, '42501',
  'Only the Superadmin can export CNIC and IBAN numbers.', 'an Admin cannot ask for CNIC and IBAN');
select is((select r ->> 'cnic' from jsonb_array_elements(public.export_data('leads', now() - interval '1 day', now() + interval '1 day', 'a5000000-0000-0000-0000-00000000000a') -> 'rows') r limit 1),
  null, 'an Admin''s lead export carries no CNIC');
select is((select r ->> 'iban' from jsonb_array_elements(public.export_data('leads', now() - interval '1 day', now() + interval '1 day', 'a5000000-0000-0000-0000-00000000000a') -> 'rows') r limit 1),
  null, 'and no IBAN');
reset role;

-- Superadmin may include them.
select pg_temp.act_as('a6000000-0000-0000-0000-000000000001', 'aal2');
select is((select r ->> 'cnic' from jsonb_array_elements(public.export_data('leads', now() - interval '1 day', now() + interval '1 day', 'a5000000-0000-0000-0000-00000000000a', true) -> 'rows') r limit 1),
  '3621000000011', 'the Superadmin''s export can include the CNIC');
reset role;

-- History and audit: three exports so far (Admin x2 counted below, Superadmin x1), each with a history row and an audit row.
select is((select count(*)::int from public.export_history where user_id = 'a6000000-0000-0000-0000-000000000002'), 2, 'each Admin export adds one history row');
select is((select count(*)::int from public.audit_log where action = 'export.create' and user_id = 'a6000000-0000-0000-0000-000000000002'), 2, 'and one audit row');
select is((select (meta ->> 'rows')::int from public.audit_log where action = 'export.create' and user_id = 'a6000000-0000-0000-0000-000000000001'), 1, 'the audit row records the row count');
select is((select includes_sensitive from public.export_history where user_id = 'a6000000-0000-0000-0000-000000000001'), true, 'and whether CNIC and IBAN were included');

-- Reports.
select pg_temp.act_as('a6000000-0000-0000-0000-000000000002', 'aal2');
select is(
  (select coalesce(sum((r ->> 'verified_pkr')::bigint), 0) from jsonb_array_elements(public.report_data('deposits', now() - interval '1 day', now() + interval '1 day')) r),
  (select coalesce(sum(total_pkr), 0)::numeric from public.board_teams(now() - interval '1 day', now() + interval '1 day')),
  'the Deposits report total equals the boards summed for the same period');
select is((select (r ->> 'verified_pkr')::bigint from jsonb_array_elements(public.report_data('sources', now() - interval '1 day', now() + interval '1 day')) r where r ->> 'source' = 'Twelve Source'),
  120000::bigint, 'by source: only the verified Rs 120,000 counts, not the pending one');
select is((select (r ->> 'verified_pkr')::bigint from jsonb_array_elements(public.report_data('deposits', now() - interval '1 day', now() + interval '1 day', null, 'a4000000-0000-0000-0000-000000000001')) r where r ->> 'team' = 'Twelve A'),
  120000::bigint, 'the broker filter keeps the verified deposit');
select throws_ok($$ select public.report_data('nonsense', now() - interval '1 day', now() + interval '1 day') $$, 'P0001', 'Unknown report.', 'an unknown report is refused');

select * from finish();
rollback;

-- Module 13: interest level (hot, warm, cold) and last-contact tracking.
begin;
select plan(25);

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

select pg_temp.make_user('b1300000-0000-0000-0000-000000000001', 'admin13@test.local');
select pg_temp.make_user('b1300000-0000-0000-0000-00000000000a', 'lead13@test.local');
select pg_temp.make_user('b1300000-0000-0000-0000-0000000000a1', 'agenta13@test.local');
select pg_temp.make_user('b1300000-0000-0000-0000-0000000000a2', 'agentb13@test.local');
insert into public.profiles (id, full_name, email, role) values
  ('b1300000-0000-0000-0000-000000000001', 'Admin Thirteen', 'admin13@test.local', 'admin'),
  ('b1300000-0000-0000-0000-00000000000a', 'Lead Thirteen', 'lead13@test.local', 'team_lead');
insert into public.teams (id, name, color, team_lead_id)
values ('b1500000-0000-0000-0000-00000000000a', 'Thirteen Team', 'sky', 'b1300000-0000-0000-0000-00000000000a');
insert into public.profiles (id, full_name, email, role, team_id) values
  ('b1300000-0000-0000-0000-0000000000a1', 'Agent A Thirteen', 'agenta13@test.local', 'agent', 'b1500000-0000-0000-0000-00000000000a'),
  ('b1300000-0000-0000-0000-0000000000a2', 'Agent B Thirteen', 'agentb13@test.local', 'agent', 'b1500000-0000-0000-0000-00000000000a');

-- Agent A has leads 1 and 2; agent B has lead 3.
insert into public.leads (id, full_name, phone, source, stage, team_id, agent_id, created_by) values
  ('b1700000-0000-0000-0000-000000000001', 'Heat One', '+923571000001', 'PR', 'assigned', 'b1500000-0000-0000-0000-00000000000a', 'b1300000-0000-0000-0000-0000000000a1', 'b1300000-0000-0000-0000-000000000001'),
  ('b1700000-0000-0000-0000-000000000002', 'Heat Two', '+923571000002', 'PR', 'assigned', 'b1500000-0000-0000-0000-00000000000a', 'b1300000-0000-0000-0000-0000000000a1', 'b1300000-0000-0000-0000-000000000001'),
  ('b1700000-0000-0000-0000-000000000003', 'Heat Three', '+923571000003', 'PR', 'assigned', 'b1500000-0000-0000-0000-00000000000a', 'b1300000-0000-0000-0000-0000000000a2', 'b1300000-0000-0000-0000-000000000001');

select is((select temperature from public.leads where id = 'b1700000-0000-0000-0000-000000000001'), null, 'a new lead has no interest level yet');
select is((select last_contacted_at from public.leads where id = 'b1700000-0000-0000-0000-000000000001'), null, 'a new lead has no last contact');

-- ---------------------------------------------------------------------------
-- Interest level
-- ---------------------------------------------------------------------------
select pg_temp.act_as('b1300000-0000-0000-0000-0000000000a1');
select lives_ok($$ select public.set_lead_temperature('b1700000-0000-0000-0000-000000000001', 'hot') $$, 'an agent sets Hot on their own lead');
select is((select temperature from public.leads where id = 'b1700000-0000-0000-0000-000000000001'), 'hot', 'the interest level is saved');
select is((select count(*)::int from public.activities where lead_id = 'b1700000-0000-0000-0000-000000000001' and type = 'system' and notes = 'Interest set to Hot.'),
  1, 'setting it writes one timeline entry');
select lives_ok($$ select public.set_lead_temperature('b1700000-0000-0000-0000-000000000001', 'cold') $$, 'an agent changes it to Cold');
select is((select notes from public.activities where lead_id = 'b1700000-0000-0000-0000-000000000001' and notes like 'Interest changed%'),
  'Interest changed from Hot to Cold.', 'a change records the old and new level');
select lives_ok($$ select public.set_lead_temperature('b1700000-0000-0000-0000-000000000001', 'cold') $$, 'setting the same level again is accepted');
select is((select count(*)::int from public.activities where lead_id = 'b1700000-0000-0000-0000-000000000001' and type = 'system'),
  2, 'and writes nothing new');
select throws_ok($$ select public.set_lead_temperature('b1700000-0000-0000-0000-000000000001', 'scorching') $$, 'P0001',
  'Choose Hot, Warm or Cold.', 'only Hot, Warm or Cold are accepted');
select throws_ok($$ select public.set_lead_temperature('b1700000-0000-0000-0000-000000000003', 'hot') $$, '42501',
  'This lead belongs to another team.', 'an agent cannot set the interest on another agent''s lead');
select is((select count(*)::int from public.leads where id = 'b1700000-0000-0000-0000-000000000003'), 0, 'and cannot even see it');

-- ---------------------------------------------------------------------------
-- Last contact
-- ---------------------------------------------------------------------------
select lives_ok($$ select public.log_contact('b1700000-0000-0000-0000-000000000002', 'whatsapp', 'Sent the brochure') $$, 'an agent logs a WhatsApp');
select is((select last_contact_channel from public.leads where id = 'b1700000-0000-0000-0000-000000000002'), 'whatsapp', 'the channel is stamped on the lead');
select ok((select last_contacted_at > now() - interval '1 minute' from public.leads where id = 'b1700000-0000-0000-0000-000000000002'),
  'the time is the server''s time');
select lives_ok($$ select public.log_contact('b1700000-0000-0000-0000-000000000002', 'email') $$, 'an agent logs an email');
select is((select last_contact_channel from public.leads where id = 'b1700000-0000-0000-0000-000000000002'), 'email', 'the newest contact wins');
select throws_ok($$ select public.log_contact('b1700000-0000-0000-0000-000000000002', 'carrier_pigeon') $$, 'P0001',
  'Choose WhatsApp, Message or Email.', 'an unknown channel is rejected');
select throws_ok($$ select public.log_contact('b1700000-0000-0000-0000-000000000003', 'message') $$, '42501',
  'This lead belongs to another team.', 'an agent cannot log a contact on another agent''s lead');

-- A call through the stage machine also counts as contact.
select lives_ok($$ select public.record_lead_event('b1700000-0000-0000-0000-000000000001', 'assigned', 'call', 'no_answer', 'no_answer', null,
  now() + interval '2 hours', null, 1, false) $$, 'a logged call works as before');
select is((select last_contact_channel from public.leads where id = 'b1700000-0000-0000-0000-000000000001'), 'call', 'a call stamps the channel too');

-- A note is not a contact.
select lives_ok($$ select public.record_lead_event('b1700000-0000-0000-0000-000000000002', 'assigned', 'note', null, null, 'Just a note') $$, 'a note is saved');
select is((select last_contact_channel from public.leads where id = 'b1700000-0000-0000-0000-000000000002'), 'email', 'a note does not change the last contact');

-- The Team Lead can set the level on a lead in their team.
reset role;
select pg_temp.act_as('b1300000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.set_lead_temperature('b1700000-0000-0000-0000-000000000003', 'warm') $$, 'a Team Lead sets the level on a lead in their team');

-- Signed out, nothing runs.
reset role;
set local role anon;
select throws_ok($$ select public.set_lead_temperature('b1700000-0000-0000-0000-000000000003', 'hot') $$, '42501', null, 'signed out cannot set an interest level');

reset role;
select * from finish();
rollback;

-- Module 8: deposits and verification.
-- Owner decision (8 Oct 2026): no proof file is stored. The Admin verifies a deposit by matching its
-- reference number, amount, date and method against the bank or broker statement.

create table public.deposits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.leads (id),
  broker_id uuid not null references public.brokers (id),
  type text not null check (type in ('first', 'top_up')),
  -- Copied from the lead at insert and never changed: the credit stays where the money was earned.
  agent_id uuid not null references public.profiles (id),
  team_id uuid not null references public.teams (id),
  credited_analyst_id uuid references public.profiles (id),
  amount_pkr bigint not null check (amount_pkr between 1 and 1000000000),
  deposit_date date not null,
  method text not null check (method in ('bank_transfer', 'cash', 'cheque', 'online', 'other')),
  reference_no text not null check (char_length(btrim(reference_no)) between 4 and 60),
  cash_flag boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'reversed')),
  verified_by uuid references public.profiles (id),
  verified_at timestamptz,
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 300),
  rejected_by uuid references public.profiles (id),
  rejected_at timestamptz,
  reversed_by uuid references public.profiles (id),
  reversed_at timestamptz,
  reverse_reason text check (reverse_reason is null or char_length(reverse_reason) <= 300),
  created_by uuid not null references public.profiles (id)
);

-- A reference number can be used once. A rejected record does not hold it, so a typo can be re-entered.
create unique index deposits_reference_unique on public.deposits (lower(btrim(reference_no))) where status <> 'rejected';
create index deposits_status_idx on public.deposits (status, created_at);
create index deposits_lead_idx on public.deposits (lead_id);
create index deposits_team_idx on public.deposits (team_id, status, verified_at);
create index deposits_analyst_idx on public.deposits (credited_analyst_id) where credited_analyst_id is not null;

-- The live feed: one row per verified deposit, with no client and no lead reference.
create table public.feed_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('deposit_verified')),
  team_id uuid not null references public.teams (id),
  agent_id uuid not null references public.profiles (id),
  amount_pkr bigint not null check (amount_pkr > 0)
);
create index feed_events_created_idx on public.feed_events (created_at desc);

-- ---------------------------------------------------------------------------
-- Guard: money facts never change; status moves only forward through the functions below
-- ---------------------------------------------------------------------------
create function private.deposits_guard()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if private.is_trusted_backend() then
    return new;
  end if;
  if row(new.lead_id, new.broker_id, new.agent_id, new.team_id, new.credited_analyst_id, new.amount_pkr,
         new.deposit_date, new.method, new.reference_no, new.cash_flag, new.created_by, new.created_at)
     is distinct from
     row(old.lead_id, old.broker_id, old.agent_id, old.team_id, old.credited_analyst_id, old.amount_pkr,
         old.deposit_date, old.method, old.reference_no, old.cash_flag, old.created_by, old.created_at) then
    raise exception 'A recorded deposit cannot be edited. Reject it and record it again.' using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     and not (
       (old.status = 'pending' and new.status in ('verified', 'rejected'))
       or (old.status = 'verified' and new.status = 'reversed')
     ) then
    raise exception 'A % deposit cannot become %.', old.status, new.status using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger deposits_guard before update on public.deposits
  for each row execute function private.deposits_guard();

create function private.deposits_no_delete()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'Deposits cannot be deleted. Reject or reverse them instead.' using errcode = '42501';
end;
$$;
create trigger deposits_no_delete before delete on public.deposits
  for each row execute function private.deposits_no_delete();

-- Verifying writes exactly one feed row. Reversing never removes it: boards are computed from deposits.
create function private.deposits_feed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'verified' and old.status is distinct from 'verified' then
    insert into public.feed_events (kind, team_id, agent_id, amount_pkr)
    values ('deposit_verified', new.team_id, new.agent_id, new.amount_pkr);
  end if;
  return null;
end;
$$;
create trigger deposits_feed after update of status on public.deposits
  for each row execute function private.deposits_feed();

-- ---------------------------------------------------------------------------
-- Row-level security. Admins see all; a Team Lead their team's; an agent their own; analysts none.
-- ---------------------------------------------------------------------------
alter table public.deposits enable row level security;
alter table public.feed_events enable row level security;
revoke all on public.deposits, public.feed_events from anon;

create policy deposits_select on public.deposits
  for select to authenticated
  using (
    private.is_admin_or_superadmin()
    or (private.current_app_role() = 'team_lead' and team_id = private.current_team_id())
    or (private.current_app_role() = 'agent' and agent_id = (select auth.uid()))
  );

-- The feed shows amounts, teams and agents to every signed-in role. Never a client.
create policy feed_events_select on public.feed_events
  for select to authenticated using (private.current_app_role() is not null);

revoke insert, update, delete on public.deposits, public.feed_events from authenticated;
grant select on public.deposits, public.feed_events to authenticated;

alter publication supabase_realtime add table public.feed_events;

-- ---------------------------------------------------------------------------
-- record_deposit: the agent, Team Lead or Admin records money received from a client
-- ---------------------------------------------------------------------------
create function public.record_deposit(
  p_lead_id uuid,
  p_amount bigint,
  p_date date,
  p_method text,
  p_reference text
)
returns public.deposits
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  lead public.leads;
  k public.kyc_profiles;
  dep public.deposits;
  limit_pkr bigint;
  flag boolean;
  dep_type text;
  ref text := btrim(coalesce(p_reference, ''));
  admin_id uuid;
begin
  if me is null or not private.owns_lead(p_lead_id) then
    raise exception 'This lead belongs to another team.' using errcode = '42501';
  end if;
  select * into lead from public.leads where id = p_lead_id for update;
  if lead.team_id is null or lead.agent_id is null then
    raise exception 'Assign this lead to an agent before recording a deposit.' using errcode = 'P0001';
  end if;
  if lead.stage not in ('documents_pending', 'deposit_recorded', 'deposit_verified') then
    raise exception 'A deposit is recorded once the client is in documents. Move the lead there first.' using errcode = 'P0001';
  end if;
  select * into k from public.kyc_profiles where lead_id = lead.id;
  if k.id is null or k.status not in ('submitted', 'approved') then
    raise exception 'Complete every document and detail before recording a deposit.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount < 1 then
    raise exception 'Enter the amount in rupees.' using errcode = 'P0001';
  end if;
  if p_date is null or p_date > (now() at time zone 'Asia/Karachi')::date then
    raise exception 'The deposit date cannot be in the future.' using errcode = 'P0001';
  end if;
  if char_length(ref) < 4 then
    raise exception 'Enter the bank or transaction reference number.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.deposits d where lower(btrim(d.reference_no)) = lower(ref) and d.status <> 'rejected') then
    raise exception 'That reference number has already been used.' using errcode = 'P0001';
  end if;

  select coalesce((value)::bigint, 25000) into limit_pkr from public.settings where key = 'cash_flag_limit_pkr';
  flag := p_method = 'cash' and p_amount > coalesce(limit_pkr, 25000);
  dep_type := case when exists (
      select 1 from public.deposits d where d.lead_id = lead.id and d.status in ('pending', 'verified')
    ) then 'top_up' else 'first' end;

  insert into public.deposits (lead_id, broker_id, type, agent_id, team_id, credited_analyst_id, amount_pkr,
                               deposit_date, method, reference_no, cash_flag, created_by)
  values (lead.id, k.broker_id, dep_type, lead.agent_id, lead.team_id, lead.credited_analyst_id, p_amount,
          p_date, p_method, ref, flag, me)
  returning * into dep;

  if lead.stage = 'documents_pending' then
    update public.leads set stage = 'deposit_recorded', last_activity_at = now() where id = lead.id;
    update public.follow_ups set status = 'done', done_at = now() where lead_id = lead.id and status = 'open';
  end if;

  insert into public.activities (lead_id, user_id, type, from_stage, to_stage, notes)
  values (lead.id, me, 'system',
          case when lead.stage = 'documents_pending' then 'documents_pending'::public.lead_stage end,
          case when lead.stage = 'documents_pending' then 'deposit_recorded'::public.lead_stage end,
          format('Deposit of Rs %s recorded (%s), waiting for the Admin.', to_char(p_amount, 'FM999,999,999,999'), replace(p_method, '_', ' ')));
  perform private.audit('deposit.recorded', 'deposit', dep.id::text,
    jsonb_build_object('lead_id', lead.id, 'amount_pkr', p_amount, 'type', dep_type, 'method', p_method, 'cash_flag', flag));

  -- The Admins are told there is money to check; flagged cash is called out.
  for admin_id in select id from public.profiles where role in ('admin', 'superadmin') and is_active and id <> me loop
    perform private.notify(admin_id, 'deposit_to_verify',
      format('Rs %s %s to verify%s.', to_char(p_amount, 'FM999,999,999,999'), replace(p_method, '_', ' '),
             case when flag then ' (cash above the limit)' else '' end),
      '/deposits');
  end loop;
  return dep;
end;
$$;

-- ---------------------------------------------------------------------------
-- verify_deposit: an Admin who did not record it confirms the statement matches
-- ---------------------------------------------------------------------------
create function public.verify_deposit(p_deposit_id uuid, p_statement_checked boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  dep public.deposits;
  lead public.leads;
  k public.kyc_profiles;
  tl uuid;
  new_type text;
  first_name text;
  amount_text text;
begin
  if not private.is_admin_or_superadmin() then
    raise exception 'Only an Admin verifies deposits.' using errcode = '42501';
  end if;
  select * into dep from public.deposits where id = p_deposit_id for update;
  if dep.id is null then
    raise exception 'That deposit no longer exists.' using errcode = 'P0001';
  end if;
  if dep.created_by = me then
    raise exception 'You recorded this deposit, so another Admin must verify it.' using errcode = '42501';
  end if;
  if dep.status <> 'pending' then
    raise exception 'This deposit is already %.', dep.status using errcode = 'P0001';
  end if;
  if not coalesce(p_statement_checked, false) then
    raise exception 'Confirm the reference, amount and date match the statement first.' using errcode = 'P0001';
  end if;
  select * into k from public.kyc_profiles where lead_id = dep.lead_id;
  if k.id is null or k.status <> 'approved' then
    raise exception 'The client''s KYC is not approved yet.' using errcode = 'P0001';
  end if;

  -- The client's first verified deposit is "first"; every later one is a top-up.
  new_type := case when exists (
      select 1 from public.deposits d where d.lead_id = dep.lead_id and d.status = 'verified' and d.id <> dep.id
    ) then 'top_up' else 'first' end;

  update public.deposits
     set status = 'verified', verified_by = me, verified_at = now(), type = new_type
   where id = dep.id;

  select * into lead from public.leads where id = dep.lead_id for update;
  if lead.stage = 'deposit_recorded' then
    update public.leads set stage = 'deposit_verified', next_follow_up_at = null, last_activity_at = now() where id = lead.id;
    update public.follow_ups set status = 'done', done_at = now() where lead_id = lead.id and status = 'open';
  end if;

  amount_text := to_char(dep.amount_pkr, 'FM999,999,999,999');
  first_name := split_part(lead.full_name, ' ', 1);
  insert into public.activities (lead_id, user_id, type, from_stage, to_stage, notes)
  values (lead.id, me, 'system',
          case when lead.stage = 'deposit_recorded' then 'deposit_recorded'::public.lead_stage end,
          case when lead.stage = 'deposit_recorded' then 'deposit_verified'::public.lead_stage end,
          format('Deposit of Rs %s verified.', amount_text));
  perform private.audit('deposit.verified', 'deposit', dep.id::text,
    jsonb_build_object('lead_id', lead.id, 'amount_pkr', dep.amount_pkr, 'type', new_type));

  -- The agent, their Team Lead and the credited analyst hear about it. The analyst gets no client name.
  select t.team_lead_id into tl from public.teams t where t.id = dep.team_id;
  perform private.notify(dep.agent_id, 'deposit_verified',
    format('Rs %s from %s is verified.', amount_text, first_name), '/lead/' || lead.id::text);
  if tl is not null and tl <> dep.agent_id then
    perform private.notify(tl, 'deposit_verified',
      format('Rs %s from %s is verified for your team.', amount_text, first_name), '/lead/' || lead.id::text);
  end if;
  if dep.credited_analyst_id is not null then
    perform private.notify(dep.credited_analyst_id, 'deposit_verified',
      format('A client you saw has a verified deposit of Rs %s. You are credited.', amount_text), '/sessions');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- reject_deposit: the reason goes to the agent; a rejected first deposit sends the lead back to documents
-- ---------------------------------------------------------------------------
create function public.reject_deposit(p_deposit_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  dep public.deposits;
  lead public.leads;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
  amount_text text;
begin
  if not private.is_admin_or_superadmin() then
    raise exception 'Only an Admin rejects deposits.' using errcode = '42501';
  end if;
  select * into dep from public.deposits where id = p_deposit_id for update;
  if dep.id is null then
    raise exception 'That deposit no longer exists.' using errcode = 'P0001';
  end if;
  if dep.status <> 'pending' then
    raise exception 'This deposit is already %.', dep.status using errcode = 'P0001';
  end if;
  if reason is null then
    raise exception 'Give a reason so the agent knows what to fix.' using errcode = 'P0001';
  end if;

  update public.deposits
     set status = 'rejected', reject_reason = reason, rejected_by = me, rejected_at = now()
   where id = dep.id;

  select * into lead from public.leads where id = dep.lead_id for update;
  if lead.stage = 'deposit_recorded'
     and not exists (select 1 from public.deposits d where d.lead_id = lead.id and d.status = 'pending') then
    update public.leads
       set stage = 'documents_pending', next_follow_up_at = now() + interval '1 day', last_activity_at = now()
     where id = lead.id;
    insert into public.follow_ups (lead_id, agent_id, due_at) values (lead.id, coalesce(lead.agent_id, dep.agent_id), now() + interval '1 day');
  end if;

  amount_text := to_char(dep.amount_pkr, 'FM999,999,999,999');
  insert into public.activities (lead_id, user_id, type, from_stage, to_stage, notes)
  values (lead.id, me, 'system',
          case when lead.stage = 'deposit_recorded' and not exists (select 1 from public.deposits d where d.lead_id = lead.id and d.status = 'pending')
               then 'deposit_recorded'::public.lead_stage end,
          case when lead.stage = 'deposit_recorded' and not exists (select 1 from public.deposits d where d.lead_id = lead.id and d.status = 'pending')
               then 'documents_pending'::public.lead_stage end,
          format('Deposit of Rs %s rejected: %s', amount_text, reason));
  perform private.audit('deposit.rejected', 'deposit', dep.id::text,
    jsonb_build_object('lead_id', lead.id, 'amount_pkr', dep.amount_pkr, 'reason', reason));
  perform private.notify(dep.agent_id, 'deposit_rejected',
    format('Rs %s from %s was rejected: %s', amount_text, split_part(lead.full_name, ' ', 1), reason),
    '/lead/' || lead.id::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- reverse_deposit: a verified deposit the client took back. Comes off every total.
-- ---------------------------------------------------------------------------
create function public.reverse_deposit(p_deposit_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  dep public.deposits;
  lead public.leads;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
  amount_text text;
  tl uuid;
begin
  if not private.is_admin_or_superadmin() then
    raise exception 'Only an Admin reverses deposits.' using errcode = '42501';
  end if;
  select * into dep from public.deposits where id = p_deposit_id for update;
  if dep.id is null then
    raise exception 'That deposit no longer exists.' using errcode = 'P0001';
  end if;
  if dep.status <> 'verified' then
    raise exception 'Only a verified deposit can be reversed.' using errcode = 'P0001';
  end if;
  if reason is null then
    raise exception 'Give a reason for the reversal.' using errcode = 'P0001';
  end if;

  update public.deposits
     set status = 'reversed', reverse_reason = reason, reversed_by = me, reversed_at = now()
   where id = dep.id;

  select * into lead from public.leads where id = dep.lead_id;
  amount_text := to_char(dep.amount_pkr, 'FM999,999,999,999');
  insert into public.activities (lead_id, user_id, type, notes)
  values (lead.id, me, 'system', format('Deposit of Rs %s reversed: %s', amount_text, reason));
  perform private.audit('deposit.reversed', 'deposit', dep.id::text,
    jsonb_build_object('lead_id', lead.id, 'amount_pkr', dep.amount_pkr, 'reason', reason));

  select t.team_lead_id into tl from public.teams t where t.id = dep.team_id;
  perform private.notify(dep.agent_id, 'deposit_reversed',
    format('Rs %s from %s was reversed: %s', amount_text, split_part(lead.full_name, ' ', 1), reason), '/lead/' || lead.id::text);
  if tl is not null and tl <> dep.agent_id then
    perform private.notify(tl, 'deposit_reversed',
      format('Rs %s from %s was reversed: %s', amount_text, split_part(lead.full_name, ' ', 1), reason), '/lead/' || lead.id::text);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- ask_agent_about_deposit: the Admin asks a question instead of deciding yet
-- ---------------------------------------------------------------------------
create function public.ask_agent_about_deposit(p_deposit_id uuid, p_question text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  dep public.deposits;
  lead public.leads;
  q text := nullif(btrim(coalesce(p_question, '')), '');
begin
  if not private.is_admin_or_superadmin() then
    raise exception 'Only an Admin asks about deposits.' using errcode = '42501';
  end if;
  select * into dep from public.deposits where id = p_deposit_id;
  if dep.id is null or dep.status <> 'pending' then
    raise exception 'Only a deposit waiting for review can be queried.' using errcode = 'P0001';
  end if;
  if q is null then
    raise exception 'Write your question for the agent.' using errcode = 'P0001';
  end if;
  select * into lead from public.leads where id = dep.lead_id;
  insert into public.activities (lead_id, user_id, type, notes)
  values (lead.id, auth.uid(), 'note', left(format('Question about the deposit: %s', q), 2000));
  perform private.audit('deposit.question', 'deposit', dep.id::text, jsonb_build_object('lead_id', lead.id));
  perform private.notify(dep.agent_id, 'deposit_question',
    format('About the Rs %s deposit from %s: %s', to_char(dep.amount_pkr, 'FM999,999,999,999'), split_part(lead.full_name, ' ', 1), left(q, 160)),
    '/lead/' || lead.id::text);
end;
$$;

-- Names for the verification queue: agent and team, and whether the client's KYC is approved.
create function public.deposit_queue_context(p_deposit_ids uuid[])
returns table (deposit_id uuid, client_name text, kyc_status text, agent_name text, team_name text)
language sql stable security definer set search_path = ''
as $$
  select d.id, l.full_name, k.status, p.full_name, t.name
    from public.deposits d
    join public.leads l on l.id = d.lead_id
    left join public.kyc_profiles k on k.lead_id = d.lead_id
    left join public.profiles p on p.id = d.agent_id
    left join public.teams t on t.id = d.team_id
   where d.id = any (p_deposit_ids) and private.is_admin_or_superadmin()
$$;

-- The analyst's own credit now shows rupees: verified deposits of the clients credited to them.
drop function public.my_analyst_credit();
create function public.my_analyst_credit()
returns table (credited_clients bigint, sessions_held bigint, verified_pkr bigint, verified_deposits bigint)
language sql stable security definer set search_path = ''
as $$
  select (select count(*) from public.leads l where l.credited_analyst_id = auth.uid()),
         (select count(*) from public.sessions s where s.analyst_id = auth.uid() and s.outcome = 'attended'),
         (select coalesce(sum(d.amount_pkr), 0)::bigint from public.deposits d where d.credited_analyst_id = auth.uid() and d.status = 'verified'),
         (select count(*) from public.deposits d where d.credited_analyst_id = auth.uid() and d.status = 'verified')
$$;

revoke execute on function public.record_deposit(uuid, bigint, date, text, text) from public, anon;
revoke execute on function public.verify_deposit(uuid, boolean) from public, anon;
revoke execute on function public.reject_deposit(uuid, text) from public, anon;
revoke execute on function public.reverse_deposit(uuid, text) from public, anon;
revoke execute on function public.ask_agent_about_deposit(uuid, text) from public, anon;
revoke execute on function public.deposit_queue_context(uuid[]) from public, anon;
revoke execute on function public.my_analyst_credit() from public, anon;
grant execute on function public.record_deposit(uuid, bigint, date, text, text) to authenticated;
grant execute on function public.verify_deposit(uuid, boolean) to authenticated;
grant execute on function public.reject_deposit(uuid, text) to authenticated;
grant execute on function public.reverse_deposit(uuid, text) to authenticated;
grant execute on function public.ask_agent_about_deposit(uuid, text) to authenticated;
grant execute on function public.deposit_queue_context(uuid[]) to authenticated;
grant execute on function public.my_analyst_credit() to authenticated;

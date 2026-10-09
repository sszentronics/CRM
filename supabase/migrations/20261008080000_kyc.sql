-- Module 7: KYC documents, redesigned (owner decision, 8 Oct 2026).
-- Client documents are NOT stored or hosted. The CRM keeps the typed KYC fields and a checklist the
-- agent ticks and the Admin approves. No files, no storage bucket, no signed URLs.

create table public.kyc_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lead_id uuid not null unique references public.leads (id),
  broker_id uuid not null references public.brokers (id),
  -- The broker's checklist when this client started, so later broker edits apply to new clients only.
  checklist jsonb not null check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) between 1 and 20),
  cnic_number text unique check (cnic_number is null or cnic_number ~ '^[0-9]{13}$'),
  cnic_expiry date,
  mother_name text check (mother_name is null or char_length(btrim(mother_name)) between 2 and 80),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  bank_name text check (bank_name is null or char_length(btrim(bank_name)) between 2 and 80),
  iban text check (iban is null or iban ~ '^PK[0-9]{2}[A-Z]{4}[0-9A-Z]{16}$'),
  income_band text check (income_band is null or income_band in ('under_50k', '50k_150k', '150k_500k', 'over_500k')),
  sim_in_own_name boolean,
  consent_at timestamptz,
  risk_level text check (risk_level is null or risk_level in ('low', 'medium', 'high')),
  is_pep boolean,
  status text not null default 'incomplete' check (status in ('incomplete', 'submitted', 'approved'))
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kyc_profile_id uuid not null references public.kyc_profiles (id),
  type text not null check (type ~ '^[a-z_]{3,40}$'),
  status text not null default 'collected' check (status in ('collected', 'approved', 'rejected')),
  collected_by uuid references public.profiles (id),
  collected_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 200),
  unique (kyc_profile_id, type)
);
create index documents_status_idx on public.documents (status, collected_at);

-- ---------------------------------------------------------------------------
-- Status: approved when every item is approved and every field is filled; submitted when every
-- item is collected or approved and every field is filled; otherwise incomplete.
-- ---------------------------------------------------------------------------
create function private.kyc_fields_complete(k public.kyc_profiles)
returns boolean
language sql immutable set search_path = ''
as $$
  select k.cnic_number is not null and k.cnic_expiry is not null and k.mother_name is not null and k.email is not null
     and k.bank_name is not null and k.iban is not null and k.income_band is not null and k.sim_in_own_name is not null
     and k.consent_at is not null and k.risk_level is not null and k.is_pep is not null
$$;

create function private.kyc_recompute(p_profile_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  k public.kyc_profiles;
  total int;
  ready int;
  approved int;
  next_status text;
begin
  select * into k from public.kyc_profiles where id = p_profile_id;
  if k.id is null then
    return;
  end if;
  select jsonb_array_length(k.checklist) into total;
  select count(*) filter (where d.status in ('collected', 'approved')), count(*) filter (where d.status = 'approved')
    into ready, approved
    from public.documents d
   where d.kyc_profile_id = k.id and k.checklist ? d.type;
  next_status := case
    when private.kyc_fields_complete(k) and approved = total then 'approved'
    when private.kyc_fields_complete(k) and ready = total then 'submitted'
    else 'incomplete' end;
  if next_status is distinct from k.status then
    update public.kyc_profiles set status = next_status where id = k.id;
  end if;
end;
$$;

create function private.kyc_profiles_touch()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger kyc_profiles_touch before update on public.kyc_profiles
  for each row execute function private.kyc_profiles_touch();

create function private.kyc_after_profile()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  -- Avoid recursion: status-only updates come from kyc_recompute itself.
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and row(new.cnic_number, new.cnic_expiry, new.mother_name, new.email, new.bank_name, new.iban, new.income_band,
             new.sim_in_own_name, new.consent_at, new.risk_level, new.is_pep, new.checklist)
         is not distinct from
         row(old.cnic_number, old.cnic_expiry, old.mother_name, old.email, old.bank_name, old.iban, old.income_band,
             old.sim_in_own_name, old.consent_at, old.risk_level, old.is_pep, old.checklist) then
    return null;
  end if;
  perform private.kyc_recompute(new.id);
  return null;
end;
$$;
create trigger kyc_after_profile after insert or update on public.kyc_profiles
  for each row execute function private.kyc_after_profile();

create function private.kyc_after_document()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  perform private.kyc_recompute(coalesce(new.kyc_profile_id, old.kyc_profile_id));
  return null;
end;
$$;
create trigger kyc_after_document after insert or update or delete on public.documents
  for each row execute function private.kyc_after_document();

-- Once approved, a profile's fields are fixed for agents and Team Leads; an Admin can still correct them.
create function private.kyc_guard_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if private.is_trusted_backend() or private.is_admin_or_superadmin() then
    return new;
  end if;
  if old.status = 'approved' and row(new.cnic_number, new.cnic_expiry, new.mother_name, new.email, new.bank_name, new.iban,
       new.income_band, new.sim_in_own_name, new.consent_at, new.risk_level, new.is_pep, new.broker_id, new.checklist)
       is distinct from row(old.cnic_number, old.cnic_expiry, old.mother_name, old.email, old.bank_name, old.iban,
       old.income_band, old.sim_in_own_name, old.consent_at, old.risk_level, old.is_pep, old.broker_id, old.checklist) then
    raise exception 'These KYC details are approved. Ask an Admin to change them.' using errcode = '42501';
  end if;
  if new.lead_id is distinct from old.lead_id then
    raise exception 'A KYC profile cannot move to another lead.' using errcode = '42501';
  end if;
  if (new.broker_id is distinct from old.broker_id or new.checklist is distinct from old.checklist)
     and exists (select 1 from public.documents d where d.kyc_profile_id = old.id and d.status = 'approved') then
    raise exception 'Some documents are already approved for this broker. Ask an Admin to unlock them first.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger kyc_guard_update before update on public.kyc_profiles
  for each row execute function private.kyc_guard_update();

-- ---------------------------------------------------------------------------
-- Row-level security. Analysts never see KYC (section 3).
-- ---------------------------------------------------------------------------
alter table public.kyc_profiles enable row level security;
alter table public.documents enable row level security;
revoke all on public.kyc_profiles, public.documents from anon;

create policy kyc_select on public.kyc_profiles
  for select to authenticated using (private.owns_lead(lead_id));
create policy kyc_insert on public.kyc_profiles
  for insert to authenticated with check (private.owns_lead(lead_id));
create policy kyc_update on public.kyc_profiles
  for update to authenticated using (private.owns_lead(lead_id)) with check (private.owns_lead(lead_id));

create policy documents_select on public.documents
  for select to authenticated
  using (exists (select 1 from public.kyc_profiles k where k.id = kyc_profile_id and private.owns_lead(k.lead_id)));

-- ---------------------------------------------------------------------------
-- Checklist actions (writes go through these, with audit rows and notifications)
-- ---------------------------------------------------------------------------

-- The agent (or Team Lead or Admin) marks an item collected, or clears a tick that is not approved.
create function public.set_document_collected(p_profile_id uuid, p_type text, p_collected boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  k public.kyc_profiles;
  d public.documents;
begin
  select * into k from public.kyc_profiles where id = p_profile_id;
  if k.id is null or not private.owns_lead(k.lead_id) then
    raise exception 'This lead belongs to another team.' using errcode = '42501';
  end if;
  if not (k.checklist ? p_type) then
    raise exception 'That document is not on this broker''s checklist.' using errcode = 'P0001';
  end if;
  select * into d from public.documents where kyc_profile_id = p_profile_id and type = p_type for update;
  if d.status = 'approved' and not private.is_admin_or_superadmin() then
    raise exception 'This document is approved and locked. Ask an Admin to unlock it.' using errcode = '42501';
  end if;
  if p_collected then
    insert into public.documents (kyc_profile_id, type, status, collected_by, collected_at)
    values (p_profile_id, p_type, 'collected', auth.uid(), now())
    on conflict (kyc_profile_id, type) do update
      set status = 'collected', collected_by = auth.uid(), collected_at = now(),
          reviewed_by = null, reviewed_at = null, reject_reason = null;
  else
    delete from public.documents where kyc_profile_id = p_profile_id and type = p_type;
  end if;
  insert into public.activities (lead_id, user_id, type, notes)
  values (k.lead_id, auth.uid(), 'system', format('%s: %s.', initcap(replace(p_type, '_', ' ')), case when p_collected then 'collected' else 'tick cleared' end));
  perform private.audit(case when p_collected then 'document.collected' else 'document.cleared' end, 'document',
    coalesce(d.id, (select id from public.documents where kyc_profile_id = p_profile_id and type = p_type))::text,
    jsonb_build_object('type', p_type, 'lead_id', k.lead_id));
end;
$$;

-- Admin review: approve or reject (with a reason, which notifies the agent).
create function public.review_document(p_document_id uuid, p_approve boolean, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  d public.documents;
  k public.kyc_profiles;
  lead public.leads;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not private.is_admin_or_superadmin() then
    raise exception 'Only an Admin reviews documents.' using errcode = '42501';
  end if;
  select * into d from public.documents where id = p_document_id for update;
  if d.id is null then
    raise exception 'That document no longer exists.' using errcode = 'P0001';
  end if;
  if not p_approve and reason is null then
    raise exception 'Give a reason so the agent knows what to fix.' using errcode = 'P0001';
  end if;
  update public.documents
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = case when p_approve then null else reason end
   where id = d.id;
  select * into k from public.kyc_profiles where id = d.kyc_profile_id;
  select * into lead from public.leads where id = k.lead_id;
  perform private.audit(case when p_approve then 'document.approved' else 'document.rejected' end, 'document', d.id::text,
    jsonb_build_object('type', d.type, 'lead_id', k.lead_id, 'reason', reason));
  if not p_approve and lead.agent_id is not null then
    perform private.notify(lead.agent_id, 'document_rejected',
      format('%s rejected for %s: %s. Collect it again.', initcap(replace(d.type, '_', ' ')), split_part(lead.full_name, ' ', 1), reason),
      '/lead/' || lead.id::text);
  end if;
end;
$$;

-- Admin: approve every collected item on a profile at once.
create function public.approve_all_documents(p_profile_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  if not private.is_admin_or_superadmin() then
    raise exception 'Only an Admin reviews documents.' using errcode = '42501';
  end if;
  update public.documents set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = null
   where kyc_profile_id = p_profile_id and status = 'collected';
  get diagnostics n = row_count;
  perform private.audit('document.approve_all', 'kyc_profile', p_profile_id::text, jsonb_build_object('approved', n));
  return n;
end;
$$;

-- Admin: unlock an approved item so the agent can collect it again.
create function public.unlock_document(p_document_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  d public.documents;
begin
  if not private.is_admin_or_superadmin() then
    raise exception 'Only an Admin unlocks documents.' using errcode = '42501';
  end if;
  update public.documents set status = 'collected', reviewed_by = null, reviewed_at = null
   where id = p_document_id and status = 'approved'
  returning * into d;
  if d.id is null then
    raise exception 'Only approved documents can be unlocked.' using errcode = 'P0001';
  end if;
  perform private.audit('document.unlocked', 'document', d.id::text, jsonb_build_object('type', d.type));
end;
$$;

-- Duplicate-CNIC and CNIC search across all leads, for the server only. Returns a lead id, never details.
create function public.lead_with_cnic(p_cnic text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select k.lead_id from public.kyc_profiles k where k.cnic_number = p_cnic
$$;

revoke execute on function public.set_document_collected(uuid, text, boolean) from public, anon;
revoke execute on function public.review_document(uuid, boolean, text) from public, anon;
revoke execute on function public.approve_all_documents(uuid) from public, anon;
revoke execute on function public.unlock_document(uuid) from public, anon;
revoke execute on function public.lead_with_cnic(text) from public, anon, authenticated;
grant execute on function public.set_document_collected(uuid, text, boolean) to authenticated;
grant execute on function public.review_document(uuid, boolean, text) to authenticated;
grant execute on function public.approve_all_documents(uuid) to authenticated;
grant execute on function public.unlock_document(uuid) to authenticated;
grant execute on function public.lead_with_cnic(text) to service_role;

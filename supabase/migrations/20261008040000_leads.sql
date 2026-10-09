-- Module 3: lead intake. Leads get into the pool cleanly, with no duplicates.
-- Module 4 adds the read and write policies for Team Leads, agents and analysts.

create type public.lead_stage as enum (
  'new', 'assigned', 'no_answer', 'follow_up', 'interested', 'with_analyst', 'post_session',
  'documents_pending', 'deposit_recorded', 'deposit_verified', 'not_interested', 'invalid'
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 80),
  -- Normalised by the app to +92 and 10 digits. Unique: one lead per number, ever.
  phone text not null unique check (phone ~ '^\+92[1-9][0-9]{9}$'),
  city text check (city is null or char_length(city) <= 60),
  source text not null check (char_length(btrim(source)) between 1 and 60),
  campaign text check (campaign is null or char_length(campaign) <= 80),
  notes text check (notes is null or char_length(notes) <= 1000),
  stage public.lead_stage not null default 'new',
  team_id uuid references public.teams (id),
  agent_id uuid references public.profiles (id),
  next_follow_up_at timestamptz,
  no_answer_count integer not null default 0 check (no_answer_count >= 0),
  close_reason text,
  invalid_confirmed_by uuid references public.profiles (id),
  returned_to_lead boolean not null default false,
  credited_analyst_id uuid references public.profiles (id),
  agent_assigned_at timestamptz,
  last_activity_at timestamptz,
  created_by uuid references public.profiles (id)
);

create index leads_stage_idx on public.leads (stage);
create index leads_team_idx on public.leads (team_id) where team_id is not null;
create index leads_agent_idx on public.leads (agent_id) where agent_id is not null;
create index leads_created_at_idx on public.leads (created_at desc);
-- Name search ("ali" finds "Ali Raza" and "Zain Ali").
create extension if not exists pg_trgm with schema extensions;
create index leads_name_trgm_idx on public.leads using gin (full_name extensions.gin_trgm_ops);

alter table public.leads enable row level security;
revoke all on public.leads from anon;

-- Superadmin and Admin see every lead. Module 4 adds Team Lead, agent and analyst scopes.
create policy leads_select_admins on public.leads
  for select to authenticated
  using ((select private.is_admin_or_superadmin()));

-- New leads enter the pool: stage new, no team, no agent, created by the person adding them.
create policy leads_insert_admins on public.leads
  for insert to authenticated
  with check (
    (select private.is_admin_or_superadmin())
    and stage = 'new'
    and team_id is null
    and agent_id is null
    and created_by = (select auth.uid())
  );

-- Server-only: which of these phone numbers already exist, whoever can see them.
-- Returns numbers only, never lead details, so a duplicate check leaks nothing else.
create function public.existing_lead_phones(phones text[])
returns setof text
language sql stable security definer set search_path = ''
as $$
  select l.phone from public.leads l where l.phone = any(phones)
$$;

revoke execute on function public.existing_lead_phones(text[]) from public, anon, authenticated;
grant execute on function public.existing_lead_phones(text[]) to service_role;

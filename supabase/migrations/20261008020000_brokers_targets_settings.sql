-- Module 2: brokers, targets and settings. The owner's configuration exists before any lead does.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- First day of the current month in Karachi. Targets before this month are locked.
create function private.karachi_month_start()
returns date
language sql stable set search_path = ''
as $$
  select date_trunc('month', (now() at time zone 'Asia/Karachi'))::date
$$;

grant execute on function private.karachi_month_start() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- brokers
-- ---------------------------------------------------------------------------
create type public.broker_market as enum ('psx', 'pmex', 'other');

create table public.brokers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  market public.broker_market not null,
  -- Document type keys a client of this broker must upload. Copied onto each KYC profile when it is
  -- created (Module 7), so a later change applies to new clients only.
  kyc_checklist jsonb not null default '[]'::jsonb
    check (jsonb_typeof(kyc_checklist) = 'array' and jsonb_array_length(kyc_checklist) between 1 and 20),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
create unique index brokers_name_unique on public.brokers (lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- targets
-- ---------------------------------------------------------------------------
create table public.targets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  team_id uuid not null references public.teams (id),
  month date not null check (extract(day from month) = 1),
  amount_pkr bigint not null check (amount_pkr >= 0 and amount_pkr <= 100000000000),
  updated_at timestamptz not null default now(),
  unique (team_id, month)
);

-- Past months are history: nobody changes them, not even the service role.
create function private.targets_lock_past()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (tg_op in ('UPDATE', 'DELETE') and old.month < private.karachi_month_start())
     or (tg_op in ('INSERT', 'UPDATE') and new.month < private.karachi_month_start()) then
    raise exception 'Targets for past months are locked.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger targets_lock_past
  before insert or update or delete on public.targets
  for each row execute function private.targets_lock_past();

-- ---------------------------------------------------------------------------
-- settings
-- ---------------------------------------------------------------------------
create table public.settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,62}$'),
  value jsonb not null,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create function private.settings_touch()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end;
$$;

create trigger settings_touch
  before update on public.settings
  for each row execute function private.settings_touch();

create function private.brokers_touch()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger brokers_touch
  before update on public.brokers
  for each row execute function private.brokers_touch();

-- Defaults from BUILD.md section 6.
insert into public.settings (key, value) values
  ('first_call_deadline_hours', '24'),
  ('max_call_tries', '5'),
  ('stale_days', '7'),
  ('cooling_off_days', '90'),
  ('referral_deadline_hours', '24'),
  ('reversal_window_days', '30'),
  ('cash_flag_limit_pkr', '25000'),
  ('idle_signout_minutes', '30'),
  ('lead_sources', '["Facebook", "Instagram", "TikTok", "PR", "Referral", "Walk-in"]'),
  ('not_interested_reasons', '["Not enough money", "No trust", "Already has a broker", "Not reachable", "Other"]'),
  ('invalid_reasons', '["Wrong number", "Duplicate", "Fake"]');

-- ---------------------------------------------------------------------------
-- Row-level security: everyone signed in reads; only the Superadmin writes; nothing is deleted
-- ---------------------------------------------------------------------------
alter table public.brokers enable row level security;
alter table public.targets enable row level security;
alter table public.settings enable row level security;

revoke all on public.brokers, public.targets, public.settings from anon;

-- Active brokers for everyone; the Superadmin also sees switched-off ones.
create policy brokers_select on public.brokers
  for select to authenticated
  using (is_active or (select private.is_superadmin()));

create policy brokers_insert on public.brokers
  for insert to authenticated
  with check ((select private.is_superadmin()));

create policy brokers_update on public.brokers
  for update to authenticated
  using ((select private.is_superadmin()))
  with check ((select private.is_superadmin()));

-- Targets are shown on the Arena and dashboards, so every signed-in role reads them.
create policy targets_select on public.targets
  for select to authenticated
  using (true);

create policy targets_insert on public.targets
  for insert to authenticated
  with check ((select private.is_superadmin()));

create policy targets_update on public.targets
  for update to authenticated
  using ((select private.is_superadmin()))
  with check ((select private.is_superadmin()));

create policy settings_select on public.settings
  for select to authenticated
  using (true);

create policy settings_update on public.settings
  for update to authenticated
  using ((select private.is_superadmin()))
  with check ((select private.is_superadmin()));

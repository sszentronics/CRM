-- Workspaces: one company per workspace, in one database.
-- Trading Labs becomes the first client workspace. New sign-ups get a 14-day demo workspace of their own.
-- Isolation has three layers: a restrictive row-level policy on every table, a trigger that stops any write
-- into another workspace (this also covers the security-definer functions), and workspace-scoped views
-- that the security-definer functions now read from.

create type public.workspace_plan as enum ('client', 'trial');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  plan public.workspace_plan not null default 'trial',
  trial_ends_at timestamptz,
  -- Set once a demo user picks the default CRM. A custom site is a request, see workspace_requests.
  product text check (product in ('crm')),
  -- Client colours: {"primary": "#rrggbb", "rail": "#rrggbb"}. Null means the QuantraPro look.
  theme jsonb check (
    theme is null or (
      jsonb_typeof(theme) = 'object'
      and theme ->> 'primary' ~ '^#[0-9a-fA-F]{6}$'
      and theme ->> 'rail' ~ '^#[0-9a-fA-F]{6}$'
    )
  ),
  logo_path text check (logo_path is null or logo_path ~ '^/[A-Za-z0-9/_.\-]+$'),
  created_at timestamptz not null default now(),
  constraint workspaces_trial_has_end check (plan = 'client' or trial_ends_at is not null)
);

insert into public.workspaces (id, name, plan, product, logo_path)
values ('00000000-0000-4000-8000-000000000001', 'Trading Labs', 'client', 'crm', '/brand/tl-logo.png');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column workspace_id uuid not null default '00000000-0000-4000-8000-000000000001'
  references public.workspaces (id);

create function private.current_workspace_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.workspace_id from public.profiles p where p.id = (select auth.uid()) and p.is_active
$$;

create function private.is_trial_workspace()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select w.plan = 'trial' from public.workspaces w where w.id = private.current_workspace_id()), false)
$$;

-- Demo workspaces skip the authenticator-app step so a new sign-up can start straight away.
-- Client workspaces keep it for Admin and Superadmin exactly as before.
create or replace function private.has_aal2()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2' or private.is_trial_workspace()
$$;

grant execute on function private.current_workspace_id(), private.is_trial_workspace() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- workspace_id on every table. Existing rows belong to Trading Labs.
-- After the backfill the default becomes the signed-in user's workspace, and is null for the service role,
-- so server code has to say which workspace it means.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['teams','audit_log','brokers','targets','settings','leads','notifications','assignments',
    'activities','follow_ups','sessions','kyc_profiles','documents','deposits','feed_events','team_prizes',
    'rank_snapshots','export_history'] loop
    execute format(
      'alter table public.%I add column workspace_id uuid not null default %L references public.workspaces (id)',
      t, '00000000-0000-4000-8000-000000000001');
  end loop;
  foreach t in array array['teams','profiles','audit_log','brokers','targets','settings','leads','notifications','assignments',
    'activities','follow_ups','sessions','kyc_profiles','documents','deposits','feed_events','team_prizes',
    'rank_snapshots','export_history'] loop
    execute format('alter table public.%I alter column workspace_id set default private.current_workspace_id()', t);
    execute format('create index %I on public.%I (workspace_id)', t || '_workspace_idx', t);
  end loop;
end $$;

-- Seeds the default settings for a new workspace.
create function private.seed_workspace_settings(p_workspace uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.settings (workspace_id, key, value) values
    (p_workspace, 'first_call_deadline_hours', '24'),
    (p_workspace, 'max_call_tries', '5'),
    (p_workspace, 'stale_days', '7'),
    (p_workspace, 'cooling_off_days', '90'),
    (p_workspace, 'referral_deadline_hours', '24'),
    (p_workspace, 'reversal_window_days', '30'),
    (p_workspace, 'cash_flag_limit_pkr', '25000'),
    (p_workspace, 'idle_signout_minutes', '30'),
    (p_workspace, 'lead_sources', '["Facebook", "Instagram", "TikTok", "PR", "Referral", "Walk-in"]'),
    (p_workspace, 'not_interested_reasons', '["Not enough money", "No trust", "Already has a broker", "Not reachable", "Other"]'),
    (p_workspace, 'invalid_reasons', '["Wrong number", "Duplicate", "Fake"]')
  on conflict do nothing
$$;
revoke execute on function private.seed_workspace_settings(uuid) from public, anon, authenticated;
grant execute on function private.seed_workspace_settings(uuid) to service_role;

-- Uniqueness is per workspace now.
alter table public.leads drop constraint leads_phone_key;
alter table public.leads add constraint leads_workspace_phone_key unique (workspace_id, phone);
alter table public.kyc_profiles drop constraint kyc_profiles_cnic_number_key;
alter table public.kyc_profiles add constraint kyc_profiles_workspace_cnic_key unique (workspace_id, cnic_number);
drop index public.teams_name_unique;
create unique index teams_name_unique on public.teams (workspace_id, lower(btrim(name)));
drop index public.brokers_name_unique;
create unique index brokers_name_unique on public.brokers (workspace_id, lower(btrim(name)));
drop index public.deposits_reference_unique;
create unique index deposits_reference_unique on public.deposits (workspace_id, lower(btrim(reference_no))) where status <> 'rejected';
alter table public.settings drop constraint settings_pkey;
alter table public.settings add primary key (workspace_id, key);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.workspaces enable row level security;
revoke all on public.workspaces from anon;
create policy workspaces_select_own on public.workspaces
  for select to authenticated
  using (id = (select private.current_workspace_id()));

do $$
declare
  t text;
begin
  foreach t in array array['teams','profiles','audit_log','brokers','targets','settings','leads','notifications','assignments',
    'activities','follow_ups','sessions','kyc_profiles','documents','deposits','feed_events','team_prizes',
    'rank_snapshots','export_history'] loop
    -- A restrictive policy is ANDed with every existing policy, so none of them had to be rewritten.
    execute format(
      'create policy workspace_isolation on public.%I as restrictive for all to authenticated
         using (workspace_id = (select private.current_workspace_id()))
         with check (workspace_id = (select private.current_workspace_id()))', t);
  end loop;
end $$;

-- Requests from a workspace to the QuantraPro team: a custom site, the default CRM, or an upgrade.
create table public.workspace_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workspace_id uuid not null default private.current_workspace_id() references public.workspaces (id),
  requested_by uuid not null default auth.uid() references public.profiles (id),
  kind text not null check (kind in ('custom_site', 'default_crm', 'upgrade')),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'new' check (status in ('new', 'in_progress', 'done'))
);
create index workspace_requests_workspace_idx on public.workspace_requests (workspace_id, created_at desc);
alter table public.workspace_requests enable row level security;
revoke all on public.workspace_requests from anon;
create policy workspace_requests_select on public.workspace_requests
  for select to authenticated
  using (workspace_id = (select private.current_workspace_id()) and (select private.is_superadmin()));
create policy workspace_requests_insert on public.workspace_requests
  for insert to authenticated
  with check (
    workspace_id = (select private.current_workspace_id())
    and requested_by = (select auth.uid())
    and (select private.is_superadmin())
  );

-- ---------------------------------------------------------------------------
-- Row trigger: fills workspace_id, then refuses writes into another workspace or after a demo has ended
-- ---------------------------------------------------------------------------
create function private.workspace_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  target uuid;
  mine uuid;
  ended boolean;
begin
  if tg_op = 'INSERT' and new.workspace_id is null then
    -- Rows written by background jobs take the workspace of the person they are about.
    if tg_table_name = 'notifications' or tg_table_name = 'audit_log' then
      if new.user_id is not null then
        select p.workspace_id into new.workspace_id from public.profiles p where p.id = new.user_id;
      end if;
    end if;
    if new.workspace_id is null then
      new.workspace_id := private.current_workspace_id();
    end if;
    -- Migrations, tests and seeds run as the database owner and belong to Trading Labs.
    if new.workspace_id is null and current_user in ('postgres', 'supabase_admin') then
      new.workspace_id := '00000000-0000-4000-8000-000000000001';
    end if;
  end if;

  mine := private.current_workspace_id();
  -- Signed-in people only: the service role and background jobs name their workspace themselves.
  if mine is not null then
    target := case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end;
    if target is distinct from mine
       or (tg_op = 'UPDATE' and new.workspace_id is distinct from old.workspace_id) then
      raise exception 'That belongs to another workspace.' using errcode = '42501';
    end if;
    select (w.plan = 'trial' and w.trial_ends_at < now()) into ended from public.workspaces w where w.id = mine;
    if coalesce(ended, false) then
      raise exception 'Your demo has ended. Ask for a custom site or the default CRM to continue.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['teams','profiles','audit_log','brokers','targets','settings','leads','notifications','assignments',
    'activities','follow_ups','sessions','kyc_profiles','documents','deposits','feed_events','team_prizes',
    'rank_snapshots','export_history'] loop
    -- The aa_ prefix makes this run before every other trigger on the table.
    execute format('create trigger aa_workspace_row before insert or update or delete on public.%I
                    for each row execute function private.workspace_row()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Workspace-scoped views for the security-definer functions
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['teams','profiles','audit_log','brokers','targets','settings','leads','notifications','assignments',
    'activities','follow_ups','sessions','kyc_profiles','documents','deposits','feed_events','team_prizes',
    'rank_snapshots','export_history'] loop
    execute format(
      'create view private.ws_%I as select * from public.%I where workspace_id = (select private.current_workspace_id())',
      t, t);
    execute format('revoke all on private.ws_%I from public, anon, authenticated', t);
  end loop;
end $$;

create or replace view public.profiles_public
with (security_invoker = false)
as
  select id, full_name, photo_url, role, team_id from public.profiles
   where workspace_id = (select private.current_workspace_id());

-- ---------------------------------------------------------------------------
-- Functions the service role calls without a signed-in user: they take the workspace explicitly
-- ---------------------------------------------------------------------------
drop function public.existing_lead_phones(text[]);
create function public.existing_lead_phones(p_workspace uuid, phones text[])
returns setof text
language sql stable security definer set search_path = ''
as $$
  select l.phone from public.leads l where l.workspace_id = p_workspace and l.phone = any(phones)
$$;
revoke execute on function public.existing_lead_phones(uuid, text[]) from public, anon, authenticated;
grant execute on function public.existing_lead_phones(uuid, text[]) to service_role;

drop function public.lead_with_cnic(text);
create function public.lead_with_cnic(p_workspace uuid, p_cnic text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select k.lead_id from public.kyc_profiles k where k.workspace_id = p_workspace and k.cnic_number = p_cnic
$$;
revoke execute on function public.lead_with_cnic(uuid, text) from public, anon, authenticated;
grant execute on function public.lead_with_cnic(uuid, text) to service_role;

-- Referral overdue alerts: each session is checked against its own workspace's deadline and its own admins.
create or replace function public.run_referral_sweep()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  a record;
  alerted integer := 0;
begin
  for r in
    select s.id, s.workspace_id, l.id as lead_id, l.full_name,
           coalesce((select (st.value)::int from public.settings st
                      where st.workspace_id = s.workspace_id and st.key = 'referral_deadline_hours'), 24) as hours,
           s.created_at
      from public.sessions s join public.leads l on l.id = s.lead_id
     where s.handed_back_at is null and s.cancelled_at is null and s.scheduled_at is null
       and s.deadline_alerted_at is null
  loop
    continue when r.created_at >= now() - make_interval(hours => r.hours);
    for a in select id from public.profiles
              where workspace_id = r.workspace_id and role in ('admin', 'superadmin') and is_active loop
      perform private.notify(a.id, 'referral_overdue',
        format('The referral for %s has no session date after %s hours.', split_part(r.full_name, ' ', 1), r.hours),
        '/lead/' || r.lead_id::text);
    end loop;
    update public.sessions set deadline_alerted_at = now() where id = r.id;
    alerted := alerted + 1;
  end loop;
  return alerted;
end;
$$;

-- Daily rank snapshot, one workspace at a time.
create or replace function public.take_rank_snapshot()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Karachi')::date;
  m_from timestamptz := private.karachi_month_start()::timestamp at time zone 'Asia/Karachi';
  n integer := 0;
  c integer;
  w uuid;
begin
  delete from public.rank_snapshots where snapshot_date = today;
  for w in select id from public.workspaces loop
    insert into public.rank_snapshots (workspace_id, board, subject_id, rank, total_pkr, snapshot_date)
    select w, 'teams', x.team_id, x.rank, x.total_pkr, today
      from (
        select (row_number() over (order by coalesce(s.total, 0) desc, s.reached asc nulls last, tm.name))::integer as rank,
               tm.id as team_id, coalesce(s.total, 0)::bigint as total_pkr
          from public.teams tm
          left join (select team_id, sum(amount_pkr) as total, max(verified_at) as reached from public.deposits
                      where workspace_id = w and status = 'verified' and verified_at >= m_from group by team_id) s on s.team_id = tm.id
         where tm.workspace_id = w and tm.is_active) x;
    get diagnostics c = row_count; n := n + c;

    insert into public.rank_snapshots (workspace_id, board, subject_id, rank, total_pkr, snapshot_date)
    select w, 'agents', x.id, x.rank, x.total, today from (
      select (row_number() over (order by coalesce(s.total, 0) desc, s.reached asc nulls last, p.full_name))::integer as rank,
             p.id, coalesce(s.total, 0)::bigint as total
        from public.profiles p
        left join (select agent_id, sum(amount_pkr) as total, max(verified_at) as reached from public.deposits
                    where workspace_id = w and status = 'verified' and verified_at >= m_from group by agent_id) s on s.agent_id = p.id
       where p.workspace_id = w and ((p.role = 'agent' and p.is_active) or s.total is not null)) x;
    get diagnostics c = row_count; n := n + c;

    insert into public.rank_snapshots (workspace_id, board, subject_id, rank, total_pkr, snapshot_date)
    select w, 'analysts', x.id, x.rank, x.total, today from (
      select (row_number() over (order by coalesce(s.total, 0) desc, s.reached asc nulls last, p.full_name))::integer as rank,
             p.id, coalesce(s.total, 0)::bigint as total
        from public.profiles p
        left join (select credited_analyst_id as aid, sum(amount_pkr) as total, max(verified_at) as reached from public.deposits
                    where workspace_id = w and status = 'verified' and credited_analyst_id is not null and verified_at >= m_from
                    group by credited_analyst_id) s on s.aid = p.id
       where p.workspace_id = w and p.role = 'analyst' and (p.is_active or s.total is not null)) x;
    get diagnostics c = row_count; n := n + c;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Every other security-definer function bypasses row-level security, so each one is re-created with its
-- reads going through the workspace-scoped views (private.ws_*) instead of the raw tables. The bodies are
-- taken from the database itself, so this stays correct whatever the earlier migrations defined.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  def text;
  scoped text;
  n integer := 0;
  tabs constant text := 'teams|profiles|audit_log|brokers|targets|settings|leads|notifications|assignments|activities|follow_ups|sessions|kyc_profiles|documents|deposits|feed_events|team_prizes|rank_snapshots|export_history';
  -- Functions that must keep reading the raw tables: they run without a signed-in user, are the helpers
  -- the views themselves depend on, or were written above to name the workspace explicitly.
  leave_alone constant text[] := array[
    'private.current_app_role', 'private.current_team_id', 'private.current_workspace_id', 'private.is_trial_workspace',
    'private.has_aal2', 'private.workspace_row', 'private.seed_workspace_settings', 'private.notify', 'private.audit',
    'private.stamp_last_contact', 'private.deposits_feed',
    'public.admin_end_sessions', 'public.run_follow_up_sweep', 'public.run_referral_sweep', 'public.take_rank_snapshot',
    'public.existing_lead_phones', 'public.lead_with_cnic'
  ];
begin
  for f in
    select p.oid, n.nspname || '.' || p.proname as full_name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prosecdef and p.prokind = 'f'
       and (n.nspname || '.' || p.proname) <> all (leave_alone)
  loop
    def := pg_get_functiondef(f.oid);
    -- Reads go through the workspace views. Deletes stay on the table (the row trigger guards them).
    scoped := regexp_replace(def, '\m(from|join)(\s+)public\.(' || tabs || ')\M', '\1\2private.ws_\3', 'gi');
    scoped := regexp_replace(scoped, '(delete\s+from\s+)private\.ws_', '\1public.', 'gi');
    if scoped <> def then
      execute scoped;
      n := n + 1;
    end if;
  end loop;
  raise notice 'Scoped % security-definer functions to the caller''s workspace.', n;
end $$;

-- ---------------------------------------------------------------------------
-- Workspace actions
-- ---------------------------------------------------------------------------
-- Sign-up: a demo workspace with its owner and default settings. Called by the server with the service role.
create function public.provision_workspace(p_user uuid, p_email text, p_full_name text, p_company text, p_trial_days integer default 14)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  ws uuid;
begin
  insert into public.workspaces (name, plan, trial_ends_at)
  values (btrim(p_company), 'trial', now() + make_interval(days => p_trial_days))
  returning id into ws;

  insert into public.profiles (id, full_name, email, role, workspace_id)
  values (p_user, btrim(p_full_name), lower(p_email), 'superadmin', ws);

  perform private.seed_workspace_settings(ws);
  insert into public.audit_log (workspace_id, user_id, action, entity, entity_id, meta)
  values (ws, p_user, 'workspace.create', 'workspace', ws::text, jsonb_build_object('plan', 'trial', 'days', p_trial_days));
  return ws;
end;
$$;
revoke execute on function public.provision_workspace(uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.provision_workspace(uuid, text, text, text, integer) to service_role;

-- A demo owner starts the default CRM.
create function public.choose_default_crm()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  ws uuid := private.current_workspace_id();
begin
  if not private.is_superadmin() then
    raise exception 'Only the workspace owner can choose.' using errcode = '42501';
  end if;
  update public.workspaces set product = 'crm' where id = ws and product is null;
  perform private.audit('workspace.choose_crm', 'workspace', ws::text, '{}'::jsonb);
end;
$$;

-- Client workspaces pick their own name and colours. Demo workspaces keep the QuantraPro look.
create function public.update_workspace_branding(p_name text, p_theme jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  ws public.workspaces;
begin
  if not private.is_superadmin() then
    raise exception 'Only the Superadmin changes branding.' using errcode = '42501';
  end if;
  select * into ws from public.workspaces where id = private.current_workspace_id();
  if ws.plan <> 'client' then
    raise exception 'Custom colours are part of a client workspace. Ask us to upgrade you.' using errcode = '42501';
  end if;
  update public.workspaces
     set name = coalesce(nullif(btrim(p_name), ''), name),
         theme = p_theme
   where id = ws.id;
  perform private.audit('workspace.branding', 'workspace', ws.id::text, jsonb_build_object('theme', p_theme));
end;
$$;

revoke execute on function public.choose_default_crm(), public.update_workspace_branding(text, jsonb) from public, anon;
grant execute on function public.choose_default_crm(), public.update_workspace_branding(text, jsonb) to authenticated;

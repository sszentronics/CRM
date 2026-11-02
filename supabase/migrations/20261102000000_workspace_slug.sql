-- A short address per workspace, so each company has its own branded sign-in page at /c/<slug>.
alter table public.workspaces
  add column slug text unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');

update public.workspaces set slug = 'trading-labs' where id = '00000000-0000-4000-8000-000000000001';

-- Sign-up now picks a unique slug from the company name ("Acme Trading" becomes acme-trading, then acme-trading-2).
create or replace function public.provision_workspace(p_user uuid, p_email text, p_full_name text, p_company text, p_trial_days integer default 14)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  ws uuid;
  base text;
  candidate text;
  n integer := 1;
begin
  base := trim(both '-' from regexp_replace(lower(btrim(p_company)), '[^a-z0-9]+', '-', 'g'));
  base := left(base, 32);
  base := trim(both '-' from base);
  if char_length(base) < 3 then
    base := 'company';
  end if;
  candidate := base;
  while exists (select 1 from public.workspaces w where w.slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;

  insert into public.workspaces (name, slug, plan, trial_ends_at)
  values (btrim(p_company), candidate, 'trial', now() + make_interval(days => p_trial_days))
  returning id into ws;

  insert into public.profiles (id, full_name, email, role, workspace_id)
  values (p_user, btrim(p_full_name), lower(p_email), 'superadmin', ws);

  perform private.seed_workspace_settings(ws);
  insert into public.audit_log (workspace_id, user_id, action, entity, entity_id, meta)
  values (ws, p_user, 'workspace.create', 'workspace', ws::text, jsonb_build_object('plan', 'trial', 'days', p_trial_days, 'slug', candidate));
  return ws;
end;
$$;

-- Module 4: workload counts for the distribution and assignment screens.
-- Security invoker: callers only count leads their row-level security lets them see.

create function public.team_workload()
returns table (team_id uuid, open_leads bigint, unassigned_leads bigint)
language sql stable security invoker set search_path = ''
as $$
  select l.team_id,
         count(*) filter (where private.is_open_stage(l.stage)),
         count(*) filter (where private.is_open_stage(l.stage) and l.agent_id is null)
    from public.leads l
   where l.team_id is not null
   group by l.team_id
$$;

create function public.agent_workload(p_team_id uuid)
returns table (agent_id uuid, open_leads bigint, assigned_today bigint)
language sql stable security invoker set search_path = ''
as $$
  select l.agent_id,
         count(*) filter (where private.is_open_stage(l.stage)),
         count(*) filter (where l.agent_assigned_at >= date_trunc('day', now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi')
    from public.leads l
   where l.team_id = p_team_id and l.agent_id is not null
   group by l.agent_id
$$;

revoke execute on function public.team_workload() from public, anon;
revoke execute on function public.agent_workload(uuid) from public, anon;
grant execute on function public.team_workload() to authenticated;
grant execute on function public.agent_workload(uuid) to authenticated;

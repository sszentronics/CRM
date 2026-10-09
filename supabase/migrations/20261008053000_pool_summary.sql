-- Module 4: pool counts by source, counted in the database (API responses are capped at 1,000 rows).
create function public.pool_summary()
returns table (source text, leads bigint)
language sql stable security invoker set search_path = ''
as $$
  select l.source, count(*)
    from public.leads l
   where l.team_id is null and l.stage = 'new'
   group by l.source
   order by count(*) desc, l.source
$$;

revoke execute on function public.pool_summary() from public, anon;
grant execute on function public.pool_summary() to authenticated;

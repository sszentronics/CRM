-- Module 0: the database is reachable and the RLS guard is in place from day one.
begin;
select plan(2);

select has_extension('pgtap', 'pgTAP is installed for database tests');

-- BUILD.md rule 1: every table in public has RLS. Module 12 keeps this test.
select is_empty(
  $$ select c.relname
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and not c.relrowsecurity $$,
  'every table in public has row-level security enabled'
);

select * from finish();
rollback;

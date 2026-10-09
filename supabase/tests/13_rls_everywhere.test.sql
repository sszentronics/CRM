-- Module 12: no table in public may ship without row-level security.
begin;
select plan(3);

select is(
  (select count(*)::int from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0, 'every table in public has row-level security enabled');

select is(
  (select string_agg(c.relname, ', ') from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  null, 'and the list of tables without it is empty');

-- Nothing in public is readable by the anonymous role.
select is(
  (select count(*)::int from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.grantee = 'anon' and g.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')),
  0, 'the anonymous role holds no table privileges in public');

select * from finish();
rollback;

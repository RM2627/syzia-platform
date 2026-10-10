-- Read-only inventory after migrations 004 and 005. No changes or grants.
begin read only;
select c.relname,c.relrowsecurity,c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by c.relname;
select tablename,policyname,cmd,roles,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname;
select p.proname,pg_get_function_identity_arguments(p.oid) arguments,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and (p.proname like 'company_%' or p.proname like 'valid_%') order by n.nspname,p.proname;
select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') order by table_name,grantee,privilege_type;
select conrelid::regclass table_name,conname,pg_get_constraintdef(oid) definition from pg_constraint where connamespace='public'::regnamespace order by conrelid::regclass::text,conname;
rollback;

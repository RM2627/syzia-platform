-- Read-only inventory. Run in the dedicated Supabase test project's SQL Editor.
begin read only;
select current_database() as database_name,version() as postgres_version;
select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('profiles','platform_roles','organizations','organization_members','attendant_organizations','audit_logs') order by 1;
select tablename,policyname,cmd,roles,qual,with_check from pg_policies
where schemaname='public' and tablename in ('profiles','platform_roles','organizations','organization_members','attendant_organizations','audit_logs') order by 1;
select n.nspname,p.proname,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname like 'foundation_%') or (n.nspname='private' and p.proname in ('lock_authorize','require_eligible_user')) order by 1,2;
select table_name,privilege_type,grantee from information_schema.role_table_grants
where table_schema='public' and grantee in ('anon','authenticated') and table_name in ('profiles','platform_roles','organizations','organization_members','attendant_organizations','audit_logs') order by 1,2,3;
select conrelid::regclass as table_name,conname,pg_get_constraintdef(oid) as definition from pg_constraint
where conrelid in ('public.profiles'::regclass,'public.platform_roles'::regclass,'public.organizations'::regclass,'public.organization_members'::regclass,'public.attendant_organizations'::regclass,'public.audit_logs'::regclass) order by 1,2;
select indexname,indexdef from pg_indexes where schemaname='public' and indexname='attendant_one_primary_idx';
commit;

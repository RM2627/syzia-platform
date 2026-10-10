-- READ ONLY. Run manually in the owner's dedicated environment after 027.
-- Aggregate diagnostics only; does not return secrets or mutate state.
select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='private' and c.relname in ('organization_retention','organization_creation_requests','access_deliveries');
select state,count(*) from private.enterprise_accounts group by state order by state;
select state,code,count(*) from private.access_deliveries group by state,code order by state,code;
select count(*) as organizations_without_administrator from public.organizations o where not exists(
 select 1 from public.organization_members m where m.organization_id=o.id and m.role='admin_empresa' and m.status='active');
select p.proname,has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
('access_create_organization','access_organizations','access_delete_organization','foundation_global_audit','access_reserve','access_reserve_026','access_team','access_team_026','access_delivery_prepare','access_delivery_finish') order by p.proname;
select conname,pg_get_constraintdef(oid) from pg_constraint where conrelid='public.audit_logs'::regclass and conname='audit_logs_organization_id_fkey';

-- READ ONLY: inspect after 026. No Auth credentials, hashes, contact addresses or tokens.
select schemaname,tablename,policyname,roles,cmd from pg_policies where tablename='legal_documents';
select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relname in ('access_policy','enterprise_codes','enterprise_accounts','access_enforced_users','enterprise_sessions','access_limits','legal_documents','legal_acceptances');
select p.proname,pg_get_function_identity_arguments(p.oid) arguments,p.prosecdef security_definer,p.proacl grants from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'access_%' order by 1;
select 'organizations' object,count(*) from public.organizations union all select 'memberships',count(*) from public.organization_members union all select 'auth_users',count(*) from auth.users union all select 'invitations_history',count(*) from public.organization_invitations union all select 'enterprise_accounts',count(*) from private.enterprise_accounts;
select state,count(*) from private.enterprise_accounts group by state;
select idle_seconds,warning_seconds,code_hours,max_attempts from private.access_policy;
select kind,version,acceptance_version,is_draft,current from public.legal_documents order by kind,created_at;
select count(*) institutional_acceptances from private.legal_acceptances;

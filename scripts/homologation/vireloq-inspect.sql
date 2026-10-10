-- Read-only; dedicated environment only. Does not list emails or tokens.
begin read only;
select relname,relrowsecurity,relforcerowsecurity from pg_class where oid='public.organization_invitations'::regclass;
select policyname,roles,cmd from pg_policies where schemaname='public' and tablename='organization_invitations';
select proname,proconfig,has_function_privilege('anon',oid,'EXECUTE') anon_execute,has_function_privilege('authenticated',oid,'EXECUTE') authenticated_execute,has_function_privilege('service_role',oid,'EXECUTE') service_execute from pg_proc where pronamespace='public'::regnamespace and proname in ('foundation_invite','foundation_provision_organization','foundation_accept_invitation','foundation_revoke_invitation','foundation_claim_invitation_delivery','foundation_finish_invitation_delivery');
select conname,pg_get_constraintdef(oid) from pg_constraint where conrelid='public.organization_invitations'::regclass;
select column_name,data_type from information_schema.columns where table_schema='public' and table_name='organizations' and column_name='activated_at';
commit;

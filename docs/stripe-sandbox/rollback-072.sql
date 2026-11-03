-- Optional structural rollback, OWNER ONLY, not executed by the development agent.
-- First retain any necessary existing Sandbox contract organizations in the allowlist
-- and disable general scope through billing072_configure_sandbox(false).
-- Retain all contracts, history, audit records and historical migration files.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_advisory_xact_lock(734921501);
do $$begin
 if (select test_all_organizations from private.billing069_runtime where singleton) is distinct from false then
  raise exception 'billing072_disable_general_before_rollback';
 end if;
end;$$;
do $$declare target text;old_ text;new_ text;expected integer;definition text;begin
 for target,old_,new_,expected in select * from (values
  ('public.billing069_context_pre071(uuid)',
   $old$private.billing072_organization_allowed(p_org,r)$old$,
   $new$r.environment='production' or p_org=any(r.test_organizations)$new$,1),
  ('public.billing069_prepare_pre071(uuid,text,uuid,boolean,boolean)',
   $old$(not private.billing072_organization_allowed(p_org,r))$old$,
   $new$(r.environment='test' and not p_org=any(r.test_organizations))$new$,1),
  ('public.billing069_service(text,uuid,jsonb)',
   $old$(not private.billing072_organization_allowed(c.organization_id,r))$old$,
   $new$(s.environment='test' and not c.organization_id=any(r.test_organizations))$new$,2)
 )as changes(target,old_,new_,expected) loop
  definition=pg_get_functiondef(target::regprocedure);
  if (length(definition)-length(replace(definition,old_,'')))/length(old_)<>expected then
   raise exception 'billing072_rollback_predecessor_mismatch';
  end if;
  execute replace(definition,old_,new_);
 end loop;
end;$$;
drop function public.billing072_configure_sandbox(boolean);
drop function private.billing072_organization_allowed(uuid,private.billing069_runtime);
alter table private.billing069_runtime drop column test_all_organizations;
insert into private.billing047_audit(event)values('stripe_sandbox_scope_072_rolled_back');
commit;

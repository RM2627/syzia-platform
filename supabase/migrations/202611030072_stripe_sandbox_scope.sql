-- Explicit Sandbox scope only. Existing checkout/confirmation switches stay unchanged.
-- Apply once, after 071. A changed predecessor or duplicate application fails atomically.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_advisory_xact_lock(734921501);

alter table private.billing069_runtime
 add column test_all_organizations boolean not null default false;

-- Scope predicate, NOT authentication or eligibility. Callers retain those checks.
-- Use the caller's locked runtime snapshot; never accept browser-supplied runtime.
create function private.billing072_organization_allowed(p_org uuid,p_runtime private.billing069_runtime)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(p_org is not null and (
  p_runtime.environment='production' or
  (p_runtime.environment='test' and
   (p_runtime.test_all_organizations or p_org=any(p_runtime.test_organizations)))
 ),false);
$$;
revoke all on function private.billing072_organization_allowed(uuid,private.billing069_runtime)
 from public,anon,authenticated,service_role;

-- Retain the 071 wrappers and every financial check around these exact expressions.
-- A predecessor assertion prevents silently patching a different implementation.
do $$declare target text;old_ text;new_ text;expected integer;definition text;begin
 for target,old_,new_,expected in select * from (values
  ('public.billing069_context_pre071(uuid)',
   $old$r.environment='production' or p_org=any(r.test_organizations)$old$,
   $new$private.billing072_organization_allowed(p_org,r)$new$,1),
  ('public.billing069_prepare_pre071(uuid,text,uuid,boolean,boolean)',
   $old$(r.environment='test' and not p_org=any(r.test_organizations))$old$,
   $new$(not private.billing072_organization_allowed(p_org,r))$new$,1),
  ('public.billing069_service(text,uuid,jsonb)',
   $old$(s.environment='test' and not c.organization_id=any(r.test_organizations))$old$,
   $new$(not private.billing072_organization_allowed(c.organization_id,r))$new$,2)
 )as changes(target,old_,new_,expected) loop
  definition=pg_get_functiondef(target::regprocedure);
  if (length(definition)-length(replace(definition,old_,'')))/length(old_)<>expected then
   raise exception 'billing072_predecessor_mismatch';
  end if;
  execute replace(definition,old_,new_);
 end loop;
end;$$;

-- Owner-operated administrative RPC, same service-only boundary as billing069_configure.
-- No browser grant, no new HTTP route, no modification of mappings or contracts.
create function public.billing072_configure_sandbox(p_all_organizations boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.billing069_runtime;begin
 perform pg_advisory_xact_lock(734921501);
 if p_all_organizations is null then raise exception 'billing_configuration_invalid';end if;
 select * into strict r from private.billing069_runtime where singleton for update;
 if p_all_organizations and r.environment<>'test' then raise exception 'billing_environment_mismatch';end if;
 if r.test_all_organizations is distinct from p_all_organizations then
  update private.billing069_runtime set test_all_organizations=p_all_organizations where singleton;
  insert into private.billing047_audit(event)values(
   case when p_all_organizations then 'stripe_sandbox_general_enabled' else 'stripe_sandbox_restricted_enabled' end);
 end if;
 return jsonb_build_object('environment',r.environment,'test_all_organizations',p_all_organizations,
  'allowlist_count',cardinality(r.test_organizations));
end;$$;
revoke all on function public.billing072_configure_sandbox(boolean) from public,anon,authenticated,service_role;
grant execute on function public.billing072_configure_sandbox(boolean) to service_role;
commit;

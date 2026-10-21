-- HF01: corrective SQL for subsequent owner review/authorization only.
-- NOT part of automatic startup. Do not reapply migration 055.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
select pg_advisory_xact_lock(734921501);
select pg_advisory_xact_lock(734921554);
do $hf01$
declare
  definition text;
  old_query constant text := 'from private.commercial_materializations x join private.billing047_contracts b on b.organization_id=x.organization_id and b.current where x.state=''pending''and b.provider_id is not null and b.state in(''trialing'',''active'')';
  new_query constant text := 'from private.commercial_materializations x join private.billing047_contracts pending_billing on pending_billing.organization_id=x.organization_id and pending_billing.current where x.state=''pending''and pending_billing.provider_id is not null and pending_billing.state in(''trialing'',''active'')';
begin
  select pg_get_functiondef('public.commercial_materialization_service(text,uuid,jsonb)'::regprocedure) into definition;
  if strpos(definition, old_query) = 0 and strpos(definition, new_query) > 0 then return; end if;
  if (length(definition)-length(replace(definition,old_query,''))) <> length(old_query)
     or strpos(definition,new_query) > 0 then raise exception 'hf01_definition_unexpected'; end if;
  -- Recreate the exact existing definition, changing only the conflicting alias.
  -- Ownership, SECURITY DEFINER, search_path and existing grants are preserved.
  execute replace(definition,old_query,new_query);
end;
$hf01$;
commit;

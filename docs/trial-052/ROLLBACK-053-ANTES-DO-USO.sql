-- LOCAL/OWNER PROCEDURE ONLY. Never delete history to satisfy this guard.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
select pg_advisory_xact_lock(734921501);
lock table private.billing047_contracts in access exclusive mode;
do $$begin
 if exists(select 1 from private.billing047_contracts where provider_modified_at is not null or lease_until>clock_timestamp())
 or exists(select 1 from private.trial_audit where action='request_automatically_resolved') then
 raise exception 'billing053_rollback_requires_forward_repair';end if;
end;$$;
drop function public.billing047_service(text,uuid,jsonb);
alter function public.billing047_service_pre053(text,uuid,jsonb) rename to billing047_service;
grant execute on function public.billing047_service(text,uuid,jsonb) to service_role;
drop function public.billing047_service_pre052(text,uuid,jsonb);
alter function public.billing047_service_core_pre053(text,uuid,jsonb) rename to billing047_service_pre052;
drop function public.billing047_context(uuid);
alter function public.billing047_context_pre053(uuid) rename to billing047_context;
grant execute on function public.billing047_context(uuid) to authenticated;
drop function private.billing051_eligibility(uuid,uuid);
alter function private.billing051_eligibility_pre053(uuid,uuid) rename to billing051_eligibility;
drop function private.trial_eligibility(uuid);
alter function private.trial_eligibility_pre053(uuid) rename to trial_eligibility;
drop function private.selfservice_eligibility(uuid,text,bytea);
alter function private.selfservice_eligibility_pre053(uuid,text,bytea) rename to selfservice_eligibility;
drop function private.selfservice_projection(uuid);
alter function private.selfservice_projection_pre053(uuid) rename to selfservice_projection;
drop function private.document_normalize(text,text);
alter function private.document_normalize_pre053(text,text) rename to document_normalize;
alter table private.billing047_contracts drop column provider_modified_at,drop column provider_version_observed,drop column provider_resource_fingerprint;
commit;

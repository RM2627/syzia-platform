-- Somente antes de utilizar a atualização. Nunca apagar evidências ou vínculos novos.
-- Parar os processos da API antes da execução pelo proprietário.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
select pg_advisory_xact_lock(734921501);
lock table private.billing047_contracts,private.billing051_identity_evidence in access exclusive mode;
do $$begin
 if exists(select 1 from private.billing051_identity_evidence)
 or exists(select 1 from private.billing047_contracts where provider_payer_id is not null or validation_check is not null or method_started or method_before_card is not null or method_last_four is not null or lease_until>clock_timestamp()) then
 raise exception 'billing_rollback_requires_forward_repair';
 end if;
end;$$;
drop function public.billing051_verify_identity(uuid,text,text,text,boolean);
drop function public.billing_trial_verify(uuid,text,text,text,text,boolean);
alter function public.billing_trial_verify_pre052(uuid,text,text,text,text,boolean) rename to billing_trial_verify;
grant execute on function public.billing_trial_verify(uuid,text,text,text,text,boolean) to authenticated;
drop function public.billing047_prepare(uuid,text,uuid,uuid,boolean);
alter function public.billing047_prepare_pre052(uuid,text,uuid,uuid,boolean) rename to billing047_prepare;
grant execute on function public.billing047_prepare(uuid,text,uuid,uuid,boolean) to authenticated;
drop function public.billing047_service(text,uuid,jsonb);
alter function public.billing047_service_pre052(text,uuid,jsonb) rename to billing047_service;
grant execute on function public.billing047_service(text,uuid,jsonb) to service_role;
drop function public.billing047_context(uuid);
alter function public.billing047_context_pre052(uuid) rename to billing047_context;
grant execute on function public.billing047_context(uuid) to authenticated;
drop function private.billing051_eligibility(uuid,uuid);
drop table private.billing051_identity_evidence;
alter table private.billing047_contracts drop column validation_check,drop column provider_payer_id,drop column method_started,drop column method_before_card,drop column method_last_four;
commit;

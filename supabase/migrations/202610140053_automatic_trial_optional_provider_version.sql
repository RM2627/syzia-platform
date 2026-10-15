-- SYZIA 052: approved automatic eligibility and optional remote version.
-- Historical migrations 001–052 remain unchanged. No remote operations here.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
select pg_advisory_xact_lock(734921501);

alter function private.document_normalize(text,text) rename to document_normalize_pre053;
create function private.document_normalize(p_kind text,p_document text) returns text
language plpgsql immutable set search_path='' as $$begin
 if p_kind='CPF' and (p_document is null or btrim(p_document)!~'^([0-9]{11}|[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2})$') then return null;end if;
 return private.document_normalize_pre053(p_kind,p_document);
end;$$;
revoke all on function private.document_normalize(text,text),private.document_normalize_pre053(text,text) from public,anon,authenticated,service_role;

alter function private.billing051_eligibility(uuid,uuid) rename to billing051_eligibility_pre053;
create function private.billing051_eligibility(p_org uuid,p_contract uuid default null) returns text
language plpgsql stable security definer set search_path='' as $$begin
 if exists(select 1 from private.trial_grants where organization_id=p_org) then return 'previous_grant';end if;
 if exists(select 1 from private.trial_current_claims(p_org) x join private.trial_consumed_keys c using(kind,fingerprint))
 or exists(select 1 from private.trial_current_claims(p_org) x join private.trial_claims c using(kind,fingerprint))
 or exists(select 1 from private.trial_current_claims(p_org) x join private.billing047_trial_reservations r using(kind,fingerprint) where r.contract_id is distinct from p_contract)
 then return 'previous_identity';end if;
 if exists(select 1 from private.trial_requests where organization_id=p_org and state='denied') then return 'previous_review';end if;
 if exists(select 1 from private.trial_identifiers where organization_id=p_org and kind in('business','responsible') group by kind having count(distinct fingerprint)>1) then return 'identity_conflict';end if;
 -- Known entrypoints validate the document before storing its salted fingerprint.
 -- This is structural consistency, not identity proof. No evidence is fabricated.
 if not exists(select 1 from private.trial_identifiers i where i.organization_id=p_org and i.kind in('business','responsible') and (
 i.evidence_ref in('self_declared_structure_030','self_declared_structure_033','self_declared_structure_040','self_declared_structure_047')
 or exists(select 1 from private.billing051_identity_evidence e where e.organization_id=i.organization_id and e.kind=i.kind and e.fingerprint=i.fingerprint)
 or (i.evidence_ref not like 'self_declared_%' and exists(select 1 from private.trial_audit a where a.organization_id=i.organization_id and a.actor_id=i.verified_by and a.action='identifier_verified' and a.details->>'kind'=i.kind and a.details->>'evidence_ref'=i.evidence_ref))
 )) then return 'verification_required';end if;
 return 'eligible';
end;$$;
revoke all on function private.billing051_eligibility(uuid,uuid),private.billing051_eligibility_pre053(uuid,uuid) from public,anon,authenticated,service_role;

-- Legacy mock policy remains available to historical demo/test flows. Commercial
-- subscriptions follow the newly approved product policy, not a manual queue.
alter function private.trial_eligibility(uuid) rename to trial_eligibility_pre053;
create function private.trial_eligibility(p_org uuid) returns text
language plpgsql stable security definer set search_path='' as $$begin
 if (select mock_enabled from private.billing_runtime) then return private.trial_eligibility_pre053(p_org);end if;
 return private.billing051_eligibility(p_org);
end;$$;
revoke all on function private.trial_eligibility(uuid),private.trial_eligibility_pre053(uuid) from public,anon,authenticated,service_role;

alter function private.selfservice_eligibility(uuid,text,bytea) rename to selfservice_eligibility_pre053;
create function private.selfservice_eligibility(p_user uuid,p_kind text,p_fingerprint bytea) returns text
language plpgsql stable security definer set search_path='' as $$begin
 if (select mock_enabled from private.billing_runtime) then return private.selfservice_eligibility_pre053(p_user,p_kind,p_fingerprint);end if;
 if p_user is null or p_kind is null or p_kind not in('CPF','CNPJ') or p_fingerprint is null or octet_length(p_fingerprint)<>32 then return 'verification_required';end if;
 if exists(select 1 from private.trial_consumed_keys where (kind='account' and fingerprint=private.trial_fingerprint('account',p_user::text)) or (kind='business' and fingerprint=p_fingerprint))
 or exists(select 1 from private.trial_claims where (kind='account' and fingerprint=private.trial_fingerprint('account',p_user::text)) or (kind='business' and fingerprint=p_fingerprint))
 or exists(select 1 from private.billing047_trial_reservations where (kind='account' and fingerprint=private.trial_fingerprint('account',p_user::text)) or (kind='business' and fingerprint=p_fingerprint)) then return 'previous_identity';end if;
 if exists(select 1 from private.trial_requests where actor_id=p_user and state='denied') then return 'previous_review';end if;
 return 'eligible';
end;$$;
revoke all on function private.selfservice_eligibility(uuid,text,bytea),private.selfservice_eligibility_pre053(uuid,text,bytea) from public,anon,authenticated,service_role;

-- Re-evaluate old saved drafts on read; do not require the document again or
-- overwrite historical submissions, revision, consent or quote expiration.
alter function private.selfservice_projection(uuid) rename to selfservice_projection_pre053;
create function private.selfservice_projection(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb;d private.selfservice_drafts;why text;begin
 r=private.selfservice_projection_pre053(p_id);
 if r is null or (select mock_enabled from private.billing_runtime) then return r;end if;
 select * into d from private.selfservice_drafts where id=p_id;
 if d.state in('completed','cancelled') or d.eligibility not in('manual_policy','verification_required','eligible','previous_identity') then return r;end if;
 why=private.selfservice_eligibility(d.user_id,d.document_kind,d.identity_fingerprint);
 return r||jsonb_build_object('eligibility',why,'state',case when why='eligible' then 'ready' when why='previous_identity' then 'ineligible' else 'review' end);
end;$$;
revoke all on function private.selfservice_projection(uuid),private.selfservice_projection_pre053(uuid) from public,anon,authenticated,service_role;

alter table private.billing047_contracts
 add column provider_modified_at timestamptz,
 add column provider_version_observed boolean not null default false,
 add column provider_resource_fingerprint text check(provider_resource_fingerprint ~ '^[a-f0-9]{64}$');

-- Retain the exact prior implementation for a guarded pre-use rollback. Patch
-- only the assignment: -1 is the existing internal "never observed" sentinel;
-- an absent remote version preserves the last known counter, never invents zero.
alter function public.billing047_service_pre052(text,uuid,jsonb) rename to billing047_service_core_pre053;
revoke all on function public.billing047_service_core_pre053(text,uuid,jsonb) from public,anon,authenticated,service_role;
do $$declare d text;old_ text;begin
 d=pg_get_functiondef('public.billing047_service_core_pre053(text,uuid,jsonb)'::regprocedure);
 d=replace(d,'FUNCTION public.billing047_service_core_pre053(','FUNCTION public.billing047_service_pre052(');
 old_=$q$provider_version=(p_data->>'version')::bigint$q$;
 if (length(d)-length(replace(d,old_,'')))/length(old_)<>1 then raise exception 'billing053_unexpected_predecessor';end if;
 d=replace(d,old_,$q$provider_version=coalesce((p_data->>'version')::bigint,c.provider_version)$q$);
 -- A fresh valid read must clear a previously recorded reconciliation error;
 -- an identical fingerprint alone must not preserve a stale error forever.
 old_=$q$and c.error_code is distinct from 'billing_members_exceeded'then$q$;
 if (length(d)-length(replace(d,old_,'')))/length(old_)<>1 then raise exception 'billing053_unexpected_predecessor';end if;
 d=replace(d,old_,$q$and c.error_code is null then$q$);
 execute d;
end;$$;
revoke all on function public.billing047_service_pre052(text,uuid,jsonb) from public,anon,authenticated,service_role;

alter function public.billing047_service(text,uuid,jsonb) rename to billing047_service_pre053;
revoke all on function public.billing047_service_pre053(text,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.billing047_service(p_action text,p_id uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.billing047_contracts;r jsonb;modified_ timestamptz;fingerprint_ text;version_ bigint;request_ uuid;begin
 if p_action not in('apply','validate_snapshot') then return public.billing047_service_pre053(p_action,p_id,p_data);end if;
 perform pg_advisory_xact_lock(734921501);
 select * into c from private.billing047_contracts where id=p_id for update;
 if c.id is null then raise exception 'billing_binding_missing';end if;
 if c.lease is distinct from (p_data->>'lease')::uuid or c.lease_until<=clock_timestamp() then raise exception 'billing_lease_conflict';end if;
 if p_data ? 'version' then
 if jsonb_typeof(p_data->'version') is distinct from 'number' or (p_data->>'version')!~'^[0-9]+$' or (p_data->>'version')::numeric>9007199254740991 then raise exception 'billing_response_invalid';end if;
 version_=(p_data->>'version')::bigint;
 if version_<c.provider_version then raise exception 'billing_stale_snapshot';end if;
 end if;
 if jsonb_typeof(p_data->'modified_at') is distinct from 'string' then raise exception 'billing_response_invalid';end if;
 modified_=(p_data->>'modified_at')::timestamptz;
 if not isfinite(modified_) then raise exception 'billing_response_invalid';end if;
 -- Payments have independent official timestamps and idempotency. The resource
 -- fingerprint covers subscription facts only, excluding transport/source data.
 fingerprint_=encode(sha256(convert_to(jsonb_build_object(
 'provider_id',p_data->'provider_id','payer',p_data->'payer_reference','state',p_data->'state',
 'card',p_data->'card_reference','method',p_data->'method_label','linked',p_data->'method_linked',
 'trial_start',p_data->'trial_start','trial_end',p_data->'trial_end',
 'next_charge',p_data->'next_charge','amount',p_data->'amount_cents')::text,'UTF8')),'hex');
 if c.provider_modified_at is not null and (modified_<c.provider_modified_at or
 (modified_=c.provider_modified_at and fingerprint_ is distinct from c.provider_resource_fingerprint and not coalesce(c.provider_version_observed and c.provider_version>=0 and version_>c.provider_version,false))) then raise exception 'billing_stale_snapshot';end if;
 if p_action='validate_snapshot' then return '{}'::jsonb;end if;
 r=public.billing047_service_pre053(p_action,p_id,p_data);
 update private.billing047_contracts set provider_modified_at=modified_,provider_version_observed=p_data ? 'version',provider_resource_fingerprint=fingerprint_ where id=p_id;
 if not c.trial_recorded and (select trial_recorded from private.billing047_contracts where id=p_id) then
 for request_ in update private.trial_requests set state='approved',revision=revision+1,
 decision_reason='Automatic eligibility and official subscription confirmed; not documentary identity proof',decided_by=null,decided_at=clock_timestamp()
 where organization_id=c.organization_id and state='pending' returning id loop
 insert into private.trial_audit(organization_id,action,details) values(c.organization_id,'request_automatically_resolved',jsonb_build_object('request',request_,'contract',c.id));
 end loop;
 end if;
 return r;
end;$$;
revoke all on function public.billing047_service(text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.billing047_service(text,uuid,jsonb) to service_role;

alter function public.billing047_context(uuid) rename to billing047_context_pre053;
revoke all on function public.billing047_context_pre053(uuid) from public,anon,authenticated,service_role;
create function public.billing047_context(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare r jsonb;c private.billing047_contracts;begin
 r=public.billing047_context_pre053(p_org); -- original authorization before projection
 select * into c from private.billing047_contracts where organization_id=p_org and current;
 return r||jsonb_build_object('eligibility',private.billing051_eligibility(p_org,c.id));
end;$$;
revoke all on function public.billing047_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.billing047_context(uuid) to authenticated;
commit;

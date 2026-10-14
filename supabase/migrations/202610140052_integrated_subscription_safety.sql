-- Complemento integrado da SYZIA 051; sequência incremental 052, sem editar 001–051.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Evidence is appended only by the existing, explicitly authorized verification RPC.
-- A self-declared identifier is a fraud claim, NOT identity proof.
create table private.billing051_identity_evidence (
 organization_id uuid not null, kind text not null check(kind in('business','responsible','phone')),
 fingerprint bytea not null check(octet_length(fingerprint)=32), actor_id uuid not null,
 evidence_ref text not null check(length(evidence_ref) between 5 and 120),
 created_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,kind,fingerprint)
);
alter table private.billing051_identity_evidence enable row level security;
alter table private.billing051_identity_evidence force row level security;
revoke all on private.billing051_identity_evidence from public,anon,authenticated,service_role;
create trigger billing051_evidence_immutable before update or delete on private.billing051_identity_evidence for each row execute function private.consumer_deny_immutable();
create trigger billing051_evidence_preserve before truncate on private.billing051_identity_evidence for each statement execute function private.consumer_deny_immutable();

alter function public.billing_trial_verify(uuid,text,text,text,text,boolean) rename to billing_trial_verify_pre052;
revoke all on function public.billing_trial_verify_pre052(uuid,text,text,text,text,boolean) from public,anon,authenticated,service_role;
create function public.billing_trial_verify(p_org uuid,p_kind text,p_value text,p_evidence text,p_reason text,p_verified boolean) returns void
language plpgsql security definer set search_path='' as $$
declare canonical text;begin
 perform public.billing_trial_verify_pre052(p_org,p_kind,p_value,p_evidence,p_reason,p_verified);
 canonical=case when p_kind='phone' then regexp_replace(p_value,'[ ()-]','','g') else upper(regexp_replace(btrim(p_value),'[ .\/-]','','g')) end;
 insert into private.billing051_identity_evidence(organization_id,kind,fingerprint,actor_id,evidence_ref)
 values(p_org,p_kind,private.trial_fingerprint(p_kind,canonical),auth.uid(),btrim(p_evidence)) on conflict do nothing;
end;$$;
revoke all on function public.billing_trial_verify(uuid,text,text,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.billing_trial_verify(uuid,text,text,text,text,boolean) to authenticated;

create function private.billing051_eligibility(p_org uuid,p_contract uuid default null) returns text
language plpgsql stable security definer set search_path='' as $$
declare policy_ private.trial_policy;k text;begin
 select * into policy_ from private.trial_policy;
 if exists(select 1 from private.trial_grants where organization_id=p_org) then return 'previous_grant';end if;
 if exists(select 1 from private.trial_current_claims(p_org) x join private.trial_consumed_keys c using(kind,fingerprint))
 or exists(select 1 from private.trial_current_claims(p_org) x join private.trial_claims c using(kind,fingerprint))
 or exists(select 1 from private.trial_current_claims(p_org) x join private.billing047_trial_reservations r using(kind,fingerprint) where r.contract_id is distinct from p_contract)
 then return 'previous_identity';end if;
 if exists(select 1 from private.trial_requests where organization_id=p_org and state='denied') then return 'previous_review';end if;
 if not policy_.auto_enabled then return 'manual_policy';end if;
 foreach k in array policy_.required_types loop
 if (select count(distinct fingerprint) from private.trial_identifiers where organization_id=p_org and kind=k)>1 then return 'identity_conflict';end if;
 if not exists(
 select 1 from private.trial_identifiers i where i.organization_id=p_org and i.kind=k and (
 exists(select 1 from private.billing051_identity_evidence e where e.organization_id=i.organization_id and e.kind=i.kind and e.fingerprint=i.fingerprint)
 or (i.evidence_ref not like 'self_declared_%' and exists(select 1 from private.trial_audit a where a.organization_id=i.organization_id and a.actor_id=i.verified_by and a.action='identifier_verified' and a.details->>'kind'=i.kind and a.details->>'evidence_ref'=i.evidence_ref))
 )) then return 'verification_required';end if;
 end loop;
 return 'eligible';
end;$$;
revoke all on function private.billing051_eligibility(uuid,uuid) from public,anon,authenticated,service_role;

alter table private.billing047_contracts
 add column validation_check text,
 add column provider_payer_id text,
 add column method_started boolean not null default false,
 add column method_before_card text,
 add column method_last_four text check(method_last_four ~ '^[0-9]{4}$');

alter function public.billing047_prepare(uuid,text,uuid,uuid,boolean) rename to billing047_prepare_pre052;
revoke all on function public.billing047_prepare_pre052(uuid,text,uuid,uuid,boolean) from public,anon,authenticated,service_role;
create function public.billing047_prepare(p_org uuid,p_action text,p_version uuid,p_key uuid,p_trial boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare c private.billing047_contracts;id_ uuid;why text;begin
 perform private.permission_require(p_org,'billing.manage');perform private.company_lock(p_org);perform pg_advisory_xact_lock(734921501);
 select * into c from private.billing047_contracts where organization_id=p_org and current for update;
 if p_action='checkout' and (c.id is null or (c.provider_state='canceled' and greatest(c.trial_end,c.paid_until,now()-interval '1 second')<=now())) then
 why=private.billing051_eligibility(p_org);
 if why in('verification_required','identity_conflict','previous_review','manual_policy') then raise exception 'trial_review_required';end if;
 if (why='eligible') is distinct from p_trial then raise exception 'billing_trial_changed';end if;
 end if;
 id_=public.billing047_prepare_pre052(p_org,p_action,p_version,p_key,p_trial);
 if p_action='method' and not exists(select 1 from private.billing047_contracts where id=id_ and operation_state in('sending','uncertain')) then
 update private.billing047_contracts set method_before_card=provider_card_id,method_started=false where id=id_ and operation_id=p_key and operation_state='queued';
 end if;
 return id_;
end;$$;
revoke all on function public.billing047_prepare(uuid,text,uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.billing047_prepare(uuid,text,uuid,uuid,boolean) to authenticated;

alter function public.billing047_service(text,uuid,jsonb) rename to billing047_service_pre052;
revoke all on function public.billing047_service_pre052(text,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.billing047_service(p_action text,p_id uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.billing047_contracts;r jsonb;check_ text;begin
 if p_action in('lookup','list','get','lease') then return public.billing047_service_pre052(p_action,p_id,p_data);end if;
 perform pg_advisory_xact_lock(734921501);
 select * into c from private.billing047_contracts where id=p_id for update;
 if c.id is null then raise exception 'billing_binding_missing';end if;
 if c.lease is distinct from(p_data->>'lease')::uuid or c.lease_until<=clock_timestamp() then raise exception 'billing_lease_conflict';end if;
 if p_action='trial_check' then
 if c.trial_reserved and not c.trial_recorded and private.billing051_eligibility(c.organization_id,c.id)<>'eligible' then raise exception 'billing_trial_evidence_required';end if;
 return '{}'::jsonb;
 elsif p_action='failure' then
 check_=case when p_data->>'check'=any(array['provider_id','external_reference','collector_id','application_id','plan_id','recurrence','currency','amount','version','status','payer_id','invoice_subscription','invoice_reference','invoice_currency','payment_id','payment_collector','payment_currency','payment_amount','payment_reference','payment_payer','trial_duration','trial_dates','first_charge','snapshot','local_history']) then p_data->>'check' end;
 if c.operation='method' and c.operation_state='done' and not c.method_started then
 update private.billing047_contracts set error_code=case when p_data->>'code'~'^billing_[a-z_]{1,70}$' then p_data->>'code' else 'billing_reconciliation_required' end,
 lease=null,lease_until=null,checked_at=clock_timestamp() where id=c.id;
 else
 perform public.billing051_failure(c.id,c.lease,p_data->>'code',(p_data->>'http_status')::int,p_data->>'stage');
 end if;
 update private.billing047_contracts set validation_check=check_ where id=c.id;
 if check_ is not null then insert into private.billing047_audit(contract_id,event) values(c.id,'validation_'||check_);end if;
 return '{}'::jsonb;
 elsif p_action='bind' then
 if c.provider_payer_id is not null and c.provider_payer_id is distinct from p_data->>'payer_reference' then raise exception 'billing_binding_mismatch';end if;
 if p_data->>'payer_reference' is null or p_data->>'payer_reference' !~ '^[a-zA-Z0-9_-]{1,160}$' then raise exception 'billing_response_invalid';end if;
 update private.billing047_contracts set provider_payer_id=p_data->>'payer_reference' where id=c.id;
 elsif p_action='method_rejected' then
 if c.operation<>'method' or not c.method_started then raise exception 'billing_transition_invalid';end if;
 update private.billing047_contracts set method_started=false,operation_state='done' where id=c.id;
 insert into private.billing047_audit(contract_id,event) values(c.id,'method_rejected');return '{}'::jsonb;
 elsif p_action='start' and c.operation='method' then
 if c.method_started then raise exception 'billing_reconciliation_required';end if;
 update private.billing047_contracts set method_started=true where id=c.id;
 elsif p_action='apply' then
 if c.provider_payer_id is not null and c.provider_payer_id is distinct from p_data->>'payer_reference' then raise exception 'billing_binding_mismatch';end if;
 if c.trial_recorded and ((p_data->>'trial_start')::timestamptz is distinct from c.trial_start or (p_data->>'trial_end')::timestamptz is distinct from c.trial_end) then raise exception 'billing_trial_mismatch';end if;
 if c.trial_reserved and not c.trial_recorded and p_data->>'state'='authorized' and (p_data->>'method_linked')::boolean then
 perform public.billing047_service('trial_check',p_id,p_data);
 end if;
 end if;
 r=public.billing047_service_pre052(p_action,p_id,p_data);
 if p_action='apply' then
 update private.billing047_contracts set provider_payer_id=coalesce(provider_payer_id,p_data->>'payer_reference'),
 method_last_four=case when p_data->>'method_last_four'~'^[0-9]{4}$' then p_data->>'method_last_four' end,
 validation_check=null,provider_http_status=null,provider_error_stage=null,
 method_started=case when operation='method' and p_data->>'operation_done'='true' then false else method_started end where id=c.id;
 r=r||jsonb_build_object('operation_pending',(select operation_state<>'done' from private.billing047_contracts where id=c.id));
 end if;
 return r;
end;$$;
revoke all on function public.billing047_service(text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.billing047_service(text,uuid,jsonb) to service_role;

alter function public.billing047_context(uuid) rename to billing047_context_pre052;
revoke all on function public.billing047_context_pre052(uuid) from public,anon,authenticated,service_role;
create function public.billing047_context(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v jsonb;c private.billing047_contracts;items jsonb;begin
 v=public.billing047_context_pre052(p_org); -- existing billing.manage check first
 select * into c from private.billing047_contracts where organization_id=p_org and current;
 v=v||jsonb_build_object('eligibility',private.billing051_eligibility(p_org));
 if c.id is not null then
 select coalesce(jsonb_agg(jsonb_build_object('state',x.state,'amount_cents',x.amount_cents,'debit_at',x.debit_at,'paid_at',x.paid_at,'period_end',x.period_end) order by x.debit_at desc),'[]') into items
 from(select * from private.billing047_payments where contract_id=c.id order by debit_at desc,id limit 50)x;
 v=jsonb_set(v,'{subscription}',(v->'subscription')||jsonb_build_object('trial_start',c.trial_start,'method_last_four',c.method_last_four,'payments',items,
 'payments_count',(select count(*) from private.billing047_payments where contract_id=c.id),
 'method_retryable',c.operation='method' and c.operation_state='done' and not c.method_started and c.error_code is not null,
 'method_update_pending',c.operation='method' and c.operation_state<>'done','can_update_method',c.provider_id is not null and c.provider_state<>'canceled' and not c.cancel_requested));
 end if;
 return v;
end;$$;
revoke all on function public.billing047_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.billing047_context(uuid) to authenticated;
-- Simplified superadmin exception: two explicit human choices, no technical IDs.
create function public.billing051_verify_identity(p_org uuid,p_type text,p_value text,p_method text,p_confirmed boolean) returns text
language plpgsql security definer set search_path='' as $$
declare doc text;reference_ text;reason_ text;begin
 perform private.lock_authorize('global');
 if p_confirmed is distinct from true or p_type is null or p_type not in('CPF','CNPJ','responsible','phone') or p_method is null or p_method not in('document_checked','in_person','verified_contact') then raise exception 'trial_verification_required';end if;
 reference_='review-'||gen_random_uuid()::text;
 reason_=case p_method when 'document_checked' then 'Conferência de documento declarada explicitamente pelo administrador autorizado.' when 'in_person' then 'Conferência presencial declarada explicitamente pelo administrador autorizado.' else 'Posse do telefone confirmada por contato verificado, declarada pelo administrador autorizado.' end;
 if (p_type='phone') is distinct from (p_method='verified_contact') then raise exception 'trial_verification_required';end if;
 if p_type='phone' then
 doc=regexp_replace(p_value,'[ ()-]','','g');
 if doc~'^[0-9]{10,11}$' then doc='+55'||doc;end if;
 perform public.billing_trial_verify(p_org,'phone',doc,reference_,reason_,true);
 else
 doc=private.document_normalize(case when p_type='CNPJ' then 'CNPJ' else 'CPF' end,p_value);
 if doc is null then raise exception 'document_invalid';end if;
 if p_type in('CPF','CNPJ') then perform public.billing_trial_verify(p_org,'business','BR:'||p_type||':'||doc,reference_,reason_,true);end if;
 if p_type in('CPF','responsible') then perform public.billing_trial_verify(p_org,'responsible','BR:CPF:'||doc,reference_,reason_,true);end if;
 end if;
 return private.billing051_eligibility(p_org);
end;$$;
revoke all on function public.billing051_verify_identity(uuid,text,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.billing051_verify_identity(uuid,text,text,text,boolean) to authenticated;
commit;

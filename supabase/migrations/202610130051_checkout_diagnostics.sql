-- 051: persist safe failure outcome; no backfill or alteration of real contracts.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table private.billing047_contracts
 add column provider_http_status smallint check(provider_http_status between 400 and 599),
 add column provider_error_stage text check(provider_error_stage in('create','plan','update','lookup'));

create function public.billing051_failure(p_id uuid,p_lease uuid,p_code text,p_http_status int,p_stage text)
returns void language plpgsql security definer set search_path='' as $$
declare c private.billing047_contracts; retryable boolean; begin
 perform pg_advisory_xact_lock(734921501);
 select * into c from private.billing047_contracts where id=p_id for update;
 if c.id is null then raise exception 'billing_binding_missing';end if;
 if c.lease is distinct from p_lease or c.lease_until<=clock_timestamp() then raise exception 'billing_lease_conflict';end if;
 retryable=c.operation='checkout' and c.provider_id is null and not c.create_started;
 -- Only the existing definitive-rejection action can undo a started POST.
 -- No search result, timeout or browser return can reach that action.
 if not retryable then perform public.billing047_service('error',p_id,jsonb_build_object('lease',p_lease,'code',p_code));
 else
 update private.billing047_contracts set operation_state='done',state='payment_pending',
 error_code=case when p_code~'^billing_[a-z_]{1,70}$'then p_code else 'billing_reconciliation_required'end,
 lease=null,lease_until=null,checked_at=clock_timestamp() where id=p_id;
 insert into private.billing047_audit(contract_id,event,state)values(p_id,'checkout_failed','payment_pending');
 end if;
 update private.billing047_contracts set provider_http_status=case when p_http_status between 400 and 599 then p_http_status end,
 provider_error_stage=case when p_stage in('create','plan','update','lookup')then p_stage end where id=p_id;
end;$$;
revoke all on function public.billing051_failure(uuid,uuid,text,int,text) from public,anon,authenticated,service_role;
grant execute on function public.billing051_failure(uuid,uuid,text,int,text) to service_role;

-- Reuse the full authorization/catalog/history contract of 047. Keep the old
-- function inaccessible directly and add only current presentation metadata.
alter function public.billing047_context(uuid) rename to billing047_context_050;
revoke all on function public.billing047_context_050(uuid) from public,anon,authenticated,service_role;
create function public.billing047_context(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb;c private.billing047_contracts;retryable boolean;begin
 v=public.billing047_context_050(p_org);
 select * into c from private.billing047_contracts where organization_id=p_org and current;
 v=v||jsonb_build_object('members',(private.billing_usage_snapshot(p_org)->>'members')::int);
 if c.id is not null then
 retryable=c.operation='checkout' and c.provider_id is null and not c.create_started and not coalesce(c.lease_until>clock_timestamp(),false);
 v=jsonb_set(v,'{subscription}',(v->'subscription')||jsonb_build_object('checkout_retryable',retryable,
 'checkout_outcome',case when c.provider_id is not null then 'linked' when retryable and c.error_code is not null then 'retryable_failure' when retryable then 'ready' else 'pending'end,
 'operation_pending',coalesce(c.lease_until>clock_timestamp(),false) or (c.operation_state in('queued','sending','uncertain') and not retryable)));
 end if;
 return v;
end;$$;
revoke all on function public.billing047_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.billing047_context(uuid) to authenticated;
-- Existing RLS, FORCE RLS, immutable history and all financial decisions stay intact.
commit;

-- SYZIA 047: additive billing boundary; 001–046 remain byte-identical.
begin;
create temporary table migration047_functions on commit drop as select oid from pg_proc;
create table private.billing047_offers (
 code text primary key check(code in('essencial','profissional','equipe')),
 plan_version_id uuid not null unique references public.billing_plan_versions(id),
 trial_plan_id text not null unique check(length(trial_plan_id) between 1 and 160),
 paid_plan_id text not null unique check(length(paid_plan_id) between 1 and 160),
 check(trial_plan_id<>paid_plan_id)
);
create table private.billing047_contracts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 current boolean not null default true, actor_id uuid not null references public.profiles(id),
 plan_version_id uuid not null references public.billing_plan_versions(id), code text not null references private.billing047_offers(code),
 amount_cents int not null check(amount_cents in(4990,8990,14990)), currency text not null default 'BRL' check(currency='BRL'), interval_months int not null default 1 check(interval_months=1),
 provider_plan_id text not null, provider_id text unique, provider_version bigint not null default -1,
 provider_state text, state text not null default 'payment_pending' check(state in('trialing','active','payment_pending','grace_period','paused','cancel_scheduled','canceled','restricted','reconciliation')),
 trial_reserved boolean not null default false, trial_start timestamptz, trial_end timestamptz, trial_recorded boolean not null default false,
 paid_until timestamptz, paid_from timestamptz, grace_until timestamptz, next_charge timestamptz,
 cancel_requested boolean not null default false, method_label text, provider_card_id text,
 target_version uuid references public.billing_plan_versions(id), target_amount int, target_code text, target_requested_at timestamptz, target_effective_at timestamptz,
 operation text check(operation in('checkout','cancel','resume','change','method','reconcile')),
 operation_id uuid, operation_state text not null default 'queued' check(operation_state in('queued','sending','done','uncertain')),
 lease uuid, lease_until timestamptz, create_started boolean not null default false,
 last_fingerprint text, error_code text, created_at timestamptz not null default clock_timestamp(), checked_at timestamptz
);
create unique index billing047_one_current on private.billing047_contracts(organization_id)where current;
create table private.billing047_commands (
 organization_id uuid not null, actor_id uuid not null, key uuid not null, action text not null, version_id uuid,
 contract_id uuid not null references private.billing047_contracts(id), primary key(organization_id,key)
);
-- Independent from tenant/profile deletion. A pending checkout reserves identities too.
create table private.billing047_trial_reservations (
 kind text not null, fingerprint bytea not null, contract_id uuid not null references private.billing047_contracts(id),
 primary key(kind,fingerprint)
);
create table private.billing047_payments (
 id text primary key, contract_id uuid not null references private.billing047_contracts(id), payment_id text not null,
 state text not null check(state in('paid','failed','pending','reversed')), amount_cents int not null,
 debit_at timestamptz not null, modified_at timestamptz not null, period_end timestamptz not null, paid_at timestamptz
);
create table private.billing047_audit (
 id bigint generated always as identity primary key, contract_id uuid references private.billing047_contracts(id),
 event text not null, state text, resource_id text, created_at timestamptz not null default clock_timestamp()
);
do $$declare t text;begin foreach t in array array['billing047_offers','billing047_contracts','billing047_commands','billing047_trial_reservations','billing047_payments','billing047_audit']loop
 execute format('alter table private.%I enable row level security',t);
 execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 execute format('create trigger %I before delete or truncate on private.%I for each statement execute function private.consumer_deny_immutable()',t||'_preserve',t);
 end loop;end;$$;

create function public.billing047_offer_set(p_code text,p_version uuid,p_trial_plan text,p_paid_plan text)returns void language plpgsql security definer set search_path=''as $$
declare v public.billing_plan_versions;begin
 perform pg_advisory_xact_lock(734921501);
 select *into v from public.billing_plan_versions where id=p_version;
 if v.id is null or v.price_cents is distinct from (case p_code when 'essencial'then 4990 when 'profissional'then 8990 when 'equipe'then 14990 end) or v.interval_months<>1 or v.trial_days<>7 or v.human_support then raise exception 'billing_plan_mismatch';end if;
 if exists(select 1 from private.billing047_contracts where code=p_code)and exists(select 1 from private.billing047_offers where code=p_code and (plan_version_id<>p_version or trial_plan_id<>p_trial_plan or paid_plan_id<>p_paid_plan))then raise exception 'billing_mapping_in_use';end if;
 insert into private.billing047_offers values(p_code,p_version,p_trial_plan,p_paid_plan)on conflict(code)do update set plan_version_id=excluded.plan_version_id,trial_plan_id=excluded.trial_plan_id,paid_plan_id=excluded.paid_plan_id;
end;$$;
create function private.billing047_offer(p_version uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$declare r jsonb;begin
 select to_jsonb(o)||jsonb_build_object('amount_cents',v.price_cents,'currency','BRL','interval_months',1,'member_limit',v.member_limit)
 into r from private.billing047_offers o join public.billing_plan_versions v on v.id=o.plan_version_id join public.billing_plans p on p.id=v.plan_id
 where v.id=p_version and p.active and p.available and p.revision=v.version and not v.human_support and v.interval_months=1 and v.trial_days=7 and v.price_cents=case o.code when 'essencial'then 4990 when 'profissional'then 8990 when 'equipe'then 14990 end;
 if r is null then raise exception 'billing_plan_unavailable';end if;return r;end;$$;
create function private.billing047_state(c private.billing047_contracts)returns text language sql stable set search_path=''as $$select case
 when c.cancel_requested and c.provider_state in('paused','canceled')then case when greatest(c.trial_end,c.paid_until)>now()then 'cancel_scheduled'else 'canceled'end
 when c.state='grace_period'and c.grace_until<=now()then 'restricted'
 when c.state='trialing'and c.trial_end<=now()then 'payment_pending'
 when c.state='active'and c.paid_until<=now()then 'payment_pending'else c.state end;$$;
alter function private.billing_effective(public.billing_subscriptions)rename to billing_effective_046;
create function private.billing_effective(p_sub public.billing_subscriptions)returns text language plpgsql stable security definer set search_path=''as $$declare c private.billing047_contracts;s text;begin
 select *into c from private.billing047_contracts where organization_id=p_sub.organization_id and current;
 if c.id is null or p_sub.state='suspended'then return private.billing_effective_046(p_sub);end if;
 s=private.billing047_state(c);
 if s='trialing'then return 'trial';end if;
 if s in('active','grace_period','cancel_scheduled')then return 'active';end if;
 return case s when 'canceled'then 'cancelled'when 'paused'then 'suspended'else 'pending'end;
end;$$;

create function public.billing047_identify(p_org uuid,p_kind text,p_document text)returns void language plpgsql security definer set search_path=''as $$declare doc text;begin
 perform private.permission_require(p_org,'billing.manage');perform private.company_lock(p_org);
 doc=private.document_normalize(p_kind,p_document);if doc is null then raise exception 'document_invalid';end if;
 insert into private.trial_identifiers(organization_id,kind,fingerprint,verified_by,evidence_ref)values(p_org,'business',private.trial_fingerprint('business','BR:'||p_kind||':'||doc),auth.uid(),'self_declared_structure_047')on conflict do nothing;
 if p_kind='CPF'then insert into private.trial_identifiers(organization_id,kind,fingerprint,verified_by,evidence_ref)values(p_org,'responsible',private.trial_fingerprint('responsible','BR:CPF:'||doc),auth.uid(),'self_declared_structure_047')on conflict do nothing;end if;
end;$$;
create function public.billing047_context(p_org uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$declare c private.billing047_contracts;catalog jsonb;begin
 perform private.permission_require(p_org,'billing.manage');
 select *into c from private.billing047_contracts where organization_id=p_org and current;
 select coalesce(jsonb_agg(jsonb_build_object('code',o.code,'version_id',v.id,'plan_id',p.id,'name',p.name,'price_cents',v.price_cents,'trial_days',7,'member_limit',v.member_limit,'capabilities',v.capabilities)order by v.price_cents),'[]')into catalog
 from private.billing047_offers o join public.billing_plan_versions v on v.id=o.plan_version_id join public.billing_plans p on p.id=v.plan_id where p.active and p.available and p.revision=v.version;
 return jsonb_build_object('managed',not(select mock_enabled from private.billing_runtime),'catalog',catalog,'eligibility',case when private.trial_eligibility(p_org)='eligible'and exists(select 1 from private.trial_current_claims(p_org)x join private.billing047_trial_reservations r using(kind,fingerprint))then 'previous_identity'else private.trial_eligibility(p_org)end,
 'subscription',case when c.id is null then null else jsonb_build_object('id',c.id,'plan_version_id',c.plan_version_id,'code',c.code,'state',private.billing047_state(c),'price_cents',c.amount_cents,'currency','BRL','cycle','monthly','trial_end',c.trial_end,'access_until',greatest(c.trial_end,c.paid_until),'next_charge',case when c.cancel_requested and c.provider_state in('paused','canceled')then null else c.next_charge end,'grace_until',c.grace_until,'method',c.method_label,'cancel_requested',c.cancel_requested,'cancel_confirmed',c.cancel_requested and c.provider_state in('paused','canceled'),'can_resume',c.provider_state='paused'and greatest(c.trial_end,c.paid_until)>now(),'target_version',c.target_version,'target_effective_at',c.target_effective_at,'checkout_retryable',c.provider_id is null and not c.create_started,'checkout_trial',c.trial_reserved,'operation_pending',c.operation_state in('queued','sending','uncertain'),'error_code',c.error_code)end);
end;$$;

create function public.billing047_prepare(p_org uuid,p_action text,p_version uuid,p_key uuid,p_trial boolean)returns uuid language plpgsql security definer set search_path=''as $$
declare c private.billing047_contracts;prior private.billing047_commands;o jsonb;why text;trial_ boolean;lim int;begin
 perform private.permission_require(p_org,'billing.manage');perform private.company_lock(p_org);perform pg_advisory_xact_lock(734921501);
 if p_key is null or p_action not in('checkout','cancel','resume','change','method','reconcile')then raise exception 'billing_payload_invalid';end if;
 if private.internal_exemption(p_org)is not null or private.billing_homologation(p_org)is not null then raise exception 'billing_exemption_or_homologation';end if;
 select *into prior from private.billing047_commands where organization_id=p_org and key=p_key;
 if found then if prior.actor_id<>auth.uid()or prior.action<>p_action or prior.version_id is distinct from p_version then raise exception 'billing_key_conflict';end if;return prior.contract_id;end if;
 select *into c from private.billing047_contracts where organization_id=p_org and current for update;
 if p_action='checkout'then
 o=private.billing047_offer(p_version);
 if c.id is not null and not(coalesce(c.provider_state='canceled',false)and greatest(c.trial_end,c.paid_until,now()-interval '1 second')<=now())then
 if c.trial_reserved is distinct from p_trial then raise exception 'billing_trial_changed';end if;
 if c.plan_version_id<>p_version then raise exception 'billing_existing_subscription';end if;
 insert into private.billing047_commands values(p_org,auth.uid(),p_key,p_action,p_version,c.id);return c.id;end if;
 if c.id is null and exists(select 1 from public.billing_subscriptions where organization_id=p_org and private.billing_effective(billing_subscriptions)in('active','trial','suspended'))then raise exception 'billing_existing_subscription';end if;
 lim=(o->>'member_limit')::int;
 if lim is not null and (private.billing_usage_snapshot(p_org)->>'members')::int>lim then raise exception 'billing_members_exceeded';end if;
 why=private.trial_eligibility(p_org);
 if why in('manual_policy','verification_required')then raise exception 'trial_review_required';end if;
 trial_=why='eligible'and not exists(select 1 from private.trial_current_claims(p_org)x join private.billing047_trial_reservations r using(kind,fingerprint));
 if trial_ is distinct from p_trial then raise exception 'billing_trial_changed';end if;
 if c.id is not null then update private.billing047_contracts set current=false where id=c.id;end if;
 insert into private.billing047_contracts(organization_id,actor_id,plan_version_id,code,amount_cents,provider_plan_id,trial_reserved,operation,operation_id)
 values(p_org,auth.uid(),p_version,o->>'code',(o->>'amount_cents')::int,case when trial_ then o->>'trial_plan_id'else o->>'paid_plan_id'end,trial_,p_action,p_key)returning *into c;
 if trial_ then insert into private.billing047_trial_reservations select kind,fingerprint,c.id from private.trial_current_claims(p_org);end if;
 insert into public.billing_subscriptions(organization_id,plan_version_id,state,period_start,period_end)values(p_org,p_version,'pending',now(),now()+interval '1 second')on conflict(organization_id)do update set state='pending',plan_version_id=excluded.plan_version_id,pending_version_id=null,cancel_at_end=false,revision=public.billing_subscriptions.revision+1;
 insert into private.billing047_audit(contract_id,event)values(c.id,'checkout_started');
 else
 if c.id is null then raise exception 'billing_subscription_required';end if;
 if p_action='reconcile'then return c.id;end if;
 if c.lease_until>clock_timestamp()and c.operation_state='done'then raise exception 'billing_operation_pending';end if;
 if c.operation_state in('queued','sending','uncertain')then
 if c.operation=p_action and(p_action<>'change'or c.target_version=p_version)then return c.id;end if;raise exception 'billing_operation_pending';end if;
 if c.provider_id is null or c.provider_state='canceled'then raise exception 'billing_transition_invalid';end if;
 if p_action='resume'and(c.provider_state<>'paused'or greatest(c.trial_end,c.paid_until)<=now())then raise exception 'billing_transition_invalid';end if;
 if p_action='change'then
 if c.cancel_requested or c.target_version is not null or c.state not in('active','trialing')then raise exception 'billing_transition_invalid';end if;
 o=private.billing047_offer(p_version);lim=(o->>'member_limit')::int;
 if p_version=c.plan_version_id then raise exception 'billing_same_plan';end if;
 if lim is not null and(private.billing_usage_snapshot(p_org)->>'members')::int>lim then raise exception 'billing_members_exceeded';end if;
 update private.billing047_contracts set target_version=p_version,target_amount=(o->>'amount_cents')::int,target_code=o->>'code',target_requested_at=clock_timestamp(),target_effective_at=greatest(c.paid_until,c.trial_end,c.next_charge)where id=c.id;
 end if;
 update private.billing047_contracts set operation=p_action,operation_id=p_key,operation_state='queued',cancel_requested=case when p_action='cancel'then true else cancel_requested end where id=c.id;
 insert into private.billing047_audit(contract_id,event)values(c.id,p_action||'_requested');
 end if;
 insert into private.billing047_commands values(p_org,auth.uid(),p_key,p_action,p_version,c.id);return c.id;
end;$$;

-- One leased, durable operation per subscription, including provider reads. Secrets and
-- payment tokens are never written to these tables. An uncertain POST is never repeated.
create function public.billing047_service(p_action text,p_id uuid,p_data jsonb)returns jsonb language plpgsql security definer set search_path=''as $$
declare c private.billing047_contracts;s public.billing_subscriptions;f jsonb;oldp private.billing047_payments;paid private.billing047_payments;failed private.billing047_payments;oldstate text;target public.billing_plan_versions;g uuid;lease_ uuid;fingerprint_ text;begin
 perform pg_advisory_xact_lock(734921501);
 if p_action='lookup'then return(select to_jsonb(x)from private.billing047_contracts x where provider_id=p_data->>'provider_id');end if;
 if p_action='list'then return coalesce((select jsonb_agg(id)from(select id from private.billing047_contracts where current order by checked_at nulls first limit 1000)x),'[]');end if;
 select *into c from private.billing047_contracts where id=p_id for update;
 if c.id is null then raise exception 'billing_binding_missing';end if;
 if p_action='get'then return to_jsonb(c);end if;
 if p_action='lease'then
 if c.lease_until>clock_timestamp()then return null;end if;
 lease_=gen_random_uuid();update private.billing047_contracts set lease=lease_,lease_until=clock_timestamp()+interval '2 minutes'where id=c.id returning *into c;return to_jsonb(c);
 end if;
 if c.lease is distinct from(p_data->>'lease')::uuid or c.lease_until<=clock_timestamp()then raise exception 'billing_lease_conflict';end if;
 if p_action='start'then
 if c.operation='checkout'and c.create_started then raise exception 'billing_reconciliation_required';end if;
 update private.billing047_contracts set operation_state='sending',create_started=create_started or operation='checkout'where id=c.id;return to_jsonb(c);
 elsif p_action='rejected'then
 if c.provider_id is not null or c.operation<>'checkout'then raise exception 'billing_transition_invalid';end if;
 update private.billing047_contracts set create_started=false where id=c.id;
 insert into private.billing047_audit(contract_id,event)values(c.id,'checkout_rejected');return '{}'::jsonb;
 elsif p_action='bind'then
 if c.provider_id is not null and c.provider_id<>p_data->>'provider_id'then raise exception 'billing_binding_mismatch';end if;
 update private.billing047_contracts set provider_id=p_data->>'provider_id'where id=c.id;
 if c.provider_id is null then insert into private.billing047_audit(contract_id,event)values(c.id,'subscription_linked');end if;return '{}'::jsonb;
 elsif p_action='error'then
 update private.billing047_contracts set operation_state='uncertain',state=case when state in('payment_pending','reconciliation')then 'reconciliation'else state end,error_code=case when p_data->>'code'~'^billing_[a-z_]{1,70}$'then p_data->>'code'else 'billing_reconciliation_required'end,lease=null,lease_until=null,checked_at=clock_timestamp()where id=c.id;
 insert into private.billing047_audit(contract_id,event,state)values(c.id,'reconciliation_error',c.state);return '{}'::jsonb;
 elsif p_action='release'then
 update private.billing047_contracts set lease=null,lease_until=null,checked_at=clock_timestamp()where id=c.id;return '{}'::jsonb;
 elsif p_action<>'apply'then raise exception 'billing_payload_invalid';end if;
 if c.provider_id is distinct from p_data->>'provider_id'or(p_data->>'version')::bigint<c.provider_version then raise exception 'billing_stale_snapshot';end if;
 fingerprint_=encode(sha256(convert_to((p_data-'lease'-'source'-'operation_done')::text||coalesce(c.operation_id::text,''),'UTF8')),'hex');
 if c.last_fingerprint=fingerprint_ and private.billing047_state(c)=c.state and c.error_code is distinct from 'billing_members_exceeded'then
 update private.billing047_contracts set lease=null,lease_until=null,checked_at=clock_timestamp(),operation_state=case when p_data->>'operation_done'='true'then 'done'else operation_state end where id=c.id;
 return jsonb_build_object('state',c.state,'duplicate',true);end if;
 oldstate=c.state;
 for f in select value from jsonb_array_elements(p_data->'payments')loop
 select *into oldp from private.billing047_payments where id=f->>'id';
 if oldp.id is not null and(oldp.contract_id<>c.id or oldp.debit_at<>(f->>'debit_at')::timestamptz or oldp.amount_cents<>(f->>'amount_cents')::int)then raise exception 'billing_binding_mismatch';end if;
 if oldp.id is null or oldp.modified_at<(f->>'modified_at')::timestamptz then
 insert into private.billing047_payments values(f->>'id',c.id,f->>'payment_id',f->>'status',(f->>'amount_cents')::int,(f->>'debit_at')::timestamptz,(f->>'modified_at')::timestamptz,(f->>'period_end')::timestamptz,(f->>'paid_at')::timestamptz)
 on conflict(id)do update set payment_id=excluded.payment_id,state=excluded.state,modified_at=excluded.modified_at,paid_at=excluded.paid_at;
 insert into private.billing047_audit(contract_id,event,resource_id)values(c.id,'payment_'||(f->>'status'),f->>'id');end if;end loop;
 select *into paid from private.billing047_payments where contract_id=c.id and state='paid'and debit_at<=clock_timestamp()order by debit_at desc limit 1;
 select *into failed from private.billing047_payments where contract_id=c.id and state in('failed','reversed')and debit_at<=clock_timestamp()and (paid.id is null or debit_at>paid.debit_at)order by debit_at limit 1;
 if c.target_version is not null and paid.id is not null and paid.amount_cents=c.target_amount and paid.debit_at>=c.target_effective_at and paid.paid_at>=c.target_requested_at then
 select *into target from public.billing_plan_versions where id=c.target_version;
 if target.member_limit is not null and(private.billing_usage_snapshot(c.organization_id)->>'members')::int>target.member_limit then
 c.state='restricted';c.error_code='billing_members_exceeded';
 else c.error_code=null;c.plan_version_id=c.target_version;c.code=c.target_code;c.amount_cents=c.target_amount;c.target_version=null;c.target_amount=null;c.target_code=null;c.target_effective_at=null;c.target_requested_at=null;insert into private.billing047_audit(contract_id,event)values(c.id,'plan_changed');end if;
 end if;
 if paid.id is not null and paid.amount_cents=c.amount_cents then c.paid_until=paid.period_end;c.paid_from=paid.debit_at;end if;
 if c.trial_reserved and not c.trial_recorded and p_data->>'state'='authorized'and(p_data->>'method_linked')::boolean then
 c.trial_start=(p_data->>'trial_start')::timestamptz;c.trial_end=(p_data->>'trial_end')::timestamptz;
 if c.trial_end-c.trial_start<>interval '7 days'then raise exception 'billing_trial_mismatch';end if;
 -- Include the original responsible's reserved claims, even if membership changed.
 insert into private.trial_grants(organization_id,plan_version_id,starts_at,ends_at,mode,actor_id,reason)values(c.organization_id,c.plan_version_id,c.trial_start,c.trial_end,'automatic',c.actor_id,'Mercado Pago subscription and payment method confirmed server-side')returning id into g;
 insert into private.trial_claims select g,kind,fingerprint from private.billing047_trial_reservations where contract_id=c.id;
 insert into private.trial_claims select g,kind,fingerprint from private.trial_current_claims(c.organization_id)on conflict do nothing;
 insert into private.trial_consumed_keys select kind,fingerprint,g from private.trial_claims where grant_id=g;
 c.trial_recorded=true;insert into private.billing047_audit(contract_id,event)values(c.id,'trial_started');end if;
 if c.operation='resume'and p_data->>'state'='authorized'then c.cancel_requested=false;end if;
 c.provider_state=p_data->>'state';
 c.grace_until=case when failed.id is not null then failed.debit_at+interval '3 days'else null end;
 if c.error_code is distinct from 'billing_members_exceeded'then
 c.state=case when c.cancel_requested and c.provider_state in('paused','canceled')then case when greatest(c.trial_end,c.paid_until)>now()then 'cancel_scheduled'else 'canceled'end
 when c.provider_state='canceled'then case when greatest(c.trial_end,c.paid_until)>now()then 'cancel_scheduled'else 'canceled'end
 when c.provider_state='paused'then 'paused'
 when failed.state='reversed'then 'restricted'
 when c.grace_until is not null then case when c.grace_until>now()then 'grace_period'else 'restricted'end
 when c.paid_until>now()then 'active'
 when c.trial_end>now()and c.provider_state='authorized'and(p_data->>'method_linked')::boolean then 'trialing'else 'payment_pending'end;
 c.error_code=null;end if;
 if c.provider_state='canceled'then c.cancel_requested=true;end if;
 if c.grace_until is not null and oldstate<>c.state then insert into private.billing047_audit(contract_id,event)values(c.id,'grace_started');end if;
 update private.billing047_contracts set plan_version_id=c.plan_version_id,code=c.code,amount_cents=c.amount_cents,
 target_version=c.target_version,target_amount=c.target_amount,target_code=c.target_code,target_requested_at=c.target_requested_at,target_effective_at=c.target_effective_at,
 provider_state=c.provider_state,provider_version=(p_data->>'version')::bigint,state=c.state,trial_start=c.trial_start,trial_end=c.trial_end,trial_recorded=c.trial_recorded,
 paid_until=c.paid_until,paid_from=c.paid_from,grace_until=c.grace_until,next_charge=(p_data->>'next_charge')::timestamptz,cancel_requested=c.cancel_requested,
 method_label=p_data->>'method_label',provider_card_id=p_data->>'card_reference',operation_state=case when p_data->>'operation_done'='true'then 'done'else operation_state end,error_code=c.error_code,
 last_fingerprint=fingerprint_,lease=null,lease_until=null,checked_at=clock_timestamp()where id=c.id;
 select *into s from public.billing_subscriptions where organization_id=c.organization_id;
 update public.billing_subscriptions set plan_version_id=c.plan_version_id,pending_version_id=c.target_version,
 state=case when s.state='suspended'then 'suspended'when c.state='trialing'then 'trial'when c.state in('active','cancel_scheduled','grace_period')then 'active'when c.state='canceled'then 'cancelled'else 'pending'end,
 period_start=coalesce(c.paid_from,c.trial_start,s.period_start),period_end=greatest(c.paid_until,c.trial_end,c.grace_until,coalesce(c.paid_from,c.trial_start,s.period_start)+interval '1 second'),
 trial_used=s.trial_used or c.trial_recorded,cancel_at_end=c.cancel_requested,revision=revision+1 where organization_id=c.organization_id and c.current;
 if oldstate<>c.state then insert into private.billing047_audit(contract_id,event,state)values(c.id,'state_changed',c.state);if c.current then perform private.billing_event(c.organization_id,'subscription_'||c.state);end if;end if;
 insert into private.billing047_audit(contract_id,event,state)values(c.id,case when p_data->>'source'='webhook'then 'webhook_reconciled'else 'reconciled'end,c.state);
 return jsonb_build_object('state',c.state);
end;$$;

-- Existing mock regression fixtures keep their explicitly isolated path. Real browsers
-- cannot grant trial, renew, or cancel provider billing by invoking historical RPCs.
alter function public.billing_subscription_action(uuid,text,uuid,integer,uuid)rename to billing_subscription_action_046;
alter function public.billing_subscription_action_046(uuid,text,uuid,integer,uuid)set schema private;
create function public.billing_subscription_action(p_org uuid,p_action text,p_plan uuid,p_revision int,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$begin
 perform private.permission_require(p_org,'billing.manage');
 if exists(select 1 from private.billing047_contracts where organization_id=p_org and current)or not(select mock_enabled from private.billing_runtime)then raise exception 'billing_payment_method_required';end if;
 return private.billing_subscription_action_046(p_org,p_action,p_plan,p_revision,p_key);end;$$;
alter function public.acquisition_plans()rename to acquisition_plans_046;
alter function public.acquisition_plans_046()set schema private;
create function public.acquisition_plans()returns jsonb language sql stable security definer set search_path=''as $$
 select case when(select mock_enabled from private.billing_runtime)then private.acquisition_plans_046()else coalesce((select jsonb_agg(x||jsonb_build_object('billing047',true))from jsonb_array_elements(private.acquisition_plans_046())x where exists(select 1 from private.billing047_offers o where o.plan_version_id=(x->'version'->>'id')::uuid)),'[]')end;$$;
alter function public.selfservice_complete(uuid,integer,boolean,text)rename to selfservice_complete_046;
alter function public.selfservice_complete_046(uuid,integer,boolean,text)set schema private;
create function public.selfservice_complete(p_id uuid,p_revision int,p_consent boolean,p_conditions text)returns jsonb language plpgsql security definer set search_path=''as $$
declare d private.selfservice_drafts;a private.enterprise_accounts;org uuid;begin
 if(select mock_enabled from private.billing_runtime)then return private.selfservice_complete_046(p_id,p_revision,p_consent,p_conditions);end if;
 if not private.is_active_user()then raise exception 'access_denied';end if;
 perform pg_advisory_xact_lock(734921501);select *into d from private.selfservice_drafts where id=p_id and user_id=auth.uid()for update;
 if d.id is null then raise exception 'access_denied';end if;
 if d.state='completed'then return private.selfservice_projection(d.id);end if;
 if p_consent is distinct from true or p_conditions<>'billing-047'then raise exception 'selfservice_consent_required';end if;
 if d.revision<>p_revision or d.quote_until<=clock_timestamp()then raise exception 'selfservice_quote_expired';end if;
 perform private.billing047_offer(d.plan_version_id);
 select *into a from private.enterprise_accounts where user_id=auth.uid()and state='active'order by(organization_id is null)desc,created_at limit 1;
 if a.id is null then raise exception 'access_denied';end if;
 insert into public.organizations(name,slug)values(d.name,d.slug)returning id into org;
 update private.enterprise_codes set legal_required=true where organization_id=org;
 -- Set up membership before inserting the restricted pending subscription; one transaction.
 insert into public.organization_members(organization_id,user_id,role)values(org,auth.uid(),'admin_empresa');
 insert into private.enterprise_accounts(organization_id,user_id,username,display_name,contact_email,phone,role,state,requested_by,request_key,activated_at,generation,operation_id)values(org,auth.uid(),a.username,a.display_name,a.contact_email,d.phone,'admin_empresa','active',auth.uid(),gen_random_uuid(),clock_timestamp(),a.generation,a.operation_id);
 update private.organization_verifications set required=true,state='verified',kind=d.document_kind,masked=d.document_masked,fingerprint=d.registration_fingerprint,verified_by=auth.uid(),verified_at=clock_timestamp(),revision=revision+1 where organization_id=org;
 insert into private.trial_identifiers(organization_id,kind,fingerprint,verified_by,evidence_ref)values(org,'business',d.identity_fingerprint,auth.uid(),'self_declared_structure_047');
 if d.responsible_fingerprint is not null then insert into private.trial_identifiers(organization_id,kind,fingerprint,verified_by,evidence_ref)values(org,'responsible',d.responsible_fingerprint,auth.uid(),'self_declared_structure_047');end if;
 insert into public.billing_subscriptions(organization_id,plan_version_id,state,period_start,period_end)values(org,d.plan_version_id,'pending',clock_timestamp(),clock_timestamp()+interval '1 second');
 update private.selfservice_drafts set state='completed',organization_id=org where id=d.id;
 insert into private.acquisition_events(user_id,organization_id,event,simulation)values(auth.uid(),org,'company_registered',false);
 return private.selfservice_projection(d.id)||jsonb_build_object('billing047',true);end;$$;

do $$declare r record;begin
 for r in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private')and(p.oid not in(select oid from migration047_functions)or p.proname in('billing_subscription_action_046','selfservice_complete_046','acquisition_plans_046','billing_effective_046'))loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
 if r.nspname='public'then
 if r.proname in('billing047_service','billing047_offer_set')then execute format('grant execute on function %s to service_role',r.signature);
 else execute format('grant execute on function %s to authenticated',r.signature);end if;
 if r.proname='acquisition_plans'then execute format('grant execute on function %s to anon',r.signature);end if;end if;
 end loop;end;$$;
commit;

-- Fase 3: provider extension of the existing 047 contract/entitlement authority.
-- Preparation only. Nothing is enabled, and no external resource is created.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_advisory_xact_lock(734921501);

create table private.billing069_runtime (
 singleton boolean primary key default true check(singleton),
 checkout_mode text not null default 'disabled' check(checkout_mode in('disabled','internal','stripe')),
 environment text not null default 'test' check(environment in('test','production')),
 confirmation_enabled boolean not null default false,
 test_organizations uuid[] not null default '{}'
);
insert into private.billing069_runtime(singleton) values(true);
create table private.billing069_offers (
 code text primary key check(code in('monthly','semiannual','annual')),
 plan_version_id uuid not null unique references public.billing_plan_versions(id),
 amount_cents int not null, months int not null,
 check((code,amount_cents,months) in (('monthly',5990,1),('semiannual',29940,6),('annual',47880,12)))
);
-- Hidden plans: the existing public acquisition catalog remains unchanged.
do $$declare code_ text; amount_ int; months_ int; pid uuid; vid uuid;begin
 for code_,amount_,months_ in select * from (values('monthly',5990,1),('semiannual',29940,6),('annual',47880,12)) x loop
  insert into public.billing_plans(name,description,active,available,site_visible,self_service,self_service_trial)
  values('SYZIA Completa — '||case code_ when 'monthly' then 'Mensal' when 'semiannual' then 'Semestral' else 'Anual' end,
   'Mesmos recursos de software; 8 membros, 100 serviços ativos e 1.000 solicitações por mês. Sem atendimento humano compartilhado.',true,false,false,false,false) returning id into pid;
  insert into public.billing_plan_versions(plan_id,version,price_cents,interval_months,trial_days,human_support,commercial_followups,member_limit,service_limit,request_limit,capabilities,quota_semantics)
  values(pid,1,amount_,months_,7,false,true,8,100,1000,'{"software":true,"finance":true,"analytics":true,"commercial_followups":true,"human_support":false}',2) returning id into vid;
  insert into private.billing069_offers values(code_,vid,amount_,months_);
 end loop;
end;$$;
create table private.billing069_mappings (
 environment text not null check(environment in('test','production')), code text not null references private.billing069_offers(code),
 account_id text not null check(account_id ~ '^acct_[A-Za-z0-9]+$'), product_id text not null check(product_id ~ '^prod_[A-Za-z0-9]+$'),
 price_id text not null unique check(price_id ~ '^price_[A-Za-z0-9]+$'), primary key(environment,code)
);
alter table private.billing047_contracts add column provider text not null default 'mercado_pago' check(provider in('mercado_pago','stripe'));
alter table private.billing047_contracts alter column code drop not null;
alter table private.billing047_contracts drop constraint billing047_contracts_amount_cents_check, drop constraint billing047_contracts_interval_months_check;
alter table private.billing047_contracts add constraint billing069_provider_amount check(
 (provider='mercado_pago' and code is not null and amount_cents in(4990,8990,14990) and interval_months=1)
 or(provider='stripe' and code is null and (amount_cents,interval_months) in((5990,1),(29940,6),(47880,12))));
create table private.billing069_stripe (
 contract_id uuid primary key references private.billing047_contracts(id),
 environment text not null, offer text not null, foreign key(environment,offer) references private.billing069_mappings(environment,code),
 account_id text not null, product_id text not null, price_id text not null,
 api_version text not null check(api_version='2026-09-30.endive'),
 customer_id text unique check(customer_id ~ '^cus_[A-Za-z0-9]+$'),
 session_id text unique check(session_id ~ '^cs_[A-Za-z0-9_]+$'),
 session_url text check(length(session_url)<=2048 and session_url ~ '^https://checkout[.]stripe[.]com/'),
 attempt_at timestamptz, session_expires_at timestamptz, session_state text,
 subscription_status text, operation_requested_at timestamptz, conditions_version text not null default 'stripe-completa-1',
 conditions_accepted_at timestamptz not null default clock_timestamp()
);
create table private.billing069_inbox (
 environment text not null check(environment in('test','production')), account_id text not null,
 event_id text not null check(event_id ~ '^evt_[A-Za-z0-9]+$'), kind text not null check(length(kind)<100),
 object_id text not null check(object_id ~ '^[A-Za-z0-9_]{3,160}$'),
 contract_hint uuid, resource_hint text, digest text not null check(digest ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in('pending','done','unbound')),
 received_at timestamptz not null default clock_timestamp(), processed_at timestamptz,
 primary key(environment,account_id,event_id)
);
do $$declare t text;begin foreach t in array array['billing069_runtime','billing069_offers','billing069_mappings','billing069_stripe','billing069_inbox'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;end;$$;

-- Keep MP's environment trigger verbatim for MP. Stripe has its own frozen scope.
alter function private.billing061_contract_scope() rename to billing061_contract_scope_pre069;
create function private.billing061_contract_scope() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='UPDATE' and (new.provider is distinct from old.provider or new.provider_environment is distinct from old.provider_environment or new.mapping_id is distinct from old.mapping_id) then raise exception 'billing_environment_immutable';end if;
 if new.provider='stripe' then
  if new.mapping_id is not null or new.provider_environment not in('sandbox','production') then raise exception 'billing_environment_mismatch';end if;
  return new;
 end if;
 -- Original trigger body is installed below, guarded by a predecessor assertion.
 return new;
end;$$;
do $$declare d text; b text;begin
 d=pg_get_functiondef('private.billing061_contract_scope_pre069()'::regprocedure);
 if position('if tg_op=''UPDATE''' in d)=0 then raise exception 'billing069_predecessor_mismatch';end if;
 d=replace(d,'FUNCTION private.billing061_contract_scope_pre069()','FUNCTION private.billing061_contract_scope()');
 b=$q$if tg_op='UPDATE' and new.provider is distinct from old.provider then raise exception 'billing_environment_immutable';end if;
 if new.provider='stripe' then
 if new.mapping_id is not null or new.provider_environment not in('sandbox','production') then raise exception 'billing_environment_mismatch';end if;
 if tg_op='UPDATE' and(new.provider_environment is distinct from old.provider_environment or new.mapping_id is distinct from old.mapping_id)then raise exception 'billing_environment_immutable';end if;return new;end if;
 if tg_op='UPDATE'$q$;
 d=replace(d,'if tg_op=''UPDATE''',b); execute d;
end;$$;
drop trigger billing061_contract_scope on private.billing047_contracts;
create trigger billing061_contract_scope before insert or update on private.billing047_contracts for each row execute function private.billing061_contract_scope();

-- MP service must never lease, reconcile, or bind a Stripe contract.
alter function public.billing047_service(text,uuid,jsonb) rename to billing047_service_pre069;
create function public.billing047_service(p_action text,p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;begin
 if p_id is not null and exists(select 1 from private.billing047_contracts where id=p_id and provider<>'mercado_pago') then raise exception 'billing_provider_mismatch';end if;
 if p_action='lookup' and exists(select 1 from private.billing047_contracts where provider_id=p_data->>'provider_id' and provider<>'mercado_pago') then return null;end if;
 r=public.billing047_service_pre069(p_action,p_id,p_data);
 if p_action='list' then select coalesce(jsonb_agg(x),'[]') into r from jsonb_array_elements(r) x where exists(select 1 from private.billing047_contracts c where c.id=(x#>>'{}')::uuid and c.provider='mercado_pago');end if;
 return r;
end;$$;
alter function public.billing047_prepare(uuid,text,uuid,uuid,boolean) rename to billing047_prepare_pre069;
create function public.billing047_prepare(p_org uuid,p_action text,p_version uuid,p_key uuid,p_trial boolean) returns uuid language plpgsql security definer set search_path='' as $$begin
 perform private.permission_require(p_org,'billing.manage');perform private.company_lock(p_org);perform pg_advisory_xact_lock(734921501);
 if p_action='checkout' and (select checkout_mode from private.billing069_runtime)<>'internal' then raise exception 'billing_checkout_disabled';end if;
 if exists(select 1 from private.billing047_contracts where organization_id=p_org and current and provider<>'mercado_pago') then raise exception 'billing_provider_mismatch';end if;
 return public.billing047_prepare_pre069(p_org,p_action,p_version,p_key,p_trial);
end;$$;

create function public.billing069_context(p_org uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare c private.billing047_contracts;r private.billing069_runtime;s private.billing069_stripe;begin
 perform private.permission_require(p_org,'billing.manage');
 select * into r from private.billing069_runtime;select * into c from private.billing047_contracts where organization_id=p_org and current;
 select * into s from private.billing069_stripe where contract_id=c.id;
 return jsonb_build_object('checkout_mode',r.checkout_mode,'environment',r.environment,'provider',c.provider,'confirmation_enabled',r.confirmation_enabled,
 'test_allowed',r.environment='production' or p_org=any(r.test_organizations),'eligibility',private.billing051_eligibility(p_org,c.id),
 'catalog',(select jsonb_agg(jsonb_build_object('code',o.code,'price_cents',o.amount_cents,'interval_months',o.months,'version_id',o.plan_version_id,'member_limit',v.member_limit,'service_limit',v.service_limit,'request_limit',v.request_limit,'capabilities',v.capabilities) order by o.months) from private.billing069_offers o join public.billing_plan_versions v on v.id=o.plan_version_id),
 'subscription',case when s.contract_id is null then null else jsonb_build_object('id',c.id,'state',private.billing047_state(c),'offer',s.offer,'environment',s.environment,
 'trial_end',c.trial_end,'access_until',greatest(c.paid_until,c.trial_end),'next_charge',c.next_charge,'cancel_requested',c.cancel_requested,'pending',c.operation_state<>'done',
 'checkout_url',case when s.session_state='open' and s.session_expires_at>now() then s.session_url else null end,'error_code',c.error_code) end);
end;$$;

create function public.billing069_prepare(p_org uuid,p_offer text,p_key uuid,p_trial boolean,p_accepted boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare c private.billing047_contracts;o private.billing069_offers;m private.billing069_mappings;r private.billing069_runtime;k private.billing047_commands;why text;begin
 perform private.permission_require(p_org,'billing.manage');perform private.company_lock(p_org);perform pg_advisory_xact_lock(734921501);
 select * into r from private.billing069_runtime;
 if r.checkout_mode<>'stripe' or not r.confirmation_enabled or (r.environment='test' and not p_org=any(r.test_organizations))then raise exception 'billing_checkout_disabled';end if;
 if p_key is null or p_trial is null or p_accepted is distinct from true then raise exception 'billing_payload_invalid';end if;
 if private.internal_exemption(p_org)is not null or private.billing_homologation(p_org)is not null then raise exception 'billing_exemption_or_homologation';end if;
 select * into o from private.billing069_offers where code=p_offer;
 select * into m from private.billing069_mappings where environment=r.environment and code=p_offer;
 if o.code is null or m.code is null then raise exception 'billing_plan_unavailable';end if;
 select * into k from private.billing047_commands where organization_id=p_org and key=p_key;
 if found then
  if k.actor_id<>auth.uid() or k.action<>'checkout' or k.version_id<>o.plan_version_id then raise exception 'billing_key_conflict';end if;return k.contract_id;
 end if;
 select * into c from private.billing047_contracts where organization_id=p_org and current for update;
 if c.id is not null then
  if c.provider<>'stripe' or c.plan_version_id<>o.plan_version_id or not exists(select 1 from private.billing069_stripe where contract_id=c.id and environment=r.environment) then raise exception 'billing_existing_subscription';end if;
  if c.trial_reserved is distinct from p_trial then raise exception 'billing_trial_changed';end if;
  -- Never replace an unresolved session/contract or silently restart a trial.
  insert into private.billing047_commands values(p_org,auth.uid(),p_key,'checkout',o.plan_version_id,c.id);return c.id;
 end if;
 if exists(select 1 from public.billing_subscriptions where organization_id=p_org and private.billing_effective(billing_subscriptions) in('active','trial','suspended')) then raise exception 'billing_existing_subscription';end if;
 if (private.billing_usage_snapshot(p_org)->>'members')::int>8 or (private.billing_usage_snapshot(p_org)->>'services')::int>100 then raise exception 'billing_capacity_exceeded';end if;
 why=private.billing051_eligibility(p_org);
 if why not in('eligible','previous_identity','previous_grant') then raise exception 'trial_review_required';end if;
 if (why='eligible') is distinct from p_trial then raise exception 'billing_trial_changed';end if;
 insert into private.billing047_contracts(organization_id,actor_id,plan_version_id,code,amount_cents,interval_months,provider_plan_id,trial_reserved,operation,operation_id,provider,provider_environment)
 values(p_org,auth.uid(),o.plan_version_id,null,o.amount_cents,o.months,m.price_id,p_trial,'checkout',p_key,'stripe',case r.environment when 'test' then 'sandbox' else 'production' end) returning * into c;
 insert into private.billing069_stripe(contract_id,environment,offer,account_id,product_id,price_id,api_version) values(c.id,r.environment,o.code,m.account_id,m.product_id,m.price_id,'2026-09-30.endive');
 if p_trial then insert into private.billing047_trial_reservations select kind,fingerprint,c.id from private.trial_current_claims(p_org);end if;
 insert into public.billing_subscriptions(organization_id,plan_version_id,state,period_start,period_end)values(p_org,o.plan_version_id,'pending',now(),now()+interval '1 second')
 on conflict(organization_id)do update set state='pending',plan_version_id=excluded.plan_version_id,pending_version_id=null,cancel_at_end=false,revision=public.billing_subscriptions.revision+1;
 insert into private.billing047_commands values(p_org,auth.uid(),p_key,'checkout',o.plan_version_id,c.id);
 insert into private.billing047_audit(contract_id,event) values(c.id,'stripe_checkout_prepared');return c.id;
end;$$;

-- Service role only. The browser cannot set provider facts or grant capabilities.
create function public.billing069_service(p_action text,p_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.billing047_contracts;s private.billing069_stripe;r private.billing069_runtime;out_ jsonb;e private.billing069_inbox;begin
 perform pg_advisory_xact_lock(734921501);select * into r from private.billing069_runtime;
 if p_action='runtime' then return to_jsonb(r);end if;
 if p_data->>'environment' not in('test','production') or p_data->>'account_id' is null then raise exception 'billing_environment_mismatch';end if;
 if p_action='list' then return coalesce((select jsonb_agg(contract_id) from private.billing069_stripe bs join private.billing047_contracts bc on bc.id=bs.contract_id where bc.current and bs.environment=p_data->>'environment' and bs.account_id=p_data->>'account_id'),'[]');end if;
 if p_action='receive' then
  insert into private.billing069_inbox(environment,account_id,event_id,kind,object_id,contract_hint,resource_hint,digest)
  values(p_data->>'environment',p_data->>'account_id',p_data->>'event_id',p_data->>'kind',p_data->>'object_id',(p_data->>'contract_hint')::uuid,p_data->>'resource_hint',p_data->>'digest') on conflict do nothing;
  select * into e from private.billing069_inbox where environment=p_data->>'environment' and account_id=p_data->>'account_id' and event_id=p_data->>'event_id';
  if e.digest<>p_data->>'digest' then raise exception 'billing_webhook_conflict';end if;return jsonb_build_object('accepted',true,'status',e.status);
 end if;
 if p_action='inbox' then return coalesce((select jsonb_agg(to_jsonb(x))from(select * from private.billing069_inbox where environment=p_data->>'environment' and account_id=p_data->>'account_id' and status='pending' order by received_at limit 100)x),'[]');end if;
 if p_action in('event_done','event_unbound') then
  update private.billing069_inbox set status=case when p_action='event_done' then 'done' else 'unbound' end,processed_at=clock_timestamp()where environment=p_data->>'environment' and account_id=p_data->>'account_id' and event_id=p_data->>'event_id';return '{}';
 end if;
 if p_action='lookup' then return(select to_jsonb(bc)||to_jsonb(bs) from private.billing069_stripe bs join private.billing047_contracts bc on bc.id=bs.contract_id where bs.environment=p_data->>'environment' and bs.account_id=p_data->>'account_id' and (bc.id::text=p_data->>'resource_id' or bc.provider_id=p_data->>'resource_id' or bs.session_id=p_data->>'resource_id'));end if;
 select * into c from private.billing047_contracts where id=p_id for update;select * into s from private.billing069_stripe where contract_id=p_id;
 if c.provider is distinct from 'stripe' or s.environment is distinct from p_data->>'environment' or s.account_id is distinct from p_data->>'account_id' then raise exception 'billing_provider_mismatch';end if;
 if p_action='get' then return to_jsonb(c)||to_jsonb(s);end if;
 if p_action='lease' then
  out_=public.billing047_service_pre052('lease',p_id,'{}');if out_ is null then return null;end if;return out_||to_jsonb(s);
 end if;
 if c.lease is null or c.lease is distinct from (p_data->>'lease')::uuid or c.lease_until<=clock_timestamp() then raise exception 'billing_lease_conflict';end if;
 if p_action='release' or p_action='error' then return public.billing047_service_pre052(p_action,p_id,p_data);end if;
 if p_action='start' then
  if r.checkout_mode<>'stripe' or not r.confirmation_enabled or r.environment<>s.environment or(s.environment='test' and not c.organization_id=any(r.test_organizations))then raise exception 'billing_checkout_disabled';end if;
  if c.create_started then raise exception 'billing_reconciliation_required';end if;
  if c.trial_reserved and private.billing051_eligibility(c.organization_id,c.id)<>'eligible' then raise exception 'billing_trial_changed';end if;
  update private.billing069_stripe set attempt_at=clock_timestamp()where contract_id=p_id;
  perform public.billing047_service_pre052('start',p_id,p_data);return (select to_jsonb(x)||to_jsonb(y) from private.billing047_contracts x join private.billing069_stripe y on y.contract_id=x.id where x.id=p_id);
 end if;
 if p_action='customer' then
  if s.customer_id is not null and s.customer_id<>p_data->>'customer_id' then raise exception 'billing_binding_mismatch';end if;
  update private.billing069_stripe set customer_id=p_data->>'customer_id'where contract_id=p_id;return '{}';
 end if;
 if p_action='session' then
  if s.session_id is not null and s.session_id<>p_data->>'session_id' then raise exception 'billing_binding_mismatch';end if;
  update private.billing069_stripe set session_id=p_data->>'session_id',session_url=p_data->>'url',session_expires_at=(p_data->>'expires_at')::timestamptz,session_state=p_data->>'status'where contract_id=p_id;
  return '{}';
 end if;
 if p_action='bind' then
  if coalesce(p_data->>'provider_id','')!~'^sub_[A-Za-z0-9]+$'then raise exception 'billing_binding_mismatch';end if;
  return public.billing047_service_pre052('bind',p_id,p_data);
 end if;
 if p_action='apply' then
  if not r.confirmation_enabled or r.environment<>s.environment or(s.environment='test' and not c.organization_id=any(r.test_organizations)) then raise exception 'billing_confirmation_disabled';end if;
  if s.customer_id is distinct from p_data->>'payer_reference' or c.provider_id is distinct from p_data->>'provider_id' or c.amount_cents is distinct from (p_data->>'amount_cents')::int then raise exception 'billing_binding_mismatch';end if;
  if p_data->>'state' not in('authorized','pending','paused','canceled') or jsonb_typeof(p_data->'payments') is distinct from 'array' then raise exception 'billing_response_invalid';end if;
  if c.provider_state='canceled' and p_data->>'state'<>'canceled' then raise exception 'billing_stale_snapshot';end if;
  if c.trial_recorded and (c.trial_start is distinct from (p_data->>'trial_start')::timestamptz or c.trial_end is distinct from (p_data->>'trial_end')::timestamptz)then raise exception 'billing_trial_mismatch';end if;
  if c.trial_reserved and not c.trial_recorded and p_data->>'method_linked'='true' and private.billing051_eligibility(c.organization_id,c.id)<>'eligible' then raise exception 'billing_trial_changed';end if;
  update private.billing047_contracts set cancel_requested=coalesce((p_data->>'cancel_requested')::boolean,false)where id=p_id;
  -- Reuse the original 047 financial state/entitlement/trial/payment ledger.
  -- Provider-specific validity is checked by the Stripe adapter, not MP guards.
  out_=public.billing047_service_pre052('apply',p_id,p_data||jsonb_build_object('operation_done',true));
  update private.billing069_stripe set subscription_status=p_data->>'subscription_status',session_state='complete'where contract_id=p_id;
  return out_;
 end if;
 raise exception 'billing_payload_invalid';
end;$$;

create function public.billing069_command(p_org uuid,p_action text,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$declare c private.billing047_contracts;k private.billing047_commands;begin
 perform private.permission_require(p_org,'billing.manage');perform private.company_lock(p_org);perform pg_advisory_xact_lock(734921501);
 if p_key is null or p_action not in('cancel','resume')then raise exception 'billing_payload_invalid';end if;
 select * into k from private.billing047_commands where organization_id=p_org and key=p_key;
 if found then if k.actor_id<>auth.uid() or k.action<>p_action then raise exception 'billing_key_conflict';end if;return k.contract_id;end if;
 select * into c from private.billing047_contracts where organization_id=p_org and current for update;
 if c.provider is distinct from 'stripe' or c.provider_id is null or c.provider_state='canceled' then raise exception 'billing_transition_invalid';end if;
 if c.operation_state<>'done' or c.lease_until>clock_timestamp() then raise exception 'billing_operation_pending';end if;
 if p_action='resume' and (not c.cancel_requested or greatest(c.trial_end,c.paid_until)<=now())then raise exception 'billing_transition_invalid';end if;
 update private.billing047_contracts set operation=p_action,operation_id=p_key,operation_state='queued'where id=c.id;
 update private.billing069_stripe set operation_requested_at=clock_timestamp()where contract_id=c.id;
 insert into private.billing047_commands values(p_org,auth.uid(),p_key,p_action,null,c.id);
 insert into private.billing047_audit(contract_id,event)values(c.id,'stripe_'||p_action||'_requested');return c.id;
end;$$;

-- The shared grant ledger must identify the actual provider in new audit rows.
do $$declare d text;old_ text=$q$'Mercado Pago subscription and payment method confirmed server-side'$q$;begin
 d=pg_get_functiondef('public.billing047_service_pre052(text,uuid,jsonb)'::regprocedure);
 if (length(d)-length(replace(d,old_,'')))/length(old_)<>1 then raise exception 'billing069_predecessor_mismatch';end if;
 d=replace(d,old_,$q$case when c.provider='stripe' then 'Stripe subscription and payment method confirmed server-side' else 'Mercado Pago subscription and payment method confirmed server-side' end$q$);
 old_=$q$c.trial_reserved and not c.trial_recorded and p_data->>'state'='authorized'and$q$;
 if (length(d)-length(replace(d,old_,'')))/length(old_)<>1 then raise exception 'billing069_predecessor_mismatch';end if;
 d=replace(d,old_,$q$c.trial_reserved and not c.trial_recorded and (p_data->>'state'='authorized' or(c.provider='stripe' and p_data->>'state'='paused' and p_data->>'subscription_status'='trialing')) and$q$);execute d;
end;$$;

create function public.billing069_preflight() returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not private.is_active_user() or not private.has_global_role('super_admin') then raise exception 'access_denied' using errcode='42501';end if;
 return jsonb_build_object('allowed',true,'environment',(select environment from private.billing069_runtime),'mappings',coalesce((select jsonb_agg(to_jsonb(m)) from private.billing069_mappings m where m.environment=(select environment from private.billing069_runtime)),'[]'));
end;$$;
revoke all on function public.billing069_preflight() from public,anon,authenticated,service_role;
grant execute on function public.billing069_preflight() to authenticated;

-- Owner-operated configuration RPC, never exposed in the browser. No secrets.
create function public.billing069_configure(p_mode text,p_environment text,p_confirmation boolean,p_test_orgs uuid[],p_entries jsonb) returns void language plpgsql security definer set search_path='' as $$declare e jsonb;old_ private.billing069_mappings;begin
 perform pg_advisory_xact_lock(734921501);
 if p_mode not in('disabled','internal','stripe') or p_environment not in('test','production') or p_confirmation is null or p_test_orgs is null or jsonb_typeof(p_entries) is distinct from 'array' then raise exception 'billing_configuration_invalid';end if;
 for e in select value from jsonb_array_elements(p_entries)loop
  perform private.company_keys(e,array['code','account_id','product_id','price_id']);
  select * into old_ from private.billing069_mappings where environment=p_environment and code=e->>'code';
  if old_.code is not null and (old_.account_id<>e->>'account_id' or old_.product_id<>e->>'product_id' or old_.price_id<>e->>'price_id') then raise exception 'billing_mapping_immutable';end if;
  if exists(select 1 from private.billing069_mappings where environment<>p_environment and (price_id=e->>'price_id' or product_id=e->>'product_id'))then raise exception 'billing_environment_mismatch';end if;
  insert into private.billing069_mappings values(p_environment,e->>'code',e->>'account_id',e->>'product_id',e->>'price_id') on conflict(environment,code)do nothing;
 end loop;
 if p_mode='stripe' and (not p_confirmation or (select count(*)from private.billing069_mappings where environment=p_environment)<>3 or(select count(distinct account_id||':'||product_id)from private.billing069_mappings where environment=p_environment)<>1)then raise exception 'billing_configuration_invalid';end if;
 update private.billing069_runtime set checkout_mode=p_mode,environment=p_environment,confirmation_enabled=p_confirmation,test_organizations=p_test_orgs;
 insert into private.billing047_audit(event)values('stripe_configuration_changed');
end;$$;

revoke all on function private.billing061_contract_scope_pre069(),private.billing061_contract_scope(),public.billing047_service_pre069(text,uuid,jsonb),public.billing047_prepare_pre069(uuid,text,uuid,uuid,boolean),
 public.billing047_service(text,uuid,jsonb),public.billing047_prepare(uuid,text,uuid,uuid,boolean),public.billing069_context(uuid),public.billing069_prepare(uuid,text,uuid,boolean,boolean),public.billing069_command(uuid,text,uuid),public.billing069_service(text,uuid,jsonb),public.billing069_configure(text,text,boolean,uuid[],jsonb) from public,anon,authenticated,service_role;
grant execute on function public.billing047_service(text,uuid,jsonb),public.billing069_service(text,uuid,jsonb),public.billing069_configure(text,text,boolean,uuid[],jsonb) to service_role;
grant execute on function public.billing047_prepare(uuid,text,uuid,uuid,boolean),public.billing069_context(uuid),public.billing069_prepare(uuid,text,uuid,boolean,boolean),public.billing069_command(uuid,text,uuid)to authenticated;
commit;

-- SYZIA 061 / C. Preparation only: legacy stays selected until explicit owner apply.
begin;
create table private.billing061_runtime(singleton boolean primary key default true check(singleton),environment text not null default 'legacy'check(environment in('legacy','sandbox','production')));
insert into private.billing061_runtime values(true,'legacy');
create table private.billing061_batches(id uuid primary key,environment text not null,request_hash text not null,result jsonb not null,created_at timestamptz not null default now());
create table private.billing061_offers(id uuid primary key default gen_random_uuid(),environment text not null check(environment in('sandbox','production')),code text not null references private.billing047_offers(code),plan_version_id uuid not null unique references public.billing_plan_versions(id),source_version_id uuid not null references public.billing_plan_versions(id),trial_plan_id text not null,paid_plan_id text not null,collector_id text not null,application_id text not null,batch_id uuid not null references private.billing061_batches(id),active boolean not null default true,created_at timestamptz not null default now(),check(trial_plan_id<>paid_plan_id),unique(environment,trial_plan_id),unique(environment,paid_plan_id));
create unique index billing061_active_offer on private.billing061_offers(environment,code)where active;
create table private.billing061_notifications(environment text not null,kind text not null,resource_id text not null,received_at timestamptz not null default now(),primary key(environment,kind,resource_id));
alter table private.billing047_contracts add column provider_environment text not null default 'legacy'check(provider_environment in('legacy','sandbox','production')),add column mapping_id uuid references private.billing061_offers(id);
do $$declare n text;begin foreach n in array array['billing061_runtime','billing061_batches','billing061_offers','billing061_notifications']loop execute format('alter table private.%I enable row level security',n);execute format('alter table private.%I force row level security',n);execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);end loop;end;$$;
create function private.billing061_contract_scope()returns trigger language plpgsql security definer set search_path=''as $$declare env_ text;m private.billing061_offers;begin
 if tg_op='UPDATE'then if new.provider_environment is distinct from old.provider_environment or new.mapping_id is distinct from old.mapping_id then raise exception 'billing_environment_immutable';end if;return new;end if;
 select environment into env_ from private.billing061_runtime where singleton;
 if env_<>'legacy'then
 select *into m from private.billing061_offers where plan_version_id=new.plan_version_id and environment=env_ and active;
 if m.id is null or new.provider_plan_id not in(m.trial_plan_id,m.paid_plan_id)then raise exception 'billing_environment_mismatch';end if;
 new.provider_environment=env_;new.mapping_id=m.id;
 elsif new.provider_environment<>'legacy'or new.mapping_id is not null then raise exception 'billing_environment_mismatch';end if;return new;
end;$$;
create trigger billing061_contract_scope before insert or update on private.billing047_contracts for each row execute function private.billing061_contract_scope();
alter function private.billing047_offer(uuid)rename to billing047_offer_pre061;
create function private.billing047_offer(p_version uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$declare env_ text;r jsonb;begin
 select environment into env_ from private.billing061_runtime where singleton;
 if env_='legacy'then return private.billing047_offer_pre061(p_version);end if;
 select to_jsonb(o)||jsonb_build_object('amount_cents',v.price_cents,'currency','BRL','interval_months',1,'member_limit',v.member_limit)into r from private.billing061_offers o join public.billing_plan_versions v on v.id=o.plan_version_id join public.billing_plans p on p.id=v.plan_id where v.id=p_version and o.environment=env_ and o.active and p.active and p.available and p.revision=v.version and not v.human_support and v.interval_months=1 and v.trial_days=7 and v.price_cents=case o.code when 'essencial'then 4990 when 'profissional'then 8990 when 'equipe'then 14990 end;
 if r is null then raise exception 'billing_plan_unavailable';end if;return r;
end;$$;
alter function public.billing047_context(uuid)rename to billing047_context_pre061;
create function public.billing047_context(p_org uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare r jsonb;env_ text;catalog_ jsonb;begin
 r=public.billing047_context_pre061(p_org);select environment into env_ from private.billing061_runtime where singleton;
 if env_='legacy'then return r;end if;
 select coalesce(jsonb_agg(jsonb_build_object('code',o.code,'version_id',v.id,'plan_id',p.id,'name',p.name,'price_cents',v.price_cents,'trial_days',7,'member_limit',v.member_limit,'capabilities',v.capabilities)order by v.price_cents),'[]')into catalog_ from private.billing061_offers o join public.billing_plan_versions v on v.id=o.plan_version_id join public.billing_plans p on p.id=v.plan_id where o.environment=env_ and o.active and p.active and p.available and p.revision=v.version;
 return r||jsonb_build_object('catalog',catalog_,'environment',env_);
end;$$;
-- Old binaries fail closed after activation; before activation their behavior stays unchanged.
alter function public.billing047_service(text,uuid,jsonb)rename to billing047_service_pre061;
create function public.billing047_service(p_action text,p_id uuid,p_data jsonb)returns jsonb language plpgsql security definer set search_path=''as $$declare env_ text;r jsonb;cid uuid;begin
 select environment into env_ from private.billing061_runtime where singleton;
 if coalesce(p_data->>'environment','legacy')<>env_ then raise exception 'billing_environment_mismatch';end if;
 if env_='legacy'then return public.billing047_service_pre061(p_action,p_id,p_data);end if;
 if exists(select 1 from private.billing061_offers where environment=env_ and active and(collector_id is distinct from p_data->>'runtime_collector_id'or application_id is distinct from p_data->>'runtime_application_id'))then raise exception 'billing_environment_identity_mismatch';end if;
 if p_action='queue_notification'then
 if p_data->>'kind'not in('subscription_preapproval','subscription_authorized_payment','payment')or coalesce(p_data->>'resource_id','')!~'^[a-zA-Z0-9_-]{1,160}$'then raise exception 'billing_webhook_invalid';end if;
 insert into private.billing061_notifications(environment,kind,resource_id)values(env_,p_data->>'kind',p_data->>'resource_id')on conflict do nothing;return '{}'::jsonb;end if;
 if p_action='list'then return coalesce((select jsonb_agg(id)from private.billing047_contracts where current and provider_environment=env_),'[]');end if;
 cid=p_id;
 if p_action='lookup'then select id into cid from private.billing047_contracts where provider_id=p_data->>'provider_id';end if;
 if cid is not null and exists(select 1 from private.billing047_contracts where id=cid and provider_environment<>env_)then raise exception 'billing_environment_mismatch';end if;
 return public.billing047_service_pre061(p_action,p_id,p_data);
end;$$;
create function public.billing061_configuration(p_action text,p_data jsonb default '{}')returns jsonb language plpgsql security definer set search_path=''as $$
declare digest_ text;env_ text;entry jsonb;v public.billing_plan_versions;p public.billing_plans;new_ uuid;result_ jsonb='[]';request_hash_ text;batch_ uuid;existing_ private.billing061_batches;begin
 perform pg_advisory_xact_lock(734921501);
 select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(o)order by code),'[]')::text,'UTF8')),'hex')into digest_ from private.billing047_offers o;
 select environment into env_ from private.billing061_runtime where singleton;
 if p_action='preflight'then return jsonb_build_object('environment',env_,'legacy_mapping_sha256',digest_,'blocking_contracts',(select count(*)from private.billing047_contracts where current and(provider_state is distinct from 'canceled'or operation_state<>'done')),'legacy_contracts',(select count(*)from private.billing047_contracts where provider_environment='legacy'),'mappings',coalesce((select jsonb_agg(to_jsonb(o))from private.billing061_offers o),'[]'));end if;
 if p_action<>'configure'or coalesce(p_data->>'environment','')not in('sandbox','production')or p_data->>'account_confirmed'is distinct from 'true'or p_data->>'provider_validated'is distinct from 'true'or p_data->>'expected_legacy_sha256' is distinct from digest_ then raise exception 'billing_configuration_precondition';end if;
 batch_=(p_data->>'batch_id')::uuid;request_hash_=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 select *into existing_ from private.billing061_batches where id=batch_;
 if existing_.id is not null then if existing_.request_hash<>request_hash_ then raise exception 'idempotency_conflict';end if;return existing_.result;end if;
 if env_<>'legacy'then raise exception 'billing_environment_already_configured';end if;
 if exists(select 1 from private.billing047_contracts where current and(provider_state is distinct from 'canceled'or operation_state<>'done'))then raise exception 'billing_legacy_contracts_require_review';end if;
 if jsonb_typeof(p_data->'entries')is distinct from 'array'or jsonb_array_length(p_data->'entries')<>3 or(select count(distinct x->>'code')from jsonb_array_elements(p_data->'entries')x)<>3 then raise exception 'billing_plan_mapping_invalid';end if;
 if(select count(distinct x->>'collector_id')from jsonb_array_elements(p_data->'entries')x)<>1 or(select count(distinct x->>'application_id')from jsonb_array_elements(p_data->'entries')x)<>1 then raise exception 'billing_plan_mapping_invalid';end if;
 if(select count(distinct id_)from jsonb_array_elements(p_data->'entries')x cross join lateral(values(x->>'trial_plan_id'),(x->>'paid_plan_id'))v(id_))<>6 then raise exception 'billing_plan_mapping_invalid';end if;
 if exists(select 1 from jsonb_array_elements(p_data->'entries')x cross join lateral(values(x->>'trial_plan_id'),(x->>'paid_plan_id')) ids(id_)where exists(select 1 from private.billing047_offers o where ids.id_ in(o.trial_plan_id,o.paid_plan_id))or exists(select 1 from private.billing047_contracts c where c.provider_plan_id=ids.id_))then raise exception 'billing_legacy_plan_reuse_forbidden';end if;
 insert into private.billing061_batches values(batch_,p_data->>'environment',request_hash_,'[]',now());
 for entry in select value from jsonb_array_elements(p_data->'entries')loop
 perform private.company_keys(entry,array['code','source_version_id','trial_plan_id','paid_plan_id','collector_id','application_id']);
 if coalesce(entry->>'trial_plan_id','')!~'^[a-zA-Z0-9_-]{1,160}$'or coalesce(entry->>'paid_plan_id','')!~'^[a-zA-Z0-9_-]{1,160}$'or coalesce(entry->>'collector_id','')!~'^[0-9]+$'or coalesce(entry->>'application_id','')!~'^[0-9]+$'then raise exception 'billing_plan_mapping_invalid';end if;
 select bv.*into v from private.billing047_offers o join public.billing_plan_versions bv on bv.id=o.plan_version_id where o.code=entry->>'code'and bv.id=(entry->>'source_version_id')::uuid;
 select *into p from public.billing_plans where id=v.plan_id for update;
 if v.id is null or not p.active or not p.available or p.revision<>v.version or v.price_cents<>(case entry->>'code'when'essencial'then 4990 when'profissional'then 8990 when'equipe'then 14990 else 0 end) or v.interval_months<>1 or v.trial_days<>7 or v.human_support then raise exception 'billing_plan_unavailable';end if;
 new_=gen_random_uuid();
 update public.billing_plans set revision=revision+1 where id=p.id;
 insert into public.billing_plan_versions select(jsonb_populate_record(null::public.billing_plan_versions,to_jsonb(v)||jsonb_build_object('id',new_,'version',p.revision+1,'created_at',now()))).*;
 insert into private.billing061_offers(environment,code,plan_version_id,source_version_id,trial_plan_id,paid_plan_id,collector_id,application_id,batch_id)values(p_data->>'environment',entry->>'code',new_,v.id,entry->>'trial_plan_id',entry->>'paid_plan_id',entry->>'collector_id',entry->>'application_id',batch_);
 result_=result_||jsonb_build_array(jsonb_build_object('code',entry->>'code','plan_version_id',new_,'source_version_id',v.id));
 end loop;
 update private.billing061_runtime set environment=p_data->>'environment'where singleton;
 update private.billing061_batches set result=result_ where id=batch_;
 insert into private.billing047_audit(event)values('environment_configuration_061');return result_;
end;$$;
revoke all on function private.billing061_contract_scope(),private.billing047_offer_pre061(uuid),private.billing047_offer(uuid),public.billing047_context_pre061(uuid),public.billing047_service_pre061(text,uuid,jsonb),public.billing047_context(uuid),public.billing047_service(text,uuid,jsonb),public.billing061_configuration(text,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.billing047_context(uuid)to authenticated;
grant execute on function public.billing047_service(text,uuid,jsonb),public.billing061_configuration(text,jsonb)to service_role;
-- Preserve the existing lease-validated internal failure path after the outer scope check.
do $$declare d text;begin
 d=pg_get_functiondef('public.billing051_failure(uuid,uuid,text,integer,text)'::regprocedure);
 if position('public.billing047_service(' in d)=0 then raise exception 'billing_failure_contract_missing';end if;
 d=replace(d,'public.billing047_service(','public.billing047_service_pre061(');execute d;
end;$$;
commit;

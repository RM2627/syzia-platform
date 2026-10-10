-- SYZIA 040: incremental sobre 039, sem reescrever contratos ou dados operacionais.
begin;


create table private.billing_plan_homologations(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 plan_version_id uuid not null references public.billing_plan_versions(id),
 started_by uuid not null references public.profiles(id),started_at timestamptz not null default clock_timestamp(),
 ended_by uuid references public.profiles(id),ended_at timestamptz,reason text not null check(length(btrim(reason))between 10 and 500)
);
create unique index billing_one_homologation on private.billing_plan_homologations(organization_id)where ended_at is null;
alter table private.billing_plan_homologations enable row level security;
alter table private.billing_plan_homologations force row level security;
revoke all on private.billing_plan_homologations from public,anon,authenticated,service_role;
create function private.billing_homologation(p_org uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select jsonb_build_object('id',h.id,'started_at',h.started_at,'reason',h.reason,'plan',to_jsonb(v)||jsonb_build_object('name',p.name),'notice','PLANO APLICADO PARA HOMOLOGAÇÃO — não representa assinatura ou pagamento.')
 from private.billing_plan_homologations h join public.billing_plan_versions v on v.id=h.plan_version_id join public.billing_plans p on p.id=v.plan_id where h.organization_id=p_org and h.ended_at is null;$$;
create function private.billing_effective_version(p_org uuid)returns public.billing_plan_versions language sql stable security definer set search_path=''as $$
 select v from public.billing_plan_versions v where v.id=coalesce((select plan_version_id from private.billing_plan_homologations where organization_id=p_org and ended_at is null),(select plan_version_id from public.billing_subscriptions where organization_id=p_org));$$;
alter function private.entitlement(uuid,text)rename to entitlement_039;
create function private.entitlement(p_org uuid,p_feature text)returns boolean language plpgsql stable security definer set search_path=''as $$declare v public.billing_plan_versions;begin
 if not exists(select 1 from public.organizations where id=p_org and status='active')then return false;end if;
 if p_feature='setup'then return true;end if;
 if exists(select 1 from private.billing_plan_homologations where organization_id=p_org and ended_at is null)then
 v=private.billing_effective_version(p_org);
 if p_feature='finance_analytics'then return coalesce((v.capabilities->>'finance')::boolean,true)and coalesce((v.capabilities->>'analytics')::boolean,true);end if;
 return coalesce((v.capabilities->>p_feature)::boolean,p_feature in('finance','analytics'));
 end if;
 return private.entitlement_039(p_org,p_feature);end;$$;
create function public.billing_homologation_set(p_org uuid,p_version uuid,p_expected uuid,p_reason text,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
 declare h private.billing_plan_homologations;prior public.billing_commands;payload jsonb;result_ jsonb;begin
 perform private.lock_authorize('global');
 if p_key is null or p_reason is null or length(btrim(p_reason))not between 10 and 500 or not exists(select 1 from public.organizations where id=p_org and status='active')then raise exception 'homologation_invalid';end if;
 payload=jsonb_build_object('action','homologation','version',p_version,'expected',p_expected,'reason',btrim(p_reason));
 select *into prior from public.billing_commands where organization_id=p_org and actor_id=auth.uid()and key=p_key;
 if found then if prior.payload<>payload then raise exception 'billing_key_conflict';end if;return prior.result;end if;
 select *into h from private.billing_plan_homologations where organization_id=p_org and ended_at is null for update;
 if h.id is distinct from p_expected then raise exception 'homologation_conflict'using errcode='40001';end if;
 if p_version is not null and not exists(select 1 from public.billing_plan_versions where id=p_version)then raise exception 'billing_plan_unavailable';end if;
 update private.billing_plan_homologations set ended_at=clock_timestamp(),ended_by=auth.uid()where id=h.id;
 if p_version is not null then
 insert into private.billing_plan_homologations(organization_id,plan_version_id,started_by,reason)values(p_org,p_version,auth.uid(),btrim(p_reason))returning *into h;
 end if;
 if not private.entitlement(p_org,'human_support')then update public.attendant_organizations set status='suspended'where organization_id=p_org and status='active';end if;
 perform private.access_audit(p_org,auth.uid(),case when p_version is null then 'plan_homologation_ended'else 'plan_homologation_applied'end,h.id);
 result_=jsonb_build_object('homologation',private.billing_homologation(p_org),'ended',p_version is null);
 insert into public.billing_commands values(p_org,auth.uid(),p_key,payload,result_,clock_timestamp());return result_;end;$$;

CREATE OR REPLACE FUNCTION private.billing_assert_capacity(p_org uuid, p_metric text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare s public.billing_subscriptions;v public.billing_plan_versions;lim int;begin
 perform pg_advisory_xact_lock(734921501);
 if private.internal_exemption(p_org)is not null and private.billing_homologation(p_org)is null then return;end if;
 if p_metric in('requests','tickets','followups','software')and not private.entitlement(p_org,'software')then raise exception 'billing_subscription_required'using errcode='42501';end if;
 if p_metric='followups'and not private.entitlement(p_org,'commercial_followups')then raise exception 'billing_feature_unavailable'using errcode='42501';end if;
 select * into s from public.billing_subscriptions where organization_id=p_org;
 if private.billing_homologation(p_org)is null then if s.organization_id is null then
 if exists(select 1 from private.trial_requests where organization_id=p_org)then raise exception 'billing_subscription_required'using errcode='42501';end if;return;end if;
 if private.billing_effective(s)not in('active','trial')then raise exception 'billing_subscription_required'using errcode='42501';end if;
 end if; v=private.billing_effective_version(p_org);
 lim=case p_metric when 'members'then v.member_limit when 'services'then v.service_limit when 'requests'then v.request_limit when 'tickets'then v.ticket_limit when 'followups'then v.followup_limit end;
 if not private.billing_capacity_allows((private.billing_usage_snapshot(p_org)->>p_metric)::bigint,lim)then raise exception 'billing_limit_reached'using errcode='P0001',detail=p_metric;end if;
end;$function$;

CREATE OR REPLACE FUNCTION private.billing_usage_snapshot(p_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('month',date_trunc('month',now()at time zone 'America/Recife')::date,'timezone','America/Recife',
 'members',(select count(*)from public.organization_members m where m.organization_id=p_org and m.status='active'and not exists(select 1 from public.platform_roles r where r.user_id=m.user_id and r.role='super_admin'and r.active)),
 'services',(select count(*)from public.services where organization_id=p_org and active),
 'requests',(select count(*)from public.billing_usage where organization_id=p_org and metric='requests'and month=date_trunc('month',now()at time zone 'America/Recife')::date),
 'tickets',(select count(*)from public.billing_usage where organization_id=p_org and metric=case when coalesce((select quota_semantics from private.billing_effective_version(p_org)),2)=2 then 'human_tickets'else 'tickets'end and month=date_trunc('month',now()at time zone 'America/Recife')::date),
 'followups',(select count(*)from public.billing_usage where organization_id=p_org and metric=case when coalesce((select quota_semantics from private.billing_effective_version(p_org)),2)=2 then 'human_followups'else 'followups'end and month=date_trunc('month',now()at time zone 'America/Recife')::date));$function$;

CREATE OR REPLACE FUNCTION private.billing_ticket_service()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid;tid uuid;ledger text;sem int;begin
 if tg_table_name='ticket_messages'then if new.kind='customer'then return new;end if;actor=new.author_id;tid=new.ticket_id;
 else if new.event not in('quote','booking')or new.actor_id is null then return new;end if;actor=new.actor_id;tid=new.ticket_id;end if;
 perform pg_advisory_xact_lock(734921501);
 select quota_semantics into sem from private.billing_effective_version(new.organization_id);
 if coalesce(sem,2)=2 then
 if not private.billing_shared_actor(new.organization_id,actor)then return new;end if;ledger='human_tickets';
 else ledger='tickets';end if;
 if exists(select 1 from public.billing_usage where organization_id=new.organization_id and metric=ledger and entity_id=tid)then return new;end if;
 perform private.billing_assert_capacity(new.organization_id,'tickets');
 insert into public.billing_usage(organization_id,metric,entity_id,month)values(new.organization_id,ledger,tid,date_trunc('month',now()at time zone 'America/Recife')::date)on conflict do nothing;
 return new;end;$function$;

CREATE OR REPLACE FUNCTION private.billing_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare metric_ text;ledger text;org uuid;id_ uuid;sem int;begin
 org=new.organization_id;
 if tg_table_name='organization_members'then
 if new.status<>'active'or(tg_op='UPDATE'and old.status='active')or exists(select 1 from public.platform_roles where user_id=new.user_id and role='super_admin'and active)then return new;end if;metric_='members';
 elsif tg_table_name='services'then if not new.active or(tg_op='UPDATE'and old.active)then return new;end if;metric_='services';
 elsif tg_table_name='quote_requests'then if new.state<>'submitted'or old.state<>'draft'then return new;end if;metric_='requests';ledger='requests';id_=new.id;
 elsif tg_table_name='commercial_attempts'then
 if not private.entitlement(org,'commercial_followups')then raise exception 'billing_feature_unavailable'using errcode='42501';end if;
 select quota_semantics into sem from private.billing_effective_version(org);
 metric_='followups';ledger='followups';id_=new.id;
 if coalesce(sem,2)=2 then
 if private.billing_shared_actor(org,new.actor_id)then ledger='human_followups';else metric_='software';end if;end if;
 elsif tg_table_name in('opportunities','appointments','quote_versions')then
 if tg_table_name='quote_versions'then if new.kind='estimate'then return new;end if;end if;metric_='software';
 else raise exception 'billing_guard_scope_invalid';end if;
 perform private.billing_assert_capacity(org,metric_);
 if ledger is not null then insert into public.billing_usage(organization_id,metric,entity_id,month)values(org,ledger,id_,date_trunc('month',now()at time zone 'America/Recife')::date)on conflict do nothing;end if;
 return new;end;$function$;

CREATE OR REPLACE FUNCTION public.billing_context(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result_ jsonb;begin
 result_=private.billing_context_base(p_org);return result_||jsonb_build_object('homologation',private.billing_homologation(p_org),'effective_plan',to_jsonb(private.billing_effective_version(p_org)),'trial',private.trial_context(p_org));
end;$function$;

CREATE OR REPLACE FUNCTION public.billing_admin_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not private.has_global_role('super_admin') then raise exception 'access_denied' using errcode='42501';end if;
 return jsonb_build_object('plan_versions',(select coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('name',p.name)order by p.position,p.name,v.version desc),'[]')from public.billing_plan_versions v join public.billing_plans p on p.id=v.plan_id),'plans',private.billing_catalog(true),'organizations',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from(select o.id,o.name,o.status,private.billing_homologation(o.id) homologation,s.state,private.billing_effective(s) effective_state,s.period_end,s.revision,p.name plan_name,private.billing_usage_snapshot(o.id) usage from public.organizations o left join public.billing_subscriptions s on s.organization_id=o.id left join public.billing_plan_versions v on v.id=s.plan_version_id left join public.billing_plans p on p.id=v.plan_id order by o.name limit 500)x),'[]'::jsonb),'mock_enabled',(select mock_enabled from private.billing_runtime),'revenue_cents',null,'financial_metrics_status','not_available_without_real_payment_events');
end;$function$;

CREATE OR REPLACE FUNCTION public.billing_capabilities(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$begin
 if not private.is_active_user() or not private.access_scope(p_org) or not (private.can_access_org(p_org)or private.has_global_role('super_admin')) then raise exception 'access_denied' using errcode='42501';end if;
 return jsonb_build_object('homologation',case when private.billing_can_read(p_org)then private.billing_homologation(p_org)end,'finance',private.entitlement(p_org,'finance'),'analytics',private.entitlement(p_org,'analytics'),'software',private.entitlement(p_org,'software'),'human_support',private.entitlement(p_org,'human_support'),'commercial_followups',private.entitlement(p_org,'commercial_followups'),'exemption',case when private.billing_can_read(p_org)then private.internal_exemption(p_org)end,'commercial_state',case when private.billing_homologation(p_org)is not null then 'homologation'when private.internal_exemption(p_org)is not null then 'internal_exempt' when exists(select 1 from public.billing_subscriptions where organization_id=p_org)then(select private.billing_effective(s)from public.billing_subscriptions s where organization_id=p_org)else 'setup' end);
end;$function$;


alter table public.billing_plans add column featured boolean not null default false;
alter table public.billing_plans add column featured_label text not null default 'Mais recomendado'check(length(btrim(featured_label))between 1 and 60);
create unique index billing_one_featured_plan on public.billing_plans(featured)where featured and site_visible;
create function public.billing_plan_feature(p_plan uuid,p_label text,p_previous uuid)returns void language plpgsql security definer set search_path=''as $$declare old_ uuid;begin
 perform private.lock_authorize('global');select id into old_ from public.billing_plans where featured and site_visible for update;
 if old_ is distinct from p_previous then raise exception 'featured_plan_changed'using errcode='40001';end if;
 if p_plan is not null and(not exists(select 1 from public.billing_plans where id=p_plan and site_visible and active and available)or p_label is null or length(btrim(p_label))not between 1 and 60)then raise exception 'featured_plan_invalid';end if;
 update public.billing_plans set featured=false where featured;
 update public.billing_plans set featured=true,featured_label=btrim(p_label)where id=p_plan;
 perform private.access_audit(null,auth.uid(),'plan_feature_changed',p_plan);end;$$;

CREATE OR REPLACE FUNCTION public.acquisition_plans()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'featured',p.featured,'featured_label',p.featured_label,'name',p.name,'description',p.description,'self_service',p.self_service,'trial_eligible',p.self_service_trial,'version',to_jsonb(v))order by p.position,p.name),'[]')from public.billing_plans p join public.billing_plan_versions v on v.plan_id=p.id and v.version=p.revision where p.active and p.available and p.site_visible;$function$;

alter table private.selfservice_consents alter column payment_reference drop not null;alter table private.selfservice_drafts drop constraint selfservice_drafts_state_check;alter table private.selfservice_drafts add constraint selfservice_drafts_state_check check(state in('review','ineligible','payment_pending','ready','completed','cancelled'));

CREATE OR REPLACE FUNCTION private.selfservice_eligibility(p_user uuid, p_kind text, p_fingerprint bytea)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$declare policy_ private.trial_policy;begin
 select * into policy_ from private.trial_policy;
 
 if exists(select 1 from private.trial_consumed_keys where(kind='account'and fingerprint=private.trial_fingerprint('account',p_user::text))or(kind='business'and fingerprint=p_fingerprint))then return 'previous_identity';end if;
 if not policy_.auto_enabled then return 'manual_policy';end if;
 if not (policy_.required_types && (case when p_kind='CPF'then array['business','responsible']else array['business']end)) then return 'verification_required';end if;
 if 'phone'=any(policy_.required_types)then return 'verification_required';end if;
 return 'eligible';end;$function$;

CREATE OR REPLACE FUNCTION public.selfservice_save(p_id uuid, p_revision integer, p_name text, p_slug text, p_phone text, p_kind text, p_document text, p_plan uuid, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d private.selfservice_drafts;v public.billing_plan_versions;doc text;fp bytea;why text;until_ timestamptz;hash_ bytea;begin
 if not private.is_active_user()then raise exception 'access_denied'using errcode='42501';end if;
 perform pg_advisory_xact_lock(734921501);
 hash_=private.trial_fingerprint('selfservice_request',jsonb_build_array(p_name,p_slug,p_phone,p_kind,p_document,p_plan)::text);
 select * into d from private.selfservice_drafts where user_id=auth.uid()and request_key=p_key;
 if d.id is not null then if d.request_hash<>hash_ then raise exception 'idempotency_conflict';end if;return private.selfservice_projection(d.id);end if;
 select pv.*into v from public.billing_plan_versions pv join public.billing_plans p on p.id=pv.plan_id and p.revision=pv.version where p.id=p_plan and p.active and p.available and p.site_visible and p.self_service;
 if v.id is null then raise exception 'billing_trial_unavailable';end if;
 if p_id is null then select *into d from private.selfservice_drafts where user_id=auth.uid()and state not in('completed','cancelled');else select *into d from private.selfservice_drafts where id=p_id and user_id=auth.uid()for update;if d.id is null then raise exception 'access_denied'using errcode='42501';end if;end if;
 if d.id is not null and(d.revision<>p_revision or d.state in('completed','cancelled'))then raise exception 'selfservice_revision_conflict'using errcode='40001';end if;
 doc=private.document_normalize(p_kind,p_document);if doc is null then raise exception 'document_invalid';end if;
 fp=private.trial_fingerprint('business','BR:'||p_kind||':'||doc);why=case when v.trial_days>0 and (select self_service_trial from public.billing_plans where id=v.plan_id)then private.selfservice_eligibility(auth.uid(),p_kind,fp)else 'trial_not_offered'end;until_=clock_timestamp()+make_interval(days=>v.trial_days);
 if d.id is null then
 insert into private.selfservice_drafts(user_id,request_key,name,slug,phone,document_kind,document_masked,registration_fingerprint,identity_fingerprint,responsible_fingerprint,request_hash,plan_version_id,quote_until,trial_end,state,eligibility)
 values(auth.uid(),p_key,btrim(p_name),p_slug,btrim(p_phone),p_kind,case when p_kind='CPF'then '***.***.***-'else '**.***.***/****-'end||right(doc,2),private.trial_fingerprint('registration','BR:'||p_kind||':'||doc),fp,case when p_kind='CPF'then private.trial_fingerprint('responsible','BR:CPF:'||doc)end,hash_,v.id,clock_timestamp()+interval '20 minutes',until_,case when why='eligible'then 'ready'when why in('previous_identity','trial_not_offered')then 'ineligible'else 'review'end,why)returning *into d;
 insert into private.acquisition_events(user_id,event)values(auth.uid(),'registration_started');
 else
 update private.selfservice_drafts set request_key=p_key,name=btrim(p_name),slug=p_slug,phone=btrim(p_phone),document_kind=p_kind,document_masked=case when p_kind='CPF'then '***.***.***-'else '**.***.***/****-'end||right(doc,2),registration_fingerprint=private.trial_fingerprint('registration','BR:'||p_kind||':'||doc),identity_fingerprint=fp,responsible_fingerprint=case when p_kind='CPF'then private.trial_fingerprint('responsible','BR:CPF:'||doc)end,request_hash=hash_,plan_version_id=v.id,quote_until=clock_timestamp()+interval '20 minutes',trial_end=until_,revision=revision+1,state=case when why='eligible'then 'ready'when why in('previous_identity','trial_not_offered')then 'ineligible'else 'review'end,eligibility=why where id=d.id returning *into d;
 end if;
 return private.selfservice_projection(d.id);end;$function$;

CREATE OR REPLACE FUNCTION public.selfservice_complete(p_id uuid, p_revision integer, p_consent boolean, p_conditions text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d private.selfservice_drafts;m private.selfservice_payments;v public.billing_plan_versions;a private.enterprise_accounts;org uuid;why text;statement_ text;k text;begin
 if not private.is_active_user()then raise exception 'access_denied'using errcode='42501';end if;
 perform pg_advisory_xact_lock(734921501);select *into d from private.selfservice_drafts where id=p_id and user_id=auth.uid()for update;
 if d.id is null then raise exception 'access_denied'using errcode='42501';end if;
 if d.state='completed'then return private.selfservice_projection(d.id);end if;
 if p_consent is distinct from true or p_conditions<>'selfservice-040'then raise exception 'selfservice_consent_required';end if;
 if d.revision<>p_revision or d.quote_until<=clock_timestamp()then raise exception 'selfservice_quote_expired';end if;
 
 select pv.*into v from public.billing_plan_versions pv join public.billing_plans p on p.id=pv.plan_id and p.revision=pv.version where pv.id=d.plan_version_id and p.active and p.available and p.site_visible and p.self_service and p.self_service_trial;
 if v.id is null then raise exception 'billing_plan_unavailable';end if;
 why=private.selfservice_eligibility(auth.uid(),d.document_kind,d.identity_fingerprint);if why<>'eligible'then update private.selfservice_drafts set state=case when why in('previous_identity','trial_not_offered')then 'ineligible'else 'review'end,eligibility=why where id=d.id;return private.selfservice_projection(d.id);end if;
 d.trial_end=clock_timestamp()+make_interval(days=>v.trial_days);update private.selfservice_drafts set trial_end=d.trial_end where id=d.id;
 select *into a from private.enterprise_accounts where user_id=auth.uid()and state='active'order by(organization_id is null)desc,created_at limit 1;
 if a.id is null then raise exception 'access_denied'using errcode='42501';end if;
 insert into public.organizations(name,slug)values(d.name,d.slug)returning id into org;
 update private.enterprise_codes set legal_required=true where organization_id=org;
 insert into public.billing_subscriptions(organization_id,plan_version_id,state,period_start,period_end,trial_used)values(org,v.id,'trial',clock_timestamp(),d.trial_end,true);
 insert into public.organization_members(organization_id,user_id,role)values(org,auth.uid(),'admin_empresa');
 insert into private.enterprise_accounts(organization_id,user_id,username,display_name,contact_email,phone,role,state,requested_by,request_key,activated_at,generation,operation_id)values(org,auth.uid(),a.username,a.display_name,a.contact_email,d.phone,'admin_empresa','active',auth.uid(),gen_random_uuid(),clock_timestamp(),a.generation,a.operation_id);
 update private.organization_verifications set required=true,state='verified',kind=d.document_kind,masked=d.document_masked,fingerprint=d.registration_fingerprint,verified_by=auth.uid(),verified_at=clock_timestamp(),revision=revision+1 where organization_id=org;
 -- Same structural document check as 030; no claim of government verification.
 insert into private.trial_identifiers(organization_id,kind,fingerprint,verified_by,evidence_ref)values(org,'business',d.identity_fingerprint,auth.uid(),'self_declared_structure_033');
 if d.document_kind='CPF'then
 -- responsible is separately namespaced, derived before discarding the raw document.
 insert into private.trial_identifiers(organization_id,kind,fingerprint,verified_by,evidence_ref)values(org,'responsible',d.responsible_fingerprint,auth.uid(),'self_declared_structure_033');end if;
 perform private.trial_record(org,v.id,clock_timestamp(),d.trial_end,'automatic','Self-service: elegibilidade server-side, plano explícito e consentimento; sem pagamento');
 statement_='Grátis até '||to_char(d.trial_end at time zone 'America/Recife','DD/MM/YYYY')||'. Depois, R$ '||replace(to_char(v.price_cents/100.0,'FM999999990.00'),'.',',')||case when v.interval_months=1 then '/mês'else ' a cada '||v.interval_months||' meses'end||' no Plano '||(select name from public.billing_plans where id=v.plan_id)||', mediante contratação após o período gratuito. Esta confirmação não registra pagamento.';
 insert into private.selfservice_consents(draft_id,user_id,organization_id,plan_version_id,price_cents,interval_months,trial_end,statement,payment_reference,simulation,conditions_version)values(d.id,auth.uid(),org,v.id,v.price_cents,v.interval_months,d.trial_end,statement_,null,false,'selfservice-040');
 update private.selfservice_drafts set state='completed',organization_id=org where id=d.id;
 insert into private.acquisition_events(user_id,organization_id,event,simulation)values(auth.uid(),org,'company_registered',false),(auth.uid(),org,'trial_started',false);
 perform private.billing_event(org,'trial_started',null,jsonb_build_object('self_service',true,'simulation',false,'consent',d.id));
 -- Existing business onboarding is initialized only after selecting this company's context.
 return private.selfservice_projection(d.id);end;$function$;

CREATE OR REPLACE FUNCTION private.billing_subscription_action_038(p_org uuid, p_action text, p_plan uuid, p_revision integer, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare why text;s public.billing_subscriptions;v public.billing_plan_versions;prior public.billing_commands;payload jsonb;result_ jsonb;request_ uuid;begin
 perform private.company_lock(p_org); if private.internal_exemption(p_org) is not null then raise exception 'exemption_no_subscription';end if;
 if p_action is distinct from 'trial' then return private.billing_subscription_action_base(p_org,p_action,p_plan,p_revision,p_key);end if;
 if p_key is null then raise exception 'billing_key_required' using errcode='22023';end if;
 payload=jsonb_build_object('action',p_action,'plan',p_plan,'revision',p_revision);
 select * into prior from public.billing_commands where organization_id=p_org and actor_id=auth.uid() and key=p_key;
 if found then if prior.payload<>payload then raise exception 'billing_key_conflict' using errcode='22023';end if;return prior.result;end if;
 select * into s from public.billing_subscriptions where organization_id=p_org;
 if s.organization_id is not null or p_revision is distinct from 0 then return private.billing_subscription_action_base(p_org,p_action,p_plan,p_revision,p_key);end if;
 select pv.* into v from public.billing_plans p join public.billing_plan_versions pv on pv.plan_id=p.id and pv.version=p.revision where p.id=p_plan and p.active and p.available;
 if v.id is null or v.trial_days=0 then raise exception 'billing_trial_unavailable' using errcode='22023';end if;
 why=private.trial_eligibility(p_org);
 if why='eligible' then
 begin
 result_=private.billing_subscription_action_base(p_org,p_action,p_plan,p_revision,p_key);
 select * into s from public.billing_subscriptions where organization_id=p_org;
 perform private.trial_record(p_org,s.plan_version_id,s.period_start,s.period_end,'automatic','Verified eligibility under current policy');
 update private.trial_requests set state='approved',revision=revision+1,decision_reason='Verified automatic eligibility',decided_at=clock_timestamp() where organization_id=p_org and state='pending';
 return result_;
 exception when unique_violation then why='previous_identity'; end;
 end if;
 if why in('previous_grant','previous_identity','previous_review','not_applicable')then
 result_=jsonb_build_object('review_required',false,'eligible',false,'reason',why,'subscription_required',why<>'not_applicable');
 insert into public.billing_commands values(p_org,auth.uid(),p_key,payload,result_,now());return result_;end if;
 select id into request_ from private.trial_requests where organization_id=p_org and state='pending';
 if request_ is null then
 insert into private.trial_requests(organization_id,plan_id,actor_id,risk_reason) values(p_org,p_plan,auth.uid(),why) returning id into request_;
 insert into private.trial_audit(organization_id,actor_id,action,details) values(p_org,auth.uid(),'review_requested',jsonb_build_object('request',request_,'risk',why));end if;
 result_=jsonb_build_object('review_required',true,'request_id',request_);
 insert into public.billing_commands values(p_org,auth.uid(),p_key,payload,result_,now());
 return result_;
end;$function$;


create function public.billing_trial_confirm(p_org uuid,p_kind text,p_document text,p_plan uuid,p_revision integer,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare doc text;fp bytea;begin
 perform private.permission_require(p_org,'billing.manage');perform private.company_lock(p_org);
 if private.billing_homologation(p_org)is not null then raise exception 'homologation_trial_unavailable';end if;
 doc=private.document_normalize(p_kind,p_document);if doc is null then raise exception 'document_invalid';end if;
 fp=private.trial_fingerprint('business','BR:'||p_kind||':'||doc);
 insert into private.trial_identifiers(organization_id,kind,fingerprint,verified_by,evidence_ref)values(p_org,'business',fp,auth.uid(),'self_declared_structure_040')on conflict(organization_id,kind,fingerprint)do nothing;
 if p_kind='CPF'then insert into private.trial_identifiers(organization_id,kind,fingerprint,verified_by,evidence_ref)values(p_org,'responsible',private.trial_fingerprint('responsible','BR:CPF:'||doc),auth.uid(),'self_declared_structure_040')on conflict(organization_id,kind,fingerprint)do nothing;end if;
 return public.billing_subscription_action(p_org,'trial',p_plan,p_revision,p_key);end;$$;

CREATE OR REPLACE FUNCTION public.billing_subscription_action(p_org uuid, p_action text, p_plan uuid, p_revision integer, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$begin
 perform private.permission_require(p_org,'billing.manage');if p_action='trial'and private.billing_homologation(p_org)is not null then raise exception 'homologation_trial_unavailable';end if;
 if p_action in('subscribe','change','renew')and not(select mock_enabled from private.billing_runtime)then raise exception 'billing_provider_not_configured'using errcode='55000';end if;
 return private.billing_subscription_action_038(p_org,p_action,p_plan,p_revision,p_key);end;$function$;

CREATE OR REPLACE FUNCTION private.central_eligible(p_org uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.permission_actor(p_org,p_user,'central.read') and private.permission_actor(p_org,p_user,'central.manage') and private.permission_actor(p_org,p_user,'central.reply') and (private.permission_central_base(p_org,p_user) or (private.permission_role(p_org,p_user)in('colaborador_empresa','own_attendant')and private.permission_actor(p_org,p_user,'central.manage')and private.permission_actor(p_org,p_user,'central.reply')and(p_user is distinct from auth.uid()or(private.is_active_user()and private.access_scope(p_org)))) or
 (private.permission_role(p_org,p_user) in('admin_empresa','super_admin') and (p_user is distinct from auth.uid() or(private.is_active_user() and private.access_scope(p_org)))));
$function$;

CREATE OR REPLACE FUNCTION private.central_staff(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select private.permission_allowed(p_org,'central.read') and private.permission_role(p_org,auth.uid())in('super_admin','admin_empresa','colaborador_empresa','own_attendant','shared_attendant');$function$;

CREATE OR REPLACE FUNCTION public.central_presence(p_state text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.work_sessions;
begin perform private.central_lock();if not (exists(select 1 from public.organizations o where private.central_eligible(o.id,auth.uid())) or private.has_global_role('atendente') or exists(select 1 from public.organizations o where private.permission_manager(o.id) and private.permission_allowed(o.id,'central.read')) or exists(select 1 from public.organization_members m where m.user_id=auth.uid() and private.own_attendant(m.organization_id,auth.uid()))) then raise exception 'attendant_role_required' using errcode='42501';end if;
 if p_state is null or p_state not in ('available','busy','pause','offline') then raise exception 'invalid_presence' using errcode='22023';end if;
 select * into s from public.work_sessions where user_id=auth.uid() and ended_at is null;
 if p_state='offline' then update public.work_sessions set presence='offline',ended_at=clock_timestamp() where id=s.id;return jsonb_build_object('presence','offline');end if;
 if s.id is null then insert into public.work_sessions(user_id,presence) values(auth.uid(),p_state) returning * into s;else update public.work_sessions set presence=p_state where id=s.id returning * into s;end if;return jsonb_build_object('presence',s.presence,'started_at',s.started_at);end;$function$;

CREATE OR REPLACE FUNCTION private.v029_central_act(p_code text, p_revision integer, p_action text, p_data jsonb, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.tickets;target uuid;prior jsonb;payload jsonb;r jsonb;ev text;name text;mid uuid;snap jsonb;reply jsonb;body text;esc public.ticket_escalations;v_state text;
begin perform private.central_lock();t=private.central_ticket(p_code,p_action<>'claim');payload=jsonb_build_array(p_code,p_revision,p_action,p_data);prior=private.consumer_idem(t.organization_id,'central_act',p_key,payload);if prior is not null then return prior;end if;
 if p_revision is distinct from t.revision then raise exception 'central_revision_conflict' using errcode='40001';end if;
 if t.state='closed' then raise exception 'central_closed' using errcode='22023';end if;
 select coalesce(nullif(display_name,''),'Atendimento') into name from public.profiles where id=auth.uid();
 case p_action
 when 'claim' then
  perform private.company_keys(p_data,array[]::text[]);
  if not private.central_eligible(t.organization_id,auth.uid())then raise exception 'central_claim_permission_required'using errcode='42501';end if;
  if not exists(select 1 from public.work_sessions where user_id=auth.uid() and ended_at is null and presence in ('available','busy')) then raise exception 'central_presence_required' using errcode='42501';end if;
  if t.state in ('resolved','waiting_company') or(t.assignee_id is not null and t.assignee_id<>auth.uid() and private.central_eligible(t.organization_id,t.assignee_id)) then raise exception 'central_already_assigned' using errcode='40001';end if;
  update public.tickets set assignee_id=auth.uid(),state='active',next_action='reply' where id=t.id;ev='assigned';target=auth.uid();
 when 'transfer' then
  perform private.company_keys(p_data,array['user_id']);target=(p_data->>'user_id')::uuid;
  if t.state='resolved' or not private.central_eligible(t.organization_id,target) then raise exception 'central_invalid_recipient' using errcode='42501';end if;
  update public.tickets set assignee_id=target,state=case when state='waiting_company' then state else 'active' end where id=t.id;ev='transferred';
 when 'return' then
  perform private.company_keys(p_data,array[]::text[]);if t.state in ('resolved','waiting_company') then raise exception 'central_invalid_state' using errcode='22023';end if;
  update public.tickets set assignee_id=null,state='queued',next_action='review' where id=t.id;ev='returned';
 when 'message' then
  perform private.company_keys(p_data,array['body','reply_index','manual_id']);if t.state='resolved' then raise exception 'central_reopen_required' using errcode='22023';end if;
  body=p_data->>'body';
  if p_data ? 'reply_index' and p_data->'reply_index'<>'null'::jsonb then
   select v.id,v.snapshot into mid,snap from public.company_settings s join public.manual_versions v on v.id=s.published_manual_id and v.organization_id=s.organization_id where s.organization_id=t.organization_id and v.status='published';
   if mid is distinct from (p_data->>'manual_id')::uuid or coalesce(p_data->>'reply_index','') !~ '^[0-9]{1,3}$' then raise exception 'central_reply_changed' using errcode='40001';end if;
   reply=(snap->'quick_replies')->(p_data->>'reply_index')::integer;
   if reply is null or(not coalesce((select quick_reply_edit from public.central_settings where organization_id=t.organization_id),false) and body is distinct from reply->>'body') then raise exception 'central_reply_edit_denied' using errcode='42501';end if;
  end if;
  insert into public.ticket_messages(organization_id,ticket_id,author_id,author_name,kind,body,manual_id,reply_title) values(t.organization_id,t.id,auth.uid(),name,case when private.company_can_manage(t.organization_id) then 'company' else 'attendant' end,body,mid,reply->>'title');
  update public.tickets set state=case when state='waiting_company' then state else 'waiting_customer' end,next_action=case when state='waiting_company' then 'company' else 'customer' end,last_staff_at=clock_timestamp(),waiting_since=clock_timestamp() where id=t.id;ev='message';
 when 'note' then
  perform private.company_keys(p_data,array['body']);insert into public.ticket_notes(organization_id,ticket_id,author_id,body) values(t.organization_id,t.id,auth.uid(),p_data->>'body');ev='note';
 when 'escalate' then
  perform private.company_keys(p_data,array['reason','summary','question']);if t.state='resolved' then raise exception 'central_reopen_required' using errcode='22023';end if;
  insert into public.ticket_escalations(organization_id,ticket_id,author_id,reason,summary,question) values(t.organization_id,t.id,auth.uid(),p_data->>'reason',p_data->>'summary',p_data->>'question');
  update public.tickets set state='waiting_company',next_action='company',waiting_since=clock_timestamp() where id=t.id;ev='escalated';
 when 'decision' then
  perform private.company_keys(p_data,array['response']);if not private.company_can_manage(t.organization_id) then raise exception 'company_admin_required' using errcode='42501';end if;
  select * into esc from public.ticket_escalations where ticket_id=t.id and responded_at is null;if esc.id is null then raise exception 'central_no_pending_decision' using errcode='22023';end if;
  update public.ticket_escalations set response=p_data->>'response',responded_by=auth.uid(),responded_at=clock_timestamp() where id=esc.id;
  update public.tickets set assignee_id=case when private.central_eligible(organization_id,assignee_id) then assignee_id else null end,state=case when private.central_eligible(organization_id,assignee_id) then 'active' else 'queued' end,next_action='reply',waiting_since=clock_timestamp() where id=t.id;ev='company_replied';
 when 'state' then
  perform private.company_keys(p_data,array['state']);v_state=p_data->>'state';
  if v_state is null or v_state not in ('active','waiting_customer','waiting_internal','resolved','closed') or t.state='waiting_company' then raise exception 'central_invalid_state' using errcode='22023';end if;
  if v_state='closed' and t.state<>'resolved' then raise exception 'central_resolve_first' using errcode='22023';end if;
  if v_state='active' and t.assignee_id is null then raise exception 'central_owner_required' using errcode='42501';end if;
  update public.tickets set state=v_state, resolved_at=case when v_state='resolved' then clock_timestamp() end,closed_at=case when v_state='closed' then clock_timestamp() end, next_action=case when v_state in ('resolved','closed') then 'none' when v_state='waiting_customer' then 'customer' else 'reply' end,waiting_since=clock_timestamp() where id=t.id;
  ev=case when v_state='resolved' then 'resolved' when v_state='closed' then 'closed' when t.state='resolved' then 'reopened' else 'state' end;
 when 'priority' then
  perform private.company_keys(p_data,array['priority']);update public.tickets set priority=(p_data->>'priority')::integer where id=t.id;ev='priority';
 when 'next' then
  perform private.company_keys(p_data,array['action','due_at']);if p_data->>'due_at' is not null and (p_data->>'due_at')::timestamptz<=now() then raise exception 'central_invalid_due' using errcode='22023';end if;
  update public.tickets set next_action=p_data->>'action',next_due_at=(p_data->>'due_at')::timestamptz where id=t.id;ev='next_action';
 else raise exception 'central_unknown_action' using errcode='22023';end case;
 update public.tickets set revision=revision+1 where id=t.id;perform private.central_event(t.id,ev,t.assignee_id,target);select jsonb_build_object('code',public_code,'revision',revision,'state',state) into r from public.tickets where id=t.id;
 perform private.consumer_remember(t.organization_id,'central_act',p_key,payload,r);return r;
end;$function$;

CREATE OR REPLACE FUNCTION public.central_act(p_code text, p_revision integer, p_action text, p_data jsonb, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare org_ uuid;depth_ int;result_ jsonb; begin org_=(select organization_id from public.tickets where public_code=p_code);if p_action='claim'and not private.permission_allowed(org_,'central.manage')then raise exception 'central_claim_permission_required'using errcode='42501';end if;depth_=private.permission_enter(org_,case when p_action='message'then 'central.reply'when p_action='decision'then 'pending.manage'else 'central.manage'end);result_=private.v029_central_act(p_code,p_revision,p_action,p_data,p_key);result_=private.permission_projection(org_,'central_act',result_);perform private.permission_leave(depth_);return result_;end;$function$;

CREATE OR REPLACE FUNCTION private.permission_projection(p_org uuid, p_function text, p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$declare r jsonb=p_result;id_ uuid;begin
 if p_function in('operations_detail','operations_quote_context','operations_requests','operations_agenda','consumer_work_context','central_context','commercial_context','commercial_list','central_queue')and not private.permission_allowed(p_org,'quotes.values')then r=private.permission_redact(r);end if;
 if p_function='consumer_admin_context'then
 if not private.permission_allowed(p_org,'quotes.read')then r=jsonb_set(r,'{requests}','[]');end if;
 if not private.permission_allowed(p_org,'agenda.read')then r=jsonb_set(jsonb_set(r,'{blocks}','[]'),'{schedule}','null');end if;
 end if;
 if p_function='consumer_presence_context'and not private.permission_allowed(p_org,'portfolio.read')then r=jsonb_set(jsonb_set(r,'{portfolio_all}','[]'),'{portfolio}','[]');end if;
 if p_function='central_context'then
 r=r||jsonb_build_object('claim_eligible',private.central_eligible(p_org,auth.uid()),'admin',private.permission_manager(p_org),'action_permissions',(select jsonb_object_agg(c.action,private.permission_allowed(p_org,c.action))from private.permission_catalog c));
 select id into id_ from public.financial_accounts where organization_id=p_org and request_id=(p_result->'ticket'->>'request_id')::uuid and cancelled_at is null;
 r=r||jsonb_build_object('financial',case when id_ is not null and private.permission_allowed(p_org,'finance.accounts.read',id_)then jsonb_build_object('operational',true,'account',private.financial_account_json(p_org,id_),'can_record',private.permission_allowed(p_org,'finance.receipts.record',id_))else null end);
 end if;
 if p_function in('operations_detail','operations_quote_context')then
 select id into id_ from public.financial_accounts where organization_id=p_org and request_id=coalesce((p_result->'appointment'->>'request_id')::uuid,(p_result->'request'->>'id')::uuid)and cancelled_at is null;
 if id_ is not null and private.permission_allowed(p_org,'finance.accounts.read',id_)then r=r||jsonb_build_object('financial_account',jsonb_build_object('id',id_,'balance_cents',(private.financial_account_json(p_org,id_)->'balance_cents')));end if;
 end if;
 if p_function='commercial_context'then r=r||jsonb_build_object('can_operate',coalesce((r->>'can_operate')::boolean,false)and private.permission_allowed(p_org,'followup.manage'));end if;
 if p_function='analytics_company'then
 if private.permission_allowed(p_org,'analytics.financial')then r=r||jsonb_build_object('financial',private.financial_totals(p_org,(r->'period'->>'first_day')::date,(r->'period'->>'last_day')::date));else r=r-'financial'-'values';end if;
 end if;return r;
end;$function$;

CREATE OR REPLACE FUNCTION public.foundation_set_attendant(p_org uuid, p_user uuid, p_kind attendant_kind, p_status record_status)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.lock_authorize('global');
 if p_status='active' then
  perform private.require_eligible_user(p_user);
  if not private.entitlement(p_org,'human_support')then raise exception 'human_support_required'using errcode='42501';end if;
  if not exists(select 1 from public.platform_roles where user_id=p_user and role='atendente' and active) then raise exception 'attendant_role_required' using errcode='23514'; end if;
 end if;
 insert into public.attendant_organizations(organization_id,user_id,kind,status) values(p_org,p_user,p_kind,p_status)
 on conflict(organization_id,user_id) do update set kind=excluded.kind,status=excluded.status;
end; $function$;


create function private.human_support_revocation()returns trigger language plpgsql security definer set search_path=''as $$begin
 if not private.entitlement(new.organization_id,'human_support')then update public.attendant_organizations set status='suspended'where organization_id=new.organization_id and status='active';end if;return new;end;$$;
create trigger syzia040_subscription_support after insert or update on public.billing_subscriptions for each row execute function private.human_support_revocation();
create trigger syzia040_exemption_support after insert or update on private.organization_exemptions for each row execute function private.human_support_revocation();

CREATE OR REPLACE FUNCTION public.access_team(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare org_ uuid;depth_ int;result_ jsonb; begin org_=p_org;depth_=private.permission_enter(org_,'people.read');result_=private.v029_access_team(p_org);result_=jsonb_set(jsonb_set(result_,'{accounts}',coalesce((select jsonb_agg(x||jsonb_build_object('can_attend',private.central_eligible(p_org,(x->>'user_id')::uuid),'can_reply',private.permission_actor(p_org,(x->>'user_id')::uuid,'central.reply'),'scope','organization'))from jsonb_array_elements(result_->'accounts')x),'[]'::jsonb)),'{legacy}',coalesce((select jsonb_agg(x||jsonb_build_object('can_attend',private.central_eligible(p_org,(x->>'user_id')::uuid),'can_reply',private.permission_actor(p_org,(x->>'user_id')::uuid,'central.reply'),'scope','organization'))from jsonb_array_elements(result_->'legacy')x),'[]'::jsonb));result_=result_||jsonb_build_object('shared',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.id,'name',p.display_name,'status',a.status,'kind',a.kind))from public.attendant_organizations a join public.profiles p on p.id=a.user_id where a.organization_id=p_org),'[]'::jsonb));result_=private.permission_projection(org_,'access_team',result_);perform private.permission_leave(depth_);return result_;end;$function$;

CREATE OR REPLACE FUNCTION public.people_companies()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$begin
 if not private.people_can('companies.read')then raise exception 'access_denied'using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status,'human_support',private.entitlement(id,'human_support'))order by name)from public.organizations),'[]');end;$function$;

CREATE OR REPLACE FUNCTION public.people_link(p_user uuid, p_org uuid, p_role text, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a private.enterprise_accounts;begin
 perform private.lock_authorize('global');
 if not private.company_can_manage(p_org)then raise exception 'access_denied'using errcode='42501';end if;
 if exists(select 1 from private.enterprise_accounts where user_id=p_user and organization_id is null and role='syzia_staff')then raise exception 'platform_staff_requires_assignment';end if;
 if p_role not in('admin_empresa','colaborador_empresa','own_attendant')or p_active is null then raise exception 'access_invalid';end if;
 select * into a from private.enterprise_accounts where user_id=p_user order by(organization_id is null)desc,created_at limit 1;
 if a.id is null or a.state not in('active','pending') then raise exception 'access_change_unavailable';end if;
 if p_role='admin_empresa' and a.contact_email is null then raise exception 'administrator_email_required';end if;

 if not p_active then
 if p_user=auth.uid()then raise exception 'cannot_change_own_membership';end if;
 update public.organization_members set status='suspended'where organization_id=p_org and user_id=p_user;
 else perform public.foundation_set_member(p_org,p_user,case when p_role='admin_empresa'then 'admin_empresa'::public.member_role else 'colaborador_empresa'::public.member_role end,case when p_active then 'active'::public.record_status else 'suspended'::public.record_status end);end if;
 update public.organization_members set is_attendant=p_role='own_attendant'where organization_id=p_org and user_id=p_user;
 if p_active then
 if not exists(select 1 from private.enterprise_codes where organization_id=p_org)then raise exception 'company_code_unavailable';end if;
 insert into private.enterprise_accounts(organization_id,user_id,username,display_name,contact_email,phone,role,state,generation,operation_id,activated_at,requested_by,request_key)
 values(p_org,p_user,a.username,a.display_name,a.contact_email,a.phone,p_role,a.state,a.generation,a.operation_id,a.activated_at,auth.uid(),gen_random_uuid())
 on conflict(organization_id,user_id)do update set role=excluded.role;
 end if;
 update private.enterprise_sessions set revoked=true where user_id=p_user and(organization_id=p_org or organization_id is null);
 perform private.access_audit(p_org,auth.uid(),case when p_active then 'person_linked'else 'person_unlinked'end,a.id);
end;$function$;

CREATE OR REPLACE FUNCTION public.access_manage(p_id uuid, p_action text, p_username text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_role text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a private.enterprise_accounts;begin
 perform pg_advisory_xact_lock(734921501);select * into a from private.enterprise_accounts where id=p_id for update;if exists(select 1 from private.enterprise_accounts where user_id=a.user_id and organization_id is null and role='syzia_staff')then raise exception 'shared_identity_requires_superadmin'using errcode='42501';end if;perform private.lock_authorize('org',a.organization_id);
 if not private.company_can_manage(a.organization_id) then raise exception 'access_denied' using errcode='42501';end if;
 if a.id is null or a.user_id=auth.uid() or a.state in ('changing','reserved') then raise exception 'access_change_unavailable';end if;
 if p_action='edit' then
 if p_role not in ('admin_empresa','colaborador_empresa','own_attendant') then raise exception 'access_denied';end if;
 -- Preserve admin email requirement during demotion/promotion; update contact first, role through existing command.
 update private.enterprise_accounts set contact_email=nullif(lower(btrim(p_email)),''),username=lower(btrim(p_username)) where id=p_id;
 perform public.foundation_set_member(a.organization_id,a.user_id,case when p_role='admin_empresa' then 'admin_empresa'::public.member_role else 'colaborador_empresa'::public.member_role end,(select status from public.organization_members where organization_id=a.organization_id and user_id=a.user_id));
 update public.organization_members set is_attendant=p_role='own_attendant' where organization_id=a.organization_id and user_id=a.user_id;
 update private.enterprise_accounts set role=p_role,generation=generation+1,code_hash=null,proof_hash=null where id=p_id;
 elsif p_action in ('disable','enable') then
 perform public.foundation_set_member(a.organization_id,a.user_id,case when a.role='admin_empresa' then 'admin_empresa'::public.member_role else 'colaborador_empresa'::public.member_role end,case when p_action='disable' then 'suspended'::public.record_status else 'active'::public.record_status end);
 else raise exception 'access_denied';end if;
 update private.enterprise_sessions set revoked=true where user_id=a.user_id and organization_id=a.organization_id;
 perform private.access_audit(a.organization_id,auth.uid(),'access_'||p_action,a.id);end;$function$;


create function public.people_staff_edit(p_user uuid,p_name text,p_username text,p_email text,p_phone text)returns void language plpgsql security definer set search_path=''as $$declare a private.enterprise_accounts;begin
 perform private.lock_authorize('global');select *into a from private.enterprise_accounts where user_id=p_user and organization_id is null and role='syzia_staff'for update;
 if a.id is null or a.state in('reserved','changing','uncertain')or p_user=auth.uid()then raise exception 'access_change_unavailable';end if;
 if p_name is null or length(btrim(p_name))not between 3 and 120 or p_username is null or lower(btrim(p_username))!~'^[a-z][a-z0-9]{1,29}[.][a-z0-9][a-z0-9.]{0,29}$'or p_email is null or length(btrim(p_email))>254 or btrim(p_email)!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'or length(coalesce(p_phone,''))>40 then raise exception 'access_identity_invalid';end if;
 update private.enterprise_accounts set display_name=btrim(p_name),username=lower(btrim(p_username)),contact_email=nullif(lower(btrim(p_email)),''),phone=nullif(btrim(p_phone),'')where id=a.id;
 update public.profiles set display_name=btrim(p_name)where id=p_user;
 update private.enterprise_sessions set revoked=true where user_id=p_user;
 perform private.access_audit(null,auth.uid(),'staff_identity_edited',a.id);end;$$;

CREATE OR REPLACE FUNCTION public.permissions_context(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not private.is_active_user() or not private.access_scope(p_org) or private.permission_role(p_org,auth.uid()) is null then raise exception 'permission_denied' using errcode='42501';end if;
 return jsonb_build_object('homologation',case when private.billing_homologation(p_org)is not null then jsonb_build_object('notice','PLANO APLICADO PARA HOMOLOGAÇÃO — não representa assinatura ou pagamento.','name',private.billing_homologation(p_org)#>>'{plan,name}')end,'timezone',(select timezone from public.organizations where id=p_org),'role',private.permission_role(p_org,auth.uid()),'actions',coalesce((select jsonb_object_agg(c.action,jsonb_build_object('allowed',private.permission_allowed(p_org,c.action) or exists(select 1 from private.organization_permissions g where g.organization_id=p_org and g.user_id=auth.uid() and g.action=c.action and g.granted and g.scope='assigned' and private.entitlement(p_org,c.capability) and private.permission_role(p_org,auth.uid())=any(c.roles)),'scope',case when private.permission_manager(p_org) then 'organization' else (select scope from private.organization_permissions where organization_id=p_org and user_id=auth.uid() and action=c.action and granted)end)) from private.permission_catalog c),'{}'::jsonb));
end;$function$;

CREATE OR REPLACE FUNCTION public.permissions_team(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$begin
 perform private.permission_require(p_org,'people.manage');
 return jsonb_build_object('catalog',(select jsonb_agg(to_jsonb(c) order by module,action) from private.permission_catalog c),
 'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.id,'name',p.display_name,'role',x.role,'can_attend',private.central_eligible(p_org,p.id),'can_reply',private.permission_actor(p_org,p.id,'central.reply'),'revision',coalesce((select revision from private.permission_revisions where organization_id=p_org and user_id=p.id),0),'grants',coalesce((select jsonb_agg(jsonb_build_object('action',action,'scope',scope,'granted',granted) order by action) from private.organization_permissions where organization_id=p_org and user_id=p.id),'[]'::jsonb))) from (
 select user_id,case when role='admin_empresa' then 'admin_empresa' when is_attendant then 'own_attendant' else 'colaborador_empresa' end role from public.organization_members where organization_id=p_org and status='active'
 union all select user_id,'shared_attendant' from public.attendant_organizations where organization_id=p_org and status='active')x join public.profiles p on p.id=x.user_id),'[]'::jsonb));end;$function$;


create function public.people_staff_state(p_user uuid,p_active boolean)returns void language plpgsql security definer set search_path=''as $$declare a private.enterprise_accounts;begin
 perform private.lock_authorize('global');select *into a from private.enterprise_accounts where user_id=p_user and organization_id is null and role='syzia_staff'for update;
 if a.id is null or p_active is null or a.state in('reserved','changing','uncertain')or p_user=auth.uid()then raise exception 'access_change_unavailable';end if;
 update private.enterprise_accounts set state=case when p_active then case when activated_at is null then 'pending'else 'active'end else 'disabled'end where id=a.id;
 update public.profiles set status=case when p_active then 'active'::public.record_status else 'suspended'::public.record_status end where id=p_user;
 update private.enterprise_sessions set revoked=true where user_id=p_user;
 if not p_active then update public.attendant_organizations set status='suspended'where user_id=p_user;end if;
 perform private.access_audit(null,auth.uid(),case when p_active then 'staff_identity_enabled'else 'staff_identity_disabled'end,a.id);end;$$;


create function private.consumer_booking_status(q public.quote_requests)returns jsonb language plpgsql stable security definer set search_path=''as $$declare s jsonb;pub public.consumer_publications;ready boolean=false;begin
 if q.state not in('submitted','under_review','quoted','approved')then return jsonb_build_object('ready',false,'reason','request_not_ready');end if;
 if q.accepted_version_id is not null then return jsonb_build_object('ready',true,'reason',null);end if;
 if q.state not in('submitted','under_review')then return jsonb_build_object('ready',false,'reason','proposal_required');end if;
 pub=private.consumer_publication((select slug from public.organizations where id=q.organization_id));
 begin s=private.consumer_request_selection(q);exception when sqlstate '22023'then return jsonb_build_object('ready',false,'reason','service_unavailable');end;
 ready=coalesce((s->>'direct_booking')::boolean,false)and s->>'price_mode'='fixed'and pub.id=q.publication_id;
 return jsonb_build_object('ready',coalesce(ready,false),'reason',case when ready then null else 'proposal_required'end);end;$$;

CREATE OR REPLACE FUNCTION private.central_request_context_core(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quote_requests;c public.customers;
begin select * into q from public.quote_requests where public_code=p_code;select * into c from public.customers where id=q.customer_id and organization_id=q.organization_id;
 return jsonb_build_object('booking',private.consumer_booking_status(q),'branding',(select pub.payload->'branding'from public.consumer_pages page join public.consumer_publications pub on pub.id=page.publication_id where page.organization_id=q.organization_id),'code',q.public_code,'state',q.state,'revision',q.revision,'name',c.name,'notes',q.notes,'requested_items',private.consumer_requested_items(q),'review_alerts',q.review_alerts,'can_manage',private.consumer_access(q.id,true),'is_owner',c.user_id=auth.uid(),'company',(select jsonb_build_object('name',name,'slug',slug) from public.organizations where id=q.organization_id),'current_version',(select public_code from public.quote_versions where id=q.current_version_id),'accepted_version',(select public_code from public.quote_versions where id=q.accepted_version_id),
 'answers',coalesce((select jsonb_agg(jsonb_build_object('label',f->>'label','answer',q.answers->(f->>'code'))) from public.consumer_publications cp cross join lateral jsonb_array_elements(cp.payload->'services') sv cross join lateral jsonb_array_elements(sv->'questions') f where cp.id=q.publication_id and sv->>'code'=q.service_code),'[]'::jsonb),
 'versions',coalesce((select jsonb_agg(jsonb_build_object('code',v.public_code,'version',v.version,'kind',v.kind,'customer_explanation',v.customer_explanation,'price_mode',v.price_mode,'total_cents',v.total_cents,'duration_minutes',v.duration_minutes,'expires_at',v.expires_at,'created_at',v.created_at,'items',(select jsonb_agg(jsonb_build_object('name',i.name,'quantity',i.quantity,'unit_cents',i.unit_cents,'price_mode',i.price_mode) order by i.position) from public.quote_items i where i.version_id=v.id)) order by v.version desc) from public.quote_versions v where v.request_id=q.id and v.state='sent'),'[]'::jsonb),
 'appointments',coalesce((select jsonb_agg(jsonb_build_object('code',a.public_code,'starts_at',a.starts_at,'ends_at',a.ends_at,'state',a.state) order by a.created_at desc) from public.appointments a where a.request_id=q.id),'[]'::jsonb),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('code',a.public_code,'mime',a.mime,'size_bytes',a.size_bytes,'state',a.state) order by a.created_at) from public.attachments a where a.request_id=q.id and (a.state='ready' or(a.state='pending' and a.expires_at>now()))),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('event',event,'at',created_at) order by created_at,id) from public.request_events where request_id=q.id),'[]'::jsonb),
 'contact_authorized',exists(select 1 from public.customer_consents where customer_id=c.id and purpose='request_contact' and revoked_at is null));
end;$function$;


revoke all on function private.billing_homologation(uuid),private.billing_effective_version(uuid),private.entitlement_039(uuid,text),private.entitlement(uuid,text),private.human_support_revocation(),private.consumer_booking_status(public.quote_requests)from public,anon,authenticated,service_role;
revoke all on function public.billing_homologation_set(uuid,uuid,uuid,text,uuid),public.billing_plan_feature(uuid,text,uuid),public.billing_trial_confirm(uuid,text,text,uuid,integer,uuid),public.people_staff_edit(uuid,text,text,text,text),public.people_staff_state(uuid,boolean)from public,anon,authenticated,service_role;
grant execute on function public.billing_homologation_set(uuid,uuid,uuid,text,uuid),public.billing_plan_feature(uuid,text,uuid),public.billing_trial_confirm(uuid,text,text,uuid,integer,uuid),public.people_staff_edit(uuid,text,text,text,text),public.people_staff_state(uuid,boolean)to authenticated;
notify pgrst,'reload schema';
commit;

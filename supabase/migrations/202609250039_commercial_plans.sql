begin;
create temporary table migration039_functions on commit drop as select oid from pg_proc;
-- Version 1 contracts retain their ceilings and history. Only a newly saved version
-- explicitly selects the new (shared-human-only) quota semantics.
alter table public.billing_plan_versions add column quota_semantics integer not null default 1 check(quota_semantics in(1,2));
alter table public.billing_usage drop constraint billing_usage_metric_check;
alter table public.billing_usage add constraint billing_usage_metric_check check(metric in('requests','tickets','followups','human_tickets','human_followups'));

create or replace function private.plan_capabilities() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.capabilities='{}'::jsonb then new.capabilities=jsonb_build_object('software',true,'human_support',new.human_support,'commercial_followups',new.commercial_followups);end if;
 if exists(select 1 from jsonb_each(new.capabilities) e where e.key not in('software','human_support','commercial_followups','finance','analytics') or jsonb_typeof(e.value)<>'boolean')then raise exception 'invalid_plan_capability';end if;
 if (new.capabilities->>'software')is distinct from 'true'then raise exception 'software_capability_required';end if;
 new.capabilities=jsonb_build_object('finance',true,'analytics',true)||new.capabilities;
 new.human_support=coalesce((new.capabilities->>'human_support')::boolean,false);
 new.commercial_followups=coalesce((new.capabilities->>'commercial_followups')::boolean,false);
 return new;end;$$;
-- Missing optional keys on old contracts and exemptions inherit the original software
-- capability. No contracted version, exemption, trial or subscription is rewritten.
alter function private.entitlement(uuid,text)rename to entitlement_038;
create function private.entitlement(p_org uuid,p_feature text)returns boolean language plpgsql stable security definer set search_path=''as $$declare c jsonb;begin
 if p_feature='finance_analytics'then return private.entitlement(p_org,'finance')and private.entitlement(p_org,'analytics');end if;
 if p_feature not in('finance','analytics')then return private.entitlement_038(p_org,p_feature);end if;
 if not private.entitlement_038(p_org,'software')then return false;end if;
 c=private.internal_exemption(p_org)->'capabilities';
 if c is null then select v.capabilities into c from public.billing_subscriptions s join public.billing_plan_versions v on v.id=s.plan_version_id where s.organization_id=p_org;end if;
 return coalesce((c->>p_feature)::boolean,true);end;$$;
update private.permission_catalog set capability='finance'where module='finance';
update private.permission_catalog set capability='analytics'where module='analytics';
update private.permission_catalog set capability='finance_analytics'where action='analytics.financial';

create function private.billing_plan_validation(p_data jsonb)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare c jsonb;issues jsonb='[]';maps jsonb='[]';k text;incl boolean;enforced_ boolean;begin
 if p_data is null or jsonb_typeof(p_data)<>'object'then return jsonb_build_object('consistent',false,'issues',jsonb_build_array('Informe os dados do plano.'),'mappings','[]'::jsonb);end if;
 c=coalesce(p_data->'capabilities',jsonb_build_object('software',true,'human_support',coalesce((p_data->>'human_support')::boolean,false),'commercial_followups',coalesce((p_data->>'commercial_followups')::boolean,true)));
 if jsonb_typeof(c)<>'object'then return jsonb_build_object('consistent',false,'issues',jsonb_build_array('Recursos inválidos.'),'mappings','[]'::jsonb);end if;
 if exists(select 1 from jsonb_each(c) where key not in('software','human_support','commercial_followups','finance','analytics')or jsonb_typeof(value)<>'boolean')then issues=issues||jsonb_build_array('Há recurso sem autorização implementada.');end if;
 if c->>'software'is distinct from 'true'then issues=issues||jsonb_build_array('A operação empresarial é a base obrigatória do plano.');end if;
 foreach k in array array['human_support','commercial_followups']loop
 if p_data?k and c?k and p_data->k is distinct from c->k then issues=issues||jsonb_build_array('A seleção de recursos está divergente: '||k);end if;end loop;
 if coalesce((p_data->>'self_service')::boolean,false)and not coalesce((p_data->>'site_visible')::boolean,false)then issues=issues||jsonb_build_array('O cadastro pelo site exige Mostrar no site.');end if;
 if coalesce((p_data->>'self_service_trial')::boolean,false)and (not coalesce((p_data->>'self_service')::boolean,false)or coalesce((p_data->>'trial_days')::int,0)<1)then issues=issues||jsonb_build_array('O teste gratuito no cadastro exige cadastro pelo site e duração maior que zero.');end if;
 if coalesce((p_data->>'quota_semantics')::int,2)=2 then
 if not coalesce((c->>'human_support')::boolean,false)and (p_data->>'ticket_limit'is not null or p_data->>'followup_limit'is not null)then issues=issues||jsonb_build_array('Capacidade humana SYZIA exige atendimento compartilhado incluído.');end if;
 if not coalesce((c->>'commercial_followups')::boolean,false)and p_data->>'followup_limit'is not null then issues=issues||jsonb_build_array('Capacidade de retorno exige retornos comerciais incluídos.');end if;end if;
 foreach k in array array['software','finance','analytics','commercial_followups','human_support']loop
 incl=case when k in('finance','analytics')then coalesce((c->>k)::boolean,true)else coalesce((c->>k)::boolean,false)end;
 enforced_=case k when 'software'then to_regprocedure('private.billing_assert_capacity(uuid,text)')is not null and exists(select 1 from pg_trigger where tgname='billing_requests_guard'and tgenabled<>'D') when 'finance'then exists(select 1 from private.permission_catalog where action='finance.accounts.read'and capability='finance')and to_regprocedure('public.financial_summary(uuid,date,date)')is not null when 'analytics'then exists(select 1 from private.permission_catalog where action='analytics.operational'and capability='analytics') when 'commercial_followups'then exists(select 1 from private.permission_catalog where action='followup.manage'and capability='commercial_followups')and exists(select 1 from pg_trigger where tgname='billing_followups_guard'and tgenabled<>'D')when 'human_support'then to_regprocedure('private.central_eligible(uuid,uuid)')is not null and exists(select 1 from pg_trigger where tgname='billing_ticket_message'and tgenabled<>'D')else false end;
 if not enforced_ then issues=issues||jsonb_build_array('Vínculo de autorização indisponível: '||k);end if;
 maps=maps||jsonb_build_array(jsonb_build_object('capability',k,'included',incl,'enforced',enforced_,'label',case k when 'software'then 'Operação empresarial'when 'finance'then 'Financeiro'when 'analytics'then 'Métricas'when 'commercial_followups'then 'Retornos comerciais'else 'Atendimento compartilhado SYZIA'end));end loop;
 return jsonb_build_object('consistent',jsonb_array_length(issues)=0,'issues',issues,'mappings',maps,'member_limit',p_data->'member_limit','quota_semantics',coalesce((p_data->>'quota_semantics')::int,2));
 exception when invalid_text_representation then return jsonb_build_object('consistent',false,'issues',jsonb_build_array('Confira os tipos dos campos do plano.'),'mappings','[]'::jsonb);
end;$$;
create function public.billing_plan_validate(p_data jsonb)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 if not private.has_global_role('super_admin')then raise exception 'access_denied'using errcode='42501';end if;return private.billing_plan_validation(p_data);end;$$;

create or replace function public.billing_plan_save(p_id uuid,p_revision integer,p_data jsonb)returns uuid language plpgsql security definer set search_path=''as $$
declare id_ uuid;rev int;v jsonb;c jsonb;begin
 perform private.lock_authorize('global');
 perform private.company_keys(p_data,array['name','description','active','available','site_visible','self_service','self_service_trial','position','price_cents','interval_months','trial_days','human_support','commercial_followups','member_limit','service_limit','request_limit','ticket_limit','followup_limit','capabilities','quota_semantics']);
 v=private.billing_plan_validation(p_data);if not(v->>'consistent')::boolean then raise exception 'billing_plan_inconsistent'using errcode='22023',detail=(v->'issues')::text;end if;
 if p_id is null then
 if p_revision is distinct from 0 then raise exception 'billing_revision_conflict'using errcode='40001';end if;
 insert into public.billing_plans(name,description,active,available,position,site_visible,self_service,self_service_trial)
 values(p_data->>'name',coalesce(p_data->>'description',''),coalesce((p_data->>'active')::boolean,true),coalesce((p_data->>'available')::boolean,false),coalesce((p_data->>'position')::int,0),coalesce((p_data->>'site_visible')::boolean,false),coalesce((p_data->>'self_service')::boolean,false),coalesce((p_data->>'self_service_trial')::boolean,false))returning id,revision into id_,rev;
 else
 update public.billing_plans set name=p_data->>'name',description=coalesce(p_data->>'description',''),active=coalesce((p_data->>'active')::boolean,true),available=coalesce((p_data->>'available')::boolean,false),position=coalesce((p_data->>'position')::int,0),site_visible=coalesce((p_data->>'site_visible')::boolean,site_visible),self_service=coalesce((p_data->>'self_service')::boolean,self_service),self_service_trial=coalesce((p_data->>'self_service_trial')::boolean,self_service_trial),revision=revision+1 where id=p_id and revision=p_revision returning id,revision into id_,rev;
 if not found then raise exception 'billing_revision_conflict'using errcode='40001';end if;end if;
 c=coalesce(p_data->'capabilities',jsonb_build_object('software',true,'human_support',coalesce((p_data->>'human_support')::boolean,false),'commercial_followups',coalesce((p_data->>'commercial_followups')::boolean,true)));
 insert into public.billing_plan_versions(plan_id,version,price_cents,interval_months,trial_days,human_support,commercial_followups,member_limit,service_limit,request_limit,ticket_limit,followup_limit,capabilities,quota_semantics)
 values(id_,rev,(p_data->>'price_cents')::int,(p_data->>'interval_months')::int,coalesce((p_data->>'trial_days')::int,0),coalesce((c->>'human_support')::boolean,false),coalesce((c->>'commercial_followups')::boolean,false),(p_data->>'member_limit')::int,(p_data->>'service_limit')::int,(p_data->>'request_limit')::int,(p_data->>'ticket_limit')::int,(p_data->>'followup_limit')::int,c,coalesce((p_data->>'quota_semantics')::int,2));
 return id_;end;$$;

create function private.billing_capacity_allows(p_used bigint,p_limit int)returns boolean language sql immutable set search_path=''as $$select p_limit is null or p_used<p_limit;$$;
create or replace function private.billing_usage_snapshot(p_org uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select jsonb_build_object('month',date_trunc('month',now()at time zone 'America/Recife')::date,'timezone','America/Recife',
 'members',(select count(*)from public.organization_members m where m.organization_id=p_org and m.status='active'and not exists(select 1 from public.platform_roles r where r.user_id=m.user_id and r.role='super_admin'and r.active)),
 'services',(select count(*)from public.services where organization_id=p_org and active),
 'requests',(select count(*)from public.billing_usage where organization_id=p_org and metric='requests'and month=date_trunc('month',now()at time zone 'America/Recife')::date),
 'tickets',(select count(*)from public.billing_usage where organization_id=p_org and metric=case when coalesce((select v.quota_semantics from public.billing_subscriptions s join public.billing_plan_versions v on v.id=s.plan_version_id where s.organization_id=p_org),2)=2 then 'human_tickets'else 'tickets'end and month=date_trunc('month',now()at time zone 'America/Recife')::date),
 'followups',(select count(*)from public.billing_usage where organization_id=p_org and metric=case when coalesce((select v.quota_semantics from public.billing_subscriptions s join public.billing_plan_versions v on v.id=s.plan_version_id where s.organization_id=p_org),2)=2 then 'human_followups'else 'followups'end and month=date_trunc('month',now()at time zone 'America/Recife')::date));$$;
create function private.billing_assert_capacity(p_org uuid,p_metric text)returns void language plpgsql security definer set search_path=''as $$declare s public.billing_subscriptions;v public.billing_plan_versions;lim int;begin
 perform pg_advisory_xact_lock(734921501);
 if private.internal_exemption(p_org)is not null then return;end if;
 if p_metric in('requests','tickets','followups','software')and not private.entitlement(p_org,'software')then raise exception 'billing_subscription_required'using errcode='42501';end if;
 if p_metric='followups'and not private.entitlement(p_org,'commercial_followups')then raise exception 'billing_feature_unavailable'using errcode='42501';end if;
 select * into s from public.billing_subscriptions where organization_id=p_org;
 if s.organization_id is null then
 if exists(select 1 from private.trial_requests where organization_id=p_org)then raise exception 'billing_subscription_required'using errcode='42501';end if;return;end if;
 if private.billing_effective(s)not in('active','trial')then raise exception 'billing_subscription_required'using errcode='42501';end if;
 select * into v from public.billing_plan_versions where id=s.plan_version_id;
 lim=case p_metric when 'members'then v.member_limit when 'services'then v.service_limit when 'requests'then v.request_limit when 'tickets'then v.ticket_limit when 'followups'then v.followup_limit end;
 if not private.billing_capacity_allows((private.billing_usage_snapshot(p_org)->>p_metric)::bigint,lim)then raise exception 'billing_limit_reached'using errcode='P0001',detail=p_metric;end if;
end;$$;
create function private.billing_shared_actor(p_org uuid,p_actor uuid)returns boolean language sql stable security definer set search_path=''as $$
 select exists(select 1 from public.attendant_organizations a join public.platform_roles r on r.user_id=a.user_id and r.role='atendente'and r.active where a.organization_id=p_org and a.user_id=p_actor and a.status='active')and not exists(select 1 from public.organization_members m where m.organization_id=p_org and m.user_id=p_actor and m.status='active');$$;
create or replace function private.billing_guard()returns trigger language plpgsql security definer set search_path=''as $$
declare metric_ text;ledger text;org uuid;id_ uuid;sem int;begin
 org=new.organization_id;
 if tg_table_name='organization_members'then
 if new.status<>'active'or(tg_op='UPDATE'and old.status='active')or exists(select 1 from public.platform_roles where user_id=new.user_id and role='super_admin'and active)then return new;end if;metric_='members';
 elsif tg_table_name='services'then if not new.active or(tg_op='UPDATE'and old.active)then return new;end if;metric_='services';
 elsif tg_table_name='quote_requests'then if new.state<>'submitted'or old.state<>'draft'then return new;end if;metric_='requests';ledger='requests';id_=new.id;
 elsif tg_table_name='commercial_attempts'then
 if not private.entitlement(org,'commercial_followups')then raise exception 'billing_feature_unavailable'using errcode='42501';end if;
 select v.quota_semantics into sem from public.billing_subscriptions s join public.billing_plan_versions v on v.id=s.plan_version_id where s.organization_id=org;
 metric_='followups';ledger='followups';id_=new.id;
 if coalesce(sem,2)=2 then
 if private.billing_shared_actor(org,new.actor_id)then ledger='human_followups';else metric_='software';end if;end if;
 elsif tg_table_name in('opportunities','appointments','quote_versions')then
 if tg_table_name='quote_versions'then if new.kind='estimate'then return new;end if;end if;metric_='software';
 else raise exception 'billing_guard_scope_invalid';end if;
 perform private.billing_assert_capacity(org,metric_);
 if ledger is not null then insert into public.billing_usage(organization_id,metric,entity_id,month)values(org,ledger,id_,date_trunc('month',now()at time zone 'America/Recife')::date)on conflict do nothing;end if;
 return new;end;$$;
drop trigger billing_tickets_guard on public.tickets;
create trigger billing_appointments_guard before insert on public.appointments for each row execute function private.billing_guard();
create trigger billing_quotes_guard before insert on public.quote_versions for each row execute function private.billing_guard();
-- Record once per ticket at the first substantive action, under the same serialization
-- lock as the write. Notes, claim, transfer, reopening and consumer replies never count.
create function private.billing_ticket_service()returns trigger language plpgsql security definer set search_path=''as $$
declare actor uuid;tid uuid;ledger text;sem int;begin
 if tg_table_name='ticket_messages'then if new.kind='customer'then return new;end if;actor=new.author_id;tid=new.ticket_id;
 else if new.event not in('quote','booking')or new.actor_id is null then return new;end if;actor=new.actor_id;tid=new.ticket_id;end if;
 perform pg_advisory_xact_lock(734921501);
 select v.quota_semantics into sem from public.billing_subscriptions s join public.billing_plan_versions v on v.id=s.plan_version_id where s.organization_id=new.organization_id;
 if coalesce(sem,2)=2 then
 if not private.billing_shared_actor(new.organization_id,actor)then return new;end if;ledger='human_tickets';
 else ledger='tickets';end if;
 if exists(select 1 from public.billing_usage where organization_id=new.organization_id and metric=ledger and entity_id=tid)then return new;end if;
 perform private.billing_assert_capacity(new.organization_id,'tickets');
 insert into public.billing_usage(organization_id,metric,entity_id,month)values(new.organization_id,ledger,tid,date_trunc('month',now()at time zone 'America/Recife')::date)on conflict do nothing;
 return new;end;$$;
create trigger billing_ticket_message before insert on public.ticket_messages for each row execute function private.billing_ticket_service();
create trigger billing_ticket_action before insert on public.ticket_events for each row execute function private.billing_ticket_service();
-- Consumer browser actions cannot manufacture a payable simulation in an environment
-- whose explicit local billing fixture is disabled. Preserve trial/admin grants.
alter function public.billing_subscription_action(uuid,text,uuid,integer,uuid)rename to billing_subscription_action_038;
alter function public.billing_subscription_action_038(uuid,text,uuid,integer,uuid)set schema private;
revoke all on function private.billing_subscription_action_038(uuid,text,uuid,integer,uuid)from public,anon,authenticated,service_role;
create function public.billing_subscription_action(p_org uuid,p_action text,p_plan uuid,p_revision integer,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$begin
 perform private.permission_require(p_org,'billing.manage');
 if p_action in('subscribe','change','renew')and not(select mock_enabled from private.billing_runtime)then raise exception 'billing_provider_not_configured'using errcode='55000';end if;
 return private.billing_subscription_action_038(p_org,p_action,p_plan,p_revision,p_key);end;$$;
create function public.billing_provider_status()returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 if not private.has_global_role('super_admin')then raise exception 'access_denied'using errcode='42501';end if;
 return jsonb_build_object('provider',null,'status','awaiting_integration','checkout_available',false,'webhooks_configured',false,'local_simulation',(select mock_enabled from private.billing_runtime));end;$$;

-- A bounded, administrative diagnostic. Temporary tenants, identity and contract are
-- created inside a subtransaction which ALWAYS raises Z0039 to roll back all writes.
-- No GUC can enable/bypass this path: global authority is checked before any action.
create function public.billing_plan_test(p_data jsonb)returns jsonb language plpgsql security definer set search_path=''as $$
declare org uuid=gen_random_uuid();other_org uuid=gen_random_uuid();usr uuid=gen_random_uuid();pid uuid;vid uuid;v public.billing_plan_versions;checks jsonb='[]';validation jsonb;action_ text;label_ text;cap text;expected_ boolean;allowed_ boolean;detail_ text;lim int;i int;u uuid;result_ jsonb;claims text=current_setting('request.jwt.claims',true);begin
 perform private.lock_authorize('global');validation=private.billing_plan_validation(p_data);
 if not(validation->>'consistent')::boolean then return jsonb_build_object('consistent',false,'rolled_back',true,'checks',jsonb_build_array(jsonb_build_object('label','Configuração do plano','expected',true,'allowed',false,'status','Inconsistência','detail',array_to_string(array(select jsonb_array_elements_text(validation->'issues')),' '))));end if;
 begin
 pid=public.billing_plan_save(null,0,p_data||jsonb_build_object('active',false,'available',false,'site_visible',false,'self_service',false,'self_service_trial',false));
 select * into v from public.billing_plan_versions where plan_id=pid;vid=v.id;lim=v.member_limit;
 insert into public.organizations(id,name,slug)values(org,'Verificação temporária do plano','check-'||org::text),(other_org,'Verificação de isolamento','check-'||other_org::text);
 insert into private.organization_verifications(organization_id,required,state)values(org,false,'legacy'),(other_org,false,'legacy')on conflict(organization_id)do update set required=false,state='legacy';
 -- Never persisted and never provisioned through an external Auth service.
 insert into auth.users(id,email,email_confirmed_at,is_anonymous)values(usr,'check-'||usr::text||'@example.invalid',now(),false);
 insert into public.organization_members(organization_id,user_id,role)values(org,usr,'admin_empresa');
 insert into public.billing_subscriptions(organization_id,plan_version_id,state,period_start,period_end)values(org,vid,'active',now(),now()+interval '1 day');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',usr,'is_anonymous',false)::text,true);
 perform public.company_initialize(org);
 for label_,action_,cap in select *from(values
 ('Página pública e portfólio','page.manage','setup'),('Clientes e atendimento','clients.manage','software'),('Solicitações e orçamentos','quotes.manage','software'),('Agenda','agenda.manage','setup'),('Financeiro','finance.accounts.read','finance'),('Métricas','analytics.operational','analytics'),('Follow-up e recuperação','followup.manage','commercial_followups'),('Equipe e permissões','people.manage','setup'))x(label,action,capability)loop
 expected_=case when cap='setup'then true else coalesce((v.capabilities->>cap)::boolean,false)end;allowed_=true;detail_=null;
 begin
 perform private.permission_require(org,action_);
 if action_='clients.manage'then perform public.operations_directory(org,'',0);
 elsif action_='agenda.manage'then perform public.operations_agenda(org,current_date,current_date+1);
 elsif action_='finance.accounts.read'then perform public.financial_summary(org,current_date,current_date);
 elsif action_='analytics.operational'then perform public.analytics_company(org,current_date,current_date,null,null);end if;
 exception when insufficient_privilege then allowed_=false;
 when others then allowed_=false;detail_='A operação não concluiu a verificação.';end;
 checks=checks||jsonb_build_array(jsonb_build_object('label',label_,'expected',expected_,'allowed',allowed_,'status',case when detail_ is not null or allowed_<>expected_ then 'Inconsistência'when allowed_ then 'Permitido'else 'Bloqueado'end,'detail',detail_));end loop;
 expected_=v.human_support;allowed_=private.entitlement(org,'human_support');checks=checks||jsonb_build_array(jsonb_build_object('label','Elegibilidade ao atendimento compartilhado SYZIA','expected',expected_,'allowed',allowed_,'status',case when allowed_<>expected_ then 'Inconsistência'when allowed_ then 'Permitido'else 'Bloqueado'end));
 -- Small seat limits exercise the INSERT trigger itself, including the first denied
 -- extra member. Larger capacities exercise the exact policy used by that trigger.
 if lim is not null and lim<=20 then
 for i in 2..lim loop
 u=gen_random_uuid();insert into auth.users(id,email_confirmed_at,is_anonymous)values(u,now(),false);
 perform public.operations_member(org,u,'colaborador_empresa','active');end loop;
 allowed_=true;begin
 u=gen_random_uuid();insert into auth.users(id,email_confirmed_at,is_anonymous)values(u,now(),false);
 perform public.operations_member(org,u,'colaborador_empresa','active');
 exception when raise_exception then if sqlerrm='billing_limit_reached'then allowed_=false;else raise;end if;end;
 checks=checks||jsonb_build_array(jsonb_build_object('label',lim::text||' membros','expected',true,'allowed',(private.billing_usage_snapshot(org)->>'members')::int=lim,'status',case when(private.billing_usage_snapshot(org)->>'members')::int=lim then 'Permitido'else 'Inconsistência'end),jsonb_build_object('label',(lim+1)::text||'º membro','expected',false,'allowed',allowed_,'status',case when allowed_ then 'Inconsistência'else 'Bloqueado'end));
 else
 allowed_=private.billing_capacity_allows(coalesce(lim,100000)-1,lim);checks=checks||jsonb_build_array(jsonb_build_object('label',case when lim is null then 'Membros: Ilimitado'else lim::text||' membros: cálculo do limite no servidor'end,'expected',true,'allowed',allowed_,'status',case when allowed_ then 'Permitido'else 'Inconsistência'end));
 if lim is not null then allowed_=private.billing_capacity_allows(lim,lim);checks=checks||jsonb_build_array(jsonb_build_object('label','Membro acima do limite: cálculo no servidor','expected',false,'allowed',allowed_,'status',case when allowed_ then 'Inconsistência'else 'Bloqueado'end));end if;end if;
 allowed_=true;begin perform public.operations_directory(other_org,'',0);exception when insufficient_privilege then allowed_=false;end;
 checks=checks||jsonb_build_array(jsonb_build_object('label','Acesso da empresa A à empresa B','expected',false,'allowed',allowed_,'status',case when allowed_ then 'Inconsistência'else 'Bloqueado'end));
 update public.billing_subscriptions set state='suspended'where organization_id=org;
 allowed_=true;begin perform public.operations_directory(org,'',0);exception when insufficient_privilege then allowed_=false;end;
 checks=checks||jsonb_build_array(jsonb_build_object('label','Operação com assinatura suspensa','expected',false,'allowed',allowed_,'status',case when allowed_ then 'Inconsistência'else 'Bloqueado'end));
 allowed_=true;begin perform public.billing_context(org);exception when insufficient_privilege then allowed_=false;end;
 checks=checks||jsonb_build_array(jsonb_build_object('label','Acesso à regularização da assinatura','expected',true,'allowed',allowed_,'status',case when allowed_ then 'Permitido'else 'Inconsistência'end));
 raise exception using errcode='Z0039',message='discard_controlled_scenario';
 exception when sqlstate 'Z0039'then null;
 when others then checks=checks||jsonb_build_array(jsonb_build_object('label','Preparação do cenário controlado','expected',true,'allowed',false,'status','Inconsistência','detail','A verificação foi interrompida e descartada. Revise os campos ou consulte o relatório técnico.'));end;
 perform set_config('request.jwt.claims',coalesce(claims,''),true);
 return jsonb_build_object('consistent',not exists(select 1 from jsonb_array_elements(checks)x where x->>'status'='Inconsistência'),'rolled_back',true,'checks',checks);
end;$$;

-- Extend the existing authorized projection; callers cannot choose capabilities.
do $$declare d text;begin
 d=pg_get_functiondef('public.billing_capabilities(uuid)'::regprocedure);
 d=replace(d,$q$'software',private.entitlement(p_org,'software')$q$,$q$'finance',private.entitlement(p_org,'finance'),'analytics',private.entitlement(p_org,'analytics'),'software',private.entitlement(p_org,'software')$q$);
 execute d;
end;$$;

-- Close new helpers; only the explicit administration RPC surface is exposed.
do $$declare f record;begin
 for f in select p.oid::regprocedure sig,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private')and p.oid not in(select oid from migration039_functions)loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
 if f.nspname='public'and f.proname in('billing_plan_validate','billing_plan_test','billing_provider_status','billing_subscription_action')then execute format('grant execute on function %s to authenticated',f.sig);end if;end loop;
end;$$;
commit;

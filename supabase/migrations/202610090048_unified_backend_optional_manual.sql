-- SYZIA 048: manual optional for company staff; shared support keeps published guidance.
begin;

-- Operational prerequisites do not include training, FAQ or a published manual.
create function private.company_operation_checks(p_org uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('company',coalesce(length(btrim(c.description))>=10 and length(btrim(c.service_regions))>=2,false),
 'services',exists(select 1 from public.services where organization_id=p_org and active),
 'hours',coalesce(jsonb_array_length(c.business_hours)>0,false),'payments',coalesce(length(btrim(c.payment_methods))>=2,false))
 from public.company_settings c where organization_id=p_org;
$$;
revoke all on function private.company_operation_checks(uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.company_readiness(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not private.company_can_read(p_org) then raise exception 'access_denied' using errcode='42501'; end if;
 return case when exists(select 1 from public.company_settings where organization_id=p_org and support_mode in('shared','mixed') and (support_configured or human_enabled)) then private.company_checklist(p_org) else private.company_operation_checks(p_org) end;
end; $function$;

CREATE OR REPLACE FUNCTION private.v029_company_set_activation(p_org uuid, p_expected_revision integer, p_human boolean, p_public_faq boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.company_settings;
begin
 if p_expected_revision is null or p_human is null or p_public_faq is null then raise exception 'invalid_company_fields' using errcode='22023'; end if;
 perform private.company_lock(p_org,p_expected_revision);
 select * into c from public.company_settings where organization_id=p_org;
 if p_human and exists(select 1 from jsonb_each(case when c.support_mode='own' then private.company_operation_checks(p_org) else private.company_checklist(p_org) end) where value<>'true'::jsonb) then raise exception 'company_not_ready_for_human' using errcode='23514'; end if;
 -- Public FAQ is independent of staffing readiness, but always an approved snapshot.
 if p_public_faq and not exists(select 1 from public.manual_versions where organization_id=p_org and id=c.published_manual_id and status='published') then raise exception 'company_published_manual_required' using errcode='23514'; end if;
 update public.company_settings set human_enabled=p_human,faq_public_enabled=p_public_faq where organization_id=p_org;
 perform private.company_touch(p_org,false);
end; $function$;

CREATE OR REPLACE FUNCTION public.company_attendant_permission(p_org uuid, p_action text, p_discount integer DEFAULT 0)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r text;grant_ text;live public.attendant_permissions;snapshot jsonb;cap integer;begin
 r=private.permission_role(p_org,auth.uid());if r is null or p_discount is null or p_discount not between 0 and 100 then return false;end if;
 grant_=case when p_action in('price_list','price_range')then 'quotes.values'when p_action in('quote_create','quote_send','quote_items','discount')then 'quotes.manage'when p_action in('schedule','reschedule','cancel','fit_in')then 'agenda.manage'when p_action in('follow_up','aftercare')then 'followup.manage'when p_action in('whatsapp','negotiate')then 'central.reply'else null end;
 if grant_ is null or not private.permission_allowed(p_org,grant_)then return false;end if;
 if p_action in('quote_create','quote_send','quote_items','discount')and not private.permission_allowed(p_org,'quotes.values')then return false;end if;
 if r in('admin_empresa','super_admin')then return p_action in('price_range','price_list','quote_create','quote_send','quote_items','discount','schedule','reschedule','cancel','fit_in','follow_up','whatsapp','aftercare','negotiate');end if;
 if not private.central_eligible(p_org,auth.uid())then return false;end if;
 select *into live from public.attendant_permissions where organization_id=p_org;
 if r='shared_attendant' then
 select v.snapshot into snapshot from public.company_settings cs join public.manual_versions v on v.id=cs.published_manual_id where cs.organization_id=p_org;
 else
 -- The current administrator-defined autonomy is authoritative for company staff.
 -- No additional action is granted: role, grants, tenant and live ceilings above still apply.
 snapshot=jsonb_build_object('permissions',to_jsonb(live),'services',coalesce((select jsonb_agg(to_jsonb(s))from public.services s where s.organization_id=p_org and s.active),'[]'::jsonb));
 end if;
 if not coalesce(live.reviewed and p_action=any(live.allowed_actions)and(snapshot->'permissions'->'allowed_actions')?p_action,false)then return false;end if;
 if p_action='price_range'and not exists(select 1 from jsonb_array_elements(snapshot->'services')s where s->>'price_mode'='from'and s->>'price_max_cents'is not null and(s->>'price_max_cents')::integer>=(s->>'price_cents')::integer)then return false;end if;
 -- negotiate is information about published conditions only, never a price-edit capability.
 if p_action='discount'then cap=least(live.max_discount_percent,coalesce((snapshot->'permissions'->>'max_discount_percent')::integer,0));return not live.never_change_price and not coalesce((snapshot->'permissions'->>'never_change_price')::boolean,true)and p_discount<=cap;end if;
 return p_discount=0;
end;$function$;

CREATE OR REPLACE FUNCTION private.commercial_can_operate(p_org uuid, p_user uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select private.permission_commercial_base(p_org,p_user)and private.permission_actor(p_org,p_user,'followup.manage')and(private.permission_role(p_org,p_user)in('admin_empresa','super_admin')or exists(select 1 from public.attendant_permissions a join public.company_settings cs on cs.organization_id=a.organization_id left join public.manual_versions v on v.id=cs.published_manual_id where a.organization_id=p_org and a.reviewed and 'follow_up'=any(a.allowed_actions)and(private.permission_role(p_org,p_user)in('own_attendant','colaborador_empresa')or(v.snapshot->'permissions'->'allowed_actions')?'follow_up')));$function$;

CREATE OR REPLACE FUNCTION private.commercial_effective(p_org uuid, p_service uuid, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cfg public.commercial_settings;specific public.commercial_rules;service_rule public.commercial_rules;mins integer;attempts integer;hours jsonb;
begin select * into cfg from public.commercial_settings where organization_id=p_org;
 select * into specific from public.commercial_rules where organization_id=p_org and kind=p_kind and enabled and(service_id=p_service or service_id is null) order by (service_id is not null) desc limit 1;
 select * into service_rule from public.commercial_rules where organization_id=p_org and service_id=p_service and kind is null and enabled;
 mins=coalesce(specific.interval_minutes,service_rule.interval_minutes,cfg.interval_minutes,1440);attempts=coalesce(specific.max_attempts,service_rule.max_attempts,cfg.max_attempts,2);
 select coalesce(cfg.contact_hours,v.snapshot->'settings'->'human_hours',nullif(c.human_hours,'[]'::jsonb),c.business_hours,'[]'::jsonb) into hours from public.company_settings c left join public.manual_versions v on v.id=c.published_manual_id where c.organization_id=p_org;
 return jsonb_build_object('enabled',coalesce(cfg.enabled,false),'interval_minutes',mins,'max_attempts',attempts,'interval_source',case when specific.interval_minutes is not null then 'rule' when service_rule.interval_minutes is not null then 'service' when cfg.interval_minutes is not null then 'company' else 'system' end,'attempt_source',case when specific.max_attempts is not null then 'rule' when service_rule.max_attempts is not null then 'service' when cfg.max_attempts is not null then 'company' else 'system' end,'rule_id',specific.id,'service_rule_id',service_rule.id,'config_revision',cfg.revision,'contact_hours',coalesce(hours,'[]'::jsonb),'eligible_types',coalesce(to_jsonb(cfg.eligible_types),'[]'::jsonb),'after_limit',coalesce(cfg.after_limit,'stop'),'conversion_criterion',coalesce(cfg.conversion_criterion,'booking'));
end;$function$;

CREATE OR REPLACE FUNCTION public.operations_quote_catalog(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$begin perform private.journey_quote_authorize(p_org);
 return jsonb_build_object('services',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('s',id),'name',name,'price_mode',price_mode,'price_cents',price_cents,'duration_minutes',duration_minutes))from public.services where organization_id=p_org and active),'[]'),
 'addons',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('a',id),'service',private.consumer_code('s',service_id),'name',name,'price_mode',price_mode,'price_cents',price_cents,'duration_minutes',duration_minutes))from public.service_addons where organization_id=p_org and active),'[]'),
 'max_daily_minutes',(select coalesce(max(extract(epoch from((h->>'close')::time-(h->>'open')::time))/60),0)from public.company_settings cs cross join lateral jsonb_array_elements(cs.business_hours)h where cs.organization_id=p_org),'max_discount_percent',case when private.permission_manager(p_org)then 100 when private.journey_company_actor(p_org,auth.uid())then coalesce((select a.max_discount_percent from public.attendant_permissions a where a.organization_id=p_org and a.reviewed and 'discount'=any(a.allowed_actions) and not a.never_change_price),0) else coalesce((select(v.snapshot->'permissions'->>'max_discount_percent')::integer from public.company_settings cs join public.manual_versions v on v.id=cs.published_manual_id where cs.organization_id=p_org and(v.snapshot->'permissions'->'allowed_actions')?'discount'and not coalesce((v.snapshot->'permissions'->>'never_change_price')::boolean,true)),0)end);end;$function$;

alter table public.central_quote_actions alter column manual_id drop not null;
create function private.central_quote_manual_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.manual_id is null and private.syzia_identity(new.actor_id) then raise exception 'company_published_manual_required' using errcode='23514';end if;
 return new;
end;$$;
revoke all on function private.central_quote_manual_guard() from public,anon,authenticated,service_role;
create trigger central_quote_manual_guard before insert or update of manual_id,actor_id on public.central_quote_actions for each row execute function private.central_quote_manual_guard();

CREATE OR REPLACE FUNCTION private.central_review_quote(p_code text, p_revision integer, p_discount integer, p_expires timestamp with time zone, p_reason text, p_expected_cents bigint, p_key uuid, p_positions integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.tickets;q public.quote_requests;m public.manual_versions;selection jsonb;items jsonb='[]';i jsonb;amount integer;original bigint=0;total bigint=0;r jsonb;prior jsonb;payload jsonb;
begin perform private.central_lock();t=private.central_ticket(p_code,true);
 if not public.company_attendant_permission(t.organization_id,'quote_create') or not public.company_attendant_permission(t.organization_id,'quote_send') or not public.company_attendant_permission(t.organization_id,'price_list') then raise exception 'central_approval_required' using errcode='42501';end if;
 if p_discount is null or p_discount<0 or p_discount>100 or(p_discount>0 and not public.company_attendant_permission(t.organization_id,'discount',p_discount)) then raise exception 'central_discount_denied' using errcode='42501';end if;
 payload=jsonb_build_array(p_code,p_revision,p_discount,p_expires,p_reason,p_expected_cents,p_positions);prior=private.consumer_idem(t.organization_id,'central_quote',p_key,payload);if prior is not null then return prior;end if;
 if t.revision is distinct from p_revision then raise exception 'central_revision_conflict' using errcode='40001';end if;
 if t.state not in ('active','waiting_internal','waiting_customer') or length(btrim(coalesce(p_reason,''))) not between 2 and 1000 then raise exception 'central_invalid_state' using errcode='22023';end if;
 select * into q from public.quote_requests where id=t.request_id;select v.* into m from public.company_settings s join public.manual_versions v on v.id=s.published_manual_id where s.organization_id=t.organization_id;
 if not exists(select 1 from public.consumer_publications cp where cp.id=q.publication_id and (cp.manual_id=m.id or(cp.manual_id is null and exists(select 1 from public.consumer_pages pg where pg.organization_id=t.organization_id and pg.publication_id=cp.id and pg.enabled)))) then raise exception 'central_price_review_required' using errcode='22023';end if;
 if private.permission_role(t.organization_id,auth.uid())='shared_attendant' and p_discount>coalesce((m.snapshot->'permissions'->>'max_discount_percent')::integer,0) then raise exception 'central_discount_denied' using errcode='42501';end if;
 selection=private.consumer_request_selection(q);
 if exists(select 1 from jsonb_array_elements(selection->'items')x where x->>'price_mode'<>'fixed') then raise exception 'central_price_review_required' using errcode='42501';end if;
 if cardinality(p_positions)<>jsonb_array_length(selection->'items')and not public.company_attendant_permission(t.organization_id,'quote_items')then raise exception 'central_approval_required'using errcode='42501';end if; if p_positions is null or cardinality(p_positions)=0 or cardinality(p_positions)<>(select count(distinct n)from unnest(p_positions)n)or exists(select 1 from unnest(p_positions)n where n is null or n<0 or n>=jsonb_array_length(selection->'items'))then raise exception 'invalid_quote_selection'using errcode='22023';end if; for i in select value from jsonb_array_elements(selection->'items')with ordinality x(value,position)where (position-1)::integer=any(p_positions)loop
  original=original+(i->>'unit_cents')::bigint;amount=floor((i->>'unit_cents')::numeric*(100-p_discount)/100)::integer;total=total+amount;
  items=items||jsonb_build_array(jsonb_build_object('name',i->>'name','quantity',1,'unit_cents',amount));end loop;
 if p_expected_cents is not null and p_expected_cents<>total then raise exception 'price_mismatch' using errcode='22023';end if;
 r=private.central_send_reviewed_quote_core(q.public_code,items,(selection->>'duration_minutes')::integer,p_expires,q.revision,p_key,p_reason);
 insert into public.central_quote_actions(organization_id,ticket_id,version_id,actor_id,original_cents,final_cents,discount_percent,reason,manual_id) values(t.organization_id,t.id,(select id from public.quote_versions where public_code=r->>'code'),auth.uid(),original,total,p_discount,p_reason,m.id);
 update public.tickets set revision=revision+1,state='waiting_customer',next_action='customer',last_staff_at=clock_timestamp(),waiting_since=clock_timestamp() where id=t.id;perform private.central_event(t.id,'quote');perform private.consumer_remember(t.organization_id,'central_quote',p_key,payload,r);return r;
end;$function$;

CREATE OR REPLACE FUNCTION private.v029_central_quote(p_code text, p_revision integer, p_discount integer, p_expires timestamp with time zone, p_reason text, p_expected_cents bigint, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.tickets;q public.quote_requests;m public.manual_versions;selection jsonb;items jsonb='[]';i jsonb;amount integer;original bigint=0;total bigint=0;r jsonb;prior jsonb;payload jsonb;
begin perform private.central_lock();t=private.central_ticket(p_code,true);
 if not public.company_attendant_permission(t.organization_id,'quote_create') or not public.company_attendant_permission(t.organization_id,'quote_send') or not public.company_attendant_permission(t.organization_id,'price_list') then raise exception 'central_approval_required' using errcode='42501';end if;
 if p_discount is null or p_discount<0 or p_discount>100 or(p_discount>0 and not public.company_attendant_permission(t.organization_id,'discount',p_discount)) then raise exception 'central_discount_denied' using errcode='42501';end if;
 payload=jsonb_build_array(p_code,p_revision,p_discount,p_expires,p_reason,p_expected_cents);prior=private.consumer_idem(t.organization_id,'central_quote',p_key,payload);if prior is not null then return prior;end if;
 if t.revision is distinct from p_revision then raise exception 'central_revision_conflict' using errcode='40001';end if;
 if t.state not in ('active','waiting_internal','waiting_customer') or length(btrim(coalesce(p_reason,''))) not between 2 and 1000 then raise exception 'central_invalid_state' using errcode='22023';end if;
 select * into q from public.quote_requests where id=t.request_id;select v.* into m from public.company_settings s join public.manual_versions v on v.id=s.published_manual_id where s.organization_id=t.organization_id;
 if not exists(select 1 from public.consumer_publications where id=q.publication_id and(manual_id=m.id or(private.journey_company_actor(t.organization_id,auth.uid())and manual_id is null))) then raise exception 'central_price_review_required' using errcode='22023';end if;
 if private.permission_role(t.organization_id,auth.uid())='shared_attendant' and p_discount>coalesce((m.snapshot->'permissions'->>'max_discount_percent')::integer,0) then raise exception 'central_discount_denied' using errcode='42501';end if;
 selection=private.consumer_request_selection(q);
 if selection->>'price_mode'<>'fixed' then raise exception 'central_price_review_required' using errcode='42501';end if;
 for i in select value from jsonb_array_elements(selection->'items') loop
  original=original+(i->>'unit_cents')::bigint;amount=floor((i->>'unit_cents')::numeric*(100-p_discount)/100)::integer;total=total+amount;
  items=items||jsonb_build_array(jsonb_build_object('name',i->>'name','quantity',1,'unit_cents',amount));end loop;
 if p_expected_cents is not null and p_expected_cents<>total then raise exception 'price_mismatch' using errcode='22023';end if;
 r=private.central_send_reviewed_quote_core(q.public_code,items,(selection->>'duration_minutes')::integer,p_expires,q.revision,p_key,p_reason);
 insert into public.central_quote_actions(organization_id,ticket_id,version_id,actor_id,original_cents,final_cents,discount_percent,reason,manual_id) values(t.organization_id,t.id,(select id from public.quote_versions where public_code=r->>'code'),auth.uid(),original,total,p_discount,p_reason,m.id);
 update public.tickets set revision=revision+1,state='waiting_customer',next_action='customer',last_staff_at=clock_timestamp(),waiting_since=clock_timestamp() where id=t.id;perform private.central_event(t.id,'quote');perform private.consumer_remember(t.organization_id,'central_quote',p_key,payload,r);return r;
end;$function$;

CREATE OR REPLACE FUNCTION private.onboarding_readiness(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.company_settings;checks jsonb;items jsonb;path text;human boolean;guide jsonb;
begin

 select * into c from public.company_settings where organization_id=p_org;checks=private.company_checklist(p_org);path='/painel/'||p_org;human=coalesce((c.support_configured or c.human_enabled) and c.support_mode in ('shared','mixed'),false);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'href',path||href,'complete',coalesce(complete,false),'required',required,'note',note) order by position),'[]') into items from (values
 (1,'company','Dados da empresa','/configuracao',coalesce(length(btrim(c.description))>=10 and length(btrim(c.service_regions))>=2 and length(btrim(c.payment_methods))>=2,false),true,'Apresente seu negócio e as informações comerciais.'),
 (2,'branding','Identidade visual','/consumidor#identidade',exists(select 1 from public.company_branding b join public.company_media l on l.id=b.logo_id and l.organization_id=p_org and l.state='ready' join public.company_media v on v.id=b.cover_id and v.organization_id=p_org and v.state='ready' where b.organization_id=p_org),false,'Recomendado: logo e capa deixam sua página com a sua cara.'),
 (3,'services','Serviços','/servicos',exists(select 1 from public.services where organization_id=p_org and active),true,'Cadastre o que sua empresa oferece.'),
 (4,'prices','Preços e modalidades','/servicos',exists(select 1 from public.services where organization_id=p_org and active) and not exists(select 1 from public.services where organization_id=p_org and active and (price_mode<>'quote' and price_cents is null)),true,'Preço fixo, a partir de ou sob consulta.'),
 (5,'hours','Horários','/configuracao#horarios',coalesce(jsonb_array_length(c.business_hours)>0,false),true,'Defina os horários em que a empresa atende.'),
 (6,'schedule','Agenda e disponibilidade','/consumidor#disponibilidade',exists(select 1 from public.schedule_resources where organization_id=p_org and active),exists(select 1 from public.services where organization_id=p_org and active and direct_booking),'Necessário quando houver agendamento online. Revise antecedência e intervalos.'),
 (7,'portfolio','Portfólio','/consumidor#portfolio',exists(select 1 from public.portfolio_items where organization_id=p_org and active),false,'Opcional: mostre seu trabalho com imagens autorizadas.'),
 (8,'page','Página pública','/consumidor#publicacao',exists(select 1 from public.consumer_pages where organization_id=p_org and enabled and publication_id is not null),true,'Revise o conteúdo antes de disponibilizá-lo na página da empresa.'),
 (9,'publication','Publicação e prontidão','/consumidor#publicacao',exists(select 1 from public.consumer_pages p join public.consumer_publications v on v.id=p.publication_id left join public.manual_versions m on m.id=v.manual_id where p.organization_id=p_org and p.enabled and (m.source_revision=c.operational_revision or(v.manual_id is null and v.payload=private.presence_payload(p_org,v.show_prices)))),true,'Rascunhos não substituem a versão aprovada para o consumidor.'),
 (10,'manual','Manual da empresa — Opcional','/manual',coalesce((checks->>'manual_published')::boolean,false),false,'Organize informações e orientações para sua equipe consultar quando necessário.'),
 (11,'faq','FAQ','/faq',coalesce((checks->>'faq')::boolean,false),false,'Respostas claras às dúvidas recorrentes.'),
 (12,'rules','Regras empresariais','/regras',coalesce((checks->>'rules')::boolean,false),false,'Defina como agir em cancelamentos, prazos e exceções.'),
 (13,'autonomy','Autonomia da equipe','/autonomia',coalesce((checks->>'autonomy')::boolean,false),false,'Você decide os limites. Fora deles, a equipe consulta a empresa.'),
 (14,'human_ready','Prontidão do suporte compartilhado','/prontidao',coalesce(c.human_enabled,false) and not exists(select 1 from jsonb_each(checks) where value<>'true'::jsonb),false,'Exigência específica da Equipe SYZIA: publique orientações, regras e autonomia antes de habilitar o apoio compartilhado. A equipe própria pode operar independentemente disso.')
 ) x(position,id,label,href,complete,required,note) where position<=10 or human;
 return jsonb_build_object('organization_id',p_org,'items',items,'shared_support',human,'ready',not exists(select 1 from jsonb_array_elements(items)i where (i->>'required')::boolean and not(i->>'complete')::boolean));
end;$function$;

-- Existing RLS/FORCE RLS, grants and table data are retained. No new public RPC or table.
commit;

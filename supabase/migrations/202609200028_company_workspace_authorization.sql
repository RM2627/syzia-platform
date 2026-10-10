begin;
-- Authorized correction: the active Super Admin may configure and operate an
-- active company using the existing workspace, without a fabricated membership.
-- is_org_admin remains membership-only. Global authority comes from the stored
-- role, with profile/Auth/session validation and the current session scope.
create or replace function private.company_can_manage(p_org uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.is_org_admin(p_org) or (
   private.has_global_role('super_admin') and private.access_scope(p_org)
   and exists(select 1 from public.organizations where id=p_org and status='active')
 );
$$;
create or replace function private.company_can_read(p_org uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_user() and private.access_scope(p_org)
 and exists(select 1 from public.organizations o where o.id=p_org and o.status='active'
   and (private.has_global_role('super_admin') or exists(
     select 1 from public.organization_members m where m.organization_id=o.id
     and m.user_id=auth.uid() and m.status='active' and not m.is_attendant)));
$$;
revoke all on function private.company_can_manage(uuid),private.company_can_read(uuid) from public,anon;
grant execute on function private.company_can_manage(uuid),private.company_can_read(uuid) to authenticated;

-- Keep the existing checklist, tutorial state and tenant-bound operation bodies.
-- Only the authorization predicate changes. No rows or progress are rewritten.
create or replace function public.onboarding_context(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.company_settings;checks jsonb;items jsonb;path text;human boolean;guide jsonb;
begin
 if not private.company_can_manage(p_org) then raise exception 'access_denied' using errcode='42501';end if;
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
 (9,'publication','Publicação e prontidão','/consumidor#publicacao',exists(select 1 from public.consumer_pages p join public.consumer_publications v on v.id=p.publication_id join public.manual_versions m on m.id=v.manual_id where p.organization_id=p_org and p.enabled and m.source_revision=c.operational_revision),true,'Rascunhos não substituem a versão aprovada para o consumidor.'),
 (10,'manual','Manual de Atendimento','/manual',coalesce((checks->>'manual_published')::boolean,false),human,'Para o atendimento humano: você orienta, nossa equipe segue.'),
 (11,'faq','FAQ','/faq',coalesce((checks->>'faq')::boolean,false),human,'Respostas claras às dúvidas recorrentes.'),
 (12,'rules','Regras empresariais','/regras',coalesce((checks->>'rules')::boolean,false),human,'Defina como agir em cancelamentos, prazos e exceções.'),
 (13,'autonomy','Autonomia da equipe','/autonomia',coalesce((checks->>'autonomy')::boolean,false),human,'Você decide os limites. Fora deles, a equipe consulta a empresa.'),
 (14,'human_ready','Prontidão do atendimento','/prontidao',coalesce(c.human_enabled,false) and not exists(select 1 from jsonb_each(checks) where value<>'true'::jsonb),human,'Revise manual, regras, equipe e disponibilidade antes de ativar.')
 ) x(position,id,label,href,complete,required,note) where position<10 or human;
 select to_jsonb(g)-array['user_id','organization_id'] into guide from public.organization_user_guides g where organization_id=p_org and user_id=auth.uid();
 return jsonb_build_object('organization_id',p_org,'items',items,'shared_support',human,'ready',not exists(select 1 from jsonb_array_elements(items)i where (i->>'required')::boolean and not(i->>'complete')::boolean),
 'guide',coalesce(guide,jsonb_build_object('status','not_started','step',0,'revision',0)));
end;$$;

create or replace function public.operations_agenda(p_org uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tz text;b jsonb;
begin
 if not private.company_can_manage(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 select timezone into tz from public.organizations where id=p_org;b=private.analytics_period(tz,p_from,p_to);
 if p_to-p_from>42 then raise exception 'invalid_agenda_period' using errcode='22023';end if;
 return jsonb_build_object('timezone',tz,'appointments',coalesce((select jsonb_agg(x order by x->>'starts_at') from (
 select to_jsonb(a)||jsonb_build_object('customer',c.name,'service',coalesce((select qi.name from public.quote_versions v join public.quote_items qi on qi.version_id=v.id where v.request_id=q.id order by v.version desc,qi.position limit 1),sv.name),'request_code',q.public_code)
 x from public.appointments a left join public.customers c on c.id=a.customer_id and c.organization_id=a.organization_id left join public.quote_requests q on q.id=a.request_id and q.organization_id=a.organization_id left join public.services sv on sv.id=q.service_id
 where a.organization_id=p_org and a.starts_at<(b->>'until')::timestamptz and a.ends_at>(b->>'from')::timestamptz order by a.starts_at limit 1000)r),'[]'::jsonb),
 'resource',(select to_jsonb(r) from public.schedule_resources r where organization_id=p_org),'hours',(select business_hours from public.company_settings where organization_id=p_org));
end;$$;

create or replace function public.operations_detail(p_org uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.appointments;q public.quote_requests;pub public.consumer_publications;v public.quote_versions;
begin
 if not private.company_can_manage(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 select * into a from public.appointments where id=p_id and organization_id=p_org;if a.id is null then raise exception 'access_denied' using errcode='42501';end if;
 select * into q from public.quote_requests where id=a.request_id and organization_id=p_org;
 select * into pub from public.consumer_publications where id=q.publication_id;
 select * into v from public.quote_versions where organization_id=p_org and request_id=q.id order by (id=q.accepted_version_id) desc nulls last,version desc limit 1;
 return jsonb_build_object('appointment',to_jsonb(a),'request',to_jsonb(q),'customer',(select jsonb_build_object('id',id,'name',name,'whatsapp',whatsapp,'email',email) from public.customers where id=a.customer_id and organization_id=p_org),
 'quote',to_jsonb(v),'accepted',q.accepted_version_id is not null,'items',coalesce((select jsonb_agg(to_jsonb(i) order by position) from public.quote_items i where organization_id=p_org and version_id=v.id),'[]'::jsonb),
 'questions',(select s->'questions' from jsonb_array_elements(pub.payload->'services')s where s->>'code'=q.service_code),'source',(select source from public.opportunity_context where organization_id=p_org and opportunity_id=q.opportunity_id),
 'history',coalesce((select jsonb_agg(to_jsonb(e) order by created_at) from public.appointment_events e where organization_id=p_org and appointment_id=a.id),'[]'::jsonb));
end;$$;

create or replace function public.operations_directory(p_org uuid,p_search text default '',p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.company_can_manage(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 if length(coalesce(p_search,''))>120 or coalesce(p_offset,0)<0 then raise exception 'invalid_search' using errcode='22023';end if;
 return jsonb_build_object('customers',coalesce((select jsonb_agg(to_jsonb(c)) from (select id,name,whatsapp,email from public.customers where organization_id=p_org and (p_search is null or name ilike '%'||p_search||'%' or whatsapp like '%'||p_search||'%') order by name,id limit 51 offset coalesce(p_offset,0))c),'[]'::jsonb),
 'catalog',(select v.payload from public.consumer_pages p join public.consumer_publications v on v.id=p.publication_id where p.organization_id=p_org and p.enabled));
end;$$;

create or replace function public.operations_requests(p_org uuid,p_search text default '',p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.company_can_manage(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 if length(coalesce(p_search,''))>120 or coalesce(p_offset,0)<0 then raise exception 'invalid_search' using errcode='22023';end if;
 return coalesce((select jsonb_agg(x) from (
 select jsonb_build_object('id',q.id,'code',q.public_code,'state',q.state,'revision',q.revision,'customer',c.name,'service',s.name,'created_at',q.created_at) x from public.quote_requests q join public.customers c on c.id=q.customer_id join public.services s on s.id=q.service_id
 where q.organization_id=p_org and (p_search is null or concat_ws(' ',c.name,s.name) ilike '%'||p_search||'%') order by q.created_at desc,q.id limit 51 offset coalesce(p_offset,0))r),'[]'::jsonb);
end;$$;

create or replace function public.operations_home(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tz text;today date;agenda jsonb;
begin
 if not private.company_can_manage(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 select timezone into tz from public.organizations where id=p_org;today=(now() at time zone tz)::date;agenda=public.operations_agenda(p_org,today,today+1);
 return agenda||jsonb_build_object('today',today,'company',(select name from public.organizations where id=p_org),
 'next',(select jsonb_build_object('id',a.id,'starts_at',a.starts_at,'customer',c.name,'service',s.name) from public.appointments a join public.customers c on c.id=a.customer_id join public.quote_requests q on q.id=a.request_id join public.services s on s.id=q.service_id where a.organization_id=p_org and a.kind='booking' and a.state='confirmed' and a.execution_state<>'completed' and a.ends_at>now() order by a.starts_at limit 1),
 'decisions',coalesce((select jsonb_agg(x) from(select jsonb_build_object('id',e.id,'ticket',t.public_code,'customer',c.name,'question',e.question,'summary',e.summary,'created_at',e.created_at) x from public.ticket_escalations e join public.tickets t on t.id=e.ticket_id join public.customers c on c.id=t.customer_id where e.organization_id=p_org and e.responded_at is null order by e.created_at limit 50)r),'[]'::jsonb),
 'quotes',coalesce((select jsonb_agg(x) from(select jsonb_build_object('id',q.id,'code',q.public_code,'customer',c.name,'service',s.name,'state',q.state) x from public.quote_requests q join public.customers c on c.id=q.customer_id join public.services s on s.id=q.service_id where q.organization_id=p_org and q.state in ('submitted','under_review') and not exists(select 1 from public.appointments a where a.organization_id=p_org and a.request_id=q.id and a.kind='booking' and a.state='confirmed') order by q.created_at limit 20)r),'[]'::jsonb),
 'notifications',coalesce((select jsonb_agg(to_jsonb(n)) from(select n.*,exists(select 1 from public.notification_reads r where r.notification_id=n.id and r.user_id=auth.uid()) as read from public.notifications n where n.organization_id=p_org order by n.created_at desc limit 20)n),'[]'::jsonb));
end;$$;

create or replace function public.operations_quote_context(p_org uuid,p_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if not private.company_can_manage(p_org) or not exists(select 1 from public.quote_requests where organization_id=p_org and public_code=p_code) then raise exception 'access_denied' using errcode='42501';end if;return public.consumer_request_context(p_code);end;$$;

create or replace function public.analytics_company(p_org uuid,p_from date,p_to date,p_service uuid default null,p_source text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;b jsonb;count_ bigint;
begin
 if not private.company_can_manage(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 r=public.analytics_company_before_operations(p_org,p_from,p_to,p_service,p_source);b=r->'period';
 select count(*) into count_ from public.appointment_events e join public.appointments a on a.id=e.appointment_id join public.quote_requests q on q.id=a.request_id left join public.opportunity_context oc on oc.opportunity_id=q.opportunity_id
 where e.organization_id=p_org and e.event='completed' and e.created_at>=(b->>'from')::timestamptz and e.created_at<(b->>'until')::timestamptz and(p_service is null or q.service_id=p_service) and(p_source is null or coalesce(oc.source,'unknown')=p_source);
 return r||jsonb_build_object('execution',jsonb_build_object('completed',count_,'basis','completion_events_in_period','revenue_cents',null));
end;$$;

create or replace function public.analytics_central(p_org uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare bounds jsonb;lo timestamptz;hi timestamptz;minutes integer;r jsonb;
begin
 if not private.company_can_manage(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 bounds=private.analytics_period((select timezone from public.organizations where id=p_org),p_from,p_to);lo=(bounds->>'from')::timestamptz;hi=(bounds->>'until')::timestamptz;
 select response_minutes into minutes from public.central_settings where organization_id=p_org;
 with cohort as(select t.id,t.created_at from public.tickets t where t.organization_id=p_org and t.created_at>=lo and t.created_at<hi),
 timings as(select t.*,first_customer.at customer_at,first_response.at response_at,extract(epoch from(first_response.at-first_customer.at)) response_seconds,
 exists(select 1 from public.ticket_events e where e.organization_id=p_org and e.ticket_id=t.id and e.event='resolved' and e.created_at<hi) resolved
 from cohort t left join lateral(select min(m.created_at) as at from public.ticket_messages m where m.organization_id=p_org and m.ticket_id=t.id and m.kind='customer' and m.created_at<hi)first_customer on true
 left join lateral(select min(m.created_at) as at from public.ticket_messages m where m.organization_id=p_org and m.ticket_id=t.id and m.kind in ('attendant','company') and m.created_at>=first_customer.at and m.created_at<hi)first_response on true)
 select jsonb_build_object('period',bounds,'generated_at',statement_timestamp(),'tickets',count(*),'resolved',count(*) filter(where resolved),'answered',count(response_at),'unanswered',count(*) filter(where customer_at is not null and response_at is null),
 'first_response_seconds',round(avg(response_seconds),1),'median_response_seconds',percentile_cont(.5) within group(order by response_seconds),
 'sla',jsonb_build_object('reference_minutes',minutes,'basis','current_configuration_elapsed_time','within',case when minutes is null then null else count(*) filter(where response_seconds<=minutes*60) end,'breached',case when minutes is null then null else count(*) filter(where response_seconds>minutes*60 or(response_at is null and customer_at<least(hi,statement_timestamp())-make_interval(mins=>minutes))) end),
 'live',jsonb_build_object('queued',(select count(*) from public.tickets where organization_id=p_org and state='queued'),'open',(select count(*) from public.tickets where organization_id=p_org and state not in ('resolved','closed')),'assigned',(select count(*) from public.tickets where organization_id=p_org and state not in ('resolved','closed') and assignee_id is not null),'waiting_company',(select count(*) from public.tickets where organization_id=p_org and state='waiting_company'))) into r from timings;
 return r;
end;$$;

-- RLS retains the organization predicate; user-specific state stays user-specific.
alter policy organization_user_guides_read on public.organization_user_guides
 using(user_id=auth.uid() and private.company_can_manage(organization_id));
alter policy appointment_events_read on public.appointment_events
 using(private.company_can_manage(organization_id));
alter policy notifications_read on public.notifications
 using(private.company_can_manage(organization_id));
alter policy notification_reads_read on public.notification_reads
 using(private.company_can_manage(organization_id) and user_id=auth.uid());
-- Existing RPC signatures/ACLs, FORCE RLS, write denials, locks, audit and trial
-- invariants are unchanged. No grants on the deprecated analytics entry point.
commit;

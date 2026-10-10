begin;
-- Reservation state remains the single source of capacity. Execution is a separate lifecycle.
alter table public.customers alter column user_id drop not null;
alter table public.appointments add column revision integer not null default 1 check(revision>0);
alter table public.appointments add column execution_state text not null default 'scheduled' check(execution_state in ('scheduled','in_progress','completed'));
alter table public.appointments add column started_at timestamptz;
alter table public.appointments add column completed_at timestamptz;
alter table public.appointments add constraint execution_consistency check(
 (execution_state='scheduled' and started_at is null and completed_at is null) or
 (kind='booking' and state='confirmed' and started_at is not null and ((execution_state='in_progress' and completed_at is null) or(execution_state='completed' and completed_at>=started_at))));
create table public.appointment_events (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,appointment_id uuid not null,actor_id uuid references public.profiles(id),
 event text not null check(event in ('booked','blocked','rescheduled','cancelled','started','completed')),previous_start timestamptz,previous_end timestamptz,starts_at timestamptz not null,ends_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default now(),
 foreign key(organization_id,appointment_id) references public.appointments(organization_id,id)
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),kind text not null check(kind in ('appointment','decision')),
 object_id uuid not null,title text not null check(length(title)<=160),href text not null check(href like '/painel/%'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default now(),unique(organization_id,id)
);
create table public.notification_reads (
 organization_id uuid not null references public.organizations(id),notification_id uuid not null references public.notifications(id),user_id uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(notification_id,user_id),foreign key(organization_id,notification_id) references public.notifications(organization_id,id)
);
create index appointment_events_history on public.appointment_events(organization_id,appointment_id,created_at);
create index notifications_recent on public.notifications(organization_id,created_at desc);
create index operations_agenda_day on public.appointments(organization_id,starts_at);
do $$declare n text;begin foreach n in array array['appointment_events','notifications','notification_reads'] loop
 execute format('alter table public.%I enable row level security',n);execute format('alter table public.%I force row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated',n);execute format('grant select on public.%I to authenticated',n);
 execute format('create policy %I on public.%I for select to authenticated using(private.is_org_admin(organization_id)%s)',n||'_read',n,case when n='notification_reads' then ' and user_id=auth.uid()' else '' end);
 execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.company_audit()',n||'_audit',n);
 end loop;end;$$;
create trigger appointment_events_immutable before update or delete on public.appointment_events for each row execute function private.consumer_deny_immutable();
create function private.operations_appointment_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if old.execution_state<>'scheduled' and (new.state<>old.state or new.starts_at<>old.starts_at or new.ends_at<>old.ends_at) then raise exception 'service_already_started' using errcode='22023';end if;
 if old.execution_state='completed' and new.execution_state<>old.execution_state or old.execution_state='in_progress' and new.execution_state='scheduled' then raise exception 'invalid_service_transition' using errcode='22023';end if;
 if old.execution_state='scheduled' and new.execution_state='completed' then raise exception 'invalid_service_transition' using errcode='22023';end if;
 new.revision=old.revision+1;return new;
end;$$;
create trigger operations_appointment_guard before update on public.appointments for each row execute function private.operations_appointment_guard();
create function private.operations_appointment_event() returns trigger language plpgsql security definer set search_path='' as $$
declare ev text;label text;
begin
 if tg_op='INSERT' then ev=case when new.kind='block' then 'blocked' else 'booked' end;
 elsif new.execution_state is distinct from old.execution_state then ev=case new.execution_state when 'in_progress' then 'started' when 'completed' then 'completed' end;
 elsif new.state='cancelled' and old.state<>'cancelled' then ev='cancelled';
 elsif new.starts_at<>old.starts_at or new.ends_at<>old.ends_at then ev='rescheduled';else return new;end if;
 insert into public.appointment_events(organization_id,appointment_id,actor_id,event,previous_start,previous_end,starts_at,ends_at)
 values(new.organization_id,new.id,auth.uid(),ev,case when tg_op='UPDATE' then old.starts_at end,case when tg_op='UPDATE' then old.ends_at end,new.starts_at,new.ends_at);
 if new.request_id is not null and ev in ('started','completed') then perform private.consumer_event(new.organization_id,new.request_id,'service_'||ev);end if;
 label=case ev when 'booked' then 'Novo agendamento' when 'blocked' then 'Período bloqueado' when 'cancelled' then 'Agendamento cancelado' when 'rescheduled' then 'Horário alterado' when 'started' then 'Serviço em execução' when 'completed' then 'Serviço concluído' end;
 insert into public.notifications(organization_id,kind,object_id,title,href) values(new.organization_id,'appointment',new.id,label,'/painel/'||new.organization_id||'/agenda?ficha='||new.id);
 return new;
end;$$;
create trigger operations_appointment_event after insert or update on public.appointments for each row execute function private.operations_appointment_event();
create function private.operations_decision_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.notifications(organization_id,kind,object_id,title,href) values(new.organization_id,'decision',new.ticket_id,'Sua equipe precisa de uma decisão','/painel/'||new.organization_id||'/pendencias?ticket='||(select public_code from public.tickets where id=new.ticket_id and organization_id=new.organization_id));return new;
end;$$;
create trigger operations_decision_notification after insert on public.ticket_escalations for each row execute function private.operations_decision_notification();
create function public.operations_customer(p_org uuid,p_data jsonb,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare prior jsonb;cid uuid;
begin perform private.company_lock(p_org);perform private.company_keys(p_data,array['name','whatsapp','email','accepted_notice','contact']);
 prior=private.consumer_idem(p_org,'operations_customer',p_key,p_data);if prior is not null then return (prior->>'id')::uuid;end if;
 if p_data->>'accepted_notice' is distinct from 'true' then raise exception 'notice_required' using errcode='22023';end if;
 insert into public.customers(organization_id,user_id,name,whatsapp,email) values(p_org,null,btrim(p_data->>'name'),p_data->>'whatsapp',nullif(btrim(p_data->>'email'),'')) returning id into cid;
 insert into public.customer_consents(organization_id,customer_id,purpose,notice_version) values(p_org,cid,'request_processing','consumer-v1');
 if p_data->>'contact'='true' then insert into public.customer_consents(organization_id,customer_id,purpose,notice_version) values(p_org,cid,'request_contact','consumer-v1');end if;
 perform private.consumer_remember(p_org,'operations_customer',p_key,p_data,jsonb_build_object('id',cid));return cid;
end;$$;
create function public.operations_request(p_org uuid,p_customer uuid,p_service text,p_addons text[],p_answers jsonb,p_notes text,p_source text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.consumer_publications;calc jsonb;op uuid;q public.quote_requests;ver uuid;item jsonb;pos integer=0;payload jsonb;prior jsonb;result jsonb;
begin perform private.company_lock(p_org);
 if not exists(select 1 from public.customers where id=p_customer and organization_id=p_org) then raise exception 'access_denied' using errcode='42501';end if;
 if p_source is null or p_source not in ('instagram','google','referral','whatsapp','direct','other','unknown') then raise exception 'invalid_source' using errcode='22023';end if;
 payload=jsonb_build_array(p_customer,p_service,p_addons,p_answers,p_notes,p_source);prior=private.consumer_idem(p_org,'operations_request',p_key,payload);if prior is not null then return prior;end if;
 v=private.consumer_publication((select slug from public.organizations where id=p_org));calc=private.consumer_selection(v.id,p_service,p_addons,p_answers);
 insert into public.opportunities(organization_id,customer_id,service_id) values(p_org,p_customer,(calc->>'service_id')::uuid) returning id into op;
 insert into public.opportunity_context(organization_id,opportunity_id,source) values(p_org,op,p_source);
 insert into public.quote_requests(organization_id,customer_id,opportunity_id,publication_id,service_id,service_code,addon_codes,answers,notes) values(p_org,p_customer,op,v.id,(calc->>'service_id')::uuid,p_service,p_addons,p_answers,coalesce(p_notes,'')) returning * into q;
 insert into public.quote_versions(organization_id,request_id,version,kind,price_mode,total_cents,duration_minutes,created_by) values(p_org,q.id,1,'estimate',calc->>'price_mode',(calc->>'total_cents')::bigint,(calc->>'duration_minutes')::integer,auth.uid()) returning id into ver;
 for item in select x from jsonb_array_elements(calc->'items')x loop insert into public.quote_items(organization_id,version_id,position,name,quantity,unit_cents,price_mode,duration_minutes) values(p_org,ver,pos,item->>'name',1,(item->>'unit_cents')::integer,item->>'price_mode',(item->>'duration_minutes')::integer);pos=pos+1;end loop;
 update public.quote_versions set state='sent' where id=ver;
 update public.quote_requests set state='submitted',revision=revision+1 where id=q.id;
 perform private.consumer_event(p_org,q.id,'created');perform private.consumer_event(p_org,q.id,'submitted');
 result=jsonb_build_object('id',q.id,'code',q.public_code,'duration_minutes',calc->'duration_minutes');perform private.consumer_remember(p_org,'operations_request',p_key,payload,result);return result;
end;$$;
create function public.operations_schedule(p_org uuid,p_request uuid,p_start timestamptz,p_duration integer,p_note text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;v public.consumer_publications;s public.schedule_resources;payload jsonb;prior jsonb;a public.appointments;calc jsonb;
begin perform private.company_lock(p_org);payload=jsonb_build_array(p_request,p_start,p_duration,p_note);
 if not exists(select 1 from public.quote_requests where id=p_request and organization_id=p_org) then raise exception 'access_denied' using errcode='42501';end if;
 prior=private.consumer_idem(p_org,'operations_schedule',p_key,payload);if prior is not null then return prior;end if;
 select * into q from public.quote_requests where id=p_request and organization_id=p_org;
 if q.state not in ('submitted','under_review','quoted','approved') or p_duration is null or p_duration not between 1 and 10080 then raise exception 'invalid_booking' using errcode='22023';end if;
 v=private.consumer_publication((select slug from public.organizations where id=p_org));calc=private.consumer_selection(q.publication_id,q.service_code,q.addon_codes,q.answers);
 if p_duration<coalesce((select duration_minutes from public.quote_versions where id=q.accepted_version_id and organization_id=p_org),(calc->>'duration_minutes')::integer) then raise exception 'booking_duration_too_short' using errcode='22023';end if;
 if not private.consumer_slot_allowed(v.id,p_start,p_duration) then raise exception 'slot_unavailable' using errcode='23P01';end if;
 select * into s from public.schedule_resources where organization_id=p_org;
 insert into public.appointments(organization_id,resource_id,kind,request_id,customer_id,starts_at,ends_at,note) values(p_org,s.id,'booking',q.id,q.customer_id,p_start,p_start+make_interval(mins=>p_duration+s.buffer_minutes),coalesce(p_note,'')) returning * into a;
 update public.opportunities set stage='contracted' where id=q.opportunity_id;perform private.consumer_event(p_org,q.id,'booked');
 perform private.consumer_remember(p_org,'operations_schedule',p_key,payload,to_jsonb(a));return to_jsonb(a);
end;$$;
create function public.operations_appointment_act(p_org uuid,p_id uuid,p_revision integer,p_action text,p_data jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments;v public.consumer_publications;s public.schedule_resources;prior jsonb;payload jsonb;ts timestamptz;minutes integer;q public.quote_requests;
begin perform private.company_lock(p_org);
 select * into a from public.appointments where id=p_id and organization_id=p_org for update;if a.id is null then raise exception 'access_denied' using errcode='42501';end if;
 payload=jsonb_build_array(p_id,p_revision,p_action,p_data);prior=private.consumer_idem(p_org,'operations_appointment_act',p_key,payload);if prior is not null then return prior;end if;
 if a.revision is distinct from p_revision then raise exception 'appointment_revision_conflict' using errcode='40001';end if;
 if a.state<>'confirmed' then raise exception 'invalid_service_transition' using errcode='22023';end if;
 if p_action='reschedule' then
  perform private.company_keys(p_data,array['start']);if a.execution_state<>'scheduled' then raise exception 'service_already_started' using errcode='22023';end if;
  ts=(p_data->>'start')::timestamptz;select * into s from public.schedule_resources where organization_id=p_org;minutes=extract(epoch from(a.ends_at-a.starts_at))/60-s.buffer_minutes;
  v=private.consumer_publication((select slug from public.organizations where id=p_org));
  if not private.consumer_slot_allowed(v.id,ts,minutes,a.id) then raise exception 'slot_unavailable' using errcode='23P01';end if;
  if a.request_id is not null then select * into q from public.quote_requests where id=a.request_id;perform private.consumer_selection(q.publication_id,q.service_code,q.addon_codes,q.answers);end if;
  update public.appointments set starts_at=ts,ends_at=ts+(a.ends_at-a.starts_at) where id=a.id returning * into a;
  if a.request_id is not null then perform private.consumer_event(p_org,a.request_id,'rescheduled');end if;
 else
  perform private.company_keys(p_data,array[]::text[]);
  case p_action
  when 'start' then
   if a.kind<>'booking' or a.execution_state<>'scheduled' or a.starts_at>now()+interval '15 minutes' then raise exception 'invalid_service_transition' using errcode='22023';end if;
   update public.appointments set execution_state='in_progress',started_at=clock_timestamp() where id=a.id returning * into a;
  when 'complete' then
   if a.kind<>'booking' or a.execution_state<>'in_progress' then raise exception 'invalid_service_transition' using errcode='22023';end if;
   update public.appointments set execution_state='completed',completed_at=clock_timestamp() where id=a.id returning * into a;
  when 'cancel' then
   if a.execution_state<>'scheduled' then raise exception 'service_already_started' using errcode='22023';end if;
   update public.appointments set state='cancelled' where id=a.id returning * into a;
   if a.request_id is not null then perform private.consumer_event(p_org,a.request_id,'cancelled');end if;
  else raise exception 'invalid_service_transition' using errcode='22023';end case;
 end if;
 perform private.consumer_remember(p_org,'operations_appointment_act',p_key,payload,to_jsonb(a));return to_jsonb(a);
end;$$;
create function public.operations_agenda(p_org uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tz text;b jsonb;
begin
 if not private.is_org_admin(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 select timezone into tz from public.organizations where id=p_org;b=private.analytics_period(tz,p_from,p_to);
 if p_to-p_from>42 then raise exception 'invalid_agenda_period' using errcode='22023';end if;
 return jsonb_build_object('timezone',tz,'appointments',coalesce((select jsonb_agg(x order by x->>'starts_at') from (
 select to_jsonb(a)||jsonb_build_object('customer',c.name,'service',coalesce((select qi.name from public.quote_versions v join public.quote_items qi on qi.version_id=v.id where v.request_id=q.id order by v.version desc,qi.position limit 1),sv.name),'request_code',q.public_code)
 x from public.appointments a left join public.customers c on c.id=a.customer_id and c.organization_id=a.organization_id left join public.quote_requests q on q.id=a.request_id and q.organization_id=a.organization_id left join public.services sv on sv.id=q.service_id
 where a.organization_id=p_org and a.starts_at<(b->>'until')::timestamptz and a.ends_at>(b->>'from')::timestamptz order by a.starts_at limit 1000)r),'[]'::jsonb),
 'resource',(select to_jsonb(r) from public.schedule_resources r where organization_id=p_org),'hours',(select business_hours from public.company_settings where organization_id=p_org));
end;$$;
create function public.operations_detail(p_org uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.appointments;q public.quote_requests;pub public.consumer_publications;v public.quote_versions;
begin
 if not private.is_org_admin(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 select * into a from public.appointments where id=p_id and organization_id=p_org;if a.id is null then raise exception 'access_denied' using errcode='42501';end if;
 select * into q from public.quote_requests where id=a.request_id and organization_id=p_org;
 select * into pub from public.consumer_publications where id=q.publication_id;
 select * into v from public.quote_versions where organization_id=p_org and request_id=q.id order by (id=q.accepted_version_id) desc nulls last,version desc limit 1;
 return jsonb_build_object('appointment',to_jsonb(a),'request',to_jsonb(q),'customer',(select jsonb_build_object('id',id,'name',name,'whatsapp',whatsapp,'email',email) from public.customers where id=a.customer_id and organization_id=p_org),
 'quote',to_jsonb(v),'accepted',q.accepted_version_id is not null,'items',coalesce((select jsonb_agg(to_jsonb(i) order by position) from public.quote_items i where organization_id=p_org and version_id=v.id),'[]'::jsonb),
 'questions',(select s->'questions' from jsonb_array_elements(pub.payload->'services')s where s->>'code'=q.service_code),'source',(select source from public.opportunity_context where organization_id=p_org and opportunity_id=q.opportunity_id),
 'history',coalesce((select jsonb_agg(to_jsonb(e) order by created_at) from public.appointment_events e where organization_id=p_org and appointment_id=a.id),'[]'::jsonb));
end;$$;
create function public.operations_directory(p_org uuid,p_search text default '',p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_org_admin(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 if length(coalesce(p_search,''))>120 or coalesce(p_offset,0)<0 then raise exception 'invalid_search' using errcode='22023';end if;
 return jsonb_build_object('customers',coalesce((select jsonb_agg(to_jsonb(c)) from (select id,name,whatsapp,email from public.customers where organization_id=p_org and (p_search is null or name ilike '%'||p_search||'%' or whatsapp like '%'||p_search||'%') order by name,id limit 51 offset coalesce(p_offset,0))c),'[]'::jsonb),
 'catalog',(select v.payload from public.consumer_pages p join public.consumer_publications v on v.id=p.publication_id where p.organization_id=p_org and p.enabled));
end;$$;
create function public.operations_requests(p_org uuid,p_search text default '',p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_org_admin(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 if length(coalesce(p_search,''))>120 or coalesce(p_offset,0)<0 then raise exception 'invalid_search' using errcode='22023';end if;
 return coalesce((select jsonb_agg(x) from (
 select jsonb_build_object('id',q.id,'code',q.public_code,'state',q.state,'revision',q.revision,'customer',c.name,'service',s.name,'created_at',q.created_at) x from public.quote_requests q join public.customers c on c.id=q.customer_id join public.services s on s.id=q.service_id
 where q.organization_id=p_org and (p_search is null or concat_ws(' ',c.name,s.name) ilike '%'||p_search||'%') order by q.created_at desc,q.id limit 51 offset coalesce(p_offset,0))r),'[]'::jsonb);
end;$$;
create function public.operations_home(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tz text;today date;agenda jsonb;
begin
 if not private.is_org_admin(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 select timezone into tz from public.organizations where id=p_org;today=(now() at time zone tz)::date;agenda=public.operations_agenda(p_org,today,today+1);
 return agenda||jsonb_build_object('today',today,'company',(select name from public.organizations where id=p_org),
 'next',(select jsonb_build_object('id',a.id,'starts_at',a.starts_at,'customer',c.name,'service',s.name) from public.appointments a join public.customers c on c.id=a.customer_id join public.quote_requests q on q.id=a.request_id join public.services s on s.id=q.service_id where a.organization_id=p_org and a.kind='booking' and a.state='confirmed' and a.execution_state<>'completed' and a.ends_at>now() order by a.starts_at limit 1),
 'decisions',coalesce((select jsonb_agg(x) from(select jsonb_build_object('id',e.id,'ticket',t.public_code,'customer',c.name,'question',e.question,'summary',e.summary,'created_at',e.created_at) x from public.ticket_escalations e join public.tickets t on t.id=e.ticket_id join public.customers c on c.id=t.customer_id where e.organization_id=p_org and e.responded_at is null order by e.created_at limit 50)r),'[]'::jsonb),
 'quotes',coalesce((select jsonb_agg(x) from(select jsonb_build_object('id',q.id,'code',q.public_code,'customer',c.name,'service',s.name,'state',q.state) x from public.quote_requests q join public.customers c on c.id=q.customer_id join public.services s on s.id=q.service_id where q.organization_id=p_org and q.state in ('submitted','under_review') and not exists(select 1 from public.appointments a where a.organization_id=p_org and a.request_id=q.id and a.kind='booking' and a.state='confirmed') order by q.created_at limit 20)r),'[]'::jsonb),
 'notifications',coalesce((select jsonb_agg(to_jsonb(n)) from(select n.*,exists(select 1 from public.notification_reads r where r.notification_id=n.id and r.user_id=auth.uid()) as read from public.notifications n where n.organization_id=p_org order by n.created_at desc limit 20)n),'[]'::jsonb));
end;$$;
create function public.operations_read_notification(p_org uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform private.company_lock(p_org);
 if not exists(select 1 from public.notifications where organization_id=p_org and id=p_id) then raise exception 'access_denied' using errcode='42501';end if;
 insert into public.notification_reads(organization_id,notification_id,user_id) values(p_org,p_id,auth.uid()) on conflict do nothing;
end;$$;
-- Completion is an operational event; never an inferred financial receipt.
alter function public.analytics_company(uuid,date,date,uuid,text) rename to analytics_company_before_operations;
revoke all on function public.analytics_company_before_operations(uuid,date,date,uuid,text) from public,anon,authenticated;
create function public.analytics_company(p_org uuid,p_from date,p_to date,p_service uuid default null,p_source text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;b jsonb;count_ bigint;
begin
 if not private.is_org_admin(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 r=public.analytics_company_before_operations(p_org,p_from,p_to,p_service,p_source);b=r->'period';
 select count(*) into count_ from public.appointment_events e join public.appointments a on a.id=e.appointment_id join public.quote_requests q on q.id=a.request_id left join public.opportunity_context oc on oc.opportunity_id=q.opportunity_id
 where e.organization_id=p_org and e.event='completed' and e.created_at>=(b->>'from')::timestamptz and e.created_at<(b->>'until')::timestamptz and(p_service is null or q.service_id=p_service) and(p_source is null or coalesce(oc.source,'unknown')=p_source);
 return r||jsonb_build_object('execution',jsonb_build_object('completed',count_,'basis','completion_events_in_period','revenue_cents',null));
end;$$;
do $$declare r record;begin for r in select p.oid::regprocedure signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname like 'operations_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',r.signature);if r.nspname='public' then execute format('grant execute on function %s to authenticated',r.signature);end if;
 end loop;end;$$;
revoke all on function public.analytics_company(uuid,date,date,uuid,text) from public,anon,authenticated;
grant execute on function public.analytics_company(uuid,date,date,uuid,text) to authenticated;
-- Explicit organization binding even when the same manager belongs to multiple companies.
create function public.operations_quote_context(p_org uuid,p_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if not private.is_org_admin(p_org) or not exists(select 1 from public.quote_requests where organization_id=p_org and public_code=p_code) then raise exception 'access_denied' using errcode='42501';end if;return public.consumer_request_context(p_code);end;$$;
create function public.operations_send_quote(p_org uuid,p_code text,p_items jsonb,p_duration integer,p_expires timestamptz,p_expected_revision integer,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.company_lock(p_org);if not exists(select 1 from public.quote_requests where organization_id=p_org and public_code=p_code) then raise exception 'access_denied' using errcode='42501';end if;return public.consumer_send_quote(p_code,p_items,p_duration,p_expires,p_expected_revision,p_key);end;$$;
revoke all on function public.operations_quote_context(uuid,text),public.operations_send_quote(uuid,text,jsonb,integer,timestamptz,integer,uuid) from public,anon,authenticated;
grant execute on function public.operations_quote_context(uuid,text),public.operations_send_quote(uuid,text,jsonb,integer,timestamptz,integer,uuid) to authenticated;
alter table public.request_events drop constraint request_events_event_check;
alter table public.request_events add constraint request_events_event_check check(event in ('created','submitted','under_review','quote_sent','approved','quote_declined','booked','cancelled','rescheduled','contact_revoked','link_revoked','service_started','service_completed'));
commit;

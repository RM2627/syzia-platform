begin;
create function private.central_lock() returns void language plpgsql security definer set search_path='' as $$
begin perform pg_advisory_xact_lock(734921501);if not private.is_active_user() then raise exception 'central_access_denied' using errcode='42501';end if;end;$$;
create function private.central_ticket(p_code text,p_operate boolean default false) returns public.tickets language plpgsql stable security definer set search_path='' as $$
declare t public.tickets;
begin select * into t from public.tickets where public_code=p_code;
 if t.id is null or not private.central_staff(t.organization_id) then raise exception 'central_access_denied' using errcode='42501';end if;
 if p_operate and not private.company_can_manage(t.organization_id) and t.assignee_id is distinct from auth.uid() then raise exception 'central_owner_required' using errcode='42501';end if;return t;end;$$;
create function private.central_event(p_ticket uuid,p_event text,p_from uuid default null,p_to uuid default null) returns void language sql security definer set search_path='' as $$
 insert into public.ticket_events(organization_id,ticket_id,actor_id,event,from_assignee,to_assignee,state) select organization_id,id,auth.uid(),p_event,p_from,p_to,state from public.tickets where id=p_ticket;
$$;
create function private.central_customer(p_request uuid,p_manage boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select private.consumer_access(p_request,p_manage) and exists(select 1 from public.quote_requests q join public.customers c on c.id=q.customer_id where q.id=p_request and(c.user_id=auth.uid() or exists(select 1 from public.customer_access a where a.request_id=q.id and a.user_id=auth.uid())));
$$;
create function private.central_open(p_request uuid) returns public.tickets language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;t public.tickets;previous uuid;
begin select * into q from public.quote_requests where id=p_request;
 if q.id is null or q.state='draft' or not exists(select 1 from public.organizations o join public.company_settings s on s.organization_id=o.id where o.id=q.organization_id and o.status='active' and s.human_enabled) then raise exception 'central_unavailable' using errcode='42501';end if;
 select * into t from public.tickets where request_id=q.id and state<>'closed';if found then return t;end if;
 select id into previous from public.tickets where request_id=q.id order by created_at desc limit 1;
 insert into public.tickets(organization_id,request_id,customer_id,previous_ticket_id,last_customer_at) values(q.organization_id,q.id,q.customer_id,previous,now()) returning * into t;perform private.central_event(t.id,'created');return t;end;$$;
create function private.central_on_submit() returns trigger language plpgsql security definer set search_path='' as $$
begin if old.state='draft' and new.state='submitted' and exists(select 1 from public.company_settings where organization_id=new.organization_id and human_enabled) then perform private.central_open(new.id);end if;return new;end;$$;
create trigger central_intake after update of state on public.quote_requests for each row execute function private.central_on_submit();
create function public.central_open_request(p_request text) returns text language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;t public.tickets;
begin perform private.central_lock();select * into q from public.quote_requests where public_code=p_request;
 if q.id is null or not private.central_staff(q.organization_id) then raise exception 'central_access_denied' using errcode='42501';end if;t=private.central_open(q.id);return t.public_code;end;$$;
create function public.central_settings_save(p_org uuid,p_revision integer,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.central_settings;
begin perform private.company_lock(p_org);perform private.company_keys(p_data,array['response_minutes','attention_minutes','quick_reply_edit','share_customer_context']);
 insert into public.central_settings(organization_id) values(p_org) on conflict do nothing;select * into r from public.central_settings where organization_id=p_org;
 if p_revision is distinct from r.revision then raise exception 'central_revision_conflict' using errcode='40001';end if;
 select * into r from jsonb_populate_record(r,p_data);update public.central_settings set response_minutes=r.response_minutes,attention_minutes=r.attention_minutes,quick_reply_edit=r.quick_reply_edit,share_customer_context=r.share_customer_context,revision=revision+1 where organization_id=p_org;end;$$;
create function public.central_presence(p_state text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.work_sessions;
begin perform private.central_lock();if not private.has_global_role('atendente') then raise exception 'attendant_role_required' using errcode='42501';end if;
 if p_state is null or p_state not in ('available','busy','pause','offline') then raise exception 'invalid_presence' using errcode='22023';end if;
 select * into s from public.work_sessions where user_id=auth.uid() and ended_at is null;
 if p_state='offline' then update public.work_sessions set presence='offline',ended_at=clock_timestamp() where id=s.id;return jsonb_build_object('presence','offline');end if;
 if s.id is null then insert into public.work_sessions(user_id,presence) values(auth.uid(),p_state) returning * into s;else update public.work_sessions set presence=p_state where id=s.id returning * into s;end if;return jsonb_build_object('presence',s.presence,'started_at',s.started_at);end;$$;
create function public.central_act(p_code text,p_revision integer,p_action text,p_data jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tickets;target uuid;prior jsonb;payload jsonb;r jsonb;ev text;name text;mid uuid;snap jsonb;reply jsonb;body text;esc public.ticket_escalations;v_state text;
begin perform private.central_lock();t=private.central_ticket(p_code,p_action<>'claim');payload=jsonb_build_array(p_code,p_revision,p_action,p_data);prior=private.consumer_idem(t.organization_id,'central_act',p_key,payload);if prior is not null then return prior;end if;
 if p_revision is distinct from t.revision then raise exception 'central_revision_conflict' using errcode='40001';end if;
 if t.state='closed' then raise exception 'central_closed' using errcode='22023';end if;
 select coalesce(nullif(display_name,''),'Atendimento') into name from public.profiles where id=auth.uid();
 case p_action
 when 'claim' then
  perform private.company_keys(p_data,array[]::text[]);
  if not private.central_eligible(t.organization_id,auth.uid()) or not exists(select 1 from public.work_sessions where user_id=auth.uid() and ended_at is null and presence in ('available','busy')) then raise exception 'central_presence_required' using errcode='42501';end if;
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
end;$$;
create function public.central_consumer_thread(p_request text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q public.quote_requests;t public.tickets;
begin select * into q from public.quote_requests where public_code=p_request;
 if q.id is null or not private.central_customer(q.id) then raise exception 'request_access_denied' using errcode='42501';end if;
 select * into t from public.tickets where request_id=q.id order by created_at desc,id desc limit 1;
 return jsonb_build_object('available',exists(select 1 from public.company_settings where organization_id=q.organization_id and human_enabled),'code',t.public_code,'state',t.state,'can_send',private.central_customer(q.id,true),
 'messages',coalesce((select jsonb_agg(jsonb_build_object('kind',m.kind,'name',m.author_name,'body',m.body,'at',m.created_at) order by m.created_at,m.id) from public.ticket_messages m where m.ticket_id=t.id),'[]'::jsonb));end;$$;
create function public.central_consumer_send(p_request text,p_body text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;t public.tickets;prior jsonb;payload jsonb;r jsonb;name text;
begin perform private.consumer_lock();select * into q from public.quote_requests where public_code=p_request;
 if q.id is null or not private.central_customer(q.id,true) then raise exception 'request_access_denied' using errcode='42501';end if;
 payload=jsonb_build_array(p_request,p_body);prior=private.consumer_idem(q.organization_id,'central_consumer_message',p_key,payload);if prior is not null then return prior;end if;
 t=private.central_open(q.id);
 if (select count(*) from public.ticket_messages where author_id=auth.uid() and created_at>now()-interval '1 minute')>=10 then raise exception 'central_message_limit' using errcode='22023';end if;
 if t.state='resolved' and t.resolved_at<now()-interval '7 days' then update public.tickets set state='closed',resolved_at=null,closed_at=clock_timestamp(),revision=revision+1 where id=t.id;perform private.central_event(t.id,'closed');t=private.central_open(q.id);end if;
 if t.state='resolved' then perform private.central_event(t.id,'reopened');end if;
 select c.name into name from public.customers c where c.id=q.customer_id;
 insert into public.ticket_messages(organization_id,ticket_id,author_id,author_name,kind,body) values(q.organization_id,t.id,auth.uid(),name,'customer',p_body);
 update public.tickets set state=case when state='waiting_company' then state when private.central_eligible(organization_id,assignee_id) then 'active' else 'queued' end,assignee_id=case when private.central_eligible(organization_id,assignee_id) then assignee_id else null end,resolved_at=null,last_customer_at=clock_timestamp(),waiting_since=case when state in ('waiting_customer','resolved') then clock_timestamp() else waiting_since end,next_action=case when state='waiting_company' then 'company' else 'reply' end,revision=revision+1 where id=t.id;
 perform private.central_event(t.id,'message');r=jsonb_build_object('code',t.public_code);perform private.consumer_remember(q.organization_id,'central_consumer_message',p_key,payload,r);return r;end;$$;
-- Explicit and deterministic priority; never uses AI or grants permission from presence.
create function public.central_queue(p_org uuid default null,p_search text default '',p_state text default null,p_mine boolean default false,p_offset integer default 0,p_view text default 'all',p_date date default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin if not private.is_active_user() then raise exception 'central_access_denied' using errcode='42501';end if;
 if coalesce(p_view,'all') not in ('all','general','company','resolved') then raise exception 'invalid_view' using errcode='22023';end if;
 if length(coalesce(p_search,''))>120 then raise exception 'invalid_search' using errcode='22023';end if;
 result=jsonb_build_object('me',auth.uid(),'name',(select display_name from public.profiles where id=auth.uid()),'presence',coalesce((select presence from public.work_sessions where user_id=auth.uid() and ended_at is null),'offline'),
 'organizations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.organizations where private.central_staff(id)),'[]'::jsonb),
 'tickets',coalesce((select jsonb_agg(x order by case x->>'sla' when 'overdue' then 2 when 'attention' then 1 else 0 end desc,(x->>'priority')::integer desc,x->>'waiting_since',x->>'code') from (
 select jsonb_build_object('code',t.public_code,'organization_id',t.organization_id,'company',o.name,'customer',c.name,'service',coalesce((select item->>'name' from public.consumer_publications pub cross join lateral jsonb_array_elements(pub.payload->'services') item where pub.id=q.publication_id and item->>'code'=q.service_code),'Serviço'),'source',coalesce(oc.source,'direct'),'request',q.public_code,'request_state',q.state,'state',t.state,'revision',t.revision,'assignee',t.assignee_id,'assignee_name',pr.display_name,'owner_valid',private.central_eligible(t.organization_id,t.assignee_id),'priority',t.priority,'next_action',t.next_action,'due_at',t.next_due_at,'waiting_since',t.waiting_since,'last_customer_at',t.last_customer_at,'last_staff_at',t.last_staff_at,'created_at',t.created_at,'resolved_at',t.resolved_at,
 'sla',case when t.state in ('resolved','closed','waiting_customer') then 'normal' when t.next_due_at<=now() or(t.state in ('queued','active') and now()>t.waiting_since+make_interval(mins=>s.response_minutes)) then 'overdue' when t.state in ('queued','active') and now()>t.waiting_since+make_interval(mins=>s.attention_minutes) then 'attention' else 'normal' end,
 'appointment',(select min(starts_at) from public.appointments where request_id=t.request_id and state='confirmed' and starts_at>=now()),'appointment_today',exists(select 1 from public.appointments a where a.request_id=t.request_id and a.state='confirmed' and (a.starts_at at time zone o.timezone)::date=(now() at time zone o.timezone)::date)) x
 from public.tickets t join public.organizations o on o.id=t.organization_id join public.customers c on c.id=t.customer_id join public.quote_requests q on q.id=t.request_id join public.services sv on sv.id=q.service_id left join public.profiles pr on pr.id=t.assignee_id left join public.central_settings s on s.organization_id=o.id left join public.opportunity_context oc on oc.opportunity_id=q.opportunity_id
 where private.central_staff(t.organization_id) and(p_org is null or t.organization_id=p_org) and(p_state is null or t.state=p_state) and(p_date is null or (t.created_at at time zone o.timezone)::date=p_date) and(coalesce(p_view,'all')='all' or (p_view='general' and t.state not in ('resolved','closed') and (t.assignee_id is null or not private.central_eligible(t.organization_id,t.assignee_id))) or (p_view='company' and t.state='waiting_company') or (p_view='resolved' and t.state='resolved' and t.resolved_at>now()-interval '7 days')) and(not coalesce(p_mine,false) or t.assignee_id=auth.uid()) and (p_search is null or p_search='' or concat_ws(' ',c.name,o.name,t.public_code,(select item->>'name' from public.consumer_publications pub cross join lateral jsonb_array_elements(pub.payload->'services') item where pub.id=q.publication_id and item->>'code'=q.service_code),oc.source,pr.display_name) ilike '%'||p_search||'%') and(t.state<>'closed' or t.closed_at>now()-interval '7 days') order by case when t.state in ('resolved','closed','waiting_customer') then 0 when t.next_due_at<=now() or(t.state in ('queued','active') and now()>t.waiting_since+make_interval(mins=>s.response_minutes)) then 2 when t.state in ('queued','active') and now()>t.waiting_since+make_interval(mins=>s.attention_minutes) then 1 else 0 end desc,t.priority desc,t.waiting_since,t.id limit 101 offset greatest(coalesce(p_offset,0),0)) items),'[]'::jsonb));
 result=result||jsonb_build_object('has_more',jsonb_array_length(result->'tickets')>100,'offset',greatest(coalesce(p_offset,0),0));
 return jsonb_set(result,'{tickets}',coalesce((select jsonb_agg(value) from jsonb_array_elements(result->'tickets') with ordinality where ordinality<=100),'[]'::jsonb));end;$$;
-- Private helpers are never arbitrary public entry points.
do $$ declare r record;begin for r in select p.oid::regprocedure signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname like 'central_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',r.signature);if r.nspname='public' then execute format('grant execute on function %s to authenticated',r.signature);end if;end loop;end;$$;
grant execute on function private.central_staff(uuid) to authenticated;
commit;

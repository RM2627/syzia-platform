begin;
-- Incremental hotfix over 049. No backfill of service models into old appointments.
create table private.service_checklist_models (
 service_id uuid primary key, organization_id uuid not null,
 revision integer not null default 0 check(revision>=0),
 foreign key(organization_id,service_id) references public.services(organization_id,id)
);
create table private.service_checklist_items (
 id uuid primary key default extensions.gen_random_uuid(), service_id uuid not null references private.service_checklist_models(service_id),
 title text not null check(length(btrim(title)) between 1 and 200),
 position integer not null check(position between 0 and 99), removed boolean not null default false
);
create table private.service_checklist_history (
 id uuid primary key default extensions.gen_random_uuid(), organization_id uuid not null,
 service_id uuid not null references private.service_checklist_models(service_id), actor_id uuid not null references auth.users(id),
 previous jsonb not null, current_value jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create table private.execution_checklist_snapshots (
 appointment_id uuid primary key references public.appointments(id), organization_id uuid not null references public.organizations(id),
 origin text not null check(origin in('legacy','booking')), created_at timestamptz not null default clock_timestamp()
);
alter table private.execution_checklist add column service_id uuid references public.services(id),
 add column service_name text, add column service_position integer,
 add column template_item_id uuid references private.service_checklist_items(id),
 add column template_revision integer, add column template_position integer;
create unique index execution_checklist_template_once on private.execution_checklist(appointment_id,template_item_id) where template_item_id is not null;
insert into private.execution_checklist_snapshots(appointment_id,organization_id,origin) select id,organization_id,'legacy' from public.appointments;
do $$declare t text;begin foreach t in array array['service_checklist_models','service_checklist_items','service_checklist_history','execution_checklist_snapshots'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
end loop;end;$$;

create function public.company_service_checklist(p_org uuid,p_service uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.permission_require(p_org,'services.read');
 if not exists(select 1 from public.services where id=p_service and organization_id=p_org)then raise exception 'service_unavailable'using errcode='42501';end if;
 return jsonb_build_object('revision',coalesce((select revision from private.service_checklist_models where service_id=p_service),0),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title)order by position,id)from private.service_checklist_items where service_id=p_service and not removed),'[]'::jsonb));
end;$$;
create function public.company_service_save_with_checklist(p_org uuid,p_id uuid,p_expected_revision integer,p_data jsonb,p_checklist_revision integer,p_items jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare depth_ int; sid uuid; m private.service_checklist_models; before_ jsonb; after_ jsonb; i jsonb; n int=0; ids uuid[]='{}'; item_id uuid; prior jsonb; payload jsonb; result_ jsonb;
begin
 depth_=private.permission_enter(p_org,'services.manage');
 perform private.presence_lock(p_org,'services.manage');
 payload=jsonb_build_array(p_id,p_expected_revision,p_data,p_checklist_revision,p_items);
 prior=private.consumer_idem(p_org,'service_checklist_save',p_key,payload);
 if prior is not null then perform private.permission_leave(depth_);return prior;end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>100 then raise exception 'checklist_model_invalid'using errcode='22023';end if;
 sid=public.company_save(p_org,'service',p_id,p_expected_revision,p_data);
 insert into private.service_checklist_models(service_id,organization_id)values(sid,p_org)on conflict do nothing;
 select *into m from private.service_checklist_models where service_id=sid and organization_id=p_org for update;
 if m.revision is distinct from p_checklist_revision then raise exception 'checklist_revision_conflict'using errcode='40001';end if;
 before_=public.company_service_checklist(p_org,sid);
 for i in select value from jsonb_array_elements(p_items)loop
  perform private.company_keys(i,array['id','title']);
  if jsonb_typeof(i->'title')is distinct from 'string' or length(btrim(i->>'title'))not between 1 and 200 then raise exception 'checklist_title_invalid'using errcode='22023';end if;
  if i->>'id' is null then
   insert into private.service_checklist_items(service_id,title,position)values(sid,btrim(i->>'title'),n)returning id into item_id;
  else
   item_id=(i->>'id')::uuid;
   if item_id=any(ids)then raise exception 'checklist_item_invalid'using errcode='22023';end if;
   update private.service_checklist_items set title=btrim(i->>'title'),position=n where id=item_id and service_id=sid and not removed;
   if not found then raise exception 'checklist_item_unavailable'using errcode='42501';end if;
  end if;
  ids=array_append(ids,item_id);n=n+1;
 end loop;
 update private.service_checklist_items set removed=true where service_id=sid and not(id=any(ids))and not removed;
 update private.service_checklist_models set revision=revision+1 where service_id=sid;
 after_=public.company_service_checklist(p_org,sid);
 insert into private.service_checklist_history(organization_id,service_id,actor_id,previous,current_value)values(p_org,sid,auth.uid(),before_,after_);
 result_=jsonb_build_object('id',sid,'checklist',after_);
 perform private.consumer_remember(p_org,'service_checklist_save',p_key,payload,result_);
 perform private.permission_leave(depth_);return result_;
end;$$;

-- Use accepted quote source metadata, not names, to resolve the purchased services.
-- Older quote versions without source metadata retain the original selected services.
create function private.checklist_request_services(p_request uuid)returns table(service_id uuid,service_name text,group_position integer)language sql stable security definer set search_path=''as $$
 with request_ as(select *from public.quote_requests where id=p_request),
 selected as(select s.id,s.name,coalesce(x.n,1)::integer pos,x.item
 from request_ q join public.services s on s.organization_id=q.organization_id
 left join lateral jsonb_array_elements(coalesce(q.requested_items,'[]'))with ordinality x(item,n) on x.item->>'service'=private.consumer_code('s',s.id)
 where x.item is not null or(jsonb_array_length(coalesce(q.requested_items,'[]'))=0 and s.id=q.service_id)),
 final_items as(select i.*from request_ q join public.quote_items i on i.version_id=q.accepted_version_id and i.organization_id=q.organization_id),
 sources as(
 select s.id,s.name,s.pos from selected s where
 not exists(select 1 from final_items where source_kind is not null)
 or exists(select 1 from final_items f where f.source_kind='original'and
 (f.source_code=coalesce(s.item->'priced_items'->0->>'position','0')))
 union
 select s.id,s.name,1000+min(f.position)from final_items f join request_ q on true join public.services s on s.organization_id=q.organization_id and private.consumer_code('s',s.id)=f.source_code where f.source_kind='service'group by s.id,s.name)
 select id,min(name),min(pos)from sources group by id order by min(pos),id;
$$;
create function private.instantiate_service_checklists()returns trigger language plpgsql security definer set search_path=''as $$
declare s record; m private.service_checklist_models; item_ private.service_checklist_items; c private.execution_checklist;
begin
 if new.kind<>'booking'or new.request_id is null then return new;end if;
 -- Same advisory lock/order as the existing booking and catalog commands.
 perform pg_advisory_xact_lock(734921501);
 insert into private.execution_checklist_snapshots(appointment_id,organization_id,origin)values(new.id,new.organization_id,'booking')on conflict do nothing;
 if not found then return new;end if;
 for s in select *from private.checklist_request_services(new.request_id)loop
  select *into m from private.service_checklist_models where service_id=s.service_id and organization_id=new.organization_id for share;
  if m.service_id is null then continue;end if;
  for item_ in select *from private.service_checklist_items where service_id=s.service_id and not removed order by position,id loop
   insert into private.execution_checklist(organization_id,appointment_id,title,created_by,updated_by,service_id,service_name,service_position,template_item_id,template_revision,template_position)
   values(new.organization_id,new.id,item_.title,auth.uid(),auth.uid(),s.service_id,s.service_name,s.group_position,item_.id,m.revision,item_.position)returning *into c;
   insert into private.execution_checklist_history(item_id,organization_id,actor_id,action,current_value)values(c.id,new.organization_id,auth.uid(),'instantiate',to_jsonb(c));
  end loop;
 end loop;
 return new;
end;$$;
create trigger instantiate_service_checklists after insert on public.appointments for each row execute function private.instantiate_service_checklists();
create or replace function public.operations_checklist(p_org uuid,p_appointment uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare d jsonb;begin
 d=public.operations_detail(p_org,p_appointment);
 return jsonb_build_object('can_edit',private.permission_allowed(p_org,'agenda.manage')and private.permission_role(p_org,auth.uid())<>'shared_attendant','items',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('updated_name',p.display_name)order by c.service_position nulls last,c.template_position nulls last,c.created_at,c.id)from private.execution_checklist c join public.profiles p on p.id=c.updated_by where c.appointment_id=p_appointment and c.organization_id=p_org and not c.removed),'[]'::jsonb));
end;$$;

create or replace function public.central_unread(p_org uuid default null)returns jsonb language plpgsql stable security definer set search_path=''as $$
begin
 if not private.is_active_user()then raise exception 'central_access_denied'using errcode='42501';end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(x)from(select t.public_code code,t.organization_id,private.ticket_unread(t.id) unread_count,
 nullif(btrim(c.name),'')customer,
 coalesce((select string_agg(i->>'name',', 'order by n)from jsonb_array_elements(coalesce(q.requested_items,'[]'))with ordinality a(i,n)),s.name)service
 from public.tickets t join public.quote_requests q on q.id=t.request_id and q.organization_id=t.organization_id
 left join public.customers c on c.id=q.customer_id and c.organization_id=t.organization_id
 left join public.services s on s.id=q.service_id and s.organization_id=t.organization_id
 where(p_org is null or t.organization_id=p_org)and private.central_staff(t.organization_id)and private.journey_ticket_visible(t.id)and private.ticket_unread(t.id)>0)x),'[]'::jsonb));
end;$$;

alter table public.request_events drop constraint request_events_event_check;
alter table public.request_events add constraint request_events_event_check check(event in('created','submitted','under_review','quote_sent','approved','quote_declined','booked','cancelled','rescheduled','contact_revoked','link_revoked','service_started','service_completed','tracking_link_reissued'));

-- Reissue uses the existing strong request tokens. No session secret or PDF URL is exposed.
-- A manage token carries consumer powers: restrict reissue to an authorized company administrator.
-- Quote/staff grants alone must not become an indirect escalation through a consumer session.
create function private.operations_tracking_allowed(p_org uuid)returns boolean language sql stable security definer set search_path=''as $$
 select private.permission_manager(p_org)and private.journey_can_price(p_org);
$$;
create or replace function public.operations_request_contact(p_org uuid,p_code text)returns jsonb language plpgsql security definer set search_path=''as $$
declare ctx jsonb;q public.quote_requests;phone_ text;name_ text;begin
 ctx=public.operations_quote_context(p_org,p_code);
 select *into q from public.quote_requests where organization_id=p_org and public_code=p_code;
 if coalesce((ctx->>'contact_authorized')::boolean,false)and public.company_attendant_permission(p_org,'whatsapp')then select whatsapp,name into phone_,name_ from public.customers where id=q.customer_id and organization_id=p_org;end if;
 return jsonb_build_object('phone',phone_,'name',name_,'company',ctx->'company'->>'name','can_share_tracking',private.operations_tracking_allowed(p_org));
end;$$;
create function public.operations_tracking_link(p_org uuid,p_code text,p_action text)returns jsonb language plpgsql security definer set search_path=''as $$
declare q public.quote_requests;secret_ text;expiry_ timestamptz=now()+interval '7 days';ctx jsonb;begin
 perform private.central_lock();ctx=public.operations_quote_context(p_org,p_code);
 if not private.operations_tracking_allowed(p_org)then raise exception 'request_access_denied'using errcode='42501';end if;
 select *into q from public.quote_requests where organization_id=p_org and public_code=p_code;
 if q.id is null or p_action is null or p_action not in('issue','revoke')then raise exception 'request_access_denied'using errcode='42501';end if;
 update public.request_access_tokens set revoked_at=clock_timestamp()where request_id=q.id and organization_id=p_org and revoked_at is null;
 if p_action='revoke'then perform private.consumer_event(p_org,q.id,'link_revoked');return jsonb_build_object('revoked',true);end if;
 secret_=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.request_access_tokens(organization_id,request_id,token_hash,scope,expires_at,created_by)values(p_org,q.id,encode(extensions.digest(secret_,'sha256'),'hex'),'manage',expiry_,auth.uid());
 perform private.consumer_event(p_org,q.id,'tracking_link_reissued');
 return jsonb_build_object('code',q.public_code,'secret',secret_,'expires_at',expiry_,'scope','manage');
end;$$;
revoke all on function private.checklist_request_services(uuid),private.instantiate_service_checklists(),private.operations_tracking_allowed(uuid)from public,anon,authenticated,service_role;
revoke all on function public.company_service_checklist(uuid,uuid),public.company_service_save_with_checklist(uuid,uuid,integer,jsonb,integer,jsonb,uuid),public.operations_tracking_link(uuid,text,text)from public,anon;
grant execute on function public.company_service_checklist(uuid,uuid),public.company_service_save_with_checklist(uuid,uuid,integer,jsonb,integer,jsonb,uuid),public.operations_tracking_link(uuid,text,text)to authenticated;

-- Preserve the 049 command; the 100-item limit now applies to manual extras.
create or replace function public.operations_checklist_save(p_org uuid,p_appointment uuid,p_id uuid,p_revision integer,p_action text,p_title text,p_done boolean,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare d jsonb;c private.execution_checklist;old_ jsonb;r jsonb;prior jsonb;payload jsonb;
begin
 d=public.operations_checklist(p_org,p_appointment);
 if not coalesce((d->>'can_edit')::boolean,false)then raise exception 'access_denied'using errcode='42501';end if;
 perform 1 from public.appointments where id=p_appointment and organization_id=p_org for update;
 if not exists(select 1 from public.appointments where id=p_appointment and kind='booking'and state='confirmed'and execution_state<>'completed')then raise exception 'checklist_read_only'using errcode='22023';end if;
 payload=jsonb_build_array(p_appointment,p_id,p_revision,p_action,p_title,p_done);prior=private.consumer_idem(p_org,'execution_checklist',p_key,payload);if prior is not null then return prior;end if;
 if p_action='add'then
  if(select count(*)from private.execution_checklist where appointment_id=p_appointment and template_item_id is null and not removed)>=100 then raise exception 'checklist_limit'using errcode='22023';end if;
  insert into private.execution_checklist(organization_id,appointment_id,title,created_by,updated_by)values(p_org,p_appointment,btrim(p_title),auth.uid(),auth.uid())returning *into c;
 elsif p_action in('edit','toggle','remove')then
  select *into c from private.execution_checklist where id=p_id and organization_id=p_org and appointment_id=p_appointment for update;
  if c.id is null or c.removed then raise exception 'checklist_item_unavailable'using errcode='22023';end if;
  if c.revision is distinct from p_revision then raise exception 'checklist_revision_conflict'using errcode='40001';end if;
  old_=to_jsonb(c);
  update private.execution_checklist set title=case when p_action='edit'then btrim(p_title)else title end,done=case when p_action='toggle'then p_done else done end,removed=p_action='remove',revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp()where id=c.id returning *into c;
 else raise exception 'checklist_action_invalid'using errcode='22023';end if;
 insert into private.execution_checklist_history(item_id,organization_id,actor_id,action,previous,current_value)values(c.id,p_org,auth.uid(),p_action,old_,to_jsonb(c));
 r=to_jsonb(c);perform private.consumer_remember(p_org,'execution_checklist',p_key,payload,r);return r;
end;$$;
commit;

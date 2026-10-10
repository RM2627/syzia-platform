begin;
-- Shared private engines: same validations, snapshots, idempotency and booking exclusion as Phase 4.
create function private.central_request_context_core(p_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q public.quote_requests;c public.customers;
begin select * into q from public.quote_requests where public_code=p_code;select * into c from public.customers where id=q.customer_id and organization_id=q.organization_id;
 return jsonb_build_object('code',q.public_code,'state',q.state,'revision',q.revision,'name',c.name,'notes',q.notes,'can_manage',private.consumer_access(q.id,true),'is_owner',c.user_id=auth.uid(),'company',(select jsonb_build_object('name',name,'slug',slug) from public.organizations where id=q.organization_id),'current_version',(select public_code from public.quote_versions where id=q.current_version_id),'accepted_version',(select public_code from public.quote_versions where id=q.accepted_version_id),
 'answers',coalesce((select jsonb_agg(jsonb_build_object('label',f->>'label','answer',q.answers->(f->>'code'))) from public.consumer_publications cp cross join lateral jsonb_array_elements(cp.payload->'services') sv cross join lateral jsonb_array_elements(sv->'questions') f where cp.id=q.publication_id and sv->>'code'=q.service_code),'[]'::jsonb),
 'versions',coalesce((select jsonb_agg(jsonb_build_object('code',v.public_code,'version',v.version,'kind',v.kind,'price_mode',v.price_mode,'total_cents',v.total_cents,'duration_minutes',v.duration_minutes,'expires_at',v.expires_at,'created_at',v.created_at,'items',(select jsonb_agg(jsonb_build_object('name',i.name,'quantity',i.quantity,'unit_cents',i.unit_cents,'price_mode',i.price_mode) order by i.position) from public.quote_items i where i.version_id=v.id)) order by v.version desc) from public.quote_versions v where v.request_id=q.id and v.state='sent'),'[]'::jsonb),
 'appointments',coalesce((select jsonb_agg(jsonb_build_object('code',a.public_code,'starts_at',a.starts_at,'ends_at',a.ends_at,'state',a.state) order by a.created_at desc) from public.appointments a where a.request_id=q.id),'[]'::jsonb),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('code',a.public_code,'mime',a.mime,'size_bytes',a.size_bytes,'state',a.state) order by a.created_at) from public.attachments a where a.request_id=q.id and (a.state='ready' or(a.state='pending' and a.expires_at>now()))),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('event',event,'at',created_at) order by created_at,id) from public.request_events where request_id=q.id),'[]'::jsonb),
 'contact_authorized',exists(select 1 from public.customer_consents where customer_id=c.id and purpose='request_contact' and revoked_at is null));
end;$$;
create or replace function public.consumer_request_context(p_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q public.quote_requests;
begin perform private.consumer_request(p_code);return private.central_request_context_core(p_code);end;$$;
create function private.central_send_quote_core(p_code text,p_items jsonb,p_duration integer,p_expires timestamptz,p_expected_revision integer,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;v public.quote_versions;i jsonb;pos integer=0;total bigint=0;payload jsonb;prior jsonb;r jsonb;
begin select * into q from public.quote_requests where public_code=p_code;
 payload=jsonb_build_array(p_code,p_items,p_duration,p_expires,p_expected_revision);prior=private.consumer_idem(q.organization_id,'send_quote',p_key,payload);if prior is not null then return prior;end if;
 if q.revision<>p_expected_revision then raise exception 'request_revision_conflict' using errcode='40001';end if;
 if q.state not in ('submitted','under_review','quoted','declined') or p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 30 or p_duration is null or p_expires is null or p_expires<=now() or p_expires>now()+interval '30 days' then raise exception 'invalid_final_quote' using errcode='22023';end if;
 perform private.consumer_selection(q.publication_id,q.service_code,q.addon_codes,q.answers);
 for i in select x from jsonb_array_elements(p_items)x loop
  perform private.company_keys(i,array['name','quantity','unit_cents']);
  if jsonb_typeof(i->'unit_cents') is distinct from 'number' or jsonb_typeof(i->'quantity') is distinct from 'number' or (i->>'unit_cents')::numeric<>trunc((i->>'unit_cents')::numeric) or (i->>'quantity')::numeric<>trunc((i->>'quantity')::numeric) then raise exception 'invalid_quote_item' using errcode='22023';end if;
  total=total+(i->>'unit_cents')::bigint*(i->>'quantity')::integer;
 end loop;
 insert into public.quote_versions(organization_id,request_id,version,kind,price_mode,total_cents,duration_minutes,expires_at,created_by) values(q.organization_id,q.id,(select max(version)+1 from public.quote_versions where request_id=q.id),'final','fixed',total,p_duration,p_expires,auth.uid()) returning * into v;
 for i in select x from jsonb_array_elements(p_items)x loop insert into public.quote_items(organization_id,version_id,position,name,quantity,unit_cents,price_mode) values(q.organization_id,v.id,pos,i->>'name',(i->>'quantity')::integer,(i->>'unit_cents')::integer,'fixed');pos=pos+1;end loop;
 update public.quote_versions set state='sent' where id=v.id;update public.quote_requests set current_version_id=v.id,state='quoted',revision=revision+1 where id=q.id;update public.opportunities set stage='quoted' where id=q.opportunity_id;perform private.consumer_event(q.organization_id,q.id,'quote_sent');r=jsonb_build_object('code',v.public_code,'total_cents',total);perform private.consumer_remember(q.organization_id,'send_quote',p_key,payload,r);return r;
end;$$;
create or replace function public.consumer_send_quote(p_code text,p_items jsonb,p_duration integer,p_expires timestamptz,p_expected_revision integer,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);perform private.company_lock(q.organization_id);return private.central_send_quote_core(p_code,p_items,p_duration,p_expires,p_expected_revision,p_key);end;$$;
create function private.central_request_slots_core(p_code text,p_day date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q public.quote_requests;v public.consumer_publications;c jsonb;minutes integer;ignore_id uuid;r jsonb;
begin select * into q from public.quote_requests where public_code=p_code;v=private.consumer_publication((select slug from public.organizations where id=q.organization_id));c=private.consumer_selection(q.publication_id,q.service_code,q.addon_codes,q.answers);
 if q.state not in ('submitted','under_review','quoted','approved') then return '[]'::jsonb;end if;
 if q.accepted_version_id is not null then select duration_minutes into minutes from public.quote_versions where id=q.accepted_version_id;elsif q.state in ('submitted','under_review') and (c->>'direct_booking')::boolean and c->>'price_mode'='fixed' and v.id=q.publication_id then minutes=(c->>'duration_minutes')::integer;else return '[]'::jsonb;end if;
 select id into ignore_id from public.appointments where request_id=q.id and state='confirmed';
 select coalesce(jsonb_agg(x),'[]'::jsonb) into r from generate_series(p_day::timestamp at time zone(v.payload->>'timezone'),(p_day+1)::timestamp at time zone(v.payload->>'timezone')-interval '15 minutes',interval '15 minutes')x where private.consumer_slot_allowed(v.id,x,minutes,ignore_id);return r;
end;$$;
create or replace function public.consumer_request_slots(p_code text,p_day date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q public.quote_requests;
begin perform private.consumer_request(p_code,true);return private.central_request_slots_core(p_code,p_day);end;$$;
create function private.central_book_core(p_code text,p_start timestamptz,p_previous text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;v public.consumer_publications;c jsonb;s public.schedule_resources;a public.appointments;minutes integer;payload jsonb;prior jsonb;r jsonb;
begin select * into q from public.quote_requests where public_code=p_code;payload=jsonb_build_array(p_code,p_start,p_previous);prior=private.consumer_idem(q.organization_id,'book',p_key,payload);if prior is not null then return prior;end if;
 v=private.consumer_publication((select slug from public.organizations where id=q.organization_id));c=private.consumer_selection(q.publication_id,q.service_code,q.addon_codes,q.answers);select * into s from public.schedule_resources where organization_id=q.organization_id;
 if q.state not in ('submitted','under_review','quoted','approved') then raise exception 'request_not_submitted' using errcode='22023';end if;
 if q.accepted_version_id is not null then select duration_minutes into minutes from public.quote_versions where id=q.accepted_version_id;elsif q.state in ('submitted','under_review') and (c->>'direct_booking')::boolean and c->>'price_mode'='fixed' and q.publication_id=v.id then minutes=(c->>'duration_minutes')::integer;else raise exception 'booking_requires_approved_quote' using errcode='22023';end if;
 if p_previous is not null then select * into a from public.appointments where request_id=q.id and public_code=p_previous and state='confirmed';if a.id is null or a.starts_at<now()+make_interval(mins=>s.cancel_minutes) then raise exception 'reschedule_not_allowed' using errcode='22023';end if;end if;
 if not private.consumer_slot_allowed(v.id,p_start,minutes,a.id) then raise exception 'slot_unavailable' using errcode='23P01';end if;
 if a.id is null then insert into public.appointments(organization_id,resource_id,kind,request_id,customer_id,starts_at,ends_at) values(q.organization_id,s.id,'booking',q.id,q.customer_id,p_start,p_start+make_interval(mins=>minutes+s.buffer_minutes)) returning * into a;perform private.consumer_event(q.organization_id,q.id,'booked');
 else update public.appointments set starts_at=p_start,ends_at=p_start+make_interval(mins=>minutes+s.buffer_minutes) where id=a.id returning * into a;perform private.consumer_event(q.organization_id,q.id,'rescheduled');end if;
 update public.opportunities set stage='contracted' where id=q.opportunity_id;r=jsonb_build_object('code',a.public_code,'starts_at',a.starts_at,'ends_at',a.ends_at);perform private.consumer_remember(q.organization_id,'book',p_key,payload,r);return r;
end;$$;
create or replace function public.consumer_book(p_code text,p_start timestamptz,p_previous text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;
begin perform private.consumer_lock();perform private.consumer_request(p_code,true);return private.central_book_core(p_code,p_start,p_previous,p_key);end;$$;
create function private.central_cancel_booking_core(p_code text,p_appointment text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;a public.appointments;s public.schedule_resources;payload jsonb;prior jsonb;r jsonb;
begin select * into q from public.quote_requests where public_code=p_code;payload=jsonb_build_array(p_code,p_appointment);prior=private.consumer_idem(q.organization_id,'cancel_booking',p_key,payload);if prior is not null then return prior;end if;
 select * into a from public.appointments where request_id=q.id and public_code=p_appointment and kind='booking';select * into s from public.schedule_resources where organization_id=q.organization_id;
 if a.id is null or (a.state='confirmed' and a.starts_at<now()+make_interval(mins=>s.cancel_minutes)) then raise exception 'cancel_not_allowed' using errcode='22023';end if;
 if a.state='confirmed' then update public.appointments set state='cancelled' where id=a.id;perform private.consumer_event(q.organization_id,q.id,'cancelled');end if;r=jsonb_build_object('code',p_appointment,'state','cancelled');perform private.consumer_remember(q.organization_id,'cancel_booking',p_key,payload,r);return r;
end;$$;
create or replace function public.consumer_cancel_booking(p_code text,p_appointment text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;
begin perform private.consumer_lock();perform private.consumer_request(p_code,true);return private.central_cancel_booking_core(p_code,p_appointment,p_key);end;$$;
create function public.central_context(p_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.tickets;q public.quote_requests;m public.manual_versions;s public.central_settings;ctx jsonb;
begin t=private.central_ticket(p_code);select * into q from public.quote_requests where id=t.request_id;select v.* into m from public.company_settings cs join public.manual_versions v on v.id=cs.published_manual_id and v.organization_id=cs.organization_id where cs.organization_id=t.organization_id and v.status='published';select * into s from public.central_settings where organization_id=t.organization_id;
 ctx=private.central_request_context_core(q.public_code);
 return jsonb_build_object('ticket',to_jsonb(t),'request',ctx,'me',auth.uid(),'admin',private.company_can_manage(t.organization_id),'operator_name',(select display_name from public.profiles where id=auth.uid()),
 'organization',(select jsonb_build_object('id',id,'name',name,'slug',slug,'timezone',timezone) from public.organizations where id=t.organization_id),
 'customer',jsonb_build_object('name',(select name from public.customers where id=t.customer_id),'whatsapp',case when(ctx->>'contact_authorized')::boolean then (select whatsapp from public.customers where id=t.customer_id) end,'request_count',(select count(*) from public.quote_requests where customer_id=t.customer_id),'previous_requests',coalesce((select jsonb_agg(jsonb_build_object('code',public_code,'state',state,'created_at',created_at)) from(select public_code,state,created_at from public.quote_requests where customer_id=t.customer_id and id<>q.id order by created_at desc limit 5) recent),'[]'::jsonb)),
 'customer_context',case when coalesce(s.share_customer_context,false) or private.company_can_manage(t.organization_id) then(select jsonb_build_object('tags',tags,'preferred_time',preferred_time,'operational_note',operational_note,'origin_context',origin_context) from public.customer_context where customer_id=t.customer_id) else null end,
 'origin',(select jsonb_build_object('source',source,'detail',source_detail) from public.opportunity_context where opportunity_id=q.opportunity_id),
 'manual',jsonb_build_object('id',m.id,'version',m.version,'title',m.title,'snapshot',m.snapshot,'sections',coalesce((select jsonb_agg(jsonb_build_object('key',section_key,'content',content) order by section_key) from public.manual_sections where manual_id=m.id),'[]'::jsonb)),
 'permissions',coalesce((select jsonb_object_agg(action,public.company_attendant_permission(t.organization_id,action)) from unnest(array['price_list','quote_create','quote_send','schedule','reschedule','cancel','whatsapp']) action),'{}'::jsonb),
 'settings',coalesce(to_jsonb(s),jsonb_build_object('revision',1,'quick_reply_edit',false,'share_customer_context',false)),
 'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'kind',a.kind)) from public.attendant_organizations a join public.profiles p on p.id=a.user_id where a.organization_id=t.organization_id and private.central_eligible(t.organization_id,p.id)),'[]'::jsonb),
 'messages',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'name',author_name,'body',body,'at',created_at) order by created_at,id) from public.ticket_messages where ticket_id=t.id),'[]'::jsonb),
 'notes',coalesce((select jsonb_agg(jsonb_build_object('body',n.body,'author',p.display_name,'at',n.created_at) order by n.created_at,n.id) from public.ticket_notes n join public.profiles p on p.id=n.author_id where ticket_id=t.id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('event',e.event,'author',p.display_name,'from',e.from_assignee,'to',e.to_assignee,'state',e.state,'at',e.created_at) order by e.created_at,e.id) from public.ticket_events e left join public.profiles p on p.id=e.actor_id where ticket_id=t.id),'[]'::jsonb),
 'escalations',coalesce((select jsonb_agg(jsonb_build_object('reason',reason,'summary',summary,'question',question,'response',response,'at',created_at,'responded_at',responded_at) order by created_at desc) from public.ticket_escalations where ticket_id=t.id),'[]'::jsonb),
 'financial',jsonb_build_object('operational',false,'label','Preparação: nenhum pagamento processado pela Central','records',coalesce((select jsonb_agg(jsonb_build_object('status',status,'origin',origin,'confirmation_method',confirmation_method,'amount_cents',amount_cents,'confirmed_cents',confirmed_cents)) from public.payments where request_id=q.id),'[]'::jsonb)));
end;$$;
create function public.central_quote(p_code text,p_revision integer,p_discount integer,p_expires timestamptz,p_reason text,p_expected_cents bigint,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tickets;q public.quote_requests;m public.manual_versions;selection jsonb;items jsonb='[]';i jsonb;amount integer;original bigint=0;total bigint=0;r jsonb;prior jsonb;payload jsonb;
begin perform private.central_lock();t=private.central_ticket(p_code,true);
 if not public.company_attendant_permission(t.organization_id,'quote_create') or not public.company_attendant_permission(t.organization_id,'quote_send') or not public.company_attendant_permission(t.organization_id,'price_list') then raise exception 'central_approval_required' using errcode='42501';end if;
 if p_discount is null or p_discount<0 or p_discount>100 or(p_discount>0 and not public.company_attendant_permission(t.organization_id,'discount',p_discount)) then raise exception 'central_discount_denied' using errcode='42501';end if;
 payload=jsonb_build_array(p_code,p_revision,p_discount,p_expires,p_reason,p_expected_cents);prior=private.consumer_idem(t.organization_id,'central_quote',p_key,payload);if prior is not null then return prior;end if;
 if t.revision is distinct from p_revision then raise exception 'central_revision_conflict' using errcode='40001';end if;
 if t.state not in ('active','waiting_internal','waiting_customer') or length(btrim(coalesce(p_reason,''))) not between 2 and 1000 then raise exception 'central_invalid_state' using errcode='22023';end if;
 select * into q from public.quote_requests where id=t.request_id;select v.* into m from public.company_settings s join public.manual_versions v on v.id=s.published_manual_id where s.organization_id=t.organization_id;
 if not exists(select 1 from public.consumer_publications where id=q.publication_id and manual_id=m.id) then raise exception 'central_price_review_required' using errcode='22023';end if;
 if p_discount>coalesce((m.snapshot->'permissions'->>'max_discount_percent')::integer,0) then raise exception 'central_discount_denied' using errcode='42501';end if;
 selection=private.consumer_selection(q.publication_id,q.service_code,q.addon_codes,q.answers);
 if selection->>'price_mode'<>'fixed' then raise exception 'central_price_review_required' using errcode='42501';end if;
 for i in select value from jsonb_array_elements(selection->'items') loop
  original=original+(i->>'unit_cents')::bigint;amount=floor((i->>'unit_cents')::numeric*(100-p_discount)/100)::integer;total=total+amount;
  items=items||jsonb_build_array(jsonb_build_object('name',i->>'name','quantity',1,'unit_cents',amount));end loop;
 if p_expected_cents is not null and p_expected_cents<>total then raise exception 'price_mismatch' using errcode='22023';end if;
 r=private.central_send_quote_core(q.public_code,items,(selection->>'duration_minutes')::integer,p_expires,q.revision,p_key);
 insert into public.central_quote_actions(organization_id,ticket_id,version_id,actor_id,original_cents,final_cents,discount_percent,reason,manual_id) values(t.organization_id,t.id,(select id from public.quote_versions where public_code=r->>'code'),auth.uid(),original,total,p_discount,p_reason,m.id);
 update public.tickets set revision=revision+1,state='waiting_customer',next_action='customer',last_staff_at=clock_timestamp(),waiting_since=clock_timestamp() where id=t.id;perform private.central_event(t.id,'quote');perform private.consumer_remember(t.organization_id,'central_quote',p_key,payload,r);return r;
end;$$;
create function public.central_slots(p_code text,p_day date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.tickets;
begin t=private.central_ticket(p_code);return private.central_request_slots_core((select public_code from public.quote_requests where id=t.request_id),p_day);end;$$;
create function public.central_booking(p_code text,p_revision integer,p_action text,p_start timestamptz,p_appointment text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tickets;code text;r jsonb;prior jsonb;payload jsonb;
begin perform private.central_lock();t=private.central_ticket(p_code,true);
 if p_action is null or p_action not in ('schedule','reschedule','cancel') or not public.company_attendant_permission(t.organization_id,p_action) then raise exception 'central_approval_required' using errcode='42501';end if;
 payload=jsonb_build_array(p_code,p_revision,p_action,p_start,p_appointment);prior=private.consumer_idem(t.organization_id,'central_booking',p_key,payload);if prior is not null then return prior;end if;
 if t.revision is distinct from p_revision then raise exception 'central_revision_conflict' using errcode='40001';end if;
 if t.state in ('closed','resolved','waiting_company') or (p_action='schedule' and p_appointment is not null) or(p_action in ('cancel','reschedule') and p_appointment is null) then raise exception 'central_invalid_state' using errcode='22023';end if;
 select public_code into code from public.quote_requests where id=t.request_id;
 if p_action='cancel' then r=private.central_cancel_booking_core(code,p_appointment,p_key);else r=private.central_book_core(code,p_start,p_appointment,p_key);end if;
 update public.tickets set revision=revision+1,next_action='review',last_staff_at=clock_timestamp() where id=t.id;perform private.central_event(t.id,'booking');perform private.consumer_remember(t.organization_id,'central_booking',p_key,payload,r);return r;end;$$;
create function private.central_attachment_access(p_request uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tickets where request_id=p_request and private.central_staff(organization_id));
$$;
create function public.central_attachment_ticket(p_code text,p_file text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tickets;a public.attachments;secret text;
begin perform private.central_lock();t=private.central_ticket(p_code);select * into a from public.attachments where request_id=t.request_id and public_code=p_file and state='ready';if a.id is null then raise exception 'attachment_access_denied' using errcode='42501';end if;
 secret=encode(extensions.gen_random_bytes(32),'hex');insert into public.attachment_tickets(organization_id,attachment_id,user_id,token_hash,expires_at) values(a.organization_id,a.id,auth.uid(),encode(extensions.digest(secret,'sha256'),'hex'),now()+interval '60 seconds');return jsonb_build_object('ticket',secret,'expires_in',60);end;$$;

create or replace function public.consumer_gateway_attachment(p_code text,p_user uuid,p_write boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attachments;q public.quote_requests;
begin perform pg_advisory_xact_lock(734921501);perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user)::text,true);
 select * into a from public.attachments where public_code=p_code;
 if a.id is null or not (private.consumer_access(a.request_id,p_write) or(not p_write and private.central_attachment_access(a.request_id))) then raise exception 'attachment_access_denied' using errcode='42501';end if;
 select * into q from public.quote_requests where id=a.request_id;
 if p_write and (a.state not in ('pending','ready') or(a.state='pending' and a.expires_at<=now()) or q.state<>'draft' or a.uploaded_by<>p_user) then raise exception 'upload_expired_or_closed' using errcode='22023';end if;
 if not p_write and a.state<>'ready' then raise exception 'attachment_not_ready' using errcode='22023';end if;
 return jsonb_build_object('path',a.object_path,'mime',a.mime,'size',a.size_bytes,'state',a.state);
end;$$;
-- Consumer quote/agenda actions wake the responsible human without commercial automation.
create function private.central_on_request_event() returns trigger language plpgsql security definer set search_path='' as $$
declare t public.tickets;
begin
 if new.event not in ('approved','quote_declined','booked','rescheduled','cancelled') or private.central_staff(new.organization_id) then return new;end if;
 select * into t from public.tickets where request_id=new.request_id and state not in ('closed','resolved');if t.id is null then return new;end if;
 update public.tickets set state=case when state='waiting_company' then state when private.central_eligible(organization_id,assignee_id) then 'active' else 'queued' end,
 assignee_id=case when private.central_eligible(organization_id,assignee_id) then assignee_id else null end,
 next_action=case when state='waiting_company' then 'company' when new.event='approved' then 'schedule' when new.event='quote_declined' then 'reply' else 'review' end,
 last_customer_at=clock_timestamp(),waiting_since=clock_timestamp(),revision=revision+1 where id=t.id;
 perform private.central_event(t.id,case when new.event in ('approved','quote_declined') then 'quote' else 'booking' end);return new;
end;$$;
create trigger central_consumer_activity after insert on public.request_events for each row execute function private.central_on_request_event();
do $$ declare r record;begin for r in select p.oid::regprocedure signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname like 'central_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',r.signature);if r.nspname='public' then execute format('grant execute on function %s to authenticated',r.signature);end if;end loop;end;$$;
grant execute on function private.central_staff(uuid) to authenticated;
commit;

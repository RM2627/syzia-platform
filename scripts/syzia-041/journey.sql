create function public.consumer_journey_slots(p_slug text,p_revision text,p_items jsonb,p_day date)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare v public.consumer_publications;c jsonb;minutes integer;r jsonb;begin
 if not private.consumer_identity()then raise exception 'consumer_session_required'using errcode='42501';end if;
 v=private.consumer_publication(p_slug);if v.public_code is distinct from p_revision then raise exception 'published_price_changed'using errcode='40001';end if;
 if p_day is null then raise exception 'invalid_day'using errcode='22023';end if;
 c=private.consumer_multi_selection(v.id,p_items);select coalesce((c->>'duration_minutes')::int,step_minutes)into minutes from public.schedule_resources where organization_id=v.organization_id;
 select coalesce(jsonb_agg(x),'[]')into r from generate_series(p_day::timestamp at time zone(v.payload->>'timezone'),(p_day+1)::timestamp at time zone(v.payload->>'timezone')-interval '1 minute',make_interval(mins=>(select step_minutes from public.schedule_resources where organization_id=v.organization_id)))x where private.consumer_slot_allowed(v.id,x,minutes);
 return jsonb_build_object('slots',r,'journey',case when(c->>'direct_booking')::boolean then 'direct'else 'review'end,'duration_minutes',c->'duration_minutes','total_cents',c->'total_cents');end;$$;

create function private.journey_require_photos(q public.quote_requests)returns void language plpgsql stable security definer set search_path=''as $$
declare item jsonb;s jsonb;f jsonb;needed boolean;begin
 for item in select value from jsonb_array_elements(coalesce(q.requested_items,jsonb_build_array(jsonb_build_object('service',q.service_code,'answers',q.answers))))loop
 select value into s from public.consumer_publications p cross join lateral jsonb_array_elements(p.payload->'services') where p.id=q.publication_id and value->>'code'=item->>'service';
 needed=s->>'photo_policy'='required';
 for f in select value from jsonb_array_elements(coalesce(s->'questions','[]'))where value->>'kind'='photo'and(value->>'required')::boolean loop
 if f->>'condition_field' is null or item->'answers'->(f->>'condition_field')=f->'condition_value'then needed=true;end if;end loop;
 if needed and not exists(select 1 from public.attachments a where a.request_id=q.id and a.state='ready'and(a.service_code=item->>'service'or(a.service_code is null and jsonb_array_length(coalesce(q.requested_items,'[{}]'))=1)))then raise exception 'required_service_photos'using errcode='22023';end if;
 end loop;end;$$;

create function public.consumer_complete_journey(p_code text,p_start timestamptz,p_attachment_count integer,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare q public.quote_requests;c jsonb;prior jsonb;payload jsonb;r jsonb;a jsonb;t public.tickets;begin
 perform private.consumer_lock();q=private.consumer_request(p_code,true);payload=jsonb_build_array(p_code,p_start,p_attachment_count);prior=private.consumer_idem(q.organization_id,'complete_journey',p_key,payload);if prior is not null then return prior;end if;
 if q.state<>'draft'or q.help_only then raise exception 'request_state_changed'using errcode='22023';end if;
 if p_start is null or p_start<=now()then raise exception 'desired_time_required'using errcode='22023';end if;
 c=private.consumer_request_selection(q);perform private.journey_require_photos(q);
 update public.quote_requests set journey=case when(c->>'direct_booking')::boolean then 'direct'else 'review'end,desired_start=p_start where id=q.id;
 r=public.consumer_submit_request(p_code,p_attachment_count,p_key);
 if(c->>'direct_booking')::boolean then a=private.central_book_core(p_code,p_start,null,p_key);r=r||jsonb_build_object('booking',a,'journey','direct');
 else
 -- A preference is not a reservation; only current opening/lead rules are required here.
 if not private.consumer_slot_allowed(q.publication_id,p_start,coalesce((c->>'duration_minutes')::integer,(select step_minutes from public.schedule_resources where organization_id=q.organization_id)))then raise exception 'slot_unavailable'using errcode='23P01';end if;
 t=private.central_open(q.id);perform private.journey_route(t.id,'Avaliação de preço ou condição necessária');r=r||jsonb_build_object('journey','review','desired_start',p_start);end if;
 perform private.consumer_remember(q.organization_id,'complete_journey',p_key,payload,r);return r;end;$$;

create function public.consumer_start_help(p_slug text,p_revision text,p_items jsonb,p_customer jsonb,p_stage text,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare v public.consumer_publications;c public.customers;calc jsonb;q public.quote_requests;op uuid;t public.tickets;prior jsonb;payload jsonb;r jsonb;begin
 perform private.consumer_lock();v=private.consumer_publication(p_slug);payload=jsonb_build_array(p_slug,p_revision,p_items,p_customer,p_stage);prior=private.consumer_idem(v.organization_id,'start_help',p_key,payload);if prior is not null then return prior;end if;
 if v.public_code<>p_revision then raise exception 'published_price_changed'using errcode='40001';end if;
 perform private.company_keys(p_customer,array['name','whatsapp','email','notice_version','accepted_notice']);
 if p_customer->>'accepted_notice'is distinct from 'true'or p_customer->>'notice_version'is distinct from 'consumer-v1'or p_stage is null or p_stage not in('services','details','customer','schedule','review')then raise exception 'notice_required'using errcode='22023';end if;
 calc=private.journey_selection(v.id,p_items,false);
 if(select count(*)from public.quote_requests r join public.customers x on x.id=r.customer_id where x.user_id=auth.uid()and r.created_at>now()-interval '1 hour')>=10 then raise exception 'request_rate_limit'using errcode='54000';end if;
 insert into public.customers(organization_id,user_id,name,whatsapp,email)values(v.organization_id,auth.uid(),btrim(p_customer->>'name'),p_customer->>'whatsapp',nullif(btrim(p_customer->>'email'),''))on conflict(organization_id,user_id)do update set name=excluded.name,whatsapp=excluded.whatsapp,email=excluded.email returning *into c;
 insert into public.customer_consents(organization_id,customer_id,purpose,notice_version)values(v.organization_id,c.id,'request_processing','consumer-v1');
 insert into public.opportunities(organization_id,customer_id,service_id)values(v.organization_id,c.id,(calc->>'service_id')::uuid)returning id into op;
 insert into public.quote_requests(organization_id,customer_id,opportunity_id,publication_id,service_id,service_code,help_only,help_context)values(v.organization_id,c.id,op,v.id,(calc->>'service_id')::uuid,p_items->0->>'service',true,jsonb_build_object('stage',p_stage,'items',p_items))returning *into q;
 t=private.central_open(q.id);if not(calc->>'direct_booking')::boolean then perform private.journey_route(t.id,'Dúvida sobre serviço que exige avaliação da empresa');end if;
 perform private.consumer_event(v.organization_id,q.id,'created');r=jsonb_build_object('code',q.public_code,'ticket',t.public_code);perform private.consumer_remember(v.organization_id,'start_help',p_key,payload,r);return r;end;$$;

create function public.consumer_draft_context(p_code text)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare q public.quote_requests;c public.customers;begin q=private.consumer_request(p_code,true);if q.state<>'draft'then raise exception 'request_state_changed'using errcode='22023';end if;select *into c from public.customers where id=q.customer_id;
 return jsonb_build_object('code',p_code,'help_only',q.help_only,'items',coalesce(q.help_context->'items',q.requested_items,jsonb_build_array(jsonb_build_object('service',q.service_code,'addons',to_jsonb(q.addon_codes),'answers',q.answers,'notes',''))),'stage',q.help_context->>'stage','notes',q.notes,'name',c.name,'whatsapp',c.whatsapp,'email',c.email,'desired_start',q.desired_start,'attachments',(select coalesce(jsonb_agg(jsonb_build_object('code',public_code,'service',service_code)),'[]')from public.attachments where request_id=q.id and state='ready'));end;$$;

create function public.consumer_prepare_help_request(p_code text,p_items jsonb,p_notes text,p_contact boolean,p_expected_cents bigint,p_key uuid,p_customer jsonb default null)returns jsonb language plpgsql security definer set search_path=''as $$
declare q public.quote_requests;c jsonb;v uuid;i jsonb;pos integer=0;r jsonb;payload jsonb;prior jsonb;begin
 perform private.consumer_lock();q=private.consumer_request(p_code,true);payload=jsonb_build_array(p_code,p_items,p_notes,p_contact,p_expected_cents,p_customer);prior=private.consumer_idem(q.organization_id,'prepare_help',p_key,payload);if prior is not null then return prior;end if;
 if q.state<>'draft'or not q.help_only then raise exception 'request_state_changed'using errcode='22023';end if;
 if not exists(select 1 from public.consumer_pages where organization_id=q.organization_id and enabled and publication_id=q.publication_id)then raise exception 'published_price_changed'using errcode='40001';end if;
 c=private.consumer_multi_selection(q.publication_id,p_items);if(c->>'total_cents')::bigint is distinct from p_expected_cents then raise exception 'price_mismatch'using errcode='22023';end if;
 if p_contact is null then raise exception 'notice_required'using errcode='22023';end if; if p_customer is not null then perform private.company_keys(p_customer,array['name','whatsapp','email','accepted_notice','notice_version']);if p_customer->>'accepted_notice'is distinct from 'true'or p_customer->>'notice_version'is distinct from 'consumer-v1'then raise exception 'notice_required'using errcode='22023';end if;update public.customers set name=btrim(p_customer->>'name'),whatsapp=p_customer->>'whatsapp',email=nullif(btrim(p_customer->>'email'),'')where id=q.customer_id;end if;
 update public.quote_requests set requested_items=c->'requested_items',review_alerts=c->'review_alerts',service_id=(c->>'service_id')::uuid,service_code=p_items->0->>'service',addon_codes=array(select jsonb_array_elements_text(p_items->0->'addons')),answers=p_items->0->'answers',notes=coalesce(p_notes,''),help_only=false,revision=revision+1 where id=q.id;
 insert into public.quote_versions(organization_id,request_id,version,kind,price_mode,total_cents,duration_minutes,created_by)values(q.organization_id,q.id,1,'estimate',c->>'price_mode',(c->>'total_cents')::bigint,(c->>'duration_minutes')::integer,auth.uid())returning id into v;
 for i in select value from jsonb_array_elements(c->'items')loop insert into public.quote_items(organization_id,version_id,position,name,quantity,unit_cents,price_mode,duration_minutes)values(q.organization_id,v,pos,i->>'name',1,(i->>'unit_cents')::integer,i->>'price_mode',(i->>'duration_minutes')::integer);pos=pos+1;end loop;
 update public.quote_versions set state='sent'where id=v;
 if p_contact and not exists(select 1 from public.customer_consents where customer_id=q.customer_id and purpose='request_contact'and revoked_at is null)then insert into public.customer_consents(organization_id,customer_id,purpose,notice_version)values(q.organization_id,q.customer_id,'request_contact','consumer-v1');end if;
 r=jsonb_build_object('code',p_code);perform private.consumer_remember(q.organization_id,'prepare_help',p_key,payload,r);return r;end;$$;

create function public.consumer_reserve_item_attachment(p_code text,p_service text,p_mime text,p_size integer,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare q public.quote_requests;r jsonb;a public.attachments;begin
 perform private.consumer_lock();q=private.consumer_request(p_code,true);
 if p_service is null or not exists(select 1 from jsonb_array_elements(coalesce(q.requested_items,q.help_context->'items',jsonb_build_array(jsonb_build_object('service',q.service_code))))i where i->>'service'=p_service)then raise exception 'attachment_service_invalid'using errcode='22023';end if;
 r=public.consumer_reserve_attachment(p_code,p_mime,p_size,p_key);select *into a from public.attachments where public_code=r->>'code';if a.service_code is not null and a.service_code<>p_service then raise exception 'idempotency_conflict'using errcode='22023';end if;
 update public.attachments set service_code=p_service where id=a.id;return r;end;$$;

create function public.operations_request_photos(p_org uuid,p_code text,p_instruction text,p_revision integer,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare q public.quote_requests;t public.tickets;r jsonb;payload jsonb;prior jsonb;begin
 perform private.central_lock();perform private.permission_require(p_org,'central.reply');if not private.journey_company_actor(p_org,auth.uid())then raise exception 'company_decision_required'using errcode='42501';end if;
 select *into q from public.quote_requests where public_code=p_code and organization_id=p_org;if q.id is null then raise exception 'request_access_denied'using errcode='42501';end if;
 payload=jsonb_build_array(p_code,p_instruction,p_revision);prior=private.consumer_idem(p_org,'request_photos',p_key,payload);if prior is not null then return prior;end if;
 if q.revision<>p_revision then raise exception 'request_revision_conflict'using errcode='40001';end if;
 if q.state not in('submitted','under_review','quoted','declined')or length(btrim(coalesce(p_instruction,'')))not between 2 and 1000 then raise exception 'invalid_photo_request'using errcode='22023';end if;
 update public.quote_requests set photo_request=p_instruction,photo_requested_at=clock_timestamp(),revision=revision+1 where id=q.id;
 t=private.central_open(q.id);insert into public.ticket_messages(organization_id,ticket_id,author_id,author_name,kind,body)values(p_org,t.id,auth.uid(),coalesce((select display_name from public.profiles where id=auth.uid()),'Empresa'),'company','Fotos necessárias: '||p_instruction);
 update public.tickets set next_action='customer',state='waiting_customer',revision=revision+1,last_staff_at=clock_timestamp()where id=t.id;perform private.central_event(t.id,'message');
 r=jsonb_build_object('code',p_code);perform private.consumer_remember(p_org,'request_photos',p_key,payload,r);return r;end;$$;

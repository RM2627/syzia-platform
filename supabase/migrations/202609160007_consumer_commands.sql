begin;
create function private.consumer_code(p_prefix text,p_id uuid) returns text language sql immutable set search_path='' as $$ select p_prefix||'_'||substr(encode(extensions.digest(p_id::text,'sha256'),'hex'),1,24); $$;
create function private.consumer_lock() returns void language plpgsql security definer set search_path='' as $$
begin perform pg_advisory_xact_lock(734921501);if not private.consumer_identity() then raise exception 'consumer_session_required' using errcode='42501';end if;end;$$;
create function private.consumer_publication(p_slug text) returns public.consumer_publications language plpgsql stable security definer set search_path='' as $$
declare result public.consumer_publications;
begin select v.* into result from public.consumer_publications v join public.consumer_pages p on p.publication_id=v.id and p.organization_id=v.organization_id join public.organizations o on o.id=p.organization_id where o.slug=p_slug and o.status='active' and p.enabled;
 if result.id is null then raise exception 'page_unavailable' using errcode='22023';end if;return result;end;$$;
create function private.consumer_request(p_code text,p_manage boolean default false) returns public.quote_requests language plpgsql stable security definer set search_path='' as $$
declare q public.quote_requests;
begin select * into q from public.quote_requests where public_code=p_code;if q.id is null or not private.consumer_access(q.id,p_manage) then raise exception 'request_access_denied' using errcode='42501';end if;return q;end;$$;
create function private.consumer_idem(p_org uuid,p_op text,p_key uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.consumer_idempotency;h text;
begin if p_key is null then raise exception 'idempotency_key_required' using errcode='22023';end if;h=encode(extensions.digest(p_payload::text,'sha256'),'hex');select * into r from public.consumer_idempotency where organization_id=p_org and user_id=auth.uid() and operation=p_op and key=p_key;
 if found then if r.payload_hash<>h then raise exception 'idempotency_conflict' using errcode='22023';end if;return r.result;end if;return null;end;$$;
create function private.consumer_remember(p_org uuid,p_op text,p_key uuid,p_payload jsonb,p_result jsonb) returns void language sql security definer set search_path='' as $$
 insert into public.consumer_idempotency(organization_id,user_id,operation,key,payload_hash,result) values(p_org,auth.uid(),p_op,p_key,encode(extensions.digest(p_payload::text,'sha256'),'hex'),p_result);
$$;
create function private.consumer_event(p_org uuid,p_request uuid,p_event text) returns void language sql security definer set search_path='' as $$ insert into public.request_events(organization_id,request_id,event,actor_id) values(p_org,p_request,p_event,auth.uid()); $$;
create function public.consumer_publish_page(p_org uuid,p_manual uuid,p_enabled boolean,p_show_prices boolean,p_expected_revision integer) returns text language plpgsql security definer set search_path='' as $$
declare m public.manual_versions;o public.organizations;p public.consumer_pages;v public.consumer_publications;payload jsonb;
begin perform private.company_lock(p_org);if p_enabled is null or p_show_prices is null or p_expected_revision is null then raise exception 'invalid_company_fields' using errcode='22023';end if;
 select * into p from public.consumer_pages where organization_id=p_org;
 if coalesce(p.revision,0)<>p_expected_revision then raise exception 'company_revision_conflict' using errcode='40001';end if;
 select * into m from public.manual_versions where id=p_manual and organization_id=p_org and status='published';if m.id is null then raise exception 'company_published_manual_required' using errcode='23514';end if;
 select * into o from public.organizations where id=p_org;
 payload=jsonb_build_object('name',o.name,'slug',o.slug,'description',m.snapshot->'settings'->>'description','phone',m.snapshot->'settings'->>'public_phone','email',m.snapshot->'settings'->>'public_email','address',m.snapshot->'settings'->>'public_address','regions',m.snapshot->'settings'->>'service_regions','payments',m.snapshot->'settings'->>'payment_methods','hours',m.snapshot->'settings'->'business_hours','timezone',o.timezone,'faqs',m.snapshot->'faqs','notice_version','consumer-v1',
 'services',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('s',(s->>'id')::uuid),'name',s->>'name','category',s->>'category','description',s->>'description','image_url',s->>'image_url','price_mode',case when p_show_prices then s->>'price_mode' else 'quote' end,'price_cents',case when p_show_prices then s->'price_cents' else 'null'::jsonb end,'duration_minutes',s->'duration_minutes','availability',s->>'availability','quotes_allowed',s->'quotes_allowed','direct_booking',p_show_prices and (s->>'direct_booking')::boolean,
 'addons',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('a',(a->>'id')::uuid),'name',a->>'name','price_mode',case when p_show_prices then a->>'price_mode' else 'quote' end,'price_cents',case when p_show_prices then a->'price_cents' else 'null'::jsonb end,'duration_minutes',a->'duration_minutes')) from jsonb_array_elements(m.snapshot->'addons') a where a->>'service_id'=s->>'id'),'[]'::jsonb),
 'questions',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('f',(f->>'id')::uuid),'label',f->>'label','kind',f->>'kind','required',f->'required','options',f->'options') order by (f->>'position')::integer) from jsonb_array_elements(m.snapshot->'fields') f where f->>'service_id'=s->>'id'),'[]'::jsonb)) order by s->>'category',s->>'name') from jsonb_array_elements(m.snapshot->'services') s),'[]'::jsonb));
 insert into public.consumer_publications(organization_id,manual_id,payload,show_prices,published_by) values(p_org,p_manual,payload,p_show_prices,auth.uid()) returning * into v;
 insert into public.consumer_pages(organization_id,enabled,publication_id) values(p_org,p_enabled,v.id) on conflict(organization_id) do update set enabled=excluded.enabled,publication_id=excluded.publication_id,revision=consumer_pages.revision+1;
 insert into public.schedule_resources(organization_id) values(p_org) on conflict do nothing;return v.public_code;
end;$$;
create function public.consumer_set_page_enabled(p_org uuid,p_enabled boolean,p_expected_revision integer) returns void language plpgsql security definer set search_path='' as $$
begin perform private.company_lock(p_org);if p_enabled is null then raise exception 'invalid_company_fields' using errcode='22023';end if;update public.consumer_pages set enabled=p_enabled,revision=revision+1 where organization_id=p_org and revision=p_expected_revision;if not found then raise exception 'company_revision_conflict' using errcode='40001';end if;end;$$;
create function public.consumer_public_page(p_slug text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v public.consumer_publications;res public.schedule_resources;
begin select x.* into v from public.consumer_publications x join public.consumer_pages p on p.publication_id=x.id and p.organization_id=x.organization_id join public.organizations o on o.id=p.organization_id where o.slug=p_slug and o.status='active' and p.enabled;if v.id is null then return null;end if;
 select * into res from public.schedule_resources where organization_id=v.organization_id;
 -- Operational deactivation is a safety stop; unpublished edits to price/content never replace the snapshot.
 return (v.payload-'services')||jsonb_build_object('revision',v.public_code,'services',coalesce((select jsonb_agg(s) from jsonb_array_elements(v.payload->'services') s where exists(select 1 from public.services live where live.organization_id=v.organization_id and private.consumer_code('s',live.id)=s->>'code' and live.active)),'[]'::jsonb),'booking_policy',jsonb_build_object('lead_minutes',res.lead_minutes,'cancel_minutes',res.cancel_minutes,'horizon_days',res.horizon_days,'active',res.active));
end;$$;
create function private.consumer_selection(p_publication uuid,p_service text,p_addons text[],p_answers jsonb,p_validate boolean default true) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v public.consumer_publications;m public.manual_versions;s jsonb;a jsonb;f jsonb;answer_value jsonb;items jsonb='[]';total bigint=0;duration integer=0;mode text='fixed';sid uuid;codes text[]='{}';key text;
begin select * into v from public.consumer_publications where id=p_publication;select * into m from public.manual_versions where id=v.manual_id and organization_id=v.organization_id;
 if p_addons is null or cardinality(p_addons)>10 or cardinality(p_addons)<>(select count(distinct x) from unnest(p_addons)x) or array_position(p_addons,null) is not null then raise exception 'invalid_addons' using errcode='22023';end if;
 select x into s from jsonb_array_elements(m.snapshot->'services') x where private.consumer_code('s',(x->>'id')::uuid)=p_service;
 sid=(s->>'id')::uuid;if sid is null or not exists(select 1 from public.services where organization_id=v.organization_id and id=sid and active) then raise exception 'service_unavailable' using errcode='22023';end if;
 items=jsonb_build_array(jsonb_build_object('name',s->>'name','quantity',1,'unit_cents',case when v.show_prices then s->'price_cents' else 'null'::jsonb end,'price_mode',case when v.show_prices then s->>'price_mode' else 'quote' end,'duration_minutes',s->'duration_minutes'));
 foreach key in array p_addons loop
  select x into a from jsonb_array_elements(m.snapshot->'addons') x where x->>'service_id'=s->>'id' and private.consumer_code('a',(x->>'id')::uuid)=key;
  if a is null or not exists(select 1 from public.service_addons where organization_id=v.organization_id and id=(a->>'id')::uuid and service_id=sid and active) then raise exception 'addon_unavailable' using errcode='22023';end if;
  items=items||jsonb_build_array(jsonb_build_object('name',a->>'name','quantity',1,'unit_cents',case when v.show_prices then a->'price_cents' else 'null'::jsonb end,'price_mode',case when v.show_prices then a->>'price_mode' else 'quote' end,'duration_minutes',a->'duration_minutes'));
 end loop;
 for a in select x from jsonb_array_elements(items)x loop
  if a->>'price_mode'='quote' then mode='quote';elsif a->>'price_mode'='from' and mode<>'quote' then mode='from';end if;
  total=total+coalesce((a->>'unit_cents')::bigint,0);duration=duration+coalesce((a->>'duration_minutes')::integer,0);
 end loop;
 if mode='quote' then total=null;end if;if s->>'duration_minutes' is null then duration=null;end if;
 if p_validate then
  if p_answers is null or jsonb_typeof(p_answers)<>'object' then raise exception 'invalid_answers' using errcode='22023';end if;
  for f in select x from jsonb_array_elements(m.snapshot->'fields') x where x->>'service_id'=s->>'id' loop
   key=private.consumer_code('f',(f->>'id')::uuid);codes=array_append(codes,key);answer_value=p_answers->key;
   if answer_value is null or answer_value='null'::jsonb or answer_value='""'::jsonb or (jsonb_typeof(answer_value)='string' and btrim(answer_value#>>'{}')='') then if (f->>'required')::boolean then raise exception 'required_answer' using errcode='22023';end if;continue;end if;
   if (f->>'kind'='text' and (jsonb_typeof(answer_value)<>'string' or length(answer_value#>>'{}')>2000)) or(f->>'kind'='number' and (jsonb_typeof(answer_value)<>'number' or abs((answer_value#>>'{}')::numeric)>100000000)) or(f->>'kind'='boolean' and jsonb_typeof(answer_value)<>'boolean') or(f->>'kind'='choice' and not exists(select 1 from jsonb_array_elements(f->'options')opt where opt=answer_value)) then raise exception 'invalid_answer' using errcode='22023';end if;
  end loop;
  if (p_answers-codes)<>'{}'::jsonb then raise exception 'unknown_answer' using errcode='22023';end if;
 end if;
 return jsonb_build_object('service_id',sid,'items',items,'total_cents',total,'price_mode',mode,'duration_minutes',duration,'direct_booking',v.show_prices and (s->>'direct_booking')::boolean,'quotes_allowed',(s->>'quotes_allowed')::boolean);
end;$$;
create function public.consumer_create_request(p_slug text,p_revision text,p_service text,p_addons text[],p_answers jsonb,p_customer jsonb,p_notes text,p_contact boolean,p_expected_cents bigint,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.consumer_publications;calc jsonb;c public.customers;op uuid;q public.quote_requests;ver uuid;item jsonb;pos integer=0;payload jsonb;prior jsonb;result jsonb;
begin perform private.consumer_lock();v=private.consumer_publication(p_slug);
 perform private.company_keys(p_customer,array['name','whatsapp','email','notice_version','accepted_notice']);
 if p_customer->>'notice_version' is distinct from 'consumer-v1' or p_customer->>'accepted_notice' is distinct from 'true' or p_contact is null then raise exception 'notice_required' using errcode='22023';end if;
 payload=jsonb_build_object('slug',p_slug,'revision',p_revision,'service',p_service,'addons',p_addons,'answers',p_answers,'customer',p_customer,'notes',p_notes,'contact',p_contact,'expected',p_expected_cents);
 prior=private.consumer_idem(v.organization_id,'create_request',p_key,payload);if prior is not null then return prior;end if;
 if v.public_code is distinct from p_revision then raise exception 'published_price_changed' using errcode='40001';end if;
 calc=private.consumer_selection(v.id,p_service,p_addons,p_answers);
 if not (calc->>'quotes_allowed')::boolean and not (calc->>'direct_booking')::boolean then raise exception 'service_unavailable' using errcode='22023';end if;
 if (calc->>'total_cents')::bigint is distinct from p_expected_cents then raise exception 'price_mismatch' using errcode='22023';end if;
 if (select count(*) from public.quote_requests qr join public.customers x on x.id=qr.customer_id where x.user_id=auth.uid() and qr.created_at>now()-interval '1 hour')>=10 then raise exception 'request_rate_limit' using errcode='54000';end if;
 insert into public.customers(organization_id,user_id,name,whatsapp,email) values(v.organization_id,auth.uid(),btrim(p_customer->>'name'),p_customer->>'whatsapp',nullif(btrim(p_customer->>'email'),'')) on conflict(organization_id,user_id) do update set name=excluded.name,whatsapp=excluded.whatsapp,email=excluded.email returning * into c;
 insert into public.customer_consents(organization_id,customer_id,purpose,notice_version) values(v.organization_id,c.id,'request_processing','consumer-v1');
 if p_contact and not exists(select 1 from public.customer_consents where customer_id=c.id and purpose='request_contact' and revoked_at is null) then insert into public.customer_consents(organization_id,customer_id,purpose,notice_version) values(v.organization_id,c.id,'request_contact','consumer-v1');end if;
 insert into public.opportunities(organization_id,customer_id,service_id) values(v.organization_id,c.id,(calc->>'service_id')::uuid) returning id into op;
 insert into public.quote_requests(organization_id,customer_id,opportunity_id,publication_id,service_id,service_code,addon_codes,answers,notes) values(v.organization_id,c.id,op,v.id,(calc->>'service_id')::uuid,p_service,p_addons,p_answers,coalesce(p_notes,'')) returning * into q;
 insert into public.quote_versions(organization_id,request_id,version,kind,price_mode,total_cents,duration_minutes,created_by) values(v.organization_id,q.id,1,'estimate',calc->>'price_mode',(calc->>'total_cents')::bigint,(calc->>'duration_minutes')::integer,auth.uid()) returning id into ver;
 for item in select x from jsonb_array_elements(calc->'items')x loop insert into public.quote_items(organization_id,version_id,position,name,quantity,unit_cents,price_mode,duration_minutes) values(v.organization_id,ver,pos,item->>'name',1,(item->>'unit_cents')::integer,item->>'price_mode',(item->>'duration_minutes')::integer);pos=pos+1;end loop;
 update public.quote_versions set state='sent' where id=ver;
 perform private.consumer_event(v.organization_id,q.id,'created');result=jsonb_build_object('code',q.public_code,'state',q.state);
 perform private.consumer_remember(v.organization_id,'create_request',p_key,payload,result);return result;
end;$$;
create function public.consumer_submit_request(p_code text,p_attachment_count integer,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;prior jsonb;payload jsonb;result jsonb;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);payload=jsonb_build_object('code',p_code,'attachments',p_attachment_count);prior=private.consumer_idem(q.organization_id,'submit',p_key,payload);if prior is not null then return prior;end if;
 if q.state<>'draft' then raise exception 'request_state_changed' using errcode='22023';end if;
 if not exists(select 1 from public.consumer_pages where organization_id=q.organization_id and enabled and publication_id=q.publication_id) then raise exception 'published_price_changed' using errcode='40001';end if;
 perform private.consumer_selection(q.publication_id,q.service_code,q.addon_codes,q.answers);
 if p_attachment_count is null or p_attachment_count not between 0 and 5 or p_attachment_count<>(select count(*) from public.attachments where request_id=q.id and state='ready') then raise exception 'attachment_incomplete' using errcode='22023';end if;
 update public.quote_requests set state='submitted',revision=revision+1 where id=q.id;perform private.consumer_event(q.organization_id,q.id,'submitted');result=jsonb_build_object('code',p_code,'state','submitted');perform private.consumer_remember(q.organization_id,'submit',p_key,payload,result);return result;
end;$$;
create function public.consumer_request_context(p_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q public.quote_requests;c public.customers;
begin q=private.consumer_request(p_code);select * into c from public.customers where id=q.customer_id and organization_id=q.organization_id;
 return jsonb_build_object('code',q.public_code,'state',q.state,'revision',q.revision,'name',c.name,'notes',q.notes,'can_manage',private.consumer_access(q.id,true),'is_owner',c.user_id=auth.uid(),'company',(select jsonb_build_object('name',name,'slug',slug) from public.organizations where id=q.organization_id),'current_version',(select public_code from public.quote_versions where id=q.current_version_id),'accepted_version',(select public_code from public.quote_versions where id=q.accepted_version_id),
 'answers',coalesce((select jsonb_agg(jsonb_build_object('label',f->>'label','answer',q.answers->(f->>'code'))) from public.consumer_publications cp cross join lateral jsonb_array_elements(cp.payload->'services') sv cross join lateral jsonb_array_elements(sv->'questions') f where cp.id=q.publication_id and sv->>'code'=q.service_code),'[]'::jsonb),
 'versions',coalesce((select jsonb_agg(jsonb_build_object('code',v.public_code,'version',v.version,'kind',v.kind,'price_mode',v.price_mode,'total_cents',v.total_cents,'duration_minutes',v.duration_minutes,'expires_at',v.expires_at,'created_at',v.created_at,'items',(select jsonb_agg(jsonb_build_object('name',i.name,'quantity',i.quantity,'unit_cents',i.unit_cents,'price_mode',i.price_mode) order by i.position) from public.quote_items i where i.version_id=v.id)) order by v.version desc) from public.quote_versions v where v.request_id=q.id and v.state='sent'),'[]'::jsonb),
 'appointments',coalesce((select jsonb_agg(jsonb_build_object('code',a.public_code,'starts_at',a.starts_at,'ends_at',a.ends_at,'state',a.state) order by a.created_at desc) from public.appointments a where a.request_id=q.id),'[]'::jsonb),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('code',a.public_code,'mime',a.mime,'size_bytes',a.size_bytes,'state',a.state) order by a.created_at) from public.attachments a where a.request_id=q.id and (a.state='ready' or(a.state='pending' and a.expires_at>now()))),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('event',event,'at',created_at) order by created_at,id) from public.request_events where request_id=q.id),'[]'::jsonb),
 'contact_authorized',exists(select 1 from public.customer_consents where customer_id=c.id and purpose='request_contact' and revoked_at is null));
end;$$;
create function public.consumer_my_requests() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('code',q.public_code,'state',q.state,'created_at',q.created_at,'company_name',o.name,'slug',o.slug) order by q.created_at desc),'[]'::jsonb) from public.quote_requests q join public.organizations o on o.id=q.organization_id where private.consumer_access(q.id);
$$;
create function public.consumer_set_contact(p_code text,p_allowed boolean) returns void language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);
 if not exists(select 1 from public.customers where id=q.customer_id and user_id=auth.uid()) or p_allowed is null then raise exception 'request_access_denied' using errcode='42501';end if;
 if p_allowed then if not exists(select 1 from public.customer_consents where customer_id=q.customer_id and purpose='request_contact' and revoked_at is null) then insert into public.customer_consents(organization_id,customer_id,purpose,notice_version) values(q.organization_id,q.customer_id,'request_contact','consumer-v1');end if;
 else update public.customer_consents set revoked_at=clock_timestamp() where customer_id=q.customer_id and purpose='request_contact' and revoked_at is null;perform private.consumer_event(q.organization_id,q.id,'contact_revoked');end if;
end;$$;
create function public.consumer_create_tracking_link(p_code text,p_manage boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;secret text;expiry timestamptz=now()+interval '7 days';
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);if not exists(select 1 from public.customers where id=q.customer_id and user_id=auth.uid()) then raise exception 'request_access_denied' using errcode='42501';end if;
 secret=encode(extensions.gen_random_bytes(32),'hex');update public.request_access_tokens set revoked_at=clock_timestamp() where request_id=q.id and revoked_at is null;
 insert into public.request_access_tokens(organization_id,request_id,token_hash,scope,expires_at,created_by) values(q.organization_id,q.id,encode(extensions.digest(secret,'sha256'),'hex'),case when p_manage then 'manage' else 'view' end,expiry,auth.uid());
 return jsonb_build_object('code',q.public_code,'secret',secret,'expires_at',expiry,'scope',case when p_manage then 'manage' else 'view' end);
end;$$;
create function public.consumer_redeem_tracking_link(p_code text,p_secret text) returns void language plpgsql security definer set search_path='' as $$
declare t public.request_access_tokens;
begin perform private.consumer_lock();if p_secret is null or length(p_secret)<>64 then raise exception 'tracking_link_invalid' using errcode='42501';end if;
 select x.* into t from public.request_access_tokens x join public.quote_requests q on q.id=x.request_id and q.organization_id=x.organization_id join public.organizations o on o.id=q.organization_id where q.public_code=p_code and x.token_hash=encode(extensions.digest(p_secret,'sha256'),'hex') and x.revoked_at is null and x.expires_at>now() and o.status='active';
 if t.id is null then raise exception 'tracking_link_invalid' using errcode='42501';end if;
 if t.used_at is not null and not exists(select 1 from public.customer_access where token_id=t.id and user_id=auth.uid()) then raise exception 'tracking_link_invalid' using errcode='42501';end if;
 insert into public.customer_access(organization_id,request_id,user_id,token_id) values(t.organization_id,t.request_id,auth.uid(),t.id) on conflict(token_id,user_id) do nothing;update public.request_access_tokens set used_at=coalesce(used_at,clock_timestamp()) where id=t.id;
end;$$;
create function public.consumer_revoke_tracking(p_code text) returns void language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);if not exists(select 1 from public.customers where id=q.customer_id and user_id=auth.uid()) then raise exception 'request_access_denied' using errcode='42501';end if;
 update public.request_access_tokens set revoked_at=clock_timestamp() where request_id=q.id and revoked_at is null;perform private.consumer_event(q.organization_id,q.id,'link_revoked');end;$$;
create function public.consumer_send_quote(p_code text,p_items jsonb,p_duration integer,p_expires timestamptz,p_expected_revision integer,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;v public.quote_versions;i jsonb;pos integer=0;total bigint=0;payload jsonb;prior jsonb;r jsonb;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);perform private.company_lock(q.organization_id);
 payload=jsonb_build_array(p_code,p_items,p_duration,p_expires,p_expected_revision);prior=private.consumer_idem(q.organization_id,'send_quote',p_key,payload);if prior is not null then return prior;end if;
 if q.revision<>p_expected_revision then raise exception 'request_revision_conflict' using errcode='40001';end if;
 if q.state not in ('submitted','quoted') or p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 30 or p_duration is null or p_expires is null or p_expires<=now() or p_expires>now()+interval '30 days' then raise exception 'invalid_final_quote' using errcode='22023';end if;
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
create function public.consumer_approve_quote(p_code text,p_version text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;v public.quote_versions;payload jsonb;prior jsonb;r jsonb;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);payload=jsonb_build_array(p_code,p_version);prior=private.consumer_idem(q.organization_id,'approve',p_key,payload);if prior is not null then return prior;end if;
 select * into v from public.quote_versions where request_id=q.id and id=q.current_version_id and public_code=p_version and kind='final' and state='sent';
 if v.id is null then raise exception 'quote_version_invalid' using errcode='22023';end if;
 if q.accepted_version_id=v.id then return jsonb_build_object('code',p_code,'state','approved');end if;
 if q.state<>'quoted' or v.expires_at<=now() then raise exception 'quote_expired_or_invalid' using errcode='22023';end if;
 perform private.consumer_selection(q.publication_id,q.service_code,q.addon_codes,q.answers);
 update public.quote_requests set accepted_version_id=v.id,state='approved',revision=revision+1 where id=q.id;update public.opportunities set stage='contracted' where id=q.opportunity_id;perform private.consumer_event(q.organization_id,q.id,'approved');r=jsonb_build_object('code',p_code,'state','approved');perform private.consumer_remember(q.organization_id,'approve',p_key,payload,r);return r;
end;$$;
create function public.consumer_schedule_config(p_org uuid,p_expected_revision integer,p_rules jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s public.schedule_resources;r public.schedule_resources;
begin perform private.company_lock(p_org);perform private.company_keys(p_rules,array['active','lead_minutes','horizon_days','step_minutes','buffer_minutes','cancel_minutes']);select * into s from public.schedule_resources where organization_id=p_org;
 if s.id is null or s.revision is distinct from p_expected_revision then raise exception 'schedule_revision_conflict' using errcode='40001';end if;
 select * into r from jsonb_populate_record(s,p_rules);update public.schedule_resources set active=r.active,lead_minutes=r.lead_minutes,horizon_days=r.horizon_days,step_minutes=r.step_minutes,buffer_minutes=r.buffer_minutes,cancel_minutes=r.cancel_minutes,revision=revision+1 where id=s.id;
end;$$;
create function private.consumer_slot_allowed(p_pub uuid,p_start timestamptz,p_minutes integer,p_ignore uuid default null) returns boolean language plpgsql stable security definer set search_path='' as $$
declare v public.consumer_publications;s public.schedule_resources;local_start timestamp;local_end timestamp;finish timestamptz;
begin select * into v from public.consumer_publications where id=p_pub;select * into s from public.schedule_resources where organization_id=v.organization_id;
 if s.id is null or not s.active or p_start is null or p_minutes is null or p_minutes<1 or p_start<now()+make_interval(mins=>s.lead_minutes) or p_start>now()+make_interval(days=>s.horizon_days) then return false;end if;
 finish=p_start+make_interval(mins=>p_minutes+s.buffer_minutes);local_start=p_start at time zone (v.payload->>'timezone');local_end=finish at time zone (v.payload->>'timezone');
 if local_start::date<>local_end::date or extract(second from local_start)<>0 or extract(minute from local_start)::integer%s.step_minutes<>0 then return false;end if;
 return exists(select 1 from jsonb_array_elements(v.payload->'hours') h where (h->>'day')::integer=extract(dow from local_start) and local_start::time>=(h->>'open')::time and local_end::time<=(h->>'close')::time)
 and not exists(select 1 from public.appointments a where a.resource_id=s.id and a.state='confirmed' and a.id is distinct from p_ignore and a.slot&&tstzrange(p_start,finish,'[)'));
end;$$;
create function public.consumer_slots(p_slug text,p_service text,p_addons text[],p_day date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v public.consumer_publications;c jsonb;r jsonb;
begin v=private.consumer_publication(p_slug);c=private.consumer_selection(v.id,p_service,p_addons,'{}',false);
 if not (c->>'direct_booking')::boolean or c->>'price_mode'<>'fixed' then return '[]'::jsonb;end if;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into r from generate_series(p_day::timestamp at time zone (v.payload->>'timezone'),(p_day+1)::timestamp at time zone (v.payload->>'timezone')-interval '15 minutes',interval '15 minutes')x where private.consumer_slot_allowed(v.id,x,(c->>'duration_minutes')::integer);return r;
end;$$;
create function public.consumer_request_slots(p_code text,p_day date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q public.quote_requests;v public.consumer_publications;c jsonb;minutes integer;ignore_id uuid;r jsonb;
begin q=private.consumer_request(p_code,true);v=private.consumer_publication((select slug from public.organizations where id=q.organization_id));c=private.consumer_selection(q.publication_id,q.service_code,q.addon_codes,q.answers);
 if q.state not in ('submitted','quoted','approved') then return '[]'::jsonb;end if;
 if q.accepted_version_id is not null then select duration_minutes into minutes from public.quote_versions where id=q.accepted_version_id;elsif q.state='submitted' and (c->>'direct_booking')::boolean and c->>'price_mode'='fixed' and v.id=q.publication_id then minutes=(c->>'duration_minutes')::integer;else return '[]'::jsonb;end if;
 select id into ignore_id from public.appointments where request_id=q.id and state='confirmed';
 select coalesce(jsonb_agg(x),'[]'::jsonb) into r from generate_series(p_day::timestamp at time zone(v.payload->>'timezone'),(p_day+1)::timestamp at time zone(v.payload->>'timezone')-interval '15 minutes',interval '15 minutes')x where private.consumer_slot_allowed(v.id,x,minutes,ignore_id);return r;
end;$$;
create function public.consumer_book(p_code text,p_start timestamptz,p_previous text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;v public.consumer_publications;c jsonb;s public.schedule_resources;a public.appointments;minutes integer;payload jsonb;prior jsonb;r jsonb;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);payload=jsonb_build_array(p_code,p_start,p_previous);prior=private.consumer_idem(q.organization_id,'book',p_key,payload);if prior is not null then return prior;end if;
 v=private.consumer_publication((select slug from public.organizations where id=q.organization_id));c=private.consumer_selection(q.publication_id,q.service_code,q.addon_codes,q.answers);select * into s from public.schedule_resources where organization_id=q.organization_id;
 if q.state not in ('submitted','quoted','approved') then raise exception 'request_not_submitted' using errcode='22023';end if;
 if q.accepted_version_id is not null then select duration_minutes into minutes from public.quote_versions where id=q.accepted_version_id;elsif q.state='submitted' and (c->>'direct_booking')::boolean and c->>'price_mode'='fixed' and q.publication_id=v.id then minutes=(c->>'duration_minutes')::integer;else raise exception 'booking_requires_approved_quote' using errcode='22023';end if;
 if p_previous is not null then select * into a from public.appointments where request_id=q.id and public_code=p_previous and state='confirmed';if a.id is null or a.starts_at<now()+make_interval(mins=>s.cancel_minutes) then raise exception 'reschedule_not_allowed' using errcode='22023';end if;end if;
 if not private.consumer_slot_allowed(v.id,p_start,minutes,a.id) then raise exception 'slot_unavailable' using errcode='23P01';end if;
 if a.id is null then insert into public.appointments(organization_id,resource_id,kind,request_id,customer_id,starts_at,ends_at) values(q.organization_id,s.id,'booking',q.id,q.customer_id,p_start,p_start+make_interval(mins=>minutes+s.buffer_minutes)) returning * into a;perform private.consumer_event(q.organization_id,q.id,'booked');
 else update public.appointments set starts_at=p_start,ends_at=p_start+make_interval(mins=>minutes+s.buffer_minutes) where id=a.id returning * into a;perform private.consumer_event(q.organization_id,q.id,'rescheduled');end if;
 update public.opportunities set stage='contracted' where id=q.opportunity_id;r=jsonb_build_object('code',a.public_code,'starts_at',a.starts_at,'ends_at',a.ends_at);perform private.consumer_remember(q.organization_id,'book',p_key,payload,r);return r;
end;$$;
create function public.consumer_cancel_booking(p_code text,p_appointment text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;a public.appointments;s public.schedule_resources;payload jsonb;prior jsonb;r jsonb;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);payload=jsonb_build_array(p_code,p_appointment);prior=private.consumer_idem(q.organization_id,'cancel_booking',p_key,payload);if prior is not null then return prior;end if;
 select * into a from public.appointments where request_id=q.id and public_code=p_appointment and kind='booking';select * into s from public.schedule_resources where organization_id=q.organization_id;
 if a.id is null or (a.state='confirmed' and a.starts_at<now()+make_interval(mins=>s.cancel_minutes)) then raise exception 'cancel_not_allowed' using errcode='22023';end if;
 if a.state='confirmed' then update public.appointments set state='cancelled' where id=a.id;perform private.consumer_event(q.organization_id,q.id,'cancelled');end if;r=jsonb_build_object('code',p_appointment,'state','cancelled');perform private.consumer_remember(q.organization_id,'cancel_booking',p_key,payload,r);return r;
end;$$;
create function public.consumer_schedule_block(p_org uuid,p_start timestamptz,p_end timestamptz,p_note text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments;s public.schedule_resources;payload jsonb;prior jsonb;r jsonb;
begin perform private.company_lock(p_org);payload=jsonb_build_array(p_start,p_end,p_note);prior=private.consumer_idem(p_org,'block',p_key,payload);if prior is not null then return prior;end if;select * into s from public.schedule_resources where organization_id=p_org;
 insert into public.appointments(organization_id,resource_id,kind,starts_at,ends_at,note) values(p_org,s.id,'block',p_start,p_end,p_note) returning * into a;r=jsonb_build_object('code',a.public_code);perform private.consumer_remember(p_org,'block',p_key,payload,r);return r;
end;$$;
create function public.consumer_remove_block(p_org uuid,p_code text) returns void language plpgsql security definer set search_path='' as $$
begin perform private.company_lock(p_org);update public.appointments set state='cancelled' where organization_id=p_org and public_code=p_code and kind='block';if not found then raise exception 'block_unavailable' using errcode='22023';end if;end;$$;
create function public.consumer_admin_context(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if not private.company_can_manage(p_org) then raise exception 'company_admin_required' using errcode='42501';end if;
 return jsonb_build_object('page',(select to_jsonb(p) from public.consumer_pages p where organization_id=p_org),'schedule',(select to_jsonb(s) from public.schedule_resources s where organization_id=p_org),'requests',coalesce((select jsonb_agg(jsonb_build_object('code',q.public_code,'state',q.state,'revision',q.revision,'created_at',q.created_at,'name',c.name,'whatsapp',c.whatsapp,'contact_allowed',exists(select 1 from public.customer_consents x where x.customer_id=c.id and x.purpose='request_contact' and x.revoked_at is null)) order by q.created_at desc) from public.quote_requests q join public.customers c on c.id=q.customer_id where q.organization_id=p_org and q.state<>'draft'),'[]'::jsonb),'blocks',coalesce((select jsonb_agg(jsonb_build_object('code',a.public_code,'starts_at',a.starts_at,'ends_at',a.ends_at,'note',a.note)) from public.appointments a where a.organization_id=p_org and a.kind='block' and a.state='confirmed'),'[]'::jsonb));
end;$$;
-- No client can invoke internal helpers. Expose only these audited commands.
do $$ declare r record;begin for r in select p.oid::regprocedure signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname like 'consumer_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',r.signature);
 if r.nspname='public' then execute format('grant execute on function %s to authenticated',r.signature);end if;
 end loop;end $$;
grant execute on function private.consumer_identity(),private.consumer_access(uuid,boolean),private.consumer_customer_access(uuid) to authenticated;
grant execute on function public.consumer_public_page(text),public.consumer_slots(text,text,text[],date) to anon;
commit;

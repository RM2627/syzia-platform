begin;
create table public.company_media (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),public_code text not null unique default('m_'||encode(extensions.gen_random_bytes(12),'hex')),
 uploaded_by uuid not null references public.profiles(id),object_path text not null unique,mime text not null check(mime in ('image/jpeg','image/png','image/webp')),size_bytes integer not null check(size_bytes between 1 and 5242880),
 state text not null default 'pending' check(state in ('pending','ready')),sha256 text check(sha256 ~ '^[0-9a-f]{64}$'),width integer check(width between 1 and 8000),height integer check(height between 1 and 8000),
 expires_at timestamptz not null default(now()+interval '15 minutes'),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),
 check(state<>'ready' or(sha256 is not null and width is not null and height is not null and width::bigint*height<=20000000))
);
create table public.company_branding (
 organization_id uuid primary key references public.organizations(id),id uuid not null default gen_random_uuid(),primary_color text not null default '#193e35' check(primary_color in ('#193e35','#183c62','#563665','#653d29','#303b45')),
 logo_id uuid,cover_id uuid,category_order text[] not null default '{}',service_order text[] not null default '{}',revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(cardinality(category_order)<=20 and length(category_order::text)<=2000),check(cardinality(service_order)<=100),
 foreign key(organization_id,logo_id) references public.company_media(organization_id,id),foreign key(organization_id,cover_id) references public.company_media(organization_id,id)
);
create table public.portfolio_items (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),public_code text not null unique default('w_'||encode(extensions.gen_random_bytes(12),'hex')),
 title text not null check(length(btrim(title)) between 2 and 120),description text not null default '' check(length(description)<=600),service_id uuid,position integer not null default 0 check(position between 0 and 100),active boolean not null default true,format text not null default 'gallery' check(format in ('gallery','before_after')),media_ids uuid[] not null check(cardinality(media_ids) between 1 and 4),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),foreign key(organization_id,service_id) references public.services(organization_id,id),check(format<>'before_after' or cardinality(media_ids)=2)
);
create table public.customer_context (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),customer_id uuid not null,tags text[] not null default '{}' check(cardinality(tags)<=10 and length(tags::text)<=400),preferred_time text not null default '' check(length(preferred_time)<=160),operational_note text not null default '' check(length(operational_note)<=2000),referrer_customer_id uuid,origin_context text not null default '' check(length(origin_context)<=600),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,customer_id),foreign key(organization_id,customer_id) references public.customers(organization_id,id),foreign key(organization_id,referrer_customer_id) references public.customers(organization_id,id),check(referrer_customer_id is distinct from customer_id)
);
create table public.opportunity_context (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),opportunity_id uuid not null,source text not null check(source in ('instagram','google','referral','whatsapp','direct','other','unknown')),source_detail text not null default '' check(length(source_detail)<=200),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,opportunity_id),foreign key(organization_id,opportunity_id) references public.opportunities(organization_id,id)
);
-- The media array is validated with row locks by the authorized command and a trigger,
-- including privileged accidental writes. Request attachments are never accepted here.
create function private.consumer_portfolio_media_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin if cardinality(new.media_ids)<>(select count(distinct x) from unnest(new.media_ids)x) or exists(select 1 from unnest(new.media_ids)x where not exists(select 1 from public.company_media m where m.id=x and m.organization_id=new.organization_id and m.state='ready')) then raise exception 'portfolio_media_invalid' using errcode='23514';end if;return new;end;$$;
create trigger portfolio_media_guard before insert or update on public.portfolio_items for each row execute function private.consumer_portfolio_media_guard();
create function private.consumer_ready_media(p_org uuid,p_code text) returns uuid language plpgsql stable security definer set search_path='' as $$
declare result uuid;begin if p_code is null or p_code='' then return null;end if;select id into result from public.company_media where organization_id=p_org and public_code=p_code and state='ready';if result is null then raise exception 'company_media_invalid' using errcode='22023';end if;return result;end;$$;
create function public.consumer_branding_save(p_org uuid,p_revision integer,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare b public.company_branding;logo uuid;cover uuid;
begin perform private.company_lock(p_org);perform private.company_keys(p_data,array['primary_color','logo','cover','category_order','service_order']);select * into b from public.company_branding where organization_id=p_org;
 if coalesce(b.revision,0) is distinct from p_revision then raise exception 'branding_revision_conflict' using errcode='40001';end if;
 logo=private.consumer_ready_media(p_org,p_data->>'logo');cover=private.consumer_ready_media(p_org,p_data->>'cover');
 insert into public.company_branding(organization_id,primary_color,logo_id,cover_id,category_order,service_order) values(p_org,coalesce(p_data->>'primary_color','#193e35'),logo,cover,array(select jsonb_array_elements_text(coalesce(p_data->'category_order','[]'))),array(select jsonb_array_elements_text(coalesce(p_data->'service_order','[]'))))
 on conflict(organization_id) do update set primary_color=excluded.primary_color,logo_id=excluded.logo_id,cover_id=excluded.cover_id,category_order=excluded.category_order,service_order=excluded.service_order,revision=public.company_branding.revision+1;
end;$$;
create function public.consumer_portfolio_save(p_org uuid,p_code text,p_data jsonb) returns text language plpgsql security definer set search_path='' as $$
declare media uuid[]='{}';code text;sid uuid;result text;
begin perform private.company_lock(p_org);perform private.company_keys(p_data,array['title','description','service','position','active','format','images']);
 for code in select jsonb_array_elements_text(p_data->'images') loop media=array_append(media,private.consumer_ready_media(p_org,code));end loop;
 if p_data->>'service' is not null and p_data->>'service'<>'' then select id into sid from public.services where organization_id=p_org and private.consumer_code('s',id)=p_data->>'service';if sid is null then raise exception 'service_unavailable' using errcode='22023';end if;end if;
 if p_code is null then
 if (select count(*) from public.portfolio_items where organization_id=p_org)>=30 then raise exception 'portfolio_limit' using errcode='22023';end if;
 insert into public.portfolio_items(organization_id,title,description,service_id,position,active,format,media_ids) values(p_org,p_data->>'title',coalesce(p_data->>'description',''),sid,coalesce((p_data->>'position')::integer,0),coalesce((p_data->>'active')::boolean,true),coalesce(p_data->>'format','gallery'),media) returning public_code into result;
 else update public.portfolio_items set title=p_data->>'title',description=coalesce(p_data->>'description',''),service_id=sid,position=coalesce((p_data->>'position')::integer,0),active=coalesce((p_data->>'active')::boolean,true),format=coalesce(p_data->>'format','gallery'),media_ids=media where organization_id=p_org and public_code=p_code returning public_code into result;if result is null then raise exception 'portfolio_access_denied' using errcode='42501';end if;end if;return result;
end;$$;
create function private.consumer_design_snapshot(p_org uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('branding',coalesce((select jsonb_build_object('primary_color',b.primary_color,'logo',(select public_code from public.company_media where id=b.logo_id),'cover',(select public_code from public.company_media where id=b.cover_id),'category_order',b.category_order,'service_order',b.service_order) from public.company_branding b where organization_id=p_org),jsonb_build_object('primary_color','#193e35','category_order','[]'::jsonb,'service_order','[]'::jsonb)),
 'portfolio',coalesce((select jsonb_agg(jsonb_build_object('code',p.public_code,'title',p.title,'description',p.description,'service',case when p.service_id is null then null else private.consumer_code('s',p.service_id) end,'format',p.format,'images',(select jsonb_agg(m.public_code order by u.ordinality) from unnest(p.media_ids) with ordinality u(id,ordinality) join public.company_media m on m.id=u.id and m.organization_id=p_org and m.state='ready')) order by p.position,p.created_at) from public.portfolio_items p where p.organization_id=p_org and p.active),'[]'::jsonb));
$$;
create function public.consumer_presence_context(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if not private.company_can_manage(p_org) then raise exception 'company_admin_required' using errcode='42501';end if;
 return private.consumer_design_snapshot(p_org)||jsonb_build_object('services',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('s',id),'name',name,'category',category)) from public.services where organization_id=p_org and active),'[]'::jsonb),'revision',coalesce((select revision from public.company_branding where organization_id=p_org),0),'media',coalesce((select jsonb_agg(jsonb_build_object('code',public_code,'state',state,'mime',mime,'created_at',created_at) order by created_at desc) from public.company_media where organization_id=p_org),'[]'::jsonb),'portfolio_all',coalesce((select jsonb_agg(jsonb_build_object('code',p.public_code,'title',p.title,'description',p.description,'service',case when p.service_id is null then null else private.consumer_code('s',p.service_id) end,'position',p.position,'active',p.active,'format',p.format,'images',(select jsonb_agg(m.public_code order by u.ordinality) from unnest(p.media_ids) with ordinality u(id,ordinality) join public.company_media m on m.id=u.id)) order by p.position,p.created_at) from public.portfolio_items p where p.organization_id=p_org),'[]'::jsonb));
end;$$;
create function public.consumer_reserve_company_media(p_org uuid,p_mime text,p_size integer,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior jsonb;payload jsonb;r jsonb;a public.company_media;
begin perform private.company_lock(p_org);payload=jsonb_build_array(p_mime,p_size);prior=private.consumer_idem(p_org,'reserve_company_media',p_key,payload);if prior is not null then return prior;end if;
 if(select count(*) from public.company_media where organization_id=p_org and(state='ready' or expires_at>now()))>=150 then raise exception 'company_media_limit' using errcode='22023';end if;
 insert into public.company_media(organization_id,uploaded_by,object_path,mime,size_bytes) values(p_org,auth.uid(),p_org::text||'/'||gen_random_uuid()::text,p_mime,p_size) returning * into a;r=jsonb_build_object('code',a.public_code);perform private.consumer_remember(p_org,'reserve_company_media',p_key,payload,r);return r;
end;$$;
create function public.consumer_gateway_company_media(p_code text,p_user uuid,p_write boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.company_media;
begin perform pg_advisory_xact_lock(734921501);perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user)::text,true);select * into m from public.company_media where public_code=p_code;
 if m.id is null or not private.company_can_manage(m.organization_id) then raise exception 'company_media_access_denied' using errcode='42501';end if;
 if p_write and(m.uploaded_by<>p_user or(m.state='pending' and m.expires_at<=now())) then raise exception 'upload_expired_or_closed' using errcode='22023';end if;
 if not p_write and m.state<>'ready' then raise exception 'media_not_ready' using errcode='22023';end if;
 return jsonb_build_object('path',m.object_path,'mime',m.mime,'size',m.size_bytes,'state',m.state);
end;$$;
create function public.consumer_finalize_company_media(p_code text,p_user uuid,p_sha256 text,p_size integer,p_width integer,p_height integer) returns void language plpgsql security definer set search_path='' as $$
declare m public.company_media;
begin perform public.consumer_gateway_company_media(p_code,p_user,true);select * into m from public.company_media where public_code=p_code;if m.state='ready' then if m.sha256 is distinct from p_sha256 then raise exception 'media_already_finalized' using errcode='22023';end if;return;end if;update public.company_media set state='ready',sha256=p_sha256,size_bytes=p_size,width=p_width,height=p_height where id=m.id;end;$$;
create function public.consumer_gateway_public_media(p_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.company_media;v public.consumer_publications;
begin select * into m from public.company_media where public_code=p_code and state='ready';if m.id is null then raise exception 'public_media_unavailable' using errcode='42501';end if;
 select x.* into v from public.consumer_publications x join public.consumer_pages p on p.publication_id=x.id and p.organization_id=x.organization_id join public.organizations o on o.id=x.organization_id where p.enabled and o.status='active' and x.organization_id=m.organization_id;
 if v.id is null or not (v.payload->'branding'->>'logo'=p_code or v.payload->'branding'->>'cover'=p_code or exists(select 1 from jsonb_array_elements(coalesce(v.payload->'portfolio','[]'))w cross join lateral jsonb_array_elements_text(w->'images') i where i=p_code)) is true then raise exception 'public_media_unavailable' using errcode='42501';end if;
 return jsonb_build_object('path',m.object_path,'mime',m.mime,'size',m.size_bytes);
end;$$;
create function public.consumer_returning_profile(p_slug text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v public.consumer_publications;
begin if not private.consumer_identity() then raise exception 'consumer_session_required' using errcode='42501';end if;v=private.consumer_publication(p_slug);return(select jsonb_build_object('name',name,'whatsapp',whatsapp,'email',email) from public.customers where organization_id=v.organization_id and user_id=auth.uid());end;$$;
create function public.consumer_set_source(p_code text,p_source text,p_detail text) returns void language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);if not exists(select 1 from public.customers where id=q.customer_id and user_id=auth.uid()) then raise exception 'source_edit_denied' using errcode='42501';end if;if q.state<>'draft' then if exists(select 1 from public.opportunity_context where opportunity_id=q.opportunity_id and source=p_source and source_detail=coalesce(p_detail,'')) then return;end if;raise exception 'source_edit_denied' using errcode='42501';end if;
 insert into public.opportunity_context(organization_id,opportunity_id,source,source_detail) values(q.organization_id,q.opportunity_id,p_source,coalesce(p_detail,'')) on conflict(organization_id,opportunity_id) do update set source=excluded.source,source_detail=excluded.source_detail;end;$$;
create function public.consumer_customer_context_save(p_code text,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;r uuid;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);perform private.company_lock(q.organization_id);perform private.company_keys(p_data,array['tags','preferred_time','operational_note','origin_context','referrer_customer_id']);r=(p_data->>'referrer_customer_id')::uuid;
 insert into public.customer_context(organization_id,customer_id,tags,preferred_time,operational_note,origin_context,referrer_customer_id) values(q.organization_id,q.customer_id,array(select jsonb_array_elements_text(coalesce(p_data->'tags','[]'))),coalesce(p_data->>'preferred_time',''),coalesce(p_data->>'operational_note',''),coalesce(p_data->>'origin_context',''),r)
 on conflict(organization_id,customer_id) do update set tags=excluded.tags,preferred_time=excluded.preferred_time,operational_note=excluded.operational_note,origin_context=excluded.origin_context,referrer_customer_id=excluded.referrer_customer_id;end;$$;
create function public.consumer_work_context(p_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q public.quote_requests;
begin q=private.consumer_request(p_code);if not private.company_can_manage(q.organization_id) then raise exception 'company_admin_required' using errcode='42501';end if;
 return jsonb_build_object('request',public.consumer_request_context(p_code),'customer_context',(select to_jsonb(x)-array['id','organization_id','created_at','updated_at'] from public.customer_context x where x.customer_id=q.customer_id),'origin',(select jsonb_build_object('source',source,'detail',source_detail) from public.opportunity_context where opportunity_id=q.opportunity_id),'customer_id',q.customer_id,'request_count',(select count(*) from public.quote_requests where customer_id=q.customer_id),'referrer_options',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.customers where organization_id=q.organization_id and id<>q.customer_id),'[]'::jsonb),'next_action',case when q.state='submitted' then 'review_request' when q.state='quoted' then 'await_consumer' when q.state='approved' and not exists(select 1 from public.appointments where request_id=q.id and state='confirmed') then 'arrange_booking' else 'review_history' end);
end;$$;
alter table public.quote_requests drop constraint quote_requests_state_check;
alter table public.quote_requests add constraint quote_requests_state_check check(state in ('draft','submitted','under_review','quoted','approved','declined','cancelled'));
alter table public.request_events drop constraint request_events_event_check;
alter table public.request_events add constraint request_events_event_check check(event in ('created','submitted','under_review','quote_sent','approved','quote_declined','booked','cancelled','rescheduled','contact_revoked','link_revoked'));
create function public.consumer_mark_review(p_code text) returns void language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);perform private.company_lock(q.organization_id);if q.state='under_review' then return;end if;if q.state<>'submitted' then raise exception 'request_state_invalid' using errcode='22023';end if;update public.quote_requests set state='under_review',revision=revision+1 where id=q.id;perform private.consumer_event(q.organization_id,q.id,'under_review');end;$$;
create function public.consumer_decline_quote(p_code text,p_version text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;v public.quote_versions;payload jsonb;prior jsonb;r jsonb;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);payload=jsonb_build_array(p_code,p_version);prior=private.consumer_idem(q.organization_id,'decline',p_key,payload);if prior is not null then return prior;end if;
 select * into v from public.quote_versions where id=q.current_version_id and request_id=q.id and public_code=p_version and kind='final' and state='sent';if v.id is null or q.state not in ('quoted','declined') or(q.state='quoted' and v.expires_at<=now()) then raise exception 'quote_version_invalid' using errcode='22023';end if;
 if q.state<>'declined' then update public.quote_requests set state='declined',revision=revision+1 where id=q.id;perform private.consumer_event(q.organization_id,q.id,'quote_declined');end if;r=jsonb_build_object('code',p_code,'state','declined');perform private.consumer_remember(q.organization_id,'decline',p_key,payload,r);return r;
end;$$;

create or replace function public.consumer_publish_page(p_org uuid,p_manual uuid,p_enabled boolean,p_show_prices boolean,p_expected_revision integer) returns text language plpgsql security definer set search_path='' as $$
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
 payload=payload||private.consumer_design_snapshot(p_org);
 insert into public.consumer_publications(organization_id,manual_id,payload,show_prices,published_by) values(p_org,p_manual,payload,p_show_prices,auth.uid()) returning * into v;
 insert into public.consumer_pages(organization_id,enabled,publication_id) values(p_org,p_enabled,v.id) on conflict(organization_id) do update set enabled=excluded.enabled,publication_id=excluded.publication_id,revision=consumer_pages.revision+1;
 insert into public.schedule_resources(organization_id) values(p_org) on conflict do nothing;return v.public_code;
end;$$;

create or replace function public.consumer_send_quote(p_code text,p_items jsonb,p_duration integer,p_expires timestamptz,p_expected_revision integer,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;v public.quote_versions;i jsonb;pos integer=0;total bigint=0;payload jsonb;prior jsonb;r jsonb;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);perform private.company_lock(q.organization_id);
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

create or replace function public.consumer_request_slots(p_code text,p_day date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q public.quote_requests;v public.consumer_publications;c jsonb;minutes integer;ignore_id uuid;r jsonb;
begin q=private.consumer_request(p_code,true);v=private.consumer_publication((select slug from public.organizations where id=q.organization_id));c=private.consumer_selection(q.publication_id,q.service_code,q.addon_codes,q.answers);
 if q.state not in ('submitted','under_review','quoted','approved') then return '[]'::jsonb;end if;
 if q.accepted_version_id is not null then select duration_minutes into minutes from public.quote_versions where id=q.accepted_version_id;elsif q.state in ('submitted','under_review') and (c->>'direct_booking')::boolean and c->>'price_mode'='fixed' and v.id=q.publication_id then minutes=(c->>'duration_minutes')::integer;else return '[]'::jsonb;end if;
 select id into ignore_id from public.appointments where request_id=q.id and state='confirmed';
 select coalesce(jsonb_agg(x),'[]'::jsonb) into r from generate_series(p_day::timestamp at time zone(v.payload->>'timezone'),(p_day+1)::timestamp at time zone(v.payload->>'timezone')-interval '15 minutes',interval '15 minutes')x where private.consumer_slot_allowed(v.id,x,minutes,ignore_id);return r;
end;$$;

create or replace function public.consumer_book(p_code text,p_start timestamptz,p_previous text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;v public.consumer_publications;c jsonb;s public.schedule_resources;a public.appointments;minutes integer;payload jsonb;prior jsonb;r jsonb;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);payload=jsonb_build_array(p_code,p_start,p_previous);prior=private.consumer_idem(q.organization_id,'book',p_key,payload);if prior is not null then return prior;end if;
 v=private.consumer_publication((select slug from public.organizations where id=q.organization_id));c=private.consumer_selection(q.publication_id,q.service_code,q.addon_codes,q.answers);select * into s from public.schedule_resources where organization_id=q.organization_id;
 if q.state not in ('submitted','under_review','quoted','approved') then raise exception 'request_not_submitted' using errcode='22023';end if;
 if q.accepted_version_id is not null then select duration_minutes into minutes from public.quote_versions where id=q.accepted_version_id;elsif q.state in ('submitted','under_review') and (c->>'direct_booking')::boolean and c->>'price_mode'='fixed' and q.publication_id=v.id then minutes=(c->>'duration_minutes')::integer;else raise exception 'booking_requires_approved_quote' using errcode='22023';end if;
 if p_previous is not null then select * into a from public.appointments where request_id=q.id and public_code=p_previous and state='confirmed';if a.id is null or a.starts_at<now()+make_interval(mins=>s.cancel_minutes) then raise exception 'reschedule_not_allowed' using errcode='22023';end if;end if;
 if not private.consumer_slot_allowed(v.id,p_start,minutes,a.id) then raise exception 'slot_unavailable' using errcode='23P01';end if;
 if a.id is null then insert into public.appointments(organization_id,resource_id,kind,request_id,customer_id,starts_at,ends_at) values(q.organization_id,s.id,'booking',q.id,q.customer_id,p_start,p_start+make_interval(mins=>minutes+s.buffer_minutes)) returning * into a;perform private.consumer_event(q.organization_id,q.id,'booked');
 else update public.appointments set starts_at=p_start,ends_at=p_start+make_interval(mins=>minutes+s.buffer_minutes) where id=a.id returning * into a;perform private.consumer_event(q.organization_id,q.id,'rescheduled');end if;
 update public.opportunities set stage='contracted' where id=q.opportunity_id;r=jsonb_build_object('code',a.public_code,'starts_at',a.starts_at,'ends_at',a.ends_at);perform private.consumer_remember(q.organization_id,'book',p_key,payload,r);return r;
end;$$;

alter table public.company_media enable row level security;
alter table public.company_media force row level security;
revoke all on public.company_media from public,anon,authenticated;
grant select on public.company_media to authenticated;
create policy company_media_read on public.company_media for select to authenticated using(private.company_can_manage(organization_id));
create trigger company_media_audit after insert or update or delete on public.company_media for each row execute function private.company_audit();
create trigger company_media_updated before update on public.company_media for each row execute function private.set_updated_at();

alter table public.company_branding enable row level security;
alter table public.company_branding force row level security;
revoke all on public.company_branding from public,anon,authenticated;
grant select on public.company_branding to authenticated;
create policy company_branding_read on public.company_branding for select to authenticated using(private.company_can_manage(organization_id));
create trigger company_branding_audit after insert or update or delete on public.company_branding for each row execute function private.company_audit();
create trigger company_branding_updated before update on public.company_branding for each row execute function private.set_updated_at();

alter table public.portfolio_items enable row level security;
alter table public.portfolio_items force row level security;
revoke all on public.portfolio_items from public,anon,authenticated;
grant select on public.portfolio_items to authenticated;
create policy portfolio_items_read on public.portfolio_items for select to authenticated using(private.company_can_manage(organization_id));
create trigger portfolio_items_audit after insert or update or delete on public.portfolio_items for each row execute function private.company_audit();
create trigger portfolio_items_updated before update on public.portfolio_items for each row execute function private.set_updated_at();

alter table public.customer_context enable row level security;
alter table public.customer_context force row level security;
revoke all on public.customer_context from public,anon,authenticated;
grant select on public.customer_context to authenticated;
create policy customer_context_read on public.customer_context for select to authenticated using(private.company_can_manage(organization_id));
create trigger customer_context_audit after insert or update or delete on public.customer_context for each row execute function private.company_audit();
create trigger customer_context_updated before update on public.customer_context for each row execute function private.set_updated_at();

alter table public.opportunity_context enable row level security;
alter table public.opportunity_context force row level security;
revoke all on public.opportunity_context from public,anon,authenticated;
grant select on public.opportunity_context to authenticated;
create policy opportunity_context_read on public.opportunity_context for select to authenticated using(private.company_can_manage(organization_id));
create trigger opportunity_context_audit after insert or update or delete on public.opportunity_context for each row execute function private.company_audit();
create trigger opportunity_context_updated before update on public.opportunity_context for each row execute function private.set_updated_at();

revoke all on function private.consumer_portfolio_media_guard() from public,anon,authenticated;
revoke all on function private.consumer_ready_media(uuid,text) from public,anon,authenticated;
revoke all on function public.consumer_branding_save(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.consumer_branding_save(uuid,integer,jsonb) to authenticated;
revoke all on function public.consumer_portfolio_save(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.consumer_portfolio_save(uuid,text,jsonb) to authenticated;
revoke all on function private.consumer_design_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.consumer_presence_context(uuid) from public,anon,authenticated;
grant execute on function public.consumer_presence_context(uuid) to authenticated;
revoke all on function public.consumer_reserve_company_media(uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.consumer_reserve_company_media(uuid,text,integer,uuid) to authenticated;
revoke all on function public.consumer_gateway_company_media(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.consumer_gateway_company_media(text,uuid,boolean) to service_role;
revoke all on function public.consumer_finalize_company_media(text,uuid,text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.consumer_finalize_company_media(text,uuid,text,integer,integer,integer) to service_role;
revoke all on function public.consumer_gateway_public_media(text) from public,anon,authenticated;
grant execute on function public.consumer_gateway_public_media(text) to service_role;
revoke all on function public.consumer_returning_profile(text) from public,anon,authenticated;
grant execute on function public.consumer_returning_profile(text) to authenticated;
revoke all on function public.consumer_set_source(text,text,text) from public,anon,authenticated;
grant execute on function public.consumer_set_source(text,text,text) to authenticated;
revoke all on function public.consumer_customer_context_save(text,jsonb) from public,anon,authenticated;
grant execute on function public.consumer_customer_context_save(text,jsonb) to authenticated;
revoke all on function public.consumer_work_context(text) from public,anon,authenticated;
grant execute on function public.consumer_work_context(text) to authenticated;
revoke all on function public.consumer_mark_review(text) from public,anon,authenticated;
grant execute on function public.consumer_mark_review(text) to authenticated;
revoke all on function public.consumer_decline_quote(text,text,uuid) from public,anon,authenticated;
grant execute on function public.consumer_decline_quote(text,text,uuid) to authenticated;
commit;

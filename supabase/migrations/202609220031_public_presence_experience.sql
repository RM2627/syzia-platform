-- Scoped correction after 030. See docs/presence-correction/backend-decision.md.
begin;
alter table public.company_branding drop constraint company_branding_primary_color_check;
alter table public.company_branding add constraint company_branding_primary_color_check check(primary_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.services add column image_media_id uuid;
alter table public.services add foreign key(organization_id,image_media_id) references public.company_media(organization_id,id);
-- Preserve the existing URL fallback and all old service records.
do $$declare d text;begin
 d=pg_get_functiondef('private.v029_company_save(uuid,text,uuid,integer,jsonb)'::regprocedure);
 execute replace(d,'FUNCTION private.v029_company_save(', 'FUNCTION private.v030_company_save(');
end;$$;
create or replace function private.v029_company_save(p_org uuid,p_entity text,p_id uuid,p_expected_revision integer,p_data jsonb)returns uuid language plpgsql security definer set search_path=''as $$
declare result uuid;image_id uuid;begin
 if p_entity='service' and p_data ? 'image_media' then
 image_id=private.consumer_ready_media(p_org,p_data->>'image_media');
 result=private.v030_company_save(p_org,p_entity,p_id,p_expected_revision,(p_data-'image_media')||jsonb_build_object('image_url',''));
 update public.services set image_media_id=image_id where organization_id=p_org and id=result;
 else result=private.v030_company_save(p_org,p_entity,p_id,p_expected_revision,p_data);end if;return result;
end;$$;
-- These presentation operations honor the grants already introduced by 030.
-- Keep the shared company_lock unchanged for every other module.
create function private.presence_lock(p_org uuid,p_action text,p_expected_revision integer default null)returns void language plpgsql security definer set search_path=''as $$begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,p_action);
 if p_expected_revision is not null and not exists(select 1 from public.company_settings where organization_id=p_org and revision=p_expected_revision)then raise exception 'company_revision_conflict'using errcode='40001';end if;
end;$$;
do $$declare d text;begin
 d=pg_get_functiondef('private.v030_company_save(uuid,text,uuid,integer,jsonb)'::regprocedure);
 d=replace(d,'perform private.company_lock(p_org,p_expected_revision);','if p_entity=''service''then perform private.presence_lock(p_org,''services.manage'',p_expected_revision);else perform private.company_lock(p_org,p_expected_revision);end if;');execute d;
 d=pg_get_functiondef('private.v029_consumer_branding_save(uuid,integer,jsonb)'::regprocedure);
 d=replace(d,'perform private.company_lock(p_org);','perform private.presence_lock(p_org,''page.manage'');');execute d;
 d=pg_get_functiondef('private.v029_consumer_portfolio_save(uuid,text,jsonb)'::regprocedure);
 d=replace(d,'perform private.company_lock(p_org);','perform private.presence_lock(p_org,''portfolio.manage'');');execute d;
 d=pg_get_functiondef('private.v029_consumer_reserve_company_media(uuid,text,integer,uuid)'::regprocedure);
 d=replace(d,'perform private.company_lock(p_org);','perform private.presence_lock(p_org,case when private.permission_allowed(p_org,''portfolio.manage'')then ''portfolio.manage''when private.permission_allowed(p_org,''page.manage'')then ''page.manage''else ''services.manage''end);');execute d;
end;$$;
-- Service readers receive only the media code of their already-authorized service rows.
do $$declare d text;begin
 d=pg_get_functiondef('public.company_context(uuid)'::regprocedure);
 d=replace(d,'jsonb_agg(to_jsonb(c)order by name,id)from public.services c',
 'jsonb_agg(to_jsonb(c)||jsonb_build_object(''image_media'',(select public_code from public.company_media where id=c.image_media_id and organization_id=p_org))order by name,id)from public.services c');execute d;
end;$$;
create or replace function public.consumer_reserve_company_media(p_org uuid,p_mime text,p_size integer,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare depth_ int;result_ jsonb;begin
 depth_=private.permission_enter(p_org,case when private.permission_allowed(p_org,'portfolio.manage')then 'portfolio.manage'when private.permission_allowed(p_org,'page.manage')then 'page.manage'else 'services.manage'end);
 result_=private.v029_consumer_reserve_company_media(p_org,p_mime,p_size,p_key);perform private.permission_leave(depth_);return result_;
end;$$;
-- Retain the session-aware gateway implementation and add only service media access.
do $$declare d text;begin
 d=pg_get_functiondef('public.consumer_gateway_company_media(text,uuid,boolean)'::regprocedure);
 d=replace(d,'not(case when p_write then', 'not((private.permission_allowed(m.organization_id,''services.manage'')and m.uploaded_by=p_user)or(not p_write and private.permission_allowed(m.organization_id,''services.read'')and exists(select 1 from public.services s where s.organization_id=m.organization_id and s.image_media_id=m.id))or(case when p_write then');
 d=replace(d,'''page.read'')end)', '''page.read'')end))');execute d;
end;$$;
create function public.consumer_portfolio_delete(p_org uuid,p_code text)returns void language plpgsql security definer set search_path=''as $$begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'portfolio.manage');
 delete from public.portfolio_items where organization_id=p_org and public_code=p_code;
 if not found then raise exception 'portfolio_access_denied'using errcode='42501';end if;
 -- Published immutable snapshots and all media remain intact.
end;$$;
-- Full public drafts require the read grants for each source; no internal data is projected.
create function private.presence_require(p_org uuid)returns void language plpgsql stable security definer set search_path=''as $$begin
 perform private.permission_require(p_org,'page.read');perform private.permission_require(p_org,'services.read');
 perform private.permission_require(p_org,'portfolio.read');perform private.permission_require(p_org,'settings.read');
end;$$;
create function private.presence_payload(p_org uuid,p_show_prices boolean)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare o public.organizations;snap jsonb;payload jsonb;begin
 select * into o from public.organizations where id=p_org;
 snap=jsonb_build_object('settings',(select to_jsonb(s)from public.company_settings s where organization_id=p_org),
 'services',coalesce((select jsonb_agg(to_jsonb(s)order by name,id)from public.services s where organization_id=p_org and active),'[]'::jsonb),
 'addons',coalesce((select jsonb_agg(to_jsonb(a)order by name,id)from public.service_addons a where organization_id=p_org and active),'[]'::jsonb),
 'fields',coalesce((select jsonb_agg(to_jsonb(f)order by position,id)from public.service_intake_fields f where organization_id=p_org and active),'[]'::jsonb),
 'faqs',coalesce((select jsonb_agg(jsonb_build_object('question',question,'answer',answer)order by position,id)from public.faqs where organization_id=p_org and active),'[]'::jsonb));
 payload=jsonb_build_object('name',o.name,'slug',o.slug,'description',snap->'settings'->>'description','phone',snap->'settings'->>'public_phone','email',snap->'settings'->>'public_email','address',snap->'settings'->>'public_address','regions',snap->'settings'->>'service_regions','payments',snap->'settings'->>'payment_methods','hours',snap->'settings'->'business_hours','timezone',o.timezone,'faqs',snap->'faqs','notice_version','consumer-v1',
 'services',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('s',(s->>'id')::uuid),'name',s->>'name','category',s->>'category','description',s->>'description','image_url',s->>'image_url','image_media',(select public_code from public.company_media where organization_id=p_org and id=(s->>'image_media_id')::uuid and state='ready'),'price_mode',case when p_show_prices then s->>'price_mode' else 'quote' end,'price_cents',case when p_show_prices then s->'price_cents' else 'null'::jsonb end,'duration_minutes',s->'duration_minutes','availability',s->>'availability','quotes_allowed',s->'quotes_allowed','direct_booking',p_show_prices and (s->>'direct_booking')::boolean,
 'addons',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('a',(a->>'id')::uuid),'name',a->>'name','price_mode',case when p_show_prices then a->>'price_mode' else 'quote' end,'price_cents',case when p_show_prices then a->'price_cents' else 'null'::jsonb end,'duration_minutes',a->'duration_minutes')) from jsonb_array_elements(snap->'addons') a where a->>'service_id'=s->>'id'),'[]'::jsonb),
 'questions',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('f',(f->>'id')::uuid),'label',f->>'label','kind',f->>'kind','required',f->'required','options',f->'options') order by (f->>'position')::integer) from jsonb_array_elements(snap->'fields') f where f->>'service_id'=s->>'id'),'[]'::jsonb)) order by s->>'category',s->>'name') from jsonb_array_elements(snap->'services') s),'[]'::jsonb));
 payload=payload||private.consumer_design_snapshot(p_org);

 -- Category entities are canonical. Legacy snapshots are not changed.
 payload=jsonb_set(payload,'{branding,category_order}',coalesce((select jsonb_agg(name order by position,name,id)from public.service_categories where organization_id=p_org),'[]'::jsonb));
 return payload;
end;$$;
create function public.consumer_page_draft(p_org uuid,p_show_prices boolean default true)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare payload jsonb;page_ public.consumer_pages;pub public.consumer_publications;rules public.schedule_resources;checks jsonb;begin
 perform private.presence_require(p_org);
 if p_show_prices is null then raise exception 'invalid_company_fields';end if;
 payload=private.presence_payload(p_org,p_show_prices);
 select * into page_ from public.consumer_pages where organization_id=p_org;
 select * into pub from public.consumer_publications where id=page_.publication_id and organization_id=p_org;
 select * into rules from public.schedule_resources where organization_id=p_org;
 checks=jsonb_build_array(
 jsonb_build_object('id','company','label','Dados da empresa','required',true,'complete',length(btrim(coalesce(payload->>'description','')))>0,'href','configuracao','help','Informe uma descrição para apresentar sua empresa.'),
 jsonb_build_object('id','services','label','Serviços','required',true,'complete',jsonb_array_length(payload->'services')>0,'href','servicos','help','Cadastre e ative pelo menos um serviço.'),
 jsonb_build_object('id','prices','label','Preços ou sob consulta','required',true,'complete',not exists(select 1 from public.services where organization_id=p_org and active and price_mode<>'quote'and price_cents is null),'href','servicos','help','Informe o preço ou escolha Sob consulta.'),
 jsonb_build_object('id','hours','label','Horários','required',false,'complete',jsonb_array_length(coalesce(payload->'hours','[]'))>0,'href','configuracao#horarios','help','Opcional: informe seus horários de atendimento.'),
 jsonb_build_object('id','logo','label','Logo','required',false,'complete',payload->'branding'->>'logo'is not null,'href','pagina#identidade','help','Opcional: sua página usa o padrão quando não há logo.'),
 jsonb_build_object('id','portfolio','label','Portfólio','required',false,'complete',jsonb_array_length(payload->'portfolio')>0,'href','pagina#portfolio','help','Opcional: mostre trabalhos realizados.'),
 jsonb_build_object('id','schedule','label','Agenda online','required',false,'complete',coalesce(rules.active,false),'href','consumidor#disponibilidade','help','Opcional: configure para receber agendamentos online.'));
 return jsonb_build_object('preview',payload||jsonb_build_object('revision','draft','booking_policy',jsonb_build_object('active',coalesce(rules.active,false),'cancel_minutes',coalesce(rules.cancel_minutes,720),'lead_minutes',coalesce(rules.lead_minutes,120),'horizon_days',coalesce(rules.horizon_days,30))),
 'token',encode(extensions.digest(payload::text,'sha256'),'hex'),'page_revision',coalesce(page_.revision,0),'published',pub.id is not null,'enabled',coalesce(page_.enabled,false),'published_at',pub.created_at,'published_payload',pub.payload,'show_prices',coalesce(pub.show_prices,true),'changed',pub.payload is distinct from payload,'checklist',checks,'ready',not exists(select 1 from jsonb_array_elements(checks)x where(x->>'required')::boolean and not(x->>'complete')::boolean));
end;$$;
-- A public-content approval must not publish/change an attendant manual or disable human support.
alter table public.consumer_publications alter column manual_id drop not null;
alter table public.consumer_publications add constraint consumer_publication_source check(manual_id is not null or (jsonb_typeof(payload->'services')='array'and payload ? 'notice_version'));
create function public.consumer_publish_draft(p_org uuid,p_token text,p_show_prices boolean,p_expected_revision integer)returns text language plpgsql security definer set search_path=''as $$
declare d jsonb;payload jsonb;v public.consumer_publications;begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'page.manage');
 d=public.consumer_page_draft(p_org,p_show_prices);
 if p_expected_revision is distinct from(d->>'page_revision')::int or p_token is distinct from d->>'token'then raise exception 'page_draft_changed'using errcode='40001';end if;
 if not(d->>'ready')::boolean then raise exception 'page_not_ready'using errcode='23514';end if;
 payload=(d->'preview')-'revision'-'booking_policy';
 insert into public.consumer_publications(organization_id,manual_id,payload,show_prices,published_by)values(p_org,null,payload,p_show_prices,auth.uid())returning * into v;
 insert into public.consumer_pages(organization_id,enabled,publication_id)values(p_org,true,v.id)on conflict(organization_id)do update set enabled=true,publication_id=excluded.publication_id,revision=consumer_pages.revision+1;
 return v.public_code;
end;$$;
-- Reconstruct the frozen selection input from the same public snapshot, resolving only this tenant's immutable codes.
create function private.presence_catalog(p_org uuid,payload jsonb)returns jsonb language sql stable security definer set search_path=''as $$
 select jsonb_build_object(
 'services',coalesce((select jsonb_agg(x||jsonb_build_object('id',s.id))from jsonb_array_elements(payload->'services')x join public.services s on s.organization_id=p_org and private.consumer_code('s',s.id)=x->>'code'),'[]'::jsonb),
 'addons',coalesce((select jsonb_agg(a||jsonb_build_object('id',live.id,'service_id',s.id))from jsonb_array_elements(payload->'services')x join public.services s on s.organization_id=p_org and private.consumer_code('s',s.id)=x->>'code' cross join lateral jsonb_array_elements(x->'addons')a join public.service_addons live on live.organization_id=p_org and live.service_id=s.id and private.consumer_code('a',live.id)=a->>'code'),'[]'::jsonb),
 'fields',coalesce((select jsonb_agg(f||jsonb_build_object('id',live.id,'service_id',s.id))from jsonb_array_elements(payload->'services')x join public.services s on s.organization_id=p_org and private.consumer_code('s',s.id)=x->>'code' cross join lateral jsonb_array_elements(x->'questions')f join public.service_intake_fields live on live.organization_id=p_org and live.service_id=s.id and private.consumer_code('f',live.id)=f->>'code'),'[]'::jsonb));$$;
do $$declare d text;begin
 d=pg_get_functiondef('private.consumer_selection(uuid,text,text[],jsonb,boolean)'::regprocedure);
 d=replace(d,'select * into m from public.manual_versions where id=v.manual_id and organization_id=v.organization_id;', 'select * into m from public.manual_versions where id=v.manual_id and organization_id=v.organization_id; if v.manual_id is null then m.snapshot=private.presence_catalog(v.organization_id,v.payload);end if;');execute d;
 d=pg_get_functiondef('public.consumer_gateway_public_media(text)'::regprocedure);
 d=replace(d,'or exists(select 1 from jsonb_array_elements(coalesce(v.payload->''portfolio'',''[]''))', 'or exists(select 1 from jsonb_array_elements(v.payload->''services'')s where s->>''image_media''=p_code)or exists(select 1 from jsonb_array_elements(coalesce(v.payload->''portfolio'',''[]''))');execute d;
 -- The legacy explicit manual-publication path can also publish newly linked service images.
 d=pg_get_functiondef('private.v029_consumer_publish_page(uuid,uuid,boolean,boolean,integer)'::regprocedure);
 d=replace(d,'''image_url'',s->>''image_url''','''image_url'',s->>''image_url'',''image_media'',(select public_code from public.company_media where organization_id=p_org and id=(s->>''image_media_id'')::uuid and state=''ready'')');execute d;
 -- Keep the existing onboarding checklist and progress, recognizing the same page snapshot.
 d=pg_get_functiondef('private.onboarding_readiness(uuid)'::regprocedure);
 d=replace(d,'join public.manual_versions m on m.id=v.manual_id','left join public.manual_versions m on m.id=v.manual_id');
 d=replace(d,'m.source_revision=c.operational_revision','(m.source_revision=c.operational_revision or(v.manual_id is null and v.payload=private.presence_payload(p_org,v.show_prices)))');execute d;
end;$$;
revoke all on function private.presence_lock(uuid,text,integer),private.v030_company_save(uuid,text,uuid,integer,jsonb),private.presence_require(uuid),private.presence_payload(uuid,boolean),private.presence_catalog(uuid,jsonb)from public,anon,authenticated,service_role;
revoke all on function public.consumer_page_draft(uuid,boolean),public.consumer_publish_draft(uuid,text,boolean,integer),public.consumer_portfolio_delete(uuid,text)from public,anon,authenticated;
grant execute on function public.consumer_page_draft(uuid,boolean),public.consumer_publish_draft(uuid,text,boolean,integer),public.consumer_portfolio_delete(uuid,text)to authenticated;
commit;

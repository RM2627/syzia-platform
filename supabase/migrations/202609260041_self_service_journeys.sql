-- SYZIA 041: upgrade incremental from 040, no reset or external actions.
begin;

-- Additive metadata on existing entities. No historical row is rewritten.
alter table public.services add column contract_mode text check(contract_mode in('immediate','evaluation')),
 add column photo_policy text not null default 'none' check(photo_policy in('none','optional','recommended','required')),
 add column photo_instructions text not null default '' check(length(photo_instructions)<=1000);
alter table public.service_intake_fields add column instruction text not null default '' check(length(instruction)<=500),
 add column multiline boolean not null default false,
 add column condition_field uuid references public.service_intake_fields(id),add column condition_value jsonb;
alter table public.service_intake_fields drop constraint service_intake_fields_kind_check;
alter table public.service_intake_fields add constraint service_intake_fields_kind_check check(kind in('text','number','choice','boolean','photo'));
alter table public.quote_requests add column journey text check(journey in('direct','review')),add column desired_start timestamptz,
 add column help_only boolean not null default false,add column help_context jsonb not null default '{}',
 add column photo_requested_at timestamptz,add column photo_request text not null default '' check(length(photo_request)<=1000);
alter table public.attachments add column service_code text;
alter table public.tickets add column routing_scope text not null default 'support' check(routing_scope in('support','company')),
 add column routing_reason text not null default '';
alter table public.quote_versions add column subtotal_cents bigint check(subtotal_cents>=0),
 add column discount_cents bigint not null default 0 check(discount_cents>=0),add column desired_start timestamptz;
alter table public.quote_items add column discount_cents bigint not null default 0 check(discount_cents>=0 and discount_cents<=quantity*unit_cents),
 add column source_kind text check(source_kind in('original','service','addon','manual')),add column source_code text,
 add column public_note text not null default '' check(length(public_note)<=500);

CREATE OR REPLACE FUNCTION private.v030_company_save(p_org uuid, p_entity text, p_id uuid, p_expected_revision integer, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target uuid; old_row jsonb; candidate jsonb;
begin
 if p_expected_revision is null then raise exception 'company_revision_required' using errcode='22023'; end if;
 if p_entity='service'then perform private.presence_lock(p_org,'services.manage',p_expected_revision);else perform private.company_lock(p_org,p_expected_revision);end if;
 target=coalesce(p_id,gen_random_uuid());
 if p_entity='settings' then
  perform private.company_keys(p_data,array['legal_name','description','public_phone','public_email','public_address','service_regions','payment_methods','business_hours','human_hours','exception_contact_name','exception_contact']);
  if p_id is not null then raise exception 'invalid_company_fields' using errcode='22023'; end if;
  select to_jsonb(t) into old_row from public.company_settings t where organization_id=p_org;
  candidate=coalesce(old_row,'{}'::jsonb)||p_data;
   update public.company_settings t set legal_name=r.legal_name,description=r.description,public_phone=r.public_phone,public_email=r.public_email,public_address=r.public_address,service_regions=r.service_regions,payment_methods=r.payment_methods,business_hours=r.business_hours,human_hours=r.human_hours,exception_contact_name=r.exception_contact_name,exception_contact=r.exception_contact from jsonb_populate_record(null::public.company_settings,candidate) r where t.organization_id=p_org;
 elsif p_entity='rules' then
  perform private.company_keys(p_data,array['pricing_policy','payment_policy','cancellation_policy','rescheduling_policy','service_policy','deadlines_policy','exception_policy']);
  if p_id is not null then raise exception 'invalid_company_fields' using errcode='22023'; end if;
  select to_jsonb(t) into old_row from public.business_rules t where organization_id=p_org;
  candidate=coalesce(old_row,'{}'::jsonb)||p_data;
   update public.business_rules t set pricing_policy=r.pricing_policy,payment_policy=r.payment_policy,cancellation_policy=r.cancellation_policy,rescheduling_policy=r.rescheduling_policy,service_policy=r.service_policy,deadlines_policy=r.deadlines_policy,exception_policy=r.exception_policy from jsonb_populate_record(null::public.business_rules,candidate) r where t.organization_id=p_org;
 elsif p_entity='permissions' then
  perform private.company_keys(p_data,array['allowed_actions','never_change_price','max_discount_percent','reviewed']);
  if p_id is not null then raise exception 'invalid_company_fields' using errcode='22023'; end if;
  select to_jsonb(t) into old_row from public.attendant_permissions t where organization_id=p_org;
  candidate=coalesce(old_row,'{}'::jsonb)||p_data;
   update public.attendant_permissions t set allowed_actions=r.allowed_actions,never_change_price=r.never_change_price,max_discount_percent=r.max_discount_percent,reviewed=r.reviewed from jsonb_populate_record(null::public.attendant_permissions,candidate) r where t.organization_id=p_org;
 elsif p_entity='service' then
  perform private.company_keys(p_data,array['name','category','category_id','description','image_url','price_mode','price_cents','duration_minutes','availability','notes','active','quotes_allowed','direct_booking','contract_mode','photo_policy','photo_instructions']);
  select to_jsonb(t) into old_row from public.services t where id=p_id and organization_id=p_org;
  if p_id is not null and old_row is null then raise exception 'company_target_not_found' using errcode='22023'; end if;
  candidate=coalesce(old_row,'{"category": "", "description": "", "image_url": "", "price_mode": "quote", "price_cents": null, "duration_minutes": null, "availability": "", "notes": "", "active": true, "quotes_allowed": true, "direct_booking": false}'::jsonb)||p_data;
  if candidate->>'contract_mode'='immediate' then candidate=candidate||jsonb_build_object('direct_booking',candidate->>'price_mode'='fixed'and candidate->>'duration_minutes' is not null);elsif candidate->>'contract_mode'='evaluation'then candidate=candidate||'{"direct_booking":false,"quotes_allowed":true}';end if;
  if old_row is null then
   insert into public.services(id,organization_id,name,category,category_id,description,image_url,price_mode,price_cents,duration_minutes,availability,notes,active,quotes_allowed,direct_booking,contract_mode,photo_policy,photo_instructions) select target,p_org,r.name,r.category,r.category_id,r.description,r.image_url,r.price_mode,r.price_cents,r.duration_minutes,r.availability,r.notes,r.active,r.quotes_allowed,r.direct_booking,r.contract_mode,coalesce(r.photo_policy,'none'),coalesce(r.photo_instructions,'') from jsonb_populate_record(null::public.services,candidate) r;
  else
   update public.services t set name=r.name,category=r.category,category_id=r.category_id,description=r.description,image_url=r.image_url,price_mode=r.price_mode,price_cents=r.price_cents,duration_minutes=r.duration_minutes,availability=r.availability,notes=r.notes,active=r.active,quotes_allowed=r.quotes_allowed,direct_booking=r.direct_booking,contract_mode=r.contract_mode,photo_policy=coalesce(r.photo_policy,'none'),photo_instructions=coalesce(r.photo_instructions,'') from jsonb_populate_record(null::public.services,candidate) r where t.organization_id=p_org and t.id=p_id;
  end if;
 elsif p_entity='addon' then
  perform private.company_keys(p_data,array['service_id','name','price_mode','price_cents','duration_minutes','active']);
  select to_jsonb(t) into old_row from public.service_addons t where id=p_id and organization_id=p_org;
  if p_id is not null and old_row is null then raise exception 'company_target_not_found' using errcode='22023'; end if;
  candidate=coalesce(old_row,'{"price_mode": "quote", "price_cents": null, "duration_minutes": 0, "active": true}'::jsonb)||p_data;
  if old_row is null then
   insert into public.service_addons(id,organization_id,service_id,name,price_mode,price_cents,duration_minutes,active) select target,p_org,r.service_id,r.name,r.price_mode,r.price_cents,r.duration_minutes,r.active from jsonb_populate_record(null::public.service_addons,candidate) r;
  else
   update public.service_addons t set service_id=r.service_id,name=r.name,price_mode=r.price_mode,price_cents=r.price_cents,duration_minutes=r.duration_minutes,active=r.active from jsonb_populate_record(null::public.service_addons,candidate) r where t.organization_id=p_org and t.id=p_id;
  end if;
 elsif p_entity='field' then
  perform private.company_keys(p_data,array['service_id','label','kind','required','options','position','active','instruction','multiline','condition_field','condition_value']);
  select to_jsonb(t) into old_row from public.service_intake_fields t where id=p_id and organization_id=p_org;
  if p_id is not null and old_row is null then raise exception 'company_target_not_found' using errcode='22023'; end if;
  candidate=coalesce(old_row,'{"kind": "text", "required": true, "options": [], "position": 0, "active": true}'::jsonb)||p_data;
  if candidate->>'condition_field' is not null and not exists(select 1 from public.service_intake_fields f where f.id=(candidate->>'condition_field')::uuid and f.id<>target and f.organization_id=p_org and f.service_id=(candidate->>'service_id')::uuid and f.active and f.condition_field is null and f.kind in('boolean','choice')and case when f.kind='boolean'then jsonb_typeof(candidate->'condition_value')='boolean'else (candidate->'condition_value')in(select value from jsonb_array_elements(f.options))end)then raise exception 'invalid_question_condition'using errcode='22023';end if;
  if old_row is null then
   insert into public.service_intake_fields(id,organization_id,service_id,label,kind,required,options,position,active,instruction,multiline,condition_field,condition_value) select target,p_org,r.service_id,r.label,r.kind,r.required,r.options,r.position,r.active,coalesce(r.instruction,''),coalesce(r.multiline,false),r.condition_field,r.condition_value from jsonb_populate_record(null::public.service_intake_fields,candidate) r;
  else
   update public.service_intake_fields t set service_id=r.service_id,label=r.label,kind=r.kind,required=r.required,options=r.options,position=r.position,active=r.active,instruction=coalesce(r.instruction,''),multiline=coalesce(r.multiline,false),condition_field=r.condition_field,condition_value=r.condition_value from jsonb_populate_record(null::public.service_intake_fields,candidate) r where t.organization_id=p_org and t.id=p_id;
  end if;
 elsif p_entity='faq' then
  perform private.company_keys(p_data,array['question','answer','active','position']);
  select to_jsonb(t) into old_row from public.faqs t where id=p_id and organization_id=p_org;
  if p_id is not null and old_row is null then raise exception 'company_target_not_found' using errcode='22023'; end if;
  candidate=coalesce(old_row,'{"active": true, "position": 0}'::jsonb)||p_data;
  if old_row is null then
   insert into public.faqs(id,organization_id,question,answer,active,position) select target,p_org,r.question,r.answer,r.active,r.position from jsonb_populate_record(null::public.faqs,candidate) r;
  else
   update public.faqs t set question=r.question,answer=r.answer,active=r.active,position=r.position from jsonb_populate_record(null::public.faqs,candidate) r where t.organization_id=p_org and t.id=p_id;
  end if;
 elsif p_entity='reply' then
  perform private.company_keys(p_data,array['title','body','active']);
  select to_jsonb(t) into old_row from public.quick_replies t where id=p_id and organization_id=p_org;
  if p_id is not null and old_row is null then raise exception 'company_target_not_found' using errcode='22023'; end if;
  candidate=coalesce(old_row,'{"active": true}'::jsonb)||p_data;
  if old_row is null then
   insert into public.quick_replies(id,organization_id,title,body,active) select target,p_org,r.title,r.body,r.active from jsonb_populate_record(null::public.quick_replies,candidate) r;
  else
   update public.quick_replies t set title=r.title,body=r.body,active=r.active from jsonb_populate_record(null::public.quick_replies,candidate) r where t.organization_id=p_org and t.id=p_id;
  end if;
 elsif p_entity='section' then
  perform private.company_keys(p_data,array['content']);
  select to_jsonb(t) into old_row from public.manual_sections t where id=p_id and organization_id=p_org;
  if p_id is not null and old_row is null then raise exception 'company_target_not_found' using errcode='22023'; end if;
  if old_row is null then raise exception 'company_target_not_found' using errcode='22023'; end if;
  candidate=coalesce(old_row,'{}'::jsonb)||p_data;
  if old_row is null then
   insert into public.manual_sections(id,organization_id,content) select target,p_org,r.content from jsonb_populate_record(null::public.manual_sections,candidate) r;
  else
   update public.manual_sections t set content=r.content from jsonb_populate_record(null::public.manual_sections,candidate) r where t.organization_id=p_org and t.id=p_id;
  end if;
 else raise exception 'invalid_company_entity' using errcode='22023';
 end if;
 perform private.company_touch(p_org,p_entity<>'section');
 return case when p_entity in ('settings','rules','permissions') then p_org else target end;
end; $function$;

CREATE OR REPLACE FUNCTION private.presence_payload(p_org uuid, p_show_prices boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.organizations;snap jsonb;payload jsonb;begin
 select * into o from public.organizations where id=p_org;
 snap=jsonb_build_object('settings',(select to_jsonb(s)from public.company_settings s where organization_id=p_org),
 'services',coalesce((select jsonb_agg(to_jsonb(s)order by name,id)from public.services s where organization_id=p_org and active),'[]'::jsonb),
 'addons',coalesce((select jsonb_agg(to_jsonb(a)order by name,id)from public.service_addons a where organization_id=p_org and active),'[]'::jsonb),
 'fields',coalesce((select jsonb_agg(to_jsonb(f)order by position,id)from public.service_intake_fields f where organization_id=p_org and active),'[]'::jsonb),
 'faqs',coalesce((select jsonb_agg(jsonb_build_object('question',question,'answer',answer)order by position,id)from public.faqs where organization_id=p_org and active),'[]'::jsonb));
 payload=jsonb_build_object('name',o.name,'slug',o.slug,'description',snap->'settings'->>'description','phone',snap->'settings'->>'public_phone','email',snap->'settings'->>'public_email','address',snap->'settings'->>'public_address','regions',snap->'settings'->>'service_regions','payments',snap->'settings'->>'payment_methods','hours',snap->'settings'->'business_hours','timezone',o.timezone,'faqs',snap->'faqs','public_information',jsonb_build_object('service',coalesce((select service_policy from public.business_rules where organization_id=p_org),''),'cancellation',coalesce((select cancellation_policy from public.business_rules where organization_id=p_org),''),'rescheduling',coalesce((select rescheduling_policy from public.business_rules where organization_id=p_org),'')),'quick_replies',coalesce((select jsonb_agg(jsonb_build_object('title',title,'body',body))from public.quick_replies where organization_id=p_org and active),'[]'),'notice_version','consumer-v1',
 'services',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('s',(s->>'id')::uuid),'name',s->>'name','category',s->>'category','description',s->>'description','image_url',s->>'image_url','image_media',(select public_code from public.company_media where organization_id=p_org and id=(s->>'image_media_id')::uuid and state='ready'),'price_mode',case when p_show_prices then s->>'price_mode' else 'quote' end,'price_cents',case when p_show_prices then s->'price_cents' else 'null'::jsonb end,'duration_minutes',s->'duration_minutes','contract_mode',coalesce(s->>'contract_mode',case when(s->>'direct_booking')::boolean then 'immediate'else 'evaluation'end),'photo_policy',coalesce(s->>'photo_policy','none'),'photo_instructions',coalesce(s->>'photo_instructions',''),'availability',s->>'availability','quotes_allowed',s->'quotes_allowed','direct_booking',p_show_prices and (s->>'direct_booking')::boolean,
 'addons',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('a',(a->>'id')::uuid),'name',a->>'name','price_mode',case when p_show_prices then a->>'price_mode' else 'quote' end,'price_cents',case when p_show_prices then a->'price_cents' else 'null'::jsonb end,'duration_minutes',a->'duration_minutes')) from jsonb_array_elements(snap->'addons') a where a->>'service_id'=s->>'id'),'[]'::jsonb),
 'questions',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('f',(f->>'id')::uuid),'label',f->>'label','instruction',coalesce(f->>'instruction',''),'multiline',coalesce((f->>'multiline')::boolean,false),'condition_field',case when f->>'condition_field' is not null then private.consumer_code('f',(f->>'condition_field')::uuid)end,'condition_value',f->'condition_value','kind',f->>'kind','required',f->'required','options',f->'options') order by (f->>'position')::integer) from jsonb_array_elements(snap->'fields') f where f->>'service_id'=s->>'id'),'[]'::jsonb)) order by s->>'category',s->>'name') from jsonb_array_elements(snap->'services') s),'[]'::jsonb));
 payload=payload||private.consumer_design_snapshot(p_org);

 -- Category entities are canonical. Legacy snapshots are not changed.
 payload=jsonb_set(payload,'{branding,category_order}',coalesce((select jsonb_agg(name order by position,name,id)from public.service_categories where organization_id=p_org),'[]'::jsonb));
 return payload;
end;$function$;

CREATE OR REPLACE FUNCTION private.v029_consumer_publish_page(p_org uuid, p_manual uuid, p_enabled boolean, p_show_prices boolean, p_expected_revision integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.manual_versions;o public.organizations;p public.consumer_pages;v public.consumer_publications;payload jsonb;
begin perform private.company_lock(p_org);if p_enabled is null or p_show_prices is null or p_expected_revision is null then raise exception 'invalid_company_fields' using errcode='22023';end if;
 select * into p from public.consumer_pages where organization_id=p_org;
 if coalesce(p.revision,0)<>p_expected_revision then raise exception 'company_revision_conflict' using errcode='40001';end if;
 select * into m from public.manual_versions where id=p_manual and organization_id=p_org and status='published';if m.id is null then raise exception 'company_published_manual_required' using errcode='23514';end if;
 select * into o from public.organizations where id=p_org;
 payload=jsonb_build_object('name',o.name,'slug',o.slug,'description',m.snapshot->'settings'->>'description','phone',m.snapshot->'settings'->>'public_phone','email',m.snapshot->'settings'->>'public_email','address',m.snapshot->'settings'->>'public_address','regions',m.snapshot->'settings'->>'service_regions','payments',m.snapshot->'settings'->>'payment_methods','hours',m.snapshot->'settings'->'business_hours','timezone',o.timezone,'faqs',m.snapshot->'faqs','public_information',jsonb_build_object('service',coalesce((select service_policy from public.business_rules where organization_id=p_org),''),'cancellation',coalesce((select cancellation_policy from public.business_rules where organization_id=p_org),''),'rescheduling',coalesce((select rescheduling_policy from public.business_rules where organization_id=p_org),'')),'quick_replies',coalesce((select jsonb_agg(jsonb_build_object('title',title,'body',body))from public.quick_replies where organization_id=p_org and active),'[]'),'notice_version','consumer-v1',
 'services',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('s',(s->>'id')::uuid),'name',s->>'name','category',s->>'category','description',s->>'description','image_url',s->>'image_url','image_media',(select public_code from public.company_media where organization_id=p_org and id=(s->>'image_media_id')::uuid and state='ready'),'price_mode',case when p_show_prices then s->>'price_mode' else 'quote' end,'price_cents',case when p_show_prices then s->'price_cents' else 'null'::jsonb end,'duration_minutes',s->'duration_minutes','contract_mode',coalesce(s->>'contract_mode',case when(s->>'direct_booking')::boolean then 'immediate'else 'evaluation'end),'photo_policy',coalesce(s->>'photo_policy','none'),'photo_instructions',coalesce(s->>'photo_instructions',''),'availability',s->>'availability','quotes_allowed',s->'quotes_allowed','direct_booking',p_show_prices and (s->>'direct_booking')::boolean,
 'addons',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('a',(a->>'id')::uuid),'name',a->>'name','price_mode',case when p_show_prices then a->>'price_mode' else 'quote' end,'price_cents',case when p_show_prices then a->'price_cents' else 'null'::jsonb end,'duration_minutes',a->'duration_minutes')) from jsonb_array_elements(m.snapshot->'addons') a where a->>'service_id'=s->>'id'),'[]'::jsonb),
 'questions',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('f',(f->>'id')::uuid),'label',f->>'label','instruction',coalesce(f->>'instruction',''),'multiline',coalesce((f->>'multiline')::boolean,false),'condition_field',case when f->>'condition_field' is not null then private.consumer_code('f',(f->>'condition_field')::uuid)end,'condition_value',f->'condition_value','kind',f->>'kind','required',f->'required','options',f->'options') order by (f->>'position')::integer) from jsonb_array_elements(m.snapshot->'fields') f where f->>'service_id'=s->>'id'),'[]'::jsonb)) order by s->>'category',s->>'name') from jsonb_array_elements(m.snapshot->'services') s),'[]'::jsonb));
 payload=payload||private.consumer_design_snapshot(p_org);
 insert into public.consumer_publications(organization_id,manual_id,payload,show_prices,published_by) values(p_org,p_manual,payload,p_show_prices,auth.uid()) returning * into v;
 insert into public.consumer_pages(organization_id,enabled,publication_id) values(p_org,p_enabled,v.id) on conflict(organization_id) do update set enabled=excluded.enabled,publication_id=excluded.publication_id,revision=consumer_pages.revision+1;
 insert into public.schedule_resources(organization_id) values(p_org) on conflict do nothing;return v.public_code;
end;$function$;

CREATE OR REPLACE FUNCTION private.consumer_selection(p_publication uuid, p_service text, p_addons text[], p_answers jsonb, p_validate boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.consumer_publications;m public.manual_versions;s jsonb;a jsonb;f jsonb;answer_value jsonb;items jsonb='[]';total bigint=0;duration integer=0;mode text='fixed';sid uuid;codes text[]='{}';key text;
begin select * into v from public.consumer_publications where id=p_publication;select * into m from public.manual_versions where id=v.manual_id and organization_id=v.organization_id; if v.manual_id is null then m.snapshot=private.presence_catalog(v.organization_id,v.payload);end if;
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
   key=private.consumer_code('f',(f->>'id')::uuid);codes=array_append(codes,key);answer_value=p_answers->key; if f->>'kind'='photo'then if answer_value is not null then raise exception 'photo_answer_requires_attachment'using errcode='22023';end if;continue;end if; if f->>'condition_field' is not null and p_answers->(case when f->>'condition_field' like 'f_%'then f->>'condition_field'else private.consumer_code('f',(f->>'condition_field')::uuid)end)is distinct from f->'condition_value'then if answer_value is not null and answer_value<>'null'then raise exception 'inactive_question_answer'using errcode='22023';end if;continue;end if;
   if answer_value is null or answer_value='null'::jsonb or answer_value='""'::jsonb or (jsonb_typeof(answer_value)='string' and btrim(answer_value#>>'{}')='') then if (f->>'required')::boolean then raise exception 'required_answer' using errcode='22023';end if;continue;end if;
   if (f->>'kind'='text' and (jsonb_typeof(answer_value)<>'string' or length(answer_value#>>'{}')>2000)) or(f->>'kind'='number' and (jsonb_typeof(answer_value)<>'number' or abs((answer_value#>>'{}')::numeric)>100000000)) or(f->>'kind'='boolean' and jsonb_typeof(answer_value)<>'boolean') or(f->>'kind'='choice' and not exists(select 1 from jsonb_array_elements(f->'options')opt where opt=answer_value)) then raise exception 'invalid_answer' using errcode='22023';end if;
  end loop;
  if (p_answers-codes)<>'{}'::jsonb then raise exception 'unknown_answer' using errcode='22023';end if;
 end if;
 return jsonb_build_object('service_id',sid,'items',items,'total_cents',total,'price_mode',mode,'duration_minutes',duration,'direct_booking',v.show_prices and mode='fixed'and duration>0 and coalesce(s->>'contract_mode',case when(s->>'direct_booking')::boolean then 'immediate'else 'evaluation'end)='immediate','quotes_allowed',(s->>'quotes_allowed')::boolean);
end;$function$;

CREATE OR REPLACE FUNCTION private.journey_selection(p_publication uuid, p_items jsonb, p_validate boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.consumer_publications;entry jsonb;calc jsonb;service jsonb;pair jsonb;items jsonb='[]';original jsonb='[]';alerts jsonb='[]';codes text[]='{}';total bigint=0;duration integer=0;mode text='fixed';direct boolean=true;sid uuid;begin
 select * into v from public.consumer_publications where id=p_publication;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)not between 1 and 10 then raise exception 'invalid_request_items'using errcode='22023';end if;
 for entry in select value from jsonb_array_elements(p_items)loop
   perform private.company_keys(entry,array['service','addons','answers','notes']);
   if entry->>'service' is null or (entry->>'service')=any(codes)or jsonb_typeof(entry->'addons')is distinct from 'array' or jsonb_typeof(entry->'answers')is distinct from 'object' or (entry ? 'notes' and jsonb_typeof(entry->'notes')is distinct from 'string')or length(coalesce(entry->>'notes',''))>2000 then raise exception 'invalid_request_items'using errcode='22023';end if;
   calc=private.consumer_selection(p_publication,entry->>'service',array(select jsonb_array_elements_text(entry->'addons')),entry->'answers',p_validate);
   if not(calc->>'quotes_allowed')::boolean and not(calc->>'direct_booking')::boolean then raise exception 'service_unavailable'using errcode='22023';end if;
   select value into service from jsonb_array_elements(v.payload->'services')where value->>'code'=entry->>'service';
   sid=coalesce(sid,(calc->>'service_id')::uuid);codes=array_append(codes,entry->>'service');
   original=original||jsonb_build_array(entry||jsonb_build_object('name',service->>'name','availability',service->>'availability','priced_items',(select jsonb_agg((x.value-'unit_cents')||jsonb_build_object('position',jsonb_array_length(items)+x.n-1))from jsonb_array_elements(calc->'items')with ordinality x(value,n)),'price_mode',calc->'price_mode','duration_minutes',calc->'duration_minutes',
     'answer_labels',coalesce((select jsonb_agg(jsonb_build_object('label',f->>'label','answer',entry->'answers'->(f->>'code')))from jsonb_array_elements(service->'questions')f),'[]'::jsonb)));
   items=items||(calc->'items');total=total+(calc->>'total_cents')::bigint;duration=duration+(calc->>'duration_minutes')::integer;
   direct=direct and (calc->>'direct_booking')::boolean;
   if calc->>'price_mode'='quote' then mode='quote';elsif calc->>'price_mode'='from'and mode<>'quote'then mode='from';end if;
 end loop;
 if jsonb_array_length(items)>30 then raise exception 'request_item_limit'using errcode='22023';end if;
 -- Transitive inclusion is directional. Never silently drop the consumer's selection.
 if exists(with recursive reach(a,b)as(
   select r->>'source',r->>'target'from jsonb_array_elements(coalesce(v.payload->'relations','[]'))r where r->>'kind'='includes'
   union select reach.a,r->>'target'from reach join jsonb_array_elements(coalesce(v.payload->'relations','[]'))r on r->>'source'=reach.b where r->>'kind'='includes')select 1 from reach where a=any(codes)and b=any(codes))then raise exception 'service_already_included'using errcode='22023';end if;
 for pair in select value from jsonb_array_elements(coalesce(v.payload->'relations','[]'))where value->>'source'=any(codes)and value->>'target'=any(codes)loop
   if pair->>'kind'='incompatible'then raise exception 'services_incompatible'using errcode='22023';end if;
   if pair->>'kind'='review'then alerts=alerts||jsonb_build_array(pair||jsonb_build_object('source_name',(select x->>'name'from jsonb_array_elements(original)x where x->>'service'=pair->>'source'),'target_name',(select x->>'name'from jsonb_array_elements(original)x where x->>'service'=pair->>'target')));end if;
 end loop;
 if mode<>'fixed'then direct=false;end if; if mode='quote'or jsonb_array_length(alerts)>0 then mode='quote';total=null;direct=false;end if;
 return jsonb_build_object('service_id',sid,'items',items,'total_cents',total,'price_mode',mode,'duration_minutes',duration,'direct_booking',direct,'quotes_allowed',true,'requested_items',original,'review_alerts',alerts);
end;$function$;

create or replace function private.consumer_multi_selection(p_publication uuid,p_items jsonb)returns jsonb language sql stable security definer set search_path=''as $$select private.journey_selection(p_publication,p_items,true);$$;

CREATE OR REPLACE FUNCTION private.consumer_original_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$begin
 if old.state='draft'and old.help_only and old.requested_items is null and not new.help_only then return new;end if; if new.requested_items is distinct from old.requested_items or new.review_alerts is distinct from old.review_alerts then raise exception 'original_request_immutable'using errcode='23514';end if;return new;
end;$function$;

CREATE OR REPLACE FUNCTION public.consumer_reserve_attachment(p_code text, p_mime text, p_size integer, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quote_requests;a public.attachments;payload jsonb;prior jsonb;r jsonb;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);payload=jsonb_build_array(p_code,p_mime,p_size);prior=private.consumer_idem(q.organization_id,'reserve_attachment',p_key,payload);if prior is not null then return prior;end if;
 if q.state not in('draft','submitted','under_review','quoted','declined') then raise exception 'attachments_closed' using errcode='22023';end if;
 if (select count(*) from public.attachments where request_id=q.id and (state='ready' or(state='pending' and expires_at>now())))>=5 then raise exception 'attachment_limit' using errcode='22023';end if;
 insert into public.attachments(organization_id,request_id,uploaded_by,object_path,mime,size_bytes) values(q.organization_id,q.id,auth.uid(),q.organization_id::text||'/'||q.id::text||'/'||gen_random_uuid()::text,p_mime,p_size) returning * into a;
 r=jsonb_build_object('code',a.public_code);perform private.consumer_remember(q.organization_id,'reserve_attachment',p_key,payload,r);return r;
end;$function$;

CREATE OR REPLACE FUNCTION public.consumer_gateway_attachment(p_code text, p_user uuid, p_write boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.attachments;q public.quote_requests;
begin perform pg_advisory_xact_lock(734921501);perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'session_id',case when auth.uid()=p_user then auth.jwt()->>'session_id' else null end)::text,true);
 select * into a from public.attachments where public_code=p_code;
 if a.id is null or not (private.consumer_access(a.request_id,p_write) or(not p_write and private.central_attachment_access(a.request_id))) then raise exception 'attachment_access_denied' using errcode='42501';end if;
 select * into q from public.quote_requests where id=a.request_id;
 if p_write and (a.state not in ('pending','ready') or(a.state='pending' and a.expires_at<=now()) or q.state not in('draft','submitted','under_review','quoted','declined') or a.uploaded_by<>p_user) then raise exception 'upload_expired_or_closed' using errcode='22023';end if;
 if not p_write and a.state<>'ready' then raise exception 'attachment_not_ready' using errcode='22023';end if;
 return jsonb_build_object('path',a.object_path,'mime',a.mime,'size',a.size_bytes,'state',a.state);
end;$function$;

CREATE OR REPLACE FUNCTION public.consumer_submit_request(p_code text, p_attachment_count integer, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quote_requests;prior jsonb;payload jsonb;result jsonb;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);payload=jsonb_build_object('code',p_code,'attachments',p_attachment_count);prior=private.consumer_idem(q.organization_id,'submit',p_key,payload);if prior is not null then return prior;end if;
 if q.state<>'draft' then raise exception 'request_state_changed' using errcode='22023';end if;
 if not exists(select 1 from public.consumer_pages where organization_id=q.organization_id and enabled and publication_id=q.publication_id) then raise exception 'published_price_changed' using errcode='40001';end if;
 perform private.consumer_request_selection(q);perform private.journey_require_photos(q);
 if p_attachment_count is null or p_attachment_count not between 0 and 5 or p_attachment_count<>(select count(*) from public.attachments where request_id=q.id and state='ready') then raise exception 'attachment_incomplete' using errcode='22023';end if;
 update public.quote_requests set state='submitted',revision=revision+1 where id=q.id;perform private.consumer_event(q.organization_id,q.id,'submitted');result=jsonb_build_object('code',p_code,'state','submitted');perform private.consumer_remember(q.organization_id,'submit',p_key,payload,result);return result;
end;$function$;

CREATE OR REPLACE FUNCTION private.central_on_submit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin if old.state='draft' and new.state='submitted' and (new.journey is distinct from 'direct') and exists(select 1 from public.company_settings where organization_id=new.organization_id and(human_enabled or private.people_solo_conversation(new.organization_id))) then perform private.central_open(new.id);end if;return new;end;$function$;

CREATE OR REPLACE FUNCTION private.central_open(p_request uuid)
 RETURNS tickets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quote_requests;t public.tickets;previous uuid;
begin select * into q from public.quote_requests where id=p_request;
 if q.id is null or (q.state='draft'and not q.help_only) or not exists(select 1 from public.organizations o join public.company_settings s on s.organization_id=o.id where o.id=q.organization_id and o.status='active' and (s.human_enabled or exists(select 1 from public.organization_members m where m.organization_id=q.organization_id and m.role='admin_empresa' and m.status='active' and private.permission_actor(q.organization_id,m.user_id,'central.reply')))) then raise exception 'central_unavailable' using errcode='42501';end if;
 select * into t from public.tickets where request_id=q.id and state<>'closed';if found then return t;end if;
 select id into previous from public.tickets where request_id=q.id order by created_at desc limit 1;
 insert into public.tickets(organization_id,request_id,customer_id,previous_ticket_id,last_customer_at) values(q.organization_id,q.id,q.customer_id,previous,now()) returning * into t;perform private.central_event(t.id,'created');return t;end;$function$;

CREATE OR REPLACE FUNCTION private.central_request_slots_core(p_code text, p_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quote_requests;v public.consumer_publications;c jsonb;minutes integer;ignore_id uuid;r jsonb;
begin select * into q from public.quote_requests where public_code=p_code;v=private.consumer_publication((select slug from public.organizations where id=q.organization_id));c=private.consumer_request_selection(q);
 if q.state not in ('submitted','under_review','quoted','approved') then return '[]'::jsonb;end if;
 if q.accepted_version_id is not null then select duration_minutes into minutes from public.quote_versions where id=q.accepted_version_id;elsif q.state in ('submitted','under_review') and (c->>'direct_booking')::boolean and c->>'price_mode'='fixed' and v.id=q.publication_id then minutes=(c->>'duration_minutes')::integer;else return '[]'::jsonb;end if;
 select id into ignore_id from public.appointments where request_id=q.id and state='confirmed';
 select coalesce(jsonb_agg(x),'[]'::jsonb) into r from generate_series(p_day::timestamp at time zone(v.payload->>'timezone'),(p_day+1)::timestamp at time zone(v.payload->>'timezone')-interval '1 minute',make_interval(mins=>(select step_minutes from public.schedule_resources where organization_id=q.organization_id)))x where private.consumer_slot_allowed(v.id,x,minutes,ignore_id);return r;
end;$function$;

CREATE OR REPLACE FUNCTION public.consumer_approve_quote(p_code text, p_version text, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quote_requests;v public.quote_versions;payload jsonb;prior jsonb;r jsonb;reservation jsonb;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);payload=jsonb_build_array(p_code,p_version);prior=private.consumer_idem(q.organization_id,'approve',p_key,payload);if prior is not null then return prior;end if;
 select * into v from public.quote_versions where request_id=q.id and id=q.current_version_id and public_code=p_version and kind='final' and state='sent';
 if v.id is null then raise exception 'quote_version_invalid' using errcode='22023';end if;
 if q.accepted_version_id=v.id then return jsonb_build_object('code',p_code,'state','approved');end if;
 if q.state<>'quoted' or v.expires_at<=now() then raise exception 'quote_expired_or_invalid' using errcode='22023';end if;
 perform private.consumer_request_selection(q);
 update public.quote_requests set accepted_version_id=v.id,state='approved',revision=revision+1 where id=q.id;update public.opportunities set stage='contracted' where id=q.opportunity_id;perform private.consumer_event(q.organization_id,q.id,'approved');r=jsonb_build_object('code',p_code,'state','approved');if q.desired_start is not null then begin reservation=private.central_book_core(p_code,q.desired_start,null,gen_random_uuid());r=r||jsonb_build_object('booking',reservation,'booking_state','confirmed');exception when exclusion_violation or unique_violation then r=r||jsonb_build_object('booking_state','choose_another_time');end;end if; perform private.consumer_remember(q.organization_id,'approve',p_key,payload,r);return r;
end;$function$;

CREATE OR REPLACE FUNCTION private.central_request_context_core(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quote_requests;c public.customers;
begin select * into q from public.quote_requests where public_code=p_code;select * into c from public.customers where id=q.customer_id and organization_id=q.organization_id;
 return jsonb_build_object('journey',q.journey,'desired_start',q.desired_start,'help_only',q.help_only,'photo_request',q.photo_request,'photos_received',exists(select 1 from public.attachments where request_id=q.id and state='ready'and created_at>=q.photo_requested_at),'booking',private.consumer_booking_status(q),'branding',(select pub.payload->'branding'from public.consumer_pages page join public.consumer_publications pub on pub.id=page.publication_id where page.organization_id=q.organization_id),'code',q.public_code,'state',q.state,'revision',q.revision,'name',c.name,'notes',q.notes,'requested_items',private.consumer_requested_items(q),'review_alerts',q.review_alerts,'can_manage',private.consumer_access(q.id,true),'is_owner',c.user_id=auth.uid(),'company',(select jsonb_build_object('name',name,'slug',slug) from public.organizations where id=q.organization_id),'current_version',(select public_code from public.quote_versions where id=q.current_version_id),'accepted_version',(select public_code from public.quote_versions where id=q.accepted_version_id),
 'answers',coalesce((select jsonb_agg(jsonb_build_object('label',f->>'label','answer',q.answers->(f->>'code'))) from public.consumer_publications cp cross join lateral jsonb_array_elements(cp.payload->'services') sv cross join lateral jsonb_array_elements(sv->'questions') f where cp.id=q.publication_id and sv->>'code'=q.service_code),'[]'::jsonb),
 'versions',coalesce((select jsonb_agg(jsonb_build_object('code',v.public_code,'version',v.version,'kind',v.kind,'desired_start',v.desired_start,'subtotal_cents',coalesce(v.subtotal_cents,v.total_cents),'discount_cents',v.discount_cents,'customer_explanation',v.customer_explanation,'price_mode',v.price_mode,'total_cents',v.total_cents,'duration_minutes',v.duration_minutes,'expires_at',v.expires_at,'created_at',v.created_at,'items',(select jsonb_agg(jsonb_build_object('name',i.name,'quantity',i.quantity,'unit_cents',i.unit_cents,'price_mode',i.price_mode,'duration_minutes',i.duration_minutes,'discount_cents',i.discount_cents,'source_kind',i.source_kind,'source_code',i.source_code,'public_note',i.public_note) order by i.position) from public.quote_items i where i.version_id=v.id)) order by v.version desc) from public.quote_versions v where v.request_id=q.id and v.state='sent'),'[]'::jsonb),
 'appointments',coalesce((select jsonb_agg(jsonb_build_object('code',a.public_code,'starts_at',a.starts_at,'ends_at',a.ends_at,'state',a.state) order by a.created_at desc) from public.appointments a where a.request_id=q.id),'[]'::jsonb),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('code',a.public_code,'mime',a.mime,'size_bytes',a.size_bytes,'state',a.state,'service',a.service_code) order by a.created_at) from public.attachments a where a.request_id=q.id and (a.state='ready' or(a.state='pending' and a.expires_at>now()))),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('event',event,'at',created_at) order by created_at,id) from public.request_events where request_id=q.id),'[]'::jsonb),
 'contact_authorized',exists(select 1 from public.customer_consents where customer_id=c.id and purpose='request_contact' and revoked_at is null));
end;$function$;

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

create function private.journey_company_actor(p_org uuid,p_user uuid)returns boolean language sql stable security definer set search_path=''as $$
 select coalesce(private.permission_role(p_org,p_user)in('admin_empresa','super_admin','own_attendant','colaborador_empresa'),false);$$;
create function private.journey_ticket_visible(p_ticket uuid)returns boolean language sql stable security definer set search_path=''as $$
 select coalesce((select private.central_staff(t.organization_id)and(t.routing_scope<>'company'or private.journey_company_actor(t.organization_id,auth.uid()))from public.tickets t where t.id=p_ticket),false);$$;
create function private.journey_route(p_ticket uuid,p_reason text)returns void language plpgsql security definer set search_path=''as $$
declare t public.tickets;target uuid;begin
 select *into t from public.tickets where id=p_ticket;
 select m.user_id into target from public.organization_members m where m.organization_id=t.organization_id and m.status='active'and private.central_eligible(t.organization_id,m.user_id)and(m.role='admin_empresa'or(m.is_attendant and private.permission_actor(t.organization_id,m.user_id,'quotes.manage')and private.permission_actor(t.organization_id,m.user_id,'quotes.values')))
 order by case when m.role='admin_empresa'then 1 else 0 end,m.created_at,m.user_id limit 1;
 update public.tickets set routing_scope='company',routing_reason=p_reason,assignee_id=target,state=case when target is null then 'queued'else 'active'end,next_action='quote',revision=revision+1 where id=p_ticket;
 perform private.central_event(p_ticket,'assigned',t.assignee_id,target);end;$$;
create function private.journey_on_ticket()returns trigger language plpgsql security definer set search_path=''as $$
declare q public.quote_requests;c jsonb;begin select *into q from public.quote_requests where id=new.request_id;
 if q.help_only then c=private.journey_selection(q.publication_id,q.help_context->'items',false);else c=private.consumer_request_selection(q);end if;
 if q.journey='review'or not coalesce((c->>'direct_booking')::boolean,false)then perform private.journey_route(new.id,'Avaliação de preço ou condição necessária');end if;return new;end;$$;
create trigger journey_ticket_route after insert on public.tickets for each row execute function private.journey_on_ticket();
-- Existing permissive policies remain; restrictive policies add the decision boundary.
create policy journey_route_read on public.tickets as restrictive for select to authenticated using(private.journey_ticket_visible(id));
do $$declare n text;begin foreach n in array array['ticket_messages','ticket_notes','ticket_events','ticket_escalations','central_quote_actions']loop execute format('create policy journey_route_read on public.%I as restrictive for select to authenticated using(private.journey_ticket_visible(ticket_id))',n);end loop;end;$$;

create function private.journey_can_price(p_org uuid)returns boolean language sql stable security definer set search_path=''as $$
 select private.journey_company_actor(p_org,auth.uid())and private.permission_allowed(p_org,'quotes.read')and private.permission_allowed(p_org,'quotes.manage')and private.permission_allowed(p_org,'quotes.values');$$;
create function private.journey_quote_authorize(p_org uuid)returns void language plpgsql stable security definer set search_path=''as $$begin
 if not private.journey_can_price(p_org)then raise exception 'company_quote_permission_required'using errcode='42501';end if;end;$$;
create function public.operations_quote_catalog(p_org uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$begin perform private.journey_quote_authorize(p_org);
 return jsonb_build_object('services',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('s',id),'name',name,'price_mode',price_mode,'price_cents',price_cents,'duration_minutes',duration_minutes))from public.services where organization_id=p_org and active),'[]'),
 'addons',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('a',id),'service',private.consumer_code('s',service_id),'name',name,'price_mode',price_mode,'price_cents',price_cents,'duration_minutes',duration_minutes))from public.service_addons where organization_id=p_org and active),'[]'),
 'max_discount_percent',case when private.permission_manager(p_org)then 100 else coalesce((select(v.snapshot->'permissions'->>'max_discount_percent')::integer from public.company_settings cs join public.manual_versions v on v.id=cs.published_manual_id where cs.organization_id=p_org and(v.snapshot->'permissions'->'allowed_actions')?'discount'and not coalesce((v.snapshot->'permissions'->>'never_change_price')::boolean,true)),0)end);end;$$;
create function private.journey_quote_calculation(p_org uuid,p_code text,p_items jsonb,p_discount jsonb)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare q public.quote_requests;i jsonb;out_items jsonb='[]';item jsonb;catalog jsonb;quantity integer;unit_ bigint;minutes integer;disc bigint;subtotal bigint=0;item_discount bigint=0;global_discount bigint=0;duration integer=0;max_percent integer;original public.quote_items;mode text;value_ numeric;implicit_discount bigint=0;reference_unit bigint;services_ text[]='{}';begin
 perform private.journey_quote_authorize(p_org);select *into q from public.quote_requests where organization_id=p_org and public_code=p_code;if q.id is null then raise exception 'request_access_denied'using errcode='42501';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array'or jsonb_array_length(p_items)not between 1 and 30 then raise exception 'invalid_quote_item'using errcode='22023';end if;
 max_percent=(public.operations_quote_catalog(p_org)->>'max_discount_percent')::integer;
 for i in select value from jsonb_array_elements(p_items)loop
 perform private.company_keys(i,array['kind','code','position','name','quantity','unit_cents','duration_minutes','discount_cents','note']);
 if i->>'kind' not in('original','service','addon','manual')or i->>'kind'is null or jsonb_typeof(i->'quantity')is distinct from 'number'or jsonb_typeof(i->'unit_cents')is distinct from 'number'or jsonb_typeof(i->'duration_minutes')is distinct from 'number'or jsonb_typeof(i->'discount_cents')is distinct from 'number'then raise exception 'invalid_quote_item'using errcode='22023';end if;
 if exists(select 1 from jsonb_each(i) where key in('quantity','unit_cents','duration_minutes','discount_cents')and(value#>>'{}')::numeric<>trunc((value#>>'{}')::numeric))then raise exception 'invalid_quote_item'using errcode='22023';end if;
 quantity=(i->>'quantity')::integer;unit_=(i->>'unit_cents')::bigint;minutes=(i->>'duration_minutes')::integer;disc=(i->>'discount_cents')::bigint;
 if quantity not between 1 and 100 or unit_ not between 0 and 100000000 or minutes not between 0 and 10080 or disc<0 or disc>quantity*unit_ or length(coalesce(i->>'note',''))>500 then raise exception 'invalid_quote_item'using errcode='22023';end if;
 item=i;catalog=null;reference_unit=null;
 if i->>'kind'='original'then select qi.*into original from public.quote_items qi join public.quote_versions v on v.id=qi.version_id where v.request_id=q.id and v.kind='estimate'and v.version=1 and qi.position=(i->>'position')::integer;
 if original.id is null then raise exception 'invalid_quote_source'using errcode='22023';end if;item=item||jsonb_build_object('name',original.name);if original.price_mode='fixed'then reference_unit=original.unit_cents;if minutes<coalesce(original.duration_minutes,0)then raise exception 'quote_duration_too_short'using errcode='22023';end if;end if;
 elsif i->>'kind'='service'then select to_jsonb(s)into catalog from public.services s where organization_id=p_org and active and private.consumer_code('s',s.id)=i->>'code';
 if catalog is null then raise exception 'service_unavailable'using errcode='22023';end if;services_=array_append(services_,i->>'code');item=item||jsonb_build_object('name',catalog->>'name');
 elsif i->>'kind'='addon'then select to_jsonb(a)into catalog from public.service_addons a where organization_id=p_org and active and private.consumer_code('a',a.id)=i->>'code';
 if catalog is null or not exists(select 1 from public.services s where id=(catalog->>'service_id')::uuid and organization_id=p_org and active)then raise exception 'addon_unavailable'using errcode='22023';end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(q.requested_items,'[]'))x where x->>'service'=private.consumer_code('s',(catalog->>'service_id')::uuid))and not exists(select 1 from jsonb_array_elements(p_items)x where x->>'kind'='service'and x->>'code'=private.consumer_code('s',(catalog->>'service_id')::uuid))then raise exception 'addon_not_applicable'using errcode='22023';end if;item=item||jsonb_build_object('name',catalog->>'name');
 end if;
 if length(btrim(coalesce(item->>'name','')))not between 2 and 300 then raise exception 'invalid_quote_item'using errcode='22023';end if;
 -- An additional catalogue item keeps its configured duration. Manual and evaluated originals have an explicit final duration.
 if catalog is not null and catalog->>'duration_minutes'is not null and minutes<(catalog->>'duration_minutes')::integer then raise exception 'quote_duration_too_short'using errcode='22023';end if;
 if catalog->>'price_mode'='fixed'then reference_unit=(catalog->>'price_cents')::bigint;end if;implicit_discount=implicit_discount+greatest(coalesce(reference_unit,unit_)-unit_,0)*quantity;subtotal=subtotal+quantity*unit_;item_discount=item_discount+disc;duration=duration+quantity*minutes;out_items=out_items||jsonb_build_array(item);
 end loop;
 if duration not between 1 and 10080 then raise exception 'invalid_quote_duration'using errcode='22023';end if;
 if p_discount is null or jsonb_typeof(p_discount)<>'object'then raise exception 'invalid_discount'using errcode='22023';end if;perform private.company_keys(p_discount,array['mode','value']);mode=p_discount->>'mode';
 if mode not in('none','percent','amount')or mode is null or jsonb_typeof(p_discount->'value')is distinct from 'number'then raise exception 'invalid_discount'using errcode='22023';end if;
 value_=(p_discount->>'value')::numeric;if value_<0 or value_>100000000 or value_<>trunc(value_)or(mode='percent'and value_>100)or(mode='none'and value_<>0)then raise exception 'invalid_discount'using errcode='22023';end if;
 global_discount=case mode when 'percent'then floor((subtotal-item_discount)*value_/100)when 'amount'then value_ else 0 end;
 if item_discount+global_discount>subtotal or(item_discount+global_discount+implicit_discount)*100>(subtotal+implicit_discount)*max_percent then raise exception 'central_discount_denied'using errcode='42501';end if;
 return jsonb_build_object('items',out_items,'subtotal_cents',subtotal,'item_discount_cents',item_discount,'discount_cents',item_discount+global_discount,'total_cents',subtotal-item_discount-global_discount,'duration_minutes',duration,'desired_start',q.desired_start);end;$$;
create function public.operations_quote_calculate(p_org uuid,p_code text,p_items jsonb,p_discount jsonb)returns jsonb language sql stable security definer set search_path=''as $$select private.journey_quote_calculation(p_org,p_code,p_items,p_discount);$$;
create function public.operations_send_calculated_quote(p_org uuid,p_code text,p_items jsonb,p_discount jsonb,p_expires timestamptz,p_expected_revision integer,p_explanation text,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare q public.quote_requests;c jsonb;v public.quote_versions;i jsonb;pos integer=0;prior jsonb;payload jsonb;r jsonb;begin
 perform private.central_lock();perform private.journey_quote_authorize(p_org);select *into q from public.quote_requests where organization_id=p_org and public_code=p_code;
 if q.id is null then raise exception 'request_access_denied'using errcode='42501';end if;
 payload=jsonb_build_array(p_code,p_items,p_discount,p_expires,p_expected_revision,p_explanation);prior=private.consumer_idem(p_org,'send_calculated_quote',p_key,payload);if prior is not null then return prior;end if;
 if q.journey='direct'and exists(select 1 from public.appointments where request_id=q.id and state='confirmed')then raise exception 'direct_booking_already_confirmed'using errcode='22023';end if;
 if q.revision is distinct from p_expected_revision then raise exception 'request_revision_conflict'using errcode='40001';end if;
 if q.state not in('submitted','under_review','quoted','declined')or p_expires is null or p_expires<=now()or p_expires>now()+interval '30 days'or length(btrim(coalesce(p_explanation,'')))not between 2 and 2000 then raise exception 'invalid_final_quote'using errcode='22023';end if;
 c=private.journey_quote_calculation(p_org,p_code,p_items,p_discount);
 insert into public.quote_versions(organization_id,request_id,version,kind,price_mode,total_cents,subtotal_cents,discount_cents,duration_minutes,expires_at,created_by,customer_explanation,desired_start)values(p_org,q.id,(select coalesce(max(version),0)+1 from public.quote_versions where request_id=q.id),'final','fixed',(c->>'total_cents')::bigint,(c->>'subtotal_cents')::bigint,(c->>'discount_cents')::bigint,(c->>'duration_minutes')::integer,p_expires,auth.uid(),p_explanation,q.desired_start)returning *into v;
 for i in select value from jsonb_array_elements(c->'items')loop insert into public.quote_items(organization_id,version_id,position,name,quantity,unit_cents,price_mode,duration_minutes,discount_cents,source_kind,source_code,public_note)values(p_org,v.id,pos,i->>'name',(i->>'quantity')::int,(i->>'unit_cents')::integer,'fixed',(i->>'duration_minutes')::int,(i->>'discount_cents')::bigint,i->>'kind',coalesce(i->>'code',i->>'position'),coalesce(i->>'note',''));pos=pos+1;end loop;
 update public.quote_versions set state='sent'where id=v.id;update public.quote_requests set current_version_id=v.id,state='quoted',revision=revision+1 where id=q.id;update public.opportunities set stage='quoted'where id=q.opportunity_id;
 update public.tickets set state='waiting_customer',next_action='customer',revision=revision+1,last_staff_at=clock_timestamp(),waiting_since=clock_timestamp()where request_id=q.id and state not in('closed','resolved');
 perform private.consumer_event(p_org,q.id,'quote_sent');r=jsonb_build_object('code',v.public_code,'total_cents',v.total_cents);perform private.consumer_remember(p_org,'send_calculated_quote',p_key,payload,r);return r;end;$$;

CREATE OR REPLACE FUNCTION public.operations_send_reviewed_quote(p_org uuid, p_code text, p_items jsonb, p_duration integer, p_expires timestamp with time zone, p_expected_revision integer, p_explanation text, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare depth_ integer;r jsonb;begin
 depth_=private.permission_enter(p_org,'quotes.manage');perform private.company_lock(p_org);perform private.journey_quote_authorize(p_org);
 perform private.permission_require(p_org,'quotes.values');
 if not exists(select 1 from public.quote_requests where organization_id=p_org and public_code=p_code)then raise exception 'access_denied'using errcode='42501';end if;
 r=private.central_send_reviewed_quote_core(p_code,p_items,p_duration,p_expires,p_expected_revision,p_key,p_explanation);
 perform private.permission_leave(depth_);return r;
end;$function$;

CREATE OR REPLACE FUNCTION public.operations_send_quote(p_org uuid, p_code text, p_items jsonb, p_duration integer, p_expires timestamp with time zone, p_expected_revision integer, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare org_ uuid;depth_ int;result_ jsonb; begin org_=p_org;depth_=private.permission_enter(org_,'quotes.manage');perform private.journey_quote_authorize(org_);result_=private.v029_operations_send_quote(p_org,p_code,p_items,p_duration,p_expires,p_expected_revision,p_key);result_=private.permission_projection(org_,'operations_send_quote',result_);perform private.permission_leave(depth_);return result_;end;$function$;

CREATE OR REPLACE FUNCTION public.consumer_send_quote(p_code text, p_items jsonb, p_duration integer, p_expires timestamp with time zone, p_expected_revision integer, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare org_ uuid;depth_ int;result_ jsonb; begin org_=(select organization_id from public.quote_requests where public_code=p_code);depth_=private.permission_enter(org_,'quotes.manage');perform private.journey_quote_authorize(org_);result_=private.v029_consumer_send_quote(p_code,p_items,p_duration,p_expires,p_expected_revision,p_key);result_=private.permission_projection(org_,'consumer_send_quote',result_);perform private.permission_leave(depth_);return result_;end;$function$;

CREATE OR REPLACE FUNCTION private.central_ticket(p_code text, p_operate boolean DEFAULT false)
 RETURNS tickets
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.tickets;
begin select * into t from public.tickets where public_code=p_code;
 if t.id is null or not private.central_staff(t.organization_id)or not private.journey_ticket_visible(t.id) then raise exception 'central_access_denied' using errcode='42501';end if;
 if p_operate and not private.company_can_manage(t.organization_id) and t.assignee_id is distinct from auth.uid() then raise exception 'central_owner_required' using errcode='42501';end if;return t;end;$function$;

CREATE OR REPLACE FUNCTION public.central_queue(p_org uuid DEFAULT NULL::uuid, p_search text DEFAULT ''::text, p_state text DEFAULT NULL::text, p_mine boolean DEFAULT false, p_offset integer DEFAULT 0, p_view text DEFAULT 'all'::text, p_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin if not private.is_active_user() then raise exception 'central_access_denied' using errcode='42501';end if;
 if coalesce(p_view,'all') not in ('all','general','company','resolved') then raise exception 'invalid_view' using errcode='22023';end if;
 if length(coalesce(p_search,''))>120 then raise exception 'invalid_search' using errcode='22023';end if;
 result=jsonb_build_object('me',auth.uid(),'name',(select display_name from public.profiles where id=auth.uid()),'presence',coalesce((select presence from public.work_sessions where user_id=auth.uid() and ended_at is null),'offline'),
 'organizations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.organizations where private.central_staff(id)),'[]'::jsonb),
 'tickets',coalesce((select jsonb_agg(x order by case x->>'sla' when 'overdue' then 2 when 'attention' then 1 else 0 end desc,(x->>'priority')::integer desc,x->>'waiting_since',x->>'code') from (
 select jsonb_build_object('code',t.public_code,'organization_id',t.organization_id,'company',o.name,'customer',c.name,'service',coalesce((select item->>'name' from public.consumer_publications pub cross join lateral jsonb_array_elements(pub.payload->'services') item where pub.id=q.publication_id and item->>'code'=q.service_code),'Serviço'),'source',coalesce(oc.source,'direct'),'request',q.public_code,'routing_scope',t.routing_scope,'routing_reason',t.routing_reason,'desired_start',q.desired_start,'request_state',q.state,'state',t.state,'revision',t.revision,'assignee',t.assignee_id,'assignee_name',pr.display_name,'owner_valid',private.central_eligible(t.organization_id,t.assignee_id),'priority',t.priority,'next_action',t.next_action,'due_at',t.next_due_at,'waiting_since',t.waiting_since,'last_customer_at',t.last_customer_at,'last_staff_at',t.last_staff_at,'created_at',t.created_at,'resolved_at',t.resolved_at,
 'sla',case when t.state in ('resolved','closed','waiting_customer') then 'normal' when t.next_due_at<=now() or(t.state in ('queued','active') and now()>t.waiting_since+make_interval(mins=>s.response_minutes)) then 'overdue' when t.state in ('queued','active') and now()>t.waiting_since+make_interval(mins=>s.attention_minutes) then 'attention' else 'normal' end,
 'appointment',(select min(starts_at) from public.appointments where request_id=t.request_id and state='confirmed' and starts_at>=now()),'appointment_today',exists(select 1 from public.appointments a where a.request_id=t.request_id and a.state='confirmed' and (a.starts_at at time zone o.timezone)::date=(now() at time zone o.timezone)::date)) x
 from public.tickets t join public.organizations o on o.id=t.organization_id join public.customers c on c.id=t.customer_id join public.quote_requests q on q.id=t.request_id join public.services sv on sv.id=q.service_id left join public.profiles pr on pr.id=t.assignee_id left join public.central_settings s on s.organization_id=o.id left join public.opportunity_context oc on oc.opportunity_id=q.opportunity_id
 where private.central_staff(t.organization_id) and private.journey_ticket_visible(t.id) and(p_org is null or t.organization_id=p_org) and(p_state is null or t.state=p_state) and(p_date is null or (t.created_at at time zone o.timezone)::date=p_date) and(coalesce(p_view,'all')='all' or (p_view='general' and t.state not in ('resolved','closed') and (t.assignee_id is null or not private.central_eligible(t.organization_id,t.assignee_id))) or (p_view='company' and t.state='waiting_company') or (p_view='resolved' and t.state='resolved' and t.resolved_at>now()-interval '7 days')) and(not coalesce(p_mine,false) or t.assignee_id=auth.uid()) and (p_search is null or p_search='' or concat_ws(' ',c.name,o.name,t.public_code,(select item->>'name' from public.consumer_publications pub cross join lateral jsonb_array_elements(pub.payload->'services') item where pub.id=q.publication_id and item->>'code'=q.service_code),oc.source,pr.display_name) ilike '%'||p_search||'%') and(t.state<>'closed' or t.closed_at>now()-interval '7 days') order by case when t.state in ('resolved','closed','waiting_customer') then 0 when t.next_due_at<=now() or(t.state in ('queued','active') and now()>t.waiting_since+make_interval(mins=>s.response_minutes)) then 2 when t.state in ('queued','active') and now()>t.waiting_since+make_interval(mins=>s.attention_minutes) then 1 else 0 end desc,t.priority desc,t.waiting_since,t.id limit 101 offset greatest(coalesce(p_offset,0),0)) items),'[]'::jsonb));
 result=result||jsonb_build_object('has_more',jsonb_array_length(result->'tickets')>100,'offset',greatest(coalesce(p_offset,0),0));
 return jsonb_set(result,'{tickets}',coalesce((select jsonb_agg(value) from jsonb_array_elements(result->'tickets') with ordinality where ordinality<=100),'[]'::jsonb));end;$function$;

CREATE OR REPLACE FUNCTION private.v029_central_act(p_code text, p_revision integer, p_action text, p_data jsonb, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.tickets;target uuid;prior jsonb;payload jsonb;r jsonb;ev text;name text;mid uuid;snap jsonb;reply jsonb;body text;esc public.ticket_escalations;v_state text;
begin perform private.central_lock();t=private.central_ticket(p_code,p_action<>'claim');payload=jsonb_build_array(p_code,p_revision,p_action,p_data);prior=private.consumer_idem(t.organization_id,'central_act',p_key,payload);if prior is not null then return prior;end if;
 if p_revision is distinct from t.revision then raise exception 'central_revision_conflict' using errcode='40001';end if;
 if t.state='closed' then raise exception 'central_closed' using errcode='22023';end if;
 select coalesce(nullif(display_name,''),'Atendimento') into name from public.profiles where id=auth.uid();
 case p_action
 when 'claim' then
  perform private.company_keys(p_data,array[]::text[]);
  if not private.central_eligible(t.organization_id,auth.uid())then raise exception 'central_claim_permission_required'using errcode='42501';end if;
  if not exists(select 1 from public.work_sessions where user_id=auth.uid() and ended_at is null and presence in ('available','busy')) then raise exception 'central_presence_required' using errcode='42501';end if;
  if t.state in ('resolved','waiting_company') or(t.assignee_id is not null and t.assignee_id<>auth.uid() and private.central_eligible(t.organization_id,t.assignee_id)) then raise exception 'central_already_assigned' using errcode='40001';end if;
  update public.tickets set assignee_id=auth.uid(),state='active',next_action='reply' where id=t.id;ev='assigned';target=auth.uid();
 when 'transfer' then
  perform private.company_keys(p_data,array['user_id']);target=(p_data->>'user_id')::uuid;
  if t.state='resolved' or(t.routing_scope='company'and not private.journey_company_actor(t.organization_id,target))or not private.central_eligible(t.organization_id,target) then raise exception 'central_invalid_recipient' using errcode='42501';end if;
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
  update public.tickets set state='waiting_company',next_action='company',waiting_since=clock_timestamp() where id=t.id;ev='escalated';perform private.journey_route(t.id,'Exceção técnica/comercial — decisão da empresa');
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
end;$function$;

CREATE OR REPLACE FUNCTION private.v029_central_context(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.tickets;q public.quote_requests;m public.manual_versions;s public.central_settings;ctx jsonb;
begin t=private.central_ticket(p_code);select * into q from public.quote_requests where id=t.request_id;select v.* into m from public.company_settings cs join public.manual_versions v on v.id=cs.published_manual_id and v.organization_id=cs.organization_id where cs.organization_id=t.organization_id and v.status='published';select * into s from public.central_settings where organization_id=t.organization_id;
 ctx=private.central_request_context_core(q.public_code);
 return jsonb_build_object('ticket',to_jsonb(t),'request',ctx,'me',auth.uid(),'admin',private.company_can_manage(t.organization_id),'can_request_photos',private.journey_company_actor(t.organization_id,auth.uid())and private.permission_allowed(t.organization_id,'central.reply'),'can_price',private.journey_can_price(t.organization_id),'operator_name',(select display_name from public.profiles where id=auth.uid()),
 'organization',(select jsonb_build_object('id',id,'name',name,'slug',slug,'timezone',timezone) from public.organizations where id=t.organization_id),
 'customer',jsonb_build_object('name',(select name from public.customers where id=t.customer_id),'whatsapp',case when(ctx->>'contact_authorized')::boolean then (select whatsapp from public.customers where id=t.customer_id) end,'request_count',(select count(*) from public.quote_requests where customer_id=t.customer_id),'previous_requests',coalesce((select jsonb_agg(jsonb_build_object('code',public_code,'state',state,'created_at',created_at)) from(select public_code,state,created_at from public.quote_requests where customer_id=t.customer_id and id<>q.id order by created_at desc limit 5) recent),'[]'::jsonb)),
 'customer_context',case when coalesce(s.share_customer_context,false) or private.company_can_manage(t.organization_id) then(select jsonb_build_object('tags',tags,'preferred_time',preferred_time,'operational_note',operational_note,'origin_context',origin_context) from public.customer_context where customer_id=t.customer_id) else null end,
 'origin',(select jsonb_build_object('source',source,'detail',source_detail) from public.opportunity_context where opportunity_id=q.opportunity_id),
 'manual',jsonb_build_object('id',m.id,'version',m.version,'title',m.title,'snapshot',m.snapshot,'sections',coalesce((select jsonb_agg(jsonb_build_object('key',section_key,'content',content) order by section_key) from public.manual_sections where manual_id=m.id),'[]'::jsonb)),
 'permissions',coalesce((select jsonb_object_agg(action,public.company_attendant_permission(t.organization_id,action)) from unnest(array['price_list','quote_create','quote_send','schedule','reschedule','cancel','whatsapp']) action),'{}'::jsonb),
 'settings',coalesce(to_jsonb(s),jsonb_build_object('revision',1,'quick_reply_edit',false,'share_customer_context',false)),
 'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'kind',a.kind)) from (select user_id,kind::text kind from public.attendant_organizations where organization_id=t.organization_id union select user_id,'own' from public.organization_members where organization_id=t.organization_id and is_attendant) a join public.profiles p on p.id=a.user_id where private.central_eligible(t.organization_id,p.id)and(t.routing_scope<>'company'or private.journey_company_actor(t.organization_id,p.id))),'[]'::jsonb),
 'messages',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'name',author_name,'body',body,'at',created_at) order by created_at,id) from public.ticket_messages where ticket_id=t.id),'[]'::jsonb),
 'notes',coalesce((select jsonb_agg(jsonb_build_object('body',n.body,'author',p.display_name,'at',n.created_at) order by n.created_at,n.id) from public.ticket_notes n join public.profiles p on p.id=n.author_id where ticket_id=t.id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('event',e.event,'author',p.display_name,'from',e.from_assignee,'to',e.to_assignee,'state',e.state,'at',e.created_at) order by e.created_at,e.id) from public.ticket_events e left join public.profiles p on p.id=e.actor_id where ticket_id=t.id),'[]'::jsonb),
 'escalations',coalesce((select jsonb_agg(jsonb_build_object('reason',reason,'summary',summary,'question',question,'response',response,'at',created_at,'responded_at',responded_at) order by created_at desc) from public.ticket_escalations where ticket_id=t.id),'[]'::jsonb),
 'financial',jsonb_build_object('operational',false,'label','Preparação: nenhum pagamento processado pela Central','records',coalesce((select jsonb_agg(jsonb_build_object('status',status,'origin',origin,'confirmation_method',confirmation_method,'amount_cents',amount_cents,'confirmed_cents',confirmed_cents)) from public.payments where request_id=q.id),'[]'::jsonb)));
end;$function$;

revoke all on function public.consumer_journey_slots(text,text,jsonb,date) from public,anon,authenticated;grant execute on function public.consumer_journey_slots(text,text,jsonb,date) to authenticated;

revoke all on function public.consumer_complete_journey(text,timestamptz,integer,uuid) from public,anon,authenticated;grant execute on function public.consumer_complete_journey(text,timestamptz,integer,uuid) to authenticated;

revoke all on function public.consumer_start_help(text,text,jsonb,jsonb,text,uuid) from public,anon,authenticated;grant execute on function public.consumer_start_help(text,text,jsonb,jsonb,text,uuid) to authenticated;

revoke all on function public.consumer_prepare_help_request(text,jsonb,text,boolean,bigint,uuid,jsonb) from public,anon,authenticated;grant execute on function public.consumer_prepare_help_request(text,jsonb,text,boolean,bigint,uuid,jsonb) to authenticated;

revoke all on function public.consumer_draft_context(text) from public,anon,authenticated;grant execute on function public.consumer_draft_context(text) to authenticated;

revoke all on function public.consumer_reserve_item_attachment(text,text,text,integer,uuid) from public,anon,authenticated;grant execute on function public.consumer_reserve_item_attachment(text,text,text,integer,uuid) to authenticated;

revoke all on function public.operations_request_photos(uuid,text,text,integer,uuid) from public,anon,authenticated;grant execute on function public.operations_request_photos(uuid,text,text,integer,uuid) to authenticated;

revoke all on function public.operations_quote_calculate(uuid,text,jsonb,jsonb) from public,anon,authenticated;grant execute on function public.operations_quote_calculate(uuid,text,jsonb,jsonb) to authenticated;

revoke all on function public.operations_send_calculated_quote(uuid,text,jsonb,jsonb,timestamptz,integer,text,uuid) from public,anon,authenticated;grant execute on function public.operations_send_calculated_quote(uuid,text,jsonb,jsonb,timestamptz,integer,text,uuid) to authenticated;

revoke all on function public.operations_quote_catalog(uuid) from public,anon,authenticated;grant execute on function public.operations_quote_catalog(uuid) to authenticated;

do $$declare r record;begin for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'and(p.proname like 'journey_%')loop execute format('revoke all on function %s from public,anon,authenticated',r.signature);end loop;end;$$;

grant execute on function private.journey_ticket_visible(uuid)to authenticated;

notify pgrst,'reload schema';commit;

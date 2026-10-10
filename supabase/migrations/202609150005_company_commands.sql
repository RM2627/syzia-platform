begin;
create function private.company_lock(p_org uuid,p_expected_revision integer default null) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_authorize('org',p_org);
 if not private.company_can_manage(p_org) then raise exception 'access_denied' using errcode='42501'; end if;
 if p_expected_revision is not null and not exists(select 1 from public.company_settings where organization_id=p_org and revision=p_expected_revision) then
  raise exception 'company_revision_conflict' using errcode='40001'; end if;
end; $$;
create function private.company_touch(p_org uuid,p_operational boolean) returns void language sql security definer set search_path='' as $$
 update public.company_settings set revision=revision+1,operational_revision=operational_revision+case when p_operational then 1 else 0 end,
 human_enabled=case when p_operational then false else human_enabled end where organization_id=p_org;
$$;
create function private.company_keys(p_data jsonb,p_allowed text[]) returns void language plpgsql set search_path='' as $$
begin
 if p_data is null or jsonb_typeof(p_data)<>'object' or (p_data-p_allowed)<>'{}'::jsonb then raise exception 'invalid_company_fields' using errcode='22023'; end if;
end; $$;
create function public.company_initialize(p_org uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.company_lock(p_org);
 insert into public.company_settings(organization_id) values(p_org) on conflict do nothing;
 insert into public.business_rules(organization_id) values(p_org) on conflict do nothing;
 insert into public.attendant_permissions(organization_id) values(p_org) on conflict do nothing;
end; $$;
-- No generic table names or dynamic SQL accepted from the client.
create function public.company_save(p_org uuid,p_entity text,p_id uuid,p_expected_revision integer,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; old_row jsonb; candidate jsonb;
begin
 if p_expected_revision is null then raise exception 'company_revision_required' using errcode='22023'; end if;
 perform private.company_lock(p_org,p_expected_revision);
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
  perform private.company_keys(p_data,array['name','category','description','image_url','price_mode','price_cents','duration_minutes','availability','notes','active','quotes_allowed','direct_booking']);
  select to_jsonb(t) into old_row from public.services t where id=p_id and organization_id=p_org;
  if p_id is not null and old_row is null then raise exception 'company_target_not_found' using errcode='22023'; end if;
  candidate=coalesce(old_row,'{"category": "", "description": "", "image_url": "", "price_mode": "quote", "price_cents": null, "duration_minutes": null, "availability": "", "notes": "", "active": true, "quotes_allowed": true, "direct_booking": false}'::jsonb)||p_data;
  if old_row is null then
   insert into public.services(id,organization_id,name,category,description,image_url,price_mode,price_cents,duration_minutes,availability,notes,active,quotes_allowed,direct_booking) select target,p_org,r.name,r.category,r.description,r.image_url,r.price_mode,r.price_cents,r.duration_minutes,r.availability,r.notes,r.active,r.quotes_allowed,r.direct_booking from jsonb_populate_record(null::public.services,candidate) r;
  else
   update public.services t set name=r.name,category=r.category,description=r.description,image_url=r.image_url,price_mode=r.price_mode,price_cents=r.price_cents,duration_minutes=r.duration_minutes,availability=r.availability,notes=r.notes,active=r.active,quotes_allowed=r.quotes_allowed,direct_booking=r.direct_booking from jsonb_populate_record(null::public.services,candidate) r where t.organization_id=p_org and t.id=p_id;
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
  perform private.company_keys(p_data,array['service_id','label','kind','required','options','position','active']);
  select to_jsonb(t) into old_row from public.service_intake_fields t where id=p_id and organization_id=p_org;
  if p_id is not null and old_row is null then raise exception 'company_target_not_found' using errcode='22023'; end if;
  candidate=coalesce(old_row,'{"kind": "text", "required": true, "options": [], "position": 0, "active": true}'::jsonb)||p_data;
  if old_row is null then
   insert into public.service_intake_fields(id,organization_id,service_id,label,kind,required,options,position,active) select target,p_org,r.service_id,r.label,r.kind,r.required,r.options,r.position,r.active from jsonb_populate_record(null::public.service_intake_fields,candidate) r;
  else
   update public.service_intake_fields t set service_id=r.service_id,label=r.label,kind=r.kind,required=r.required,options=r.options,position=r.position,active=r.active from jsonb_populate_record(null::public.service_intake_fields,candidate) r where t.organization_id=p_org and t.id=p_id;
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
end; $$;
create function private.company_checklist(p_org uuid,p_draft uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.company_settings; m public.manual_versions; checks jsonb;
begin
 select * into c from public.company_settings where organization_id=p_org;
 select * into m from public.manual_versions where organization_id=p_org and id=coalesce(p_draft,c.published_manual_id);
 checks=jsonb_build_object(
 'company',coalesce(length(btrim(c.description))>=10 and length(btrim(c.service_regions))>=2,false),
 'services',exists(select 1 from public.services where organization_id=p_org and active),
 'pricing',exists(select 1 from public.business_rules where organization_id=p_org and length(btrim(pricing_policy))>=10),
 'hours',coalesce(jsonb_array_length(c.business_hours)>0 and jsonb_array_length(c.human_hours)>0,false),
 'payments',coalesce(length(btrim(c.payment_methods))>=2,false),
 'faq',exists(select 1 from public.faqs where organization_id=p_org and active),
 'replies',exists(select 1 from public.quick_replies where organization_id=p_org and active),
 'rules',exists(select 1 from public.business_rules where organization_id=p_org and length(btrim(payment_policy))>=10 and length(btrim(cancellation_policy))>=10 and length(btrim(rescheduling_policy))>=10 and length(btrim(service_policy))>=10 and length(btrim(deadlines_policy))>=10 and length(btrim(exception_policy))>=10),
 'autonomy',exists(select 1 from public.attendant_permissions where organization_id=p_org and reviewed),
 'exception_contact',coalesce(length(btrim(c.exception_contact_name))>=2 and length(btrim(c.exception_contact))>=5,false),
 'manual_sections',(select count(*)=11 from public.manual_sections where organization_id=p_org and manual_id=m.id and length(btrim(content))>=10),
 'manual_published',coalesce(m.status='published' and m.source_revision=c.operational_revision,false),
 'attendant',exists(select 1 from public.attendant_organizations a join public.profiles pr on pr.id=a.user_id join auth.users u on u.id=pr.id join public.platform_roles r on r.user_id=pr.id and r.role='atendente' and r.active
 where a.organization_id=p_org and a.status='active' and a.kind='primary' and pr.status='active' and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now()))
 );
 return checks;
end; $$;
create function public.company_create_manual(p_org uuid,p_expected_revision integer,p_title text) returns uuid language plpgsql security definer set search_path='' as $$
declare mid uuid; base uuid;
begin
 if p_expected_revision is null then raise exception 'company_revision_required' using errcode='22023'; end if;
 perform private.company_lock(p_org,p_expected_revision);
 select published_manual_id into base from public.company_settings where organization_id=p_org;
 insert into public.manual_versions(organization_id,version,title) select p_org,coalesce(max(version),0)+1,btrim(p_title) from public.manual_versions where organization_id=p_org returning id into mid;
 insert into public.manual_sections(organization_id,manual_id,section_key,content)
 select p_org,mid,k,coalesce((select content from public.manual_sections where organization_id=p_org and manual_id=base and section_key=k),'')
 from unnest(array['business','operation','deadlines','payments','regions','policies','cancellation','rescheduling','important','objections','exceptions']) k;
 perform private.company_touch(p_org,false);
 return mid;
end; $$;
create function public.company_discard_manual(p_org uuid,p_manual uuid,p_expected_revision integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_expected_revision is null then raise exception 'company_revision_required' using errcode='22023'; end if;
 perform private.company_lock(p_org,p_expected_revision);
 if not exists(select 1 from public.manual_versions where id=p_manual and organization_id=p_org and status='draft') then raise exception 'company_target_not_found' using errcode='22023'; end if;
 delete from public.manual_sections where organization_id=p_org and manual_id=p_manual;
 delete from public.manual_versions where organization_id=p_org and id=p_manual;
 perform private.company_touch(p_org,false);
end; $$;
create function public.company_publish_manual(p_org uuid,p_manual uuid,p_expected_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare c public.company_settings; checks jsonb; snap jsonb;
begin
 if p_expected_revision is null then raise exception 'company_revision_required' using errcode='22023'; end if;
 perform private.company_lock(p_org,p_expected_revision);
 if not exists(select 1 from public.manual_versions where id=p_manual and organization_id=p_org and status='draft') then raise exception 'company_target_not_found' using errcode='22023'; end if;
 checks=private.company_checklist(p_org,p_manual)-array['manual_published','attendant'];
 if exists(select 1 from jsonb_each(checks) where value<>'true'::jsonb) then raise exception 'company_not_ready_to_publish' using errcode='23514'; end if;
 select * into c from public.company_settings where organization_id=p_org;
 snap=jsonb_build_object(
 'settings',to_jsonb(c)-array['revision','operational_revision','published_manual_id','human_enabled','faq_public_enabled','created_at','updated_at'],
 'rules',(select to_jsonb(r)-array['created_at','updated_at'] from public.business_rules r where organization_id=p_org),
 'permissions',(select to_jsonb(r)-array['created_at','updated_at'] from public.attendant_permissions r where organization_id=p_org),
 'services',coalesce((select jsonb_agg(to_jsonb(r) order by r.name,r.id) from public.services r where organization_id=p_org and active),'[]'::jsonb),
 'addons',coalesce((select jsonb_agg(to_jsonb(r) order by r.name,r.id) from public.service_addons r where organization_id=p_org and active and exists(select 1 from public.services s where s.id=r.service_id and s.organization_id=p_org and s.active)),'[]'::jsonb),
 'fields',coalesce((select jsonb_agg(to_jsonb(r) order by r.position,r.id) from public.service_intake_fields r where organization_id=p_org and active and exists(select 1 from public.services s where s.id=r.service_id and s.organization_id=p_org and s.active)),'[]'::jsonb),
 'faqs',coalesce((select jsonb_agg(jsonb_build_object('question',question,'answer',answer) order by position,id) from public.faqs where organization_id=p_org and active),'[]'::jsonb),
 'quick_replies',coalesce((select jsonb_agg(jsonb_build_object('title',title,'body',body) order by title,id) from public.quick_replies where organization_id=p_org and active),'[]'::jsonb)
 );
 update public.manual_versions set status='published',source_revision=c.operational_revision,snapshot=snap,published_at=clock_timestamp(),published_by=auth.uid() where id=p_manual and organization_id=p_org;
 update public.company_settings set published_manual_id=p_manual,human_enabled=false where organization_id=p_org;
 perform private.company_touch(p_org,false);
end; $$;
create function public.company_set_activation(p_org uuid,p_expected_revision integer,p_human boolean,p_public_faq boolean) returns void language plpgsql security definer set search_path='' as $$
declare c public.company_settings;
begin
 if p_expected_revision is null or p_human is null or p_public_faq is null then raise exception 'invalid_company_fields' using errcode='22023'; end if;
 perform private.company_lock(p_org,p_expected_revision);
 select * into c from public.company_settings where organization_id=p_org;
 if p_human and exists(select 1 from jsonb_each(private.company_checklist(p_org)) where value<>'true'::jsonb) then raise exception 'company_not_ready_for_human' using errcode='23514'; end if;
 -- Public FAQ is independent of staffing readiness, but always an approved snapshot.
 if p_public_faq and not exists(select 1 from public.manual_versions where organization_id=p_org and id=c.published_manual_id and status='published') then raise exception 'company_published_manual_required' using errcode='23514'; end if;
 update public.company_settings set human_enabled=p_human,faq_public_enabled=p_public_faq where organization_id=p_org;
 perform private.company_touch(p_org,false);
end; $$;
create function public.company_attendant_permission(p_org uuid,p_action text,p_discount integer default 0) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.company_can_read(p_org) and private.has_global_role('atendente') and
 exists(select 1 from public.attendant_organizations where organization_id=p_org and user_id=auth.uid() and status='active') and
 exists(select 1 from public.company_settings where organization_id=p_org and human_enabled) and
 not exists(select 1 from jsonb_each(private.company_checklist(p_org)) where value<>'true'::jsonb) and
 exists(select 1 from public.attendant_permissions where organization_id=p_org and reviewed and p_action=any(allowed_actions)
 and p_discount>=0 and ((p_action='discount' and not never_change_price and p_discount<=max_discount_percent) or (p_action<>'discount' and p_discount=0))),false);
$$;
-- Safe public projection. No direct anonymous table reads; no private contact, policy, notes or identifiers.
create function public.company_public_faq(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',o.name,'slug',o.slug,'version',v.version,'published_at',v.published_at,'faqs',v.snapshot->'faqs')
 from public.organizations o join public.company_settings c on c.organization_id=o.id join public.manual_versions v on v.id=c.published_manual_id and v.organization_id=o.id
 where o.slug=p_slug and o.status='active' and c.faq_public_enabled and v.status='published';
$$;
create function public.company_readiness(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.company_can_read(p_org) then raise exception 'access_denied' using errcode='42501'; end if;
 return private.company_checklist(p_org);
end; $$;
create function public.company_context(p_org uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not private.company_can_read(p_org) then raise exception 'access_denied' using errcode='42501'; end if;
 return jsonb_build_object(
 'editable',private.company_can_manage(p_org),
 'settings',(select to_jsonb(c) from public.company_settings c where organization_id=p_org),
 'rules',(select to_jsonb(c) from public.business_rules c where organization_id=p_org),
 'permissions',(select to_jsonb(c) from public.attendant_permissions c where organization_id=p_org),
 'services',coalesce((select jsonb_agg(to_jsonb(c) order by name,id) from public.services c where organization_id=p_org),'[]'::jsonb),
 'addons',coalesce((select jsonb_agg(to_jsonb(c) order by name,id) from public.service_addons c where organization_id=p_org),'[]'::jsonb),
 'fields',coalesce((select jsonb_agg(to_jsonb(c) order by position,id) from public.service_intake_fields c where organization_id=p_org),'[]'::jsonb),
 'manuals',coalesce((select jsonb_agg(to_jsonb(c) order by version desc) from public.manual_versions c where organization_id=p_org),'[]'::jsonb),
 'sections',coalesce((select jsonb_agg(to_jsonb(c) order by section_key) from public.manual_sections c where organization_id=p_org),'[]'::jsonb),
 'faqs',coalesce((select jsonb_agg(to_jsonb(c) order by position,id) from public.faqs c where organization_id=p_org),'[]'::jsonb),
 'replies',coalesce((select jsonb_agg(to_jsonb(c) order by title,id) from public.quick_replies c where organization_id=p_org),'[]'::jsonb),
 'checklist',public.company_readiness(p_org)
 );
end; $$;
revoke all on function private.company_lock(uuid,integer) from public,anon,authenticated;
revoke all on function private.company_touch(uuid,boolean) from public,anon,authenticated;
revoke all on function private.company_keys(jsonb,text[]) from public,anon,authenticated;
revoke all on function private.company_checklist(uuid,uuid) from public,anon,authenticated;
revoke all on function public.company_initialize(uuid) from public,anon,authenticated;
grant execute on function public.company_initialize(uuid) to authenticated;
revoke all on function public.company_save(uuid,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.company_save(uuid,text,uuid,integer,jsonb) to authenticated;
revoke all on function public.company_create_manual(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.company_create_manual(uuid,integer,text) to authenticated;
revoke all on function public.company_discard_manual(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.company_discard_manual(uuid,uuid,integer) to authenticated;
revoke all on function public.company_publish_manual(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.company_publish_manual(uuid,uuid,integer) to authenticated;
revoke all on function public.company_set_activation(uuid,integer,boolean,boolean) from public,anon,authenticated;
grant execute on function public.company_set_activation(uuid,integer,boolean,boolean) to authenticated;
revoke all on function public.company_attendant_permission(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.company_attendant_permission(uuid,text,integer) to authenticated;
revoke all on function public.company_context(uuid) from public,anon,authenticated;
grant execute on function public.company_context(uuid) to authenticated;
revoke all on function public.company_readiness(uuid) from public,anon,authenticated;
grant execute on function public.company_readiness(uuid) to authenticated;
revoke all on function public.company_public_faq(text) from public,anon,authenticated;
grant execute on function public.company_public_faq(text) to authenticated;
grant execute on function public.company_public_faq(text) to anon;
commit;

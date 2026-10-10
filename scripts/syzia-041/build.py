from pathlib import Path
root=Path(__file__).resolve().parents[2]
b=root/'reports/syzia-041/baseline-functions'
pieces=['-- SYZIA 041: upgrade incremental from 040, no reset or external actions.\nbegin;\n', (root/'scripts/syzia-041/schema.sql').read_text()]
def emit(s):pieces.append(s.rstrip().rstrip(';')+';\n')
def src(n):return (b/(n+'.sql')).read_text()
def patched(n,pairs):
 s=src(n)
 for a,z in pairs:
  assert a in s,(n,a[:100]);s=s.replace(a,z)
 emit(s)
# Extend the existing company editor and immutable publication builders.
s=src('private.v030_company_save')
s=s.replace("'quotes_allowed','direct_booking']", "'quotes_allowed','direct_booking','contract_mode','photo_policy','photo_instructions']")
s=s.replace("'position','active']);", "'position','active','instruction','multiline','condition_field','condition_value']);")
s=s.replace('quotes_allowed,direct_booking) select','quotes_allowed,direct_booking,contract_mode,photo_policy,photo_instructions) select').replace('r.quotes_allowed,r.direct_booking from','r.quotes_allowed,r.direct_booking,r.contract_mode,coalesce(r.photo_policy,\'none\'),coalesce(r.photo_instructions,\'\') from')
s=s.replace('direct_booking=r.direct_booking from','direct_booking=r.direct_booking,contract_mode=r.contract_mode,photo_policy=coalesce(r.photo_policy,\'none\'),photo_instructions=coalesce(r.photo_instructions,\'\') from')
s=s.replace('options,position,active) select','options,position,active,instruction,multiline,condition_field,condition_value) select').replace('r.options,r.position,r.active from','r.options,r.position,r.active,coalesce(r.instruction,\'\'),coalesce(r.multiline,false),r.condition_field,r.condition_value from')
s=s.replace('position=r.position,active=r.active from','position=r.position,active=r.active,instruction=coalesce(r.instruction,\'\'),multiline=coalesce(r.multiline,false),condition_field=r.condition_field,condition_value=r.condition_value from',1)
s=s.replace("candidate=coalesce(old_row,'{\"category\"", "candidate=coalesce(old_row,'{\"category\"")
needle="  if old_row is null then\n   insert into public.services"
s=s.replace(needle,"  if candidate->>'contract_mode'='immediate' then candidate=candidate||jsonb_build_object('direct_booking',candidate->>'price_mode'='fixed'and candidate->>'duration_minutes' is not null);elsif candidate->>'contract_mode'='evaluation'then candidate=candidate||'{\"direct_booking\":false,\"quotes_allowed\":true}';end if;\n"+needle)
needle='  if old_row is null then\n   insert into public.service_intake_fields'
s=s.replace(needle,"  if candidate->>'condition_field' is not null and not exists(select 1 from public.service_intake_fields f where f.id=(candidate->>'condition_field')::uuid and f.id<>target and f.organization_id=p_org and f.service_id=(candidate->>'service_id')::uuid and f.active and f.condition_field is null and f.kind in('boolean','choice')and case when f.kind='boolean'then jsonb_typeof(candidate->'condition_value')='boolean'else (candidate->'condition_value')in(select value from jsonb_array_elements(f.options))end)then raise exception 'invalid_question_condition'using errcode='22023';end if;\n"+needle)
emit(s)
for name in ['private.presence_payload','private.v029_consumer_publish_page']:
 patched(name,[("'availability',s->>'availability'", "'contract_mode',coalesce(s->>'contract_mode',case when(s->>'direct_booking')::boolean then 'immediate'else 'evaluation'end),'photo_policy',coalesce(s->>'photo_policy','none'),'photo_instructions',coalesce(s->>'photo_instructions',''),'availability',s->>'availability'"),
 ("'kind',f->>'kind'","'instruction',coalesce(f->>'instruction',''),'multiline',coalesce((f->>'multiline')::boolean,false),'condition_field',case when f->>'condition_field' is not null then private.consumer_code('f',(f->>'condition_field')::uuid)end,'condition_value',f->'condition_value','kind',f->>'kind'")])
for name in ['private.presence_payload','private.v029_consumer_publish_page']:
 # Add to the existing emitted function, keeping the original snapshot immutable.
 for index,part in enumerate(pieces):
  if part.startswith('CREATE OR REPLACE FUNCTION '+name+'('):
   addition="'public_information',jsonb_build_object('service',coalesce((select service_policy from public.business_rules where organization_id=p_org),''),'cancellation',coalesce((select cancellation_policy from public.business_rules where organization_id=p_org),''),'rescheduling',coalesce((select rescheduling_policy from public.business_rules where organization_id=p_org),'')),'quick_replies',coalesce((select jsonb_agg(jsonb_build_object('title',title,'body',body))from public.quick_replies where organization_id=p_org and active),'[]'),'notice_version','consumer-v1'"
   pieces[index]=part.replace("'notice_version','consumer-v1'",addition)
# Single selection reads the published service, including the new fields. A draft never leaks.
s=src('private.consumer_selection')
s=s.replace("key=private.consumer_code('f',(f->>'id')::uuid);codes=array_append(codes,key);answer_value=p_answers->key;", "key=private.consumer_code('f',(f->>'id')::uuid);codes=array_append(codes,key);answer_value=p_answers->key; if f->>'kind'='photo'then if answer_value is not null then raise exception 'photo_answer_requires_attachment'using errcode='22023';end if;continue;end if; if f->>'condition_field' is not null and p_answers->(case when f->>'condition_field' like 'f_%'then f->>'condition_field'else private.consumer_code('f',(f->>'condition_field')::uuid)end)is distinct from f->'condition_value'then if answer_value is not null and answer_value<>'null'then raise exception 'inactive_question_answer'using errcode='22023';end if;continue;end if;")
s=s.replace("'direct_booking',v.show_prices and (s->>'direct_booking')::boolean", "'direct_booking',v.show_prices and mode='fixed'and duration>0 and coalesce(s->>'contract_mode',case when(s->>'direct_booking')::boolean then 'immediate'else 'evaluation'end)='immediate'")
emit(s)
# Internal unchecked-required variant only for contextual draft help; every finalization validates.
s=src('private.consumer_multi_selection').replace('private.consumer_multi_selection(p_publication uuid, p_items jsonb)','private.journey_selection(p_publication uuid, p_items jsonb, p_validate boolean)')
s=s.replace("entry->'answers');", "entry->'answers',p_validate);")
s=s.replace("if mode='quote'or", "if mode<>'fixed'then direct=false;end if; if mode='quote'or")
emit(s)
emit("create or replace function private.consumer_multi_selection(p_publication uuid,p_items jsonb)returns jsonb language sql stable security definer set search_path=''as $$select private.journey_selection(p_publication,p_items,true);$$")
# Preserve original selections. A help-only draft has not yet formed a commercial request.
patched('private.consumer_original_guard',[("if new.requested_items", "if old.state='draft'and old.help_only and old.requested_items is null and not new.help_only then return new;end if; if new.requested_items")])
# Reserve attachments on the SAME private attachment storage after submission too.
for name in ['public.consumer_reserve_attachment','public.consumer_gateway_attachment']:
 s=src(name).replace("q.state<>'draft'", "q.state not in('draft','submitted','under_review','quoted','declined')")
 emit(s)
patched('public.consumer_submit_request',[("perform private.consumer_request_selection(q);","perform private.consumer_request_selection(q);perform private.journey_require_photos(q);")])
# Existing direct endpoint cannot silently submit a deterministic request as an attended quote in 041.
# Legacy API remains supported; 041 complete_journey atomically invokes it with reservation.
# Routing and no automatic ticket for fixed/direct new requests.
patched('private.central_on_submit',[("if old.state='draft' and new.state='submitted' and exists", "if old.state='draft' and new.state='submitted' and (new.journey is distinct from 'direct') and exists")])
# Draft contextual help may open the existing ticket, never a new conversation system.
patched('private.central_open',[("q.state='draft'", "(q.state='draft'and not q.help_only)")])
# Approved quote booking uses the approved final duration, not the outdated catalogue duration.
# Existing publication, service activation and locks remain validated by the underlying engine.
patched('private.central_request_slots_core',[("-interval '15 minutes',interval '15 minutes'","-interval '1 minute',make_interval(mins=>(select step_minutes from public.schedule_resources where organization_id=q.organization_id))")])
# Approval tries desired time in a subtransaction; slot conflict does not undo acceptance.
s=src('public.consumer_approve_quote')
s=s.replace(';r jsonb;', ';r jsonb;reservation jsonb;')
s=s.replace("perform private.consumer_remember(q.organization_id,'approve',p_key,payload,r);return r;", "if q.desired_start is not null then begin reservation=private.central_book_core(p_code,q.desired_start,null,gen_random_uuid());r=r||jsonb_build_object('booking',reservation,'booking_state','confirmed');exception when exclusion_violation or unique_violation then r=r||jsonb_build_object('booking_state','choose_another_time');end;end if; perform private.consumer_remember(q.organization_id,'approve',p_key,payload,r);return r;")
emit(s)
# Metadata is part of the immutable final version and public presentation.
patched('private.central_request_context_core',[("'booking',private.consumer_booking_status(q)","'journey',q.journey,'desired_start',q.desired_start,'help_only',q.help_only,'photo_request',q.photo_request,'photos_received',exists(select 1 from public.attachments where request_id=q.id and state='ready'and created_at>=q.photo_requested_at),'booking',private.consumer_booking_status(q)"),
 ("'customer_explanation',v.customer_explanation", "'desired_start',v.desired_start,'subtotal_cents',coalesce(v.subtotal_cents,v.total_cents),'discount_cents',v.discount_cents,'customer_explanation',v.customer_explanation"),
 ("'price_mode',i.price_mode)","'price_mode',i.price_mode,'duration_minutes',i.duration_minutes,'discount_cents',i.discount_cents,'source_kind',i.source_kind,'source_code',i.source_code,'public_note',i.public_note)"),
 ("'state',a.state) order by a.created_at) from public.attachments", "'state',a.state,'service',a.service_code) order by a.created_at) from public.attachments")])
for file in ['journey.sql','routing.sql','quotes.sql']:
 emit((root/'scripts/syzia-041'/file).read_text())
# Protect old arbitrary-price endpoints too. Central deterministic review retains its own rules.
for name in ['public.operations_send_reviewed_quote','public.operations_send_quote','public.consumer_send_quote']:
 s=src(name)
 if name=='public.operations_send_reviewed_quote':s=s.replace("perform private.company_lock(p_org);", "perform private.company_lock(p_org);perform private.journey_quote_authorize(p_org);")
 elif name=='public.operations_send_quote':s=s.replace("depth_=private.permission_enter(org_,'quotes.manage');", "depth_=private.permission_enter(org_,'quotes.manage');perform private.journey_quote_authorize(org_);")
 else:s=s.replace("depth_=private.permission_enter(org_,'quotes.manage');", "depth_=private.permission_enter(org_,'quotes.manage');perform private.journey_quote_authorize(org_);")
 emit(s)
# Ticket filtering applies to context, commands, queue and SQL row access.
patched('private.central_ticket',[("not private.central_staff(t.organization_id)","not private.central_staff(t.organization_id)or not private.journey_ticket_visible(t.id)")])
patched('public.central_queue',[("where private.central_staff(t.organization_id) and", "where private.central_staff(t.organization_id) and private.journey_ticket_visible(t.id) and"),("'request_state',q.state", "'routing_scope',t.routing_scope,'routing_reason',t.routing_reason,'desired_start',q.desired_start,'request_state',q.state")])
s=src('private.v029_central_act')
s=s.replace("if t.state='resolved' or not private.central_eligible(t.organization_id,target)","if t.state='resolved' or(t.routing_scope='company'and not private.journey_company_actor(t.organization_id,target))or not private.central_eligible(t.organization_id,target)")
s=s.replace("when 'decision' then", "when 'decision' then")
s=s.replace("ev='escalated';", "ev='escalated';perform private.journey_route(t.id,'Exceção técnica/comercial — decisão da empresa');")
emit(s)
patched('private.v029_central_context',[("'operator_name'", "'can_request_photos',private.journey_company_actor(t.organization_id,auth.uid())and private.permission_allowed(t.organization_id,'central.reply'),'can_price',private.journey_can_price(t.organization_id),'operator_name'"),("where private.central_eligible(t.organization_id,p.id)","where private.central_eligible(t.organization_id,p.id)and(t.routing_scope<>'company'or private.journey_company_actor(t.organization_id,p.id))")])
# Restricted new functions: helpers are not remote entry points.
new_public=['consumer_journey_slots(text,text,jsonb,date)','consumer_complete_journey(text,timestamptz,integer,uuid)','consumer_start_help(text,text,jsonb,jsonb,text,uuid)','consumer_prepare_help_request(text,jsonb,text,boolean,bigint,uuid,jsonb)','consumer_draft_context(text)','consumer_reserve_item_attachment(text,text,text,integer,uuid)','operations_request_photos(uuid,text,text,integer,uuid)','operations_quote_calculate(uuid,text,jsonb,jsonb)','operations_send_calculated_quote(uuid,text,jsonb,jsonb,timestamptz,integer,text,uuid)','operations_quote_catalog(uuid)']
for signature in new_public:emit('revoke all on function public.'+signature+' from public,anon,authenticated;grant execute on function public.'+signature+' to authenticated')
emit('''do $$declare r record;begin for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'and(p.proname like 'journey_%')loop execute format('revoke all on function %s from public,anon,authenticated',r.signature);end loop;end;$$''')
emit('grant execute on function private.journey_ticket_visible(uuid)to authenticated')
emit("notify pgrst,'reload schema';commit")
(root/'supabase/migrations/202609260041_self_service_journeys.sql').write_text('\n'.join(pieces))
print('041 migration generated')

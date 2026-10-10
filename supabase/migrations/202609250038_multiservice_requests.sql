-- SYZIA 038 — incremental, preserving existing requests, quotations and access.
begin;
alter table public.quote_requests add column requested_items jsonb,
 add column review_alerts jsonb not null default '[]' check(jsonb_typeof(review_alerts)='array');
alter table public.quote_requests add constraint requested_items_shape check(requested_items is null or (jsonb_typeof(requested_items)='array' and jsonb_array_length(requested_items) between 1 and 10));
alter table public.quote_versions add column customer_explanation text not null default '' check(length(customer_explanation)<=2000);
create table public.service_relations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 source_id uuid not null,target_id uuid not null,kind text not null check(kind in('includes','incompatible','review')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(source_id<>target_id),
 foreign key(organization_id,source_id)references public.services(organization_id,id),
 foreign key(organization_id,target_id)references public.services(organization_id,id)
);
create unique index service_relations_pair on public.service_relations(organization_id,least(source_id,target_id),greatest(source_id,target_id));
create index service_relations_target on public.service_relations(organization_id,target_id);
alter table public.service_relations enable row level security;
alter table public.service_relations force row level security;
revoke all on public.service_relations from public,anon,authenticated;
grant select on public.service_relations to authenticated;
create policy service_relations_read on public.service_relations for select to authenticated using(private.permission_allowed(organization_id,'services.read'));
create trigger service_relations_audit after insert or update or delete on public.service_relations for each row execute function private.company_audit();
create trigger service_relations_updated before update on public.service_relations for each row execute function private.set_updated_at();
create function public.company_service_relations(p_org uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 perform private.permission_require(p_org,'services.read');
 return jsonb_build_object('revision',(select revision from public.company_settings where organization_id=p_org),
 'relations',coalesce((select jsonb_agg(to_jsonb(r)order by r.created_at,r.id)from public.service_relations r where organization_id=p_org),'[]'::jsonb));
end;$$;
create function public.company_service_relation_save(p_org uuid,p_source uuid,p_target uuid,p_kind text,p_expected_revision integer)returns void language plpgsql security definer set search_path=''as $$
declare existing public.service_relations;begin
 if p_expected_revision is null then raise exception 'company_revision_conflict'using errcode='40001';end if;
 perform private.presence_lock(p_org,'services.manage',p_expected_revision);
 if p_source is null or p_target is null or p_source=p_target then raise exception 'relation_self'using errcode='22023';end if;
 if (select count(*)from public.services where organization_id=p_org and id in(p_source,p_target))<>2 then raise exception 'service_relation_denied'using errcode='42501';end if;
 if p_kind is not null and p_kind not in('includes','incompatible','review')then raise exception 'invalid_relation'using errcode='22023';end if;
 select * into existing from public.service_relations where organization_id=p_org and least(source_id,target_id)=least(p_source,p_target)and greatest(source_id,target_id)=greatest(p_source,p_target);
 if p_kind is null then
   delete from public.service_relations where id=existing.id;
 else
   if existing.id is not null then raise exception 'relation_duplicate_or_contradictory'using errcode='22023';end if;
   if exists(select 1 from public.services where organization_id=p_org and id in(p_source,p_target)and not active)then raise exception 'service_unavailable'using errcode='22023';end if;
   insert into public.service_relations(organization_id,source_id,target_id,kind)values(p_org,p_source,p_target,p_kind);
   if exists(with recursive reach(a,b)as(
      select source_id,target_id from public.service_relations where organization_id=p_org and kind='includes'
      union select reach.a,r.target_id from reach join public.service_relations r on r.source_id=reach.b where r.organization_id=p_org and r.kind='includes')select 1 from reach where a=b)
     then raise exception 'relation_inclusion_cycle'using errcode='22023';end if;
   if exists(with recursive reach(a,b)as(
      select source_id,target_id from public.service_relations where organization_id=p_org and kind='includes'
      union select reach.a,r.target_id from reach join public.service_relations r on r.source_id=reach.b where r.organization_id=p_org and r.kind='includes')
      select 1 from reach join public.service_relations r on ((r.source_id=a and r.target_id=b)or(r.source_id=b and r.target_id=a))where r.organization_id=p_org and r.kind<>'includes')
     then raise exception 'relation_duplicate_or_contradictory'using errcode='22023';end if;
 end if;
 update public.company_settings set revision=revision+1,operational_revision=operational_revision+1 where organization_id=p_org;
end;$$;
-- Relations are reviewed and published with the same immutable public catalog.
do $$declare d text;begin
 d=pg_get_functiondef('private.consumer_design_snapshot(uuid)'::regprocedure);
 execute replace(d,'FUNCTION private.consumer_design_snapshot(', 'FUNCTION private.v037_consumer_design_snapshot(');
end;$$;
create or replace function private.consumer_design_snapshot(p_org uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select private.v037_consumer_design_snapshot(p_org)||jsonb_build_object('relations',coalesce((select jsonb_agg(jsonb_build_object('source',private.consumer_code('s',r.source_id),'target',private.consumer_code('s',r.target_id),'kind',r.kind)order by r.source_id,r.target_id)
 from public.service_relations r join public.services a on a.organization_id=r.organization_id and a.id=r.source_id join public.services b on b.organization_id=r.organization_id and b.id=r.target_id where r.organization_id=p_org and a.active and b.active),'[]'::jsonb));$$;
create function private.consumer_multi_selection(p_publication uuid,p_items jsonb)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare v public.consumer_publications;entry jsonb;calc jsonb;service jsonb;pair jsonb;items jsonb='[]';original jsonb='[]';alerts jsonb='[]';codes text[]='{}';total bigint=0;duration integer=0;mode text='fixed';direct boolean=true;sid uuid;begin
 select * into v from public.consumer_publications where id=p_publication;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)not between 1 and 10 then raise exception 'invalid_request_items'using errcode='22023';end if;
 for entry in select value from jsonb_array_elements(p_items)loop
   perform private.company_keys(entry,array['service','addons','answers','notes']);
   if entry->>'service' is null or (entry->>'service')=any(codes)or jsonb_typeof(entry->'addons')is distinct from 'array' or jsonb_typeof(entry->'answers')is distinct from 'object' or (entry ? 'notes' and jsonb_typeof(entry->'notes')is distinct from 'string')or length(coalesce(entry->>'notes',''))>2000 then raise exception 'invalid_request_items'using errcode='22023';end if;
   calc=private.consumer_selection(p_publication,entry->>'service',array(select jsonb_array_elements_text(entry->'addons')),entry->'answers');
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
 if mode='quote'or jsonb_array_length(alerts)>0 then mode='quote';total=null;direct=false;end if;
 return jsonb_build_object('service_id',sid,'items',items,'total_cents',total,'price_mode',mode,'duration_minutes',duration,'direct_booking',direct,'quotes_allowed',true,'requested_items',original,'review_alerts',alerts);
end;$$;
create function private.consumer_request_selection(q public.quote_requests)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 if q.requested_items is null then return private.consumer_selection(q.publication_id,q.service_code,q.addon_codes,q.answers);end if;
 return private.consumer_multi_selection(q.publication_id,(select jsonb_agg(jsonb_build_object('service',x->'service','addons',x->'addons','answers',x->'answers','notes',coalesce(x->'notes','""'::jsonb)))from jsonb_array_elements(q.requested_items)x));
end;$$;
-- Existing downstream engines retain their authorization, idempotency and transitions.
-- Only selection calculation becomes request-aware (submit, approval, Central, agenda).
do $$declare f record;d text;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('private','public')and p.prokind='f'and p.proname<>'consumer_request_selection'and p.prosrc like '%private.consumer_selection(q.publication_id,q.service_code,q.addon_codes,q.answers)%'loop
 d=pg_get_functiondef(f.oid);execute replace(d,'private.consumer_selection(q.publication_id,q.service_code,q.addon_codes,q.answers)','private.consumer_request_selection(q)');end loop;
end;$$;
-- Build the multiselect command from the existing create engine, preserving consent,
-- rate limiting, idempotency, customer, opportunity and single request transactions.
do $$declare d text;begin
 d=pg_get_functiondef('public.consumer_create_request(text,text,text,text[],jsonb,jsonb,text,boolean,bigint,uuid)'::regprocedure);
 d=replace(d,'FUNCTION public.consumer_create_request(', 'FUNCTION public.consumer_create_multi_request(');
 d=replace(d,'p_service text, p_addons text[], p_answers jsonb,','p_items jsonb,');
 d=replace(d,'declare v public.consumer_publications;','declare p_service text; p_addons text[]; p_answers jsonb; v public.consumer_publications;');
 d=replace(d,'''service'',p_service,''addons'',p_addons,''answers'',p_answers,','''items'',p_items,');
 d=replace(d,'calc=private.consumer_selection(v.id,p_service,p_addons,p_answers);',
 'calc=private.consumer_multi_selection(v.id,p_items);p_service=p_items->0->>''service'';p_addons=array(select jsonb_array_elements_text(p_items->0->''addons''));p_answers=p_items->0->''answers'';');
 d=replace(d,'service_code,addon_codes,answers,notes) values','service_code,addon_codes,answers,notes,requested_items,review_alerts) values');
 d=replace(d,'p_answers,coalesce(p_notes,'''')) returning * into q;', 'p_answers,coalesce(p_notes,''''),calc->''requested_items'',calc->''review_alerts'') returning * into q;');
 -- Dedicated operation avoids key collision with an earlier single-service attempt.
 d=replace(d,'''create_request''','''create_multi_request''');execute d;
end;$$;
create function private.consumer_original_guard()returns trigger language plpgsql set search_path=''as $$begin
 if new.requested_items is distinct from old.requested_items or new.review_alerts is distinct from old.review_alerts then raise exception 'original_request_immutable'using errcode='23514';end if;return new;
end;$$;
create trigger consumer_original_immutable before update on public.quote_requests for each row execute function private.consumer_original_guard();
-- Money stays in quote_items, whose existing RLS requires quotes.values.
-- The request's original selection is readable without leaking prices via SELECT.
create function private.consumer_requested_items(q public.quote_requests)returns jsonb language sql stable security definer set search_path=''as $$
 select case when q.requested_items is null then null else(select jsonb_agg(e.value||jsonb_build_object('priced_items',
   (select jsonb_agg(p.value||jsonb_build_object('unit_cents',i.unit_cents)order by p.n)
    from jsonb_array_elements(e.value->'priced_items')with ordinality p(value,n)
    left join public.quote_versions v on v.request_id=q.id and v.organization_id=q.organization_id and v.kind='estimate'and v.version=1
    left join public.quote_items i on i.version_id=v.id and i.organization_id=q.organization_id and i.position=(p.value->>'position')::integer))order by e.n)
 from jsonb_array_elements(q.requested_items)with ordinality e(value,n))end;$$;
-- Public and internal viewers reuse the same secure context and redaction wrapper.
do $$declare d text;begin
 d=pg_get_functiondef('private.central_request_context_core(text)'::regprocedure);
 d=replace(d,'''notes'',q.notes,','''notes'',q.notes,''requested_items'',private.consumer_requested_items(q),''review_alerts'',q.review_alerts,');
 d=replace(d,'''kind'',v.kind,','''kind'',v.kind,''customer_explanation'',v.customer_explanation,');execute d;
end;$$;
-- Explanation is part of the immutable proposal, visible to the consumer, not an internal note.
do $$declare d text;begin
 d=pg_get_functiondef('private.central_send_quote_core(text,jsonb,integer,timestamp with time zone,integer,uuid)'::regprocedure);
 d=replace(d,'FUNCTION private.central_send_quote_core(', 'FUNCTION private.central_send_reviewed_quote_core(');
 d=replace(d,'p_key uuid)', 'p_key uuid, p_explanation text)');
 d=replace(d,'payload=jsonb_build_array(p_code,p_items,p_duration,p_expires,p_expected_revision);', 'payload=jsonb_build_array(p_code,p_items,p_duration,p_expires,p_expected_revision);if coalesce(p_explanation,'''')<>''''then payload=payload||jsonb_build_array(p_explanation);end if;');
 d=replace(d,'if q.revision<>p_expected_revision then', 'if p_explanation is null or length(p_explanation)>2000 or(q.requested_items is not null and jsonb_array_length(q.requested_items)>1 and length(btrim(p_explanation))<2)then raise exception ''quote_explanation_required''using errcode=''22023'';end if; if q.revision<>p_expected_revision then');
 d=replace(d,'update public.quote_versions set state=''sent'' where id=v.id;', 'update public.quote_versions set customer_explanation=p_explanation,state=''sent'' where id=v.id;');execute d;
end;$$;
create function public.operations_send_reviewed_quote(p_org uuid,p_code text,p_items jsonb,p_duration integer,p_expires timestamptz,p_expected_revision integer,p_explanation text,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare depth_ integer;r jsonb;begin
 depth_=private.permission_enter(p_org,'quotes.manage');perform private.company_lock(p_org);
 perform private.permission_require(p_org,'quotes.values');
 if not exists(select 1 from public.quote_requests where organization_id=p_org and public_code=p_code)then raise exception 'access_denied'using errcode='42501';end if;
 r=private.central_send_reviewed_quote_core(p_code,p_items,p_duration,p_expires,p_expected_revision,p_key,p_explanation);
 perform private.permission_leave(depth_);return r;
end;$$;
-- Central attendants may remove selected proposal lines and apply only the existing
-- published-price/discount autonomy. Consultation values still require the company.
do $$declare d text;begin
 d=pg_get_functiondef('private.v029_central_quote(text,integer,integer,timestamp with time zone,text,bigint,uuid)'::regprocedure);
 d=replace(d,'FUNCTION private.v029_central_quote(', 'FUNCTION private.central_review_quote(');
 d=replace(d,'p_key uuid)', 'p_key uuid, p_positions integer[])');
 d=replace(d,'p_reason,p_expected_cents);prior=', 'p_reason,p_expected_cents,p_positions);prior=');
 d=replace(d,'if selection->>''price_mode''<>''fixed'' then','if exists(select 1 from jsonb_array_elements(selection->''items'')x where x->>''price_mode''<>''fixed'') then');
 d=replace(d,'if not exists(select 1 from public.consumer_publications where id=q.publication_id and manual_id=m.id) then', 'if not exists(select 1 from public.consumer_publications cp where cp.id=q.publication_id and (cp.manual_id=m.id or(cp.manual_id is null and exists(select 1 from public.consumer_pages pg where pg.organization_id=t.organization_id and pg.publication_id=cp.id and pg.enabled)))) then');
 d=replace(d,'for i in select value from jsonb_array_elements(selection->''items'') loop',
 'if cardinality(p_positions)<>jsonb_array_length(selection->''items'')and not public.company_attendant_permission(t.organization_id,''quote_items'')then raise exception ''central_approval_required''using errcode=''42501'';end if; if p_positions is null or cardinality(p_positions)=0 or cardinality(p_positions)<>(select count(distinct n)from unnest(p_positions)n)or exists(select 1 from unnest(p_positions)n where n is null or n<0 or n>=jsonb_array_length(selection->''items''))then raise exception ''invalid_quote_selection''using errcode=''22023'';end if; for i in select value from jsonb_array_elements(selection->''items'')with ordinality x(value,position)where (position-1)::integer=any(p_positions)loop');
 d=replace(d,'private.central_send_quote_core(q.public_code,items,(selection->>''duration_minutes'')::integer,p_expires,q.revision,p_key)', 'private.central_send_reviewed_quote_core(q.public_code,items,(selection->>''duration_minutes'')::integer,p_expires,q.revision,p_key,p_reason)');execute d;
 -- Existing all-lines Central command also stores its already-required reason.
 d=pg_get_functiondef('private.v029_central_quote(text,integer,integer,timestamp with time zone,text,bigint,uuid)'::regprocedure);
 d=replace(d,'private.central_send_quote_core(q.public_code,items,(selection->>''duration_minutes'')::integer,p_expires,q.revision,p_key)', 'private.central_send_reviewed_quote_core(q.public_code,items,(selection->>''duration_minutes'')::integer,p_expires,q.revision,p_key,p_reason)');execute d;
end;$$;
create function public.central_review_quote(p_code text,p_revision integer,p_positions integer[],p_discount integer,p_expires timestamptz,p_reason text,p_expected_cents bigint,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare org_ uuid;depth_ integer;r jsonb;begin
 org_=(select organization_id from public.tickets where public_code=p_code);depth_=private.permission_enter(org_,'quotes.manage');
 perform private.permission_require(org_,'quotes.values');
 r=private.central_review_quote(p_code,p_revision,p_discount,p_expires,p_reason,p_expected_cents,p_key,p_positions);
 r=private.permission_projection(org_,'central_quote',r);perform private.permission_leave(depth_);return r;
end;$$;
-- Old send endpoints stay compatible for legacy records; multiservice adjustments
-- must use the reviewed core so they cannot omit the consumer-facing explanation.
create or replace function private.central_send_quote_core(p_code text,p_items jsonb,p_duration integer,p_expires timestamptz,p_expected_revision integer,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$begin
 return private.central_send_reviewed_quote_core(p_code,p_items,p_duration,p_expires,p_expected_revision,p_key,'');
end;$$;
do $$declare r record;begin
 for r in select p.oid::regprocedure signature,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('private','public')and p.proname in('company_service_relations','company_service_relation_save','v037_consumer_design_snapshot','consumer_multi_selection','consumer_request_selection','consumer_create_multi_request','consumer_original_guard','consumer_requested_items','central_send_reviewed_quote_core','operations_send_reviewed_quote','central_review_quote')loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
 if r.nspname='public'then execute format('grant execute on function %s to authenticated',r.signature);end if;end loop;
end;$$;
commit;

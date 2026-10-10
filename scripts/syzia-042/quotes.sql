create function private.quote_explanation_required(q public.quote_requests,p_items jsonb,p_discount jsonb)returns boolean language plpgsql stable security definer set search_path=''as $$
declare i jsonb;o public.quote_items;begin
 if coalesce((p_discount->>'value')::numeric,0)>0 or jsonb_array_length(p_items)<>(select count(*)from public.quote_items i join public.quote_versions v on v.id=i.version_id where v.request_id=q.id and v.kind='estimate'and v.version=1)then return true;end if;
 if (select count(distinct value->>'position')from jsonb_array_elements(p_items))<>jsonb_array_length(p_items)then return true;end if;
 for i in select value from jsonb_array_elements(p_items)loop
 if i->>'kind'<>'original'or coalesce((i->>'discount_cents')::numeric,0)>0 or btrim(coalesce(i->>'note',''))<>''then return true;end if;
 select qi.*into o from public.quote_items qi join public.quote_versions v on v.id=qi.version_id where v.request_id=q.id and v.kind='estimate'and v.version=1 and qi.position=(i->>'position')::integer;
 if o.id is null or o.unit_cents is distinct from(i->>'unit_cents')::integer or o.quantity is distinct from(i->>'quantity')::integer or coalesce(o.duration_minutes,0)is distinct from(i->>'duration_minutes')::integer then return true;end if;
 end loop;return false;end;$$;
create function private.execution_quote_policy(q public.quote_requests,p_items jsonb)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare r jsonb;s public.services;i jsonb;begin
 r=private.execution_policy(q.publication_id,coalesce(q.requested_items,jsonb_build_array(jsonb_build_object('service',q.service_code))));
 for i in select value from jsonb_array_elements(p_items)loop
 if i->>'kind'='manual'then return jsonb_build_object('mode','continuous','max_periods',1);end if;
 if i->>'kind'in('service','addon')then
 select sv.*into s from public.services sv where sv.organization_id=q.organization_id and (private.consumer_code('s',sv.id)=i->>'code'or exists(select 1 from public.service_addons a where a.service_id=sv.id and private.consumer_code('a',a.id)=i->>'code'));
 if s.id is null or s.execution_mode<>'split'then return jsonb_build_object('mode','continuous','max_periods',1);end if;
 r=jsonb_set(r,'{max_periods}',to_jsonb(least((r->>'max_periods')::integer,coalesce(s.execution_max_periods,30))));end if;
 end loop;return r;end;$$;

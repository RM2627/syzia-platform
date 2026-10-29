-- SYZIA 061 / B. Existing publications and original requests remain immutable.
begin;
alter table public.services
 add column quantity_enabled boolean not null default false,
 add column quantity_min integer not null default 1 check(quantity_min between 1 and 100),
 add column quantity_max integer not null default 1 check(quantity_max between quantity_min and 100),
 add column quantity_unit text not null default 'unidade' check(length(trim(quantity_unit)) between 1 and 40),
 add column quantity_duration text not null default 'fixed' check(quantity_duration in('fixed','proportional','manual'));
create table private.quantity_events(id bigint generated always as identity primary key,organization_id uuid not null references public.organizations(id),service_id uuid not null,actor_id uuid,configuration jsonb not null,created_at timestamptz not null default clock_timestamp());
alter table private.quantity_events enable row level security;
alter table private.quantity_events force row level security;
revoke all on private.quantity_events from public,anon,authenticated,service_role;
alter function public.company_save(uuid,text,uuid,integer,jsonb)rename to company_save_pre061;
revoke all on function public.company_save_pre061(uuid,text,uuid,integer,jsonb)from public,anon,authenticated,service_role;
create function public.company_save(p_org uuid,p_entity text,p_id uuid,p_expected_revision integer,p_data jsonb)returns uuid language plpgsql security definer set search_path=''as $$
declare result uuid;old_ public.services;next_ public.services;keys_ text[]=array['quantity_enabled','quantity_min','quantity_max','quantity_unit','quantity_duration'];begin
 if p_entity<>'service'then return public.company_save_pre061(p_org,p_entity,p_id,p_expected_revision,p_data);end if;
 result=public.company_save_pre061(p_org,p_entity,p_id,p_expected_revision,p_data-keys_);
 select *into old_ from public.services where id=result and organization_id=p_org for update;
 select *into next_ from jsonb_populate_record(old_,p_data);
 update public.services set quantity_enabled=next_.quantity_enabled,quantity_min=next_.quantity_min,quantity_max=next_.quantity_max,quantity_unit=next_.quantity_unit,quantity_duration=next_.quantity_duration where id=result and organization_id=p_org;
 if p_data ?| keys_ then insert into private.quantity_events(organization_id,service_id,actor_id,configuration)values(p_org,result,auth.uid(),jsonb_build_object('enabled',next_.quantity_enabled,'min',next_.quantity_min,'max',next_.quantity_max,'unit',next_.quantity_unit,'duration',next_.quantity_duration));end if;
 return result;
end;$$;
revoke all on function public.company_save(uuid,text,uuid,integer,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.company_save(uuid,text,uuid,integer,jsonb)to authenticated;
-- Extend only the existing publication builders, retaining all guards and immutable snapshots.
do $$declare r record;d text;n integer=0;needle text=$n$'duration_minutes',s->'duration_minutes'$n$;begin
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('private','public')and p.prokind='f' and p.prosrc like '%'||needle||'%'loop
 d=pg_get_functiondef(r.oid);d=replace(d,needle,needle||$x$,'quantity_enabled',coalesce((s->>'quantity_enabled')::boolean,false),'quantity_min',coalesce((s->>'quantity_min')::int,1),'quantity_max',coalesce((s->>'quantity_max')::int,1),'quantity_unit',coalesce(s->>'quantity_unit','unidade'),'quantity_duration',coalesce(s->>'quantity_duration','fixed')$x$);execute d;n=n+1;
 end loop;if n=0 then raise exception 'quantity_publication_contract_missing';end if;
end;$$;
create function private.quantity_selection(service jsonb,entry jsonb,calc jsonb)returns jsonb language plpgsql immutable set search_path=''as $$
declare qty integer;items_ jsonb;duration_ integer;price_ bigint;mode_ text;begin
 if entry ? 'quantity' and (jsonb_typeof(entry->'quantity')<>'number' or (entry->>'quantity')!~'^[1-9][0-9]{0,2}$')then raise exception 'invalid_service_quantity'using errcode='22023';end if;
 qty=coalesce((entry->>'quantity')::integer,1);
 if coalesce((service->>'quantity_enabled')::boolean,false)then
 if qty<coalesce((service->>'quantity_min')::int,1)or qty>coalesce((service->>'quantity_max')::int,1)then raise exception 'service_quantity_out_of_range'using errcode='22023';end if;
 elsif qty<>1 then raise exception 'service_quantity_disabled'using errcode='22023';end if;
 -- Add-ons keep their established once-per-selected-service price and duration.
 select jsonb_agg(case when n=1 then value||jsonb_build_object('quantity',qty)else value end order by n)into items_ from jsonb_array_elements(calc->'items')with ordinality x(value,n);
 mode_=case when coalesce((service->>'quantity_enabled')::boolean,false)then coalesce(service->>'quantity_duration','fixed')else 'fixed'end;
 duration_=(calc->>'duration_minutes')::int;
 if mode_='proportional'then duration_=duration_+coalesce((service->>'duration_minutes')::int,0)*(qty-1);end if;
 if duration_>10080 then raise exception 'service_duration_limit'using errcode='22023';end if;
 price_=(calc->>'total_cents')::bigint;
 if price_ is not null then price_=price_+coalesce((items_->0->>'unit_cents')::bigint,0)*(qty-1);end if;
 if price_>2147483647 then raise exception 'service_price_limit'using errcode='22023';end if;
 return calc||jsonb_build_object('items',items_,'total_cents',price_,'duration_minutes',duration_,'direct_booking',coalesce((calc->>'direct_booking')::boolean,false)and mode_<>'manual');
end;$$;
revoke all on function private.quantity_selection(jsonb,jsonb,jsonb)from public,anon,authenticated,service_role;
do $$declare d text;needle text=$n$sid=coalesce(sid,(calc->>'service_id')::uuid);$n$;begin
 d=pg_get_functiondef('private.journey_selection(uuid,jsonb,boolean)'::regprocedure);
 if position(needle in d)=0 or position($n$array['service','addons','answers','notes']$n$ in d)=0 then raise exception 'quantity_journey_contract_missing';end if;
 d=replace(d,$n$array['service','addons','answers','notes']$n$,$n$array['service','addons','answers','notes','quantity']$n$);
 d=replace(d,needle,$n$calc=private.quantity_selection(service,entry,calc);$n$||needle);
 d=replace(d,$n$entry||jsonb_build_object('name',service->>'name'$n$,$n$entry||jsonb_build_object('quantity_enabled',coalesce((service->>'quantity_enabled')::boolean,false),'quantity_duration',coalesce(service->>'quantity_duration','fixed'),'quantity_unit',coalesce(service->>'quantity_unit','unidade'),'name',service->>'name'$n$);execute d;
 d=pg_get_functiondef('private.consumer_request_selection(public.quote_requests)'::regprocedure);
 d=replace(d,$n$'service',x->'service'$n$,$n$'quantity',coalesce(x->'quantity','1'::jsonb),'service',x->'service'$n$);execute d;
end;$$;
-- Carry service quantity settings through existing approved commercial snapshots.
do $$declare d text;begin
 d=pg_get_functiondef('private.commercial_config_fields()'::regprocedure);
 if position('"execution_max_periods"' in d)=0 then raise exception 'quantity_commercial_contract_missing';end if;
 d=replace(d,'"execution_max_periods"','"execution_max_periods","quantity_enabled","quantity_min","quantity_max","quantity_unit","quantity_duration"');execute d;
end;$$;
-- Canonicalize defaults so previously published 054/055 snapshots remain compatible.
alter function private.commercial_config_export(uuid)rename to commercial_config_export_pre061;
create function private.commercial_config_export(p_org uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare r jsonb;begin
 r=private.commercial_config_export_pre061(p_org);
 return jsonb_set(r,'{tables,services}',coalesce((select jsonb_agg(case when not coalesce((v->>'quantity_enabled')::boolean,false)and coalesce((v->>'quantity_min')::int,1)=1 and coalesce((v->>'quantity_max')::int,1)=1 and coalesce(v->>'quantity_unit','unidade')='unidade'and coalesce(v->>'quantity_duration','fixed')='fixed'then v-array['quantity_enabled','quantity_min','quantity_max','quantity_unit','quantity_duration']else v end)from jsonb_array_elements(r->'tables'->'services')v),'[]'));
end;$$;
revoke all on function private.commercial_config_export_pre061(uuid),private.commercial_config_export(uuid)from public,anon,authenticated,service_role;
-- Reuse the quote revision/audit engine; quantity policy is resolved from the immutable original.
create function private.quantity_quote_minutes(q public.quote_requests,i jsonb,qty integer,minutes integer)returns integer language plpgsql stable security definer set search_path=''as $$declare policy jsonb;begin
 if i->>'kind'='original'then select r into policy from jsonb_array_elements(coalesce(q.requested_items,'[]'))r where r->'priced_items'->0->>'position'=i->>'position';
 elsif i->>'kind'='service'then select to_jsonb(s)into policy from public.services s where organization_id=q.organization_id and private.consumer_code('s',id)=i->>'code';end if;
 return case when coalesce((policy->>'quantity_enabled')::boolean,false)and policy->>'quantity_duration'in('fixed','manual')then minutes else qty*minutes end;
end;$$;
revoke all on function private.quantity_quote_minutes(public.quote_requests,jsonb,integer,integer)from public,anon,authenticated,service_role;
do $$declare d text;needle text='duration=duration+quantity*minutes;';begin
 d=pg_get_functiondef('private.journey_quote_calculation(uuid,text,jsonb,jsonb)'::regprocedure);
 if position(needle in d)=0 then raise exception 'quantity_quote_contract_missing';end if;
 execute replace(d,needle,'duration=duration+private.quantity_quote_minutes(q,i,quantity,minutes);');
end;$$;
alter function public.operations_quote_catalog(uuid)rename to operations_quote_catalog_pre061;
revoke all on function public.operations_quote_catalog_pre061(uuid)from public,anon,authenticated,service_role;
create function public.operations_quote_catalog(p_org uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare r jsonb;begin
 r=public.operations_quote_catalog_pre061(p_org);
 return jsonb_set(r,'{services}',coalesce((select jsonb_agg(v||jsonb_build_object('quantity_enabled',s.quantity_enabled,'quantity_duration',s.quantity_duration))from jsonb_array_elements(r->'services')v join public.services s on s.organization_id=p_org and private.consumer_code('s',s.id)=v->>'code'),'[]'));
end;$$;
revoke all on function public.operations_quote_catalog(uuid)from public,anon,authenticated,service_role;
grant execute on function public.operations_quote_catalog(uuid)to authenticated;
-- The legacy one-service endpoint also obeys published quantity/duration policy.
-- Multi-service calculation calls the existing five-argument overload directly.
create function private.quantity_single_selection(p_publication uuid,p_service text,p_addons text[],p_answers jsonb)returns jsonb language plpgsql stable security definer set search_path=''as $$declare c jsonb;s jsonb;begin
 c=private.consumer_selection(p_publication,p_service,p_addons,p_answers,true);
 select x into s from public.consumer_publications p,jsonb_array_elements(p.payload->'services')x where p.id=p_publication and x->>'code'=p_service;
 return private.quantity_selection(s,'{}',c);
end;$$;
revoke all on function private.quantity_single_selection(uuid,text,text[],jsonb)from public,anon,authenticated,service_role;
do $$declare d text;begin
 d=pg_get_functiondef('public.consumer_create_request(text,text,text,text[],jsonb,jsonb,text,boolean,bigint,uuid)'::regprocedure);
 if position('private.consumer_selection(v.id,p_service,p_addons,p_answers)'in d)=0 then raise exception 'quantity_single_contract_missing';end if;
 execute replace(d,'private.consumer_selection(v.id,p_service,p_addons,p_answers)','private.quantity_single_selection(v.id,p_service,p_addons,p_answers)');
 d=pg_get_functiondef('private.consumer_request_selection(public.quote_requests)'::regprocedure);
 execute replace(d,'private.consumer_selection(q.publication_id,q.service_code,q.addon_codes,q.answers)','private.quantity_single_selection(q.publication_id,q.service_code,q.addon_codes,q.answers)');
end;$$;
-- Persist calculated units in initial estimates and help-to-request conversion.
do $$declare d text;r record;needle text;replacement text;n int=0;begin
 for r in select oid,proname from pg_proc where oid in('public.consumer_create_multi_request(text,text,jsonb,jsonb,text,boolean,bigint,uuid)'::regprocedure,'public.consumer_prepare_help_request(text,jsonb,text,boolean,bigint,uuid,jsonb)'::regprocedure)loop
 d=pg_get_functiondef(r.oid);
 if r.proname='consumer_create_multi_request'then needle=$n$item->>'name',1,(item->>'unit_cents')$n$;replacement=$n$item->>'name',coalesce((item->>'quantity')::int,1),(item->>'unit_cents')$n$;
 else needle=$n$i->>'name',1,(i->>'unit_cents')$n$;replacement=$n$i->>'name',coalesce((i->>'quantity')::int,1),(i->>'unit_cents')$n$;end if;
 if position(needle in d)=0 then raise exception 'quantity_estimate_contract_missing';end if;
 execute replace(d,needle,replacement);n=n+1;
 end loop;if n<>2 then raise exception 'quantity_estimate_contract_missing';end if;
end;$$;
commit;

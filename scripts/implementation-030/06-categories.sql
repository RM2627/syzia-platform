create function private.service_category_sync()returns trigger language plpgsql security definer set search_path=''as $$declare c public.service_categories;begin
 if tg_op='UPDATE'and new.category is not distinct from old.category and new.category_id is not distinct from old.category_id then return new;end if;
 if new.category_id is not null and(tg_op='INSERT'or new.category_id is distinct from old.category_id)then
 select * into c from public.service_categories where organization_id=new.organization_id and id=new.category_id;
 if c.id is null or not c.active then raise exception 'service_category_unavailable';end if;new.category=c.name;return new;end if;
 if length(btrim(coalesce(new.category,'')))=0 then new.category='';new.category_id=null;return new;end if;
 insert into public.service_categories(organization_id,name)values(new.organization_id,btrim(new.category))on conflict do nothing;
 select * into c from public.service_categories where organization_id=new.organization_id and lower(btrim(name))=lower(btrim(new.category));
 if not c.active and(tg_op='INSERT'or old.category_id is distinct from c.id)then raise exception 'service_category_unavailable';end if;
 new.category_id=c.id;new.category=c.name;return new;
end;$$;
create trigger service_category_sync before insert or update of category,category_id on public.services for each row execute function private.service_category_sync();
create function public.company_categories(p_org uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 perform private.permission_require(p_org,'services.read');return coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('in_use',(select count(*)from public.services s where s.organization_id=p_org and s.category_id=c.id))order by position,name,id)from public.service_categories c where organization_id=p_org),'[]'::jsonb);end;$$;
create function public.company_category_save(p_org uuid,p_id uuid,p_revision int,p_data jsonb,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare c public.service_categories;payload jsonb;prior private.category_commands;r jsonb;begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'services.manage');perform private.company_keys(p_data,array['name','active','position','delete']);
 if p_key is null then raise exception 'category_key_required';end if;
 payload=jsonb_build_array(p_id,p_revision,p_data);select * into prior from private.category_commands where organization_id=p_org and actor_id=auth.uid()and key=p_key;
 if found then if prior.payload<>payload then raise exception 'idempotency_conflict';end if;return prior.result;end if;
 if p_id is null then
 if p_revision is distinct from 0 then raise exception 'category_revision_conflict'using errcode='40001';end if;
 insert into public.service_categories(organization_id,name,position)values(p_org,btrim(p_data->>'name'),coalesce((p_data->>'position')::int,0))on conflict do nothing;
 select * into c from public.service_categories where organization_id=p_org and lower(btrim(name))=lower(btrim(p_data->>'name'));p_id=c.id;
 else
 select * into c from public.service_categories where organization_id=p_org and id=p_id for update;
 if c.id is null then raise exception 'permission_denied'using errcode='42501';end if;
 if c.revision is distinct from p_revision then raise exception 'category_revision_conflict'using errcode='40001';end if;
 if coalesce((p_data->>'delete')::boolean,false)then
 if exists(select 1 from public.services where organization_id=p_org and category_id=p_id)then raise exception 'category_in_use';end if;
 delete from public.service_categories where organization_id=p_org and id=p_id;
 else
 update public.service_categories set name=coalesce(nullif(btrim(p_data->>'name'),''),name),position=coalesce((p_data->>'position')::int,position),active=coalesce((p_data->>'active')::boolean,active),revision=revision+1 where organization_id=p_org and id=p_id returning * into c;
 update public.services set category=c.name where organization_id=p_org and category_id=p_id and category is distinct from c.name;
 end if;end if;
 perform private.company_touch(p_org,true);r=jsonb_build_object('id',p_id,'revision',c.revision);insert into private.category_commands values(p_org,auth.uid(),p_key,payload,r);return r;
end;$$;
create policy service_categories_read on public.service_categories for select to authenticated using(private.permission_allowed(organization_id,'services.read'));
do $$declare d text;begin
 d=pg_get_functiondef('public.company_save(uuid,text,uuid,integer,jsonb)'::regprocedure);
 d=replace(d,'''name'',''category'',''description''','''name'',''category'',''category_id'',''description''');
 d=replace(d,'name,category,description','name,category,category_id,description');
 d=replace(d,'r.name,r.category,r.description','r.name,r.category,r.category_id,r.description');
 d=replace(d,'category=r.category,description','category=r.category,category_id=r.category_id,description');execute d;
end;$$;

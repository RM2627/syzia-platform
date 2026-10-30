-- Native importer only. Historical editorial actions, grants and tables preserved.
begin;
create function private.insights_import_validate(d jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare k text; b jsonb;
begin
 if jsonb_typeof(d) is distinct from 'object' then raise exception 'insights_import_shape_invalid';end if;
 foreach k in array array['title','slug','summary','category','author'] loop
  if jsonb_typeof(d->k) is distinct from 'string' then raise exception 'insights_import_shape_invalid';end if;
 end loop;
 foreach k in array array['cover','seo_title','seo_description','kind'] loop
  if d ? k and jsonb_typeof(d->k) is distinct from 'string' then raise exception 'insights_import_shape_invalid';end if;
 end loop;
 foreach k in array array['featured','toc'] loop
  if d ? k and jsonb_typeof(d->k) is distinct from 'boolean' then raise exception 'insights_import_shape_invalid';end if;
 end loop;
 if jsonb_typeof(d->'tags') is distinct from 'array' or jsonb_typeof(d->'blocks') is distinct from 'array' then raise exception 'insights_import_shape_invalid';end if;
 perform private.insights_validate(d);
 if exists(select 1 from jsonb_array_elements(d->'tags') t where jsonb_typeof(t) is distinct from 'string') then raise exception 'insights_tags_invalid';end if;
 for b in select value from jsonb_array_elements(d->'blocks') loop
  if jsonb_typeof(b) is distinct from 'object' or jsonb_typeof(b->'type') is distinct from 'string' then raise exception 'insights_block_invalid';end if;
  foreach k in array array['text','url','alt','caption','media'] loop
   if b ? k and jsonb_typeof(b->k) is distinct from 'string' then raise exception 'insights_block_invalid';end if;
  end loop;
  foreach k in array array['bold','italic'] loop
   if b ? k and jsonb_typeof(b->k) is distinct from 'boolean' then raise exception 'insights_block_invalid';end if;
  end loop;
  if b ? 'level' and (jsonb_typeof(b->'level') is distinct from 'number' or b->>'level' not in ('2','3')) then raise exception 'insights_block_invalid';end if;
 end loop;
end;$$;

create function private.insights_import(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d jsonb; item jsonb; items jsonb:='[]'; i integer:=0; issue text; duplicate_ boolean; result_ jsonb;
begin
 if not private.insights_allowed() then raise exception 'access_denied' using errcode='42501';end if;
 if p_action='import_preview' then
  perform private.company_keys(p_data,array['documents']);
  if jsonb_typeof(p_data->'documents') is distinct from 'array' then raise exception 'insights_import_invalid';end if;
  if jsonb_array_length(p_data->'documents') not between 1 and 50 or octet_length(p_data::text)>1100000 then raise exception 'insights_import_invalid';end if;
  for d in select value from jsonb_array_elements(p_data->'documents') loop
   issue:=null;
   begin perform private.insights_import_validate(d);
   exception when others then
    issue:=case when sqlerrm in ('insights_document_invalid','insights_import_shape_invalid','insights_taxonomy_required','insights_tags_invalid','insights_kind_invalid','insights_media_missing','insights_block_invalid','insights_link_invalid') then sqlerrm else 'insights_import_invalid' end;
   end;
   duplicate_:=exists(select 1 from private.insights_posts where draft->>'slug'=d->>'slug' or published->>'slug'=d->>'slug') or exists(select 1 from private.insights_redirects where slug=d->>'slug');
   items:=items||jsonb_build_array(jsonb_build_object('index',i,'valid',issue is null,'duplicate',duplicate_,'error',issue));i:=i+1;
  end loop;
  return jsonb_build_object('items',items);
 elsif p_action='import_draft' then
  perform private.company_keys(p_data,array['document']);d:=p_data->'document';
  perform private.insights_import_validate(d);
  -- Short transaction lock closes check/insert races, including normal editorial writes.
  -- No global uniqueness constraint is imposed on existing drafts.
  lock table private.insights_posts in share row exclusive mode;
  if exists(select 1 from private.insights_posts where draft->>'slug'=d->>'slug' or published->>'slug'=d->>'slug') or exists(select 1 from private.insights_redirects where slug=d->>'slug') then
   return jsonb_build_object('status','duplicate','slug',d->>'slug');
  end if;
  result_:=public.insights_editor('create',jsonb_build_object('document',d));
  insert into private.insights_audit(post_id,actor_id,event,revision)values((result_->>'id')::uuid,auth.uid(),'imported',(result_->>'revision')::integer);
  return jsonb_build_object('status','created','slug',d->>'slug','post_id',result_->>'id','state',result_->>'state');
 end if;
 raise exception 'insights_action_invalid';
end;$$;
revoke all on function private.insights_import_validate(jsonb),private.insights_import(text,jsonb) from public,anon,authenticated,service_role;

-- Add dispatch after the unchanged session/permission check; fail closed on drift.
do $$declare definition_ text; anchor_ text:=$anchor$if p_action='grant'then$anchor$;
begin
 definition_:=pg_get_functiondef('public.insights_editor(text,jsonb)'::regprocedure);
 if position(anchor_ in definition_)=0 or position(anchor_ in substring(definition_ from position(anchor_ in definition_)+length(anchor_)))>0 then raise exception 'insights_import_contract_changed';end if;
 execute replace(definition_,anchor_,$dispatch$if p_action in ('import_preview','import_draft') then return private.insights_import(p_action,p_data);end if;
 if p_action='grant'then$dispatch$);
end;$$;
commit;

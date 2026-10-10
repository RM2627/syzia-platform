begin;
create function public.consumer_reserve_attachment(p_code text,p_mime text,p_size integer,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;a public.attachments;payload jsonb;prior jsonb;r jsonb;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);payload=jsonb_build_array(p_code,p_mime,p_size);prior=private.consumer_idem(q.organization_id,'reserve_attachment',p_key,payload);if prior is not null then return prior;end if;
 if q.state<>'draft' then raise exception 'attachments_closed' using errcode='22023';end if;
 if (select count(*) from public.attachments where request_id=q.id and (state='ready' or(state='pending' and expires_at>now())))>=5 then raise exception 'attachment_limit' using errcode='22023';end if;
 insert into public.attachments(organization_id,request_id,uploaded_by,object_path,mime,size_bytes) values(q.organization_id,q.id,auth.uid(),q.organization_id::text||'/'||q.id::text||'/'||gen_random_uuid()::text,p_mime,p_size) returning * into a;
 r=jsonb_build_object('code',a.public_code);perform private.consumer_remember(q.organization_id,'reserve_attachment',p_key,payload,r);return r;
end;$$;
-- Gateway only. Caller must verify JWT through Supabase Auth before supplying p_user.
create function public.consumer_gateway_attachment(p_code text,p_user uuid,p_write boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attachments;q public.quote_requests;
begin perform pg_advisory_xact_lock(734921501);perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user)::text,true);
 select * into a from public.attachments where public_code=p_code;
 if a.id is null or not private.consumer_access(a.request_id,p_write) then raise exception 'attachment_access_denied' using errcode='42501';end if;
 select * into q from public.quote_requests where id=a.request_id;
 if p_write and (a.state not in ('pending','ready') or(a.state='pending' and a.expires_at<=now()) or q.state<>'draft' or a.uploaded_by<>p_user) then raise exception 'upload_expired_or_closed' using errcode='22023';end if;
 if not p_write and a.state<>'ready' then raise exception 'attachment_not_ready' using errcode='22023';end if;
 return jsonb_build_object('path',a.object_path,'mime',a.mime,'size',a.size_bytes,'state',a.state);
end;$$;
create function public.consumer_finalize_attachment(p_code text,p_user uuid,p_sha256 text,p_size integer,p_width integer,p_height integer) returns void language plpgsql security definer set search_path='' as $$
declare a public.attachments;
begin perform public.consumer_gateway_attachment(p_code,p_user,true);select * into a from public.attachments where public_code=p_code;
 if a.state='ready' then if a.sha256 is distinct from p_sha256 then raise exception 'attachment_already_finalized' using errcode='22023';end if;return;end if;
 update public.attachments set state='ready',sha256=p_sha256,size_bytes=p_size,width=p_width,height=p_height where id=a.id;
end;$$;
create function public.consumer_attachment_ticket(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attachments;secret text;
begin perform private.consumer_lock();select * into a from public.attachments where public_code=p_code and state='ready';if a.id is null or not private.consumer_access(a.request_id) then raise exception 'attachment_access_denied' using errcode='42501';end if;
 secret=encode(extensions.gen_random_bytes(32),'hex');insert into public.attachment_tickets(organization_id,attachment_id,user_id,token_hash,expires_at) values(a.organization_id,a.id,auth.uid(),encode(extensions.digest(secret,'sha256'),'hex'),now()+interval '60 seconds');return jsonb_build_object('ticket',secret,'expires_in',60);
end;$$;
create function public.consumer_gateway_download(p_code text,p_user uuid,p_ticket text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;t public.attachment_tickets;
begin r=public.consumer_gateway_attachment(p_code,p_user,false);select t1.* into t from public.attachment_tickets t1 join public.attachments a on a.id=t1.attachment_id where a.public_code=p_code and t1.user_id=p_user and t1.token_hash=encode(extensions.digest(p_ticket,'sha256'),'hex') and t1.used_at is null and t1.expires_at>now();if t.id is null then raise exception 'download_ticket_invalid' using errcode='42501';end if;update public.attachment_tickets set used_at=clock_timestamp() where id=t.id;return r;
end;$$;
revoke all on function public.consumer_reserve_attachment(text,text,integer,uuid),public.consumer_attachment_ticket(text),public.consumer_gateway_attachment(text,uuid,boolean),public.consumer_finalize_attachment(text,uuid,text,integer,integer,integer),public.consumer_gateway_download(text,uuid,text) from public,anon,authenticated;
grant execute on function public.consumer_reserve_attachment(text,text,integer,uuid),public.consumer_attachment_ticket(text) to authenticated;
grant execute on function public.consumer_gateway_attachment(text,uuid,boolean),public.consumer_finalize_attachment(text,uuid,text,integer,integer,integer),public.consumer_gateway_download(text,uuid,text) to service_role;
commit;

-- SYZIA 036: opaque activation selectors over the existing access lifecycle.
-- 001–033 are unchanged. No backfill, plaintext token, user or membership creation.
begin;
alter table private.enterprise_accounts
  add column activation_link_hash text check (activation_link_hash ~ '^[a-f0-9]{64}$'),
  add column activation_link_generation integer;
create unique index enterprise_activation_link_unique
  on private.enterprise_accounts(activation_link_hash) where activation_link_hash is not null;

create function private.access_bind_link(p_id uuid,p_link_hash text) returns void
language plpgsql security definer set search_path='' as $$begin
 if p_link_hash is null or p_link_hash !~ '^[a-f0-9]{64}$' then raise exception 'access_invalid';end if;
 update private.enterprise_accounts set activation_link_hash=p_link_hash,activation_link_generation=generation
 where id=p_id and state='pending' and code_hash is not null;
 if not found then raise exception 'access_change_unavailable';end if;
end;$$;

create function public.access_finish_provision_link(p_id uuid,p_actor uuid,p_hash text,p_link_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 result=public.access_finish_provision(p_id,p_actor,p_hash);
 perform private.access_bind_link(p_id,p_link_hash);
 return result;
end;$$;
create function public.access_reset_link(p_id uuid,p_actor uuid,p_hash text,p_link_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 result=public.access_reset(p_id,p_actor,p_hash);
 perform private.access_bind_link(p_id,p_link_hash);
 return result;
end;$$;
create function public.access_delivery_prepare_link(p_id uuid,p_actor uuid,p_hash text,p_rotate boolean,p_link_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 result=public.access_delivery_prepare(p_id,p_actor,p_hash,p_rotate);
 perform private.access_bind_link(p_id,p_link_hash);
 return result;
end;$$;

-- Diagnostics are service-only. The HTTP adapter never exposes these reasons,
-- account identifiers or existence to the unauthenticated caller.
create function private.access_verify_preparation(p_id uuid,p_hash text,p_proof text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.enterprise_accounts;result jsonb;company_code text;begin
 perform pg_advisory_xact_lock(734921501);
 select * into a from private.enterprise_accounts where id=p_id for update;
 if a.id is null then return jsonb_build_object('valid',false,'reason','activation_context_invalid');end if;
 if a.state='active' then return jsonb_build_object('valid',false,'reason','activation_already_used');end if;
 if a.state<>'pending' or a.code_hash is null or a.code_expires is null then
  return jsonb_build_object('valid',false,'reason','activation_preparation_incompatible');end if;
 if a.code_expires<=clock_timestamp() then return jsonb_build_object('valid',false,'reason','activation_code_expired');end if;
 if a.attempts>=(select max_attempts from private.access_policy) then
  return jsonb_build_object('valid',false,'reason','activation_attempts_exhausted');end if;
 if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=a.user_id and p.status='active'
  and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now())) then
  return jsonb_build_object('valid',false,'reason','activation_preparation_incompatible');end if;
 if a.organization_id is not null and not exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id
  where m.organization_id=a.organization_id and m.user_id=a.user_id and m.status='active' and o.status='active') then
  return jsonb_build_object('valid',false,'reason','activation_preparation_incompatible');end if;
 company_code=case when a.organization_id is null then 'SYZIA' else (select code from private.enterprise_codes where organization_id=a.organization_id)end;
 -- Existing verifier retains the attempt counter, expiration and proof lifecycle.
 result=public.access_verify_code(company_code,a.username,p_hash,p_proof);
 if result is null then return jsonb_build_object('valid',false,'reason','activation_code_invalid');end if;
 return result||jsonb_build_object('valid',true);
end;$$;

create function public.access_verify_link(p_link_hash text,p_hash text,p_proof text) returns jsonb
language plpgsql security definer set search_path='' as $$declare a private.enterprise_accounts;begin
 perform pg_advisory_xact_lock(734921501);
 select * into a from private.enterprise_accounts where activation_link_hash=p_link_hash for update;
 if a.id is null then return jsonb_build_object('valid',false,'reason','activation_link_invalid');end if;
 if a.state='active' then return jsonb_build_object('valid',false,'reason','activation_already_used');end if;
 if a.activation_link_generation is distinct from a.generation then
  return jsonb_build_object('valid',false,'reason','activation_link_replaced');end if;
 return private.access_verify_preparation(a.id,p_hash,p_proof);
end;$$;

-- Old 034/035 links continue to work with their original context kept out of the UI.
-- A replaced generation must use its new opaque link, preventing accidental mixing.
create function public.access_verify_legacy(p_code text,p_username text,p_hash text,p_proof text) returns jsonb
language plpgsql security definer set search_path='' as $$declare a private.enterprise_accounts;begin
 perform pg_advisory_xact_lock(734921501);
 select x.* into a from private.enterprise_accounts x left join private.enterprise_codes c on c.organization_id=x.organization_id
 where x.username=lower(btrim(p_username)) and ((x.organization_id is null and upper(btrim(p_code))='SYZIA')or c.code=upper(btrim(p_code))) for update of x;
 if a.id is null then return jsonb_build_object('valid',false,'reason','activation_context_invalid');end if;
 if a.activation_link_hash is not null then return jsonb_build_object('valid',false,'reason','activation_link_required');end if;
 return private.access_verify_preparation(a.id,p_hash,p_proof);
end;$$;

revoke all on function private.access_bind_link(uuid,text),private.access_verify_preparation(uuid,text,text)
 from public,anon,authenticated,service_role;
revoke all on function public.access_finish_provision_link(uuid,uuid,text,text),public.access_reset_link(uuid,uuid,text,text),
 public.access_delivery_prepare_link(uuid,uuid,text,boolean,text),public.access_verify_link(text,text,text),public.access_verify_legacy(text,text,text,text)
 from public,anon,authenticated,service_role;
grant execute on function public.access_finish_provision_link(uuid,uuid,text,text),public.access_reset_link(uuid,uuid,text,text),
 public.access_delivery_prepare_link(uuid,uuid,text,boolean,text),public.access_verify_link(text,text,text),public.access_verify_legacy(text,text,text,text)
 to service_role;
commit;

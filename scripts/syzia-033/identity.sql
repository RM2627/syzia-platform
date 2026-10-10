-- Identity resolution is service-only and never makes tenant usernames globally unique.
create function public.access_identity_lookup(p_identifier text)returns jsonb language plpgsql stable security definer set search_path=''as $$declare ids uuid[];u auth.users;begin
 select array_agg(distinct id)into ids from(
 select x.id from auth.users x where lower(x.email)=lower(btrim(p_identifier))and not coalesce(x.is_anonymous,false)
 union select a.user_id from private.enterprise_accounts a where a.state='active'and(lower(a.contact_email)=lower(btrim(p_identifier))or a.username=lower(btrim(p_identifier))))x;
 if cardinality(ids)<>1 or ids is null then return null;end if;
 select * into u from auth.users where id=ids[1];
 if u.id is null or u.email_confirmed_at is null or coalesce(u.is_anonymous,false)or u.banned_until>now()or not exists(select 1 from public.profiles where id=u.id and status='active')then return null;end if;
 return jsonb_build_object('user_id',u.id,'email',u.email,'operation',(select operation_id from private.enterprise_accounts where user_id=u.id and state='active'order by generation desc,created_at desc limit 1));end;$$;
create function public.access_identity_exists(p_email text)returns boolean language sql stable security definer set search_path=''as $$
 select exists(select 1 from auth.users where lower(email)=lower(btrim(p_email)))or exists(select 1 from private.enterprise_accounts where lower(contact_email)=lower(btrim(p_email)));$$;
create function public.access_identity_contexts(p_user uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 perform private.require_eligible_user(p_user);
 return jsonb_build_object('global',exists(select 1 from public.platform_roles where user_id=p_user and active)or exists(select 1 from private.enterprise_accounts where user_id=p_user and organization_id is null and role='syzia_staff'and state='active'),
 'super_admin',private.people_root(p_user),
 'personal',(select jsonb_build_object('id',id,'generation',generation)from private.enterprise_accounts where user_id=p_user and organization_id is null and state='active'),
 'companies',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'generation',a.generation,'organization_id',o.id,'name',o.name,'role',m.role)order by o.name)from private.enterprise_accounts a join public.organization_members m on m.organization_id=a.organization_id and m.user_id=a.user_id and m.status='active'join public.organizations o on o.id=m.organization_id and o.status='active'where a.user_id=p_user and a.state='active'),'[]'));
end;$$;
-- Confirmed self-service identities use the same account/session infrastructure.
create function public.access_selfservice_identity(p_user uuid,p_name text,p_username text)returns jsonb language plpgsql security definer set search_path=''as $$declare a private.enterprise_accounts;u auth.users;begin
 perform pg_advisory_xact_lock(734921501);perform private.require_eligible_user(p_user);
 select * into u from auth.users where id=p_user;
 select * into a from private.enterprise_accounts where user_id=p_user and organization_id is null;
 if a.id is null then
 if exists(select 1 from private.enterprise_accounts where user_id=p_user)then raise exception 'existing_identity_requires_login';end if;
 insert into private.enterprise_accounts(user_id,username,display_name,contact_email,role,state,requested_by,request_key,activated_at)
 values(p_user,lower(btrim(p_username)),btrim(p_name),u.email,'person','active',p_user,gen_random_uuid(),clock_timestamp())returning * into a;
 update public.profiles set display_name=btrim(p_name)where id=p_user;
 insert into private.acquisition_events(user_id,event)values(p_user,'identity_registered');
 perform private.access_audit(null,p_user,'selfservice_identity',a.id);
 elsif a.state<>'active'then raise exception 'access_denied'using errcode='42501';end if;
 return jsonb_build_object('id',a.id,'generation',a.generation);end;$$;
create or replace function public.access_register_session(p_user uuid,p_session uuid,p_account uuid,p_generation integer)returns boolean language plpgsql security definer set search_path=''as $$declare a private.enterprise_accounts;begin
 perform pg_advisory_xact_lock(734921501);if p_session is null then return false;end if;perform private.require_eligible_user(p_user);
 if p_account is null then
 if not exists(select 1 from public.platform_roles where user_id=p_user and active)and not exists(select 1 from private.enterprise_accounts where user_id=p_user and state='active')then return false;end if;
 else
 select * into a from private.enterprise_accounts where id=p_account and user_id=p_user and state='active'and generation=p_generation;
 if a.id is null or(a.organization_id is not null and not exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.user_id=p_user and m.organization_id=a.organization_id and m.status='active'and o.status='active'))then return false;end if;end if;
 insert into private.access_enforced_users values(p_user)on conflict do nothing;
 insert into private.enterprise_sessions(session_id,user_id,organization_id,account_id,generation)values(p_session,p_user,a.organization_id,a.id,a.generation)on conflict do nothing;
 return exists(select 1 from private.enterprise_sessions where session_id=p_session and user_id=p_user and not revoked and account_id is not distinct from a.id and generation is not distinct from a.generation);
end;$$;
create function public.access_select_context(p_user uuid,p_session uuid,p_account uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare a private.enterprise_accounts;s private.enterprise_sessions;begin
 perform pg_advisory_xact_lock(734921501);perform private.require_eligible_user(p_user);
 select * into s from private.enterprise_sessions where user_id=p_user and session_id=p_session and not revoked for update;
 if s.session_id is null or s.last_activity<=clock_timestamp()-make_interval(secs=>(select idle_seconds from private.access_policy))or(s.account_id is not null and not exists(select 1 from private.enterprise_accounts where id=s.account_id and state='active'and generation=s.generation))then raise exception 'session_expired'using errcode='42501';end if;
 if p_account is null then
 if not exists(select 1 from public.platform_roles where user_id=p_user and active)and not exists(select 1 from private.enterprise_accounts where user_id=p_user and organization_id is null and role='syzia_staff'and state='active')then raise exception 'access_denied'using errcode='42501';end if;
 else
 select * into a from private.enterprise_accounts where id=p_account and user_id=p_user and state='active';
 if a.id is null or(a.organization_id is not null and not exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.organization_id=a.organization_id and m.user_id=p_user and m.status='active'and o.status='active'))then raise exception 'access_denied'using errcode='42501';end if;end if;
 update private.enterprise_sessions set organization_id=a.organization_id,account_id=a.id,generation=a.generation,last_activity=clock_timestamp()where session_id=p_session;
 perform private.access_audit(a.organization_id,p_user,'context_selected',coalesce(a.id,p_user));
 return jsonb_build_object('organization_id',a.organization_id);end;$$;
-- Contact conflicts require explicit reuse; never silently attach or duplicate another identity.
alter function public.people_reserve(text,text,text,text,text,uuid)rename to people_reserve_032;
alter function public.people_reserve_032(text,text,text,text,text,uuid)set schema private;
revoke all on function private.people_reserve_032(text,text,text,text,text,uuid)from public,anon,authenticated,service_role;
create function public.people_reserve(p_display text,p_username text,p_email text,p_phone text,p_role text,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$begin
 perform private.lock_authorize('global');
 if not exists(select 1 from private.enterprise_accounts where requested_by=auth.uid()and request_key=p_key)and public.access_identity_exists(p_email)then raise exception 'identity_exists_select_person';end if;
 return private.people_reserve_032(p_display,p_username,p_email,p_phone,p_role,p_key);end;$$;
alter function public.access_reserve(uuid,text,text,text,text,text,text,text,uuid,uuid)rename to access_reserve_032;
alter function public.access_reserve_032(uuid,text,text,text,text,text,text,text,uuid,uuid)set schema private;
revoke all on function private.access_reserve_032(uuid,text,text,text,text,text,text,text,uuid,uuid)from public,anon,authenticated,service_role;
create function public.access_reserve(p_org uuid,p_name text,p_slug text,p_display text,p_username text,p_email text,p_phone text,p_role text,p_key uuid,p_existing uuid)returns jsonb language plpgsql security definer set search_path=''as $$begin
 if p_org is null then perform private.lock_authorize('global');elsif not private.company_can_manage(p_org)then raise exception 'access_denied'using errcode='42501';end if;
 if p_existing is null and not exists(select 1 from private.enterprise_accounts where requested_by=auth.uid()and request_key=p_key)and public.access_identity_exists(p_email)then raise exception 'identity_exists_select_person';end if;
 return private.access_reserve_032(p_org,p_name,p_slug,p_display,p_username,p_email,p_phone,p_role,p_key,p_existing);end;$$;

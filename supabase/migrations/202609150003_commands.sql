begin;
create function private.lock_authorize(p_scope text,p_org uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 -- Serializes Foundation authorization mutations. Recheck AFTER waiting for lock.
 perform pg_catalog.pg_advisory_xact_lock(734921501);
 if not private.is_active_user() then raise exception 'access_denied' using errcode='42501'; end if;
 if p_scope='global' and not private.has_global_role('super_admin') then raise exception 'access_denied' using errcode='42501'; end if;
 if p_scope='org' and not (private.has_global_role('super_admin') or private.is_org_admin(p_org)) then raise exception 'access_denied' using errcode='42501'; end if;
 if p_scope not in ('global','org','self') then raise exception 'invalid_scope' using errcode='22023'; end if;
end; $$;
create function private.require_eligible_user(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles p join auth.users u on p.id=u.id where p.id=p_user and p.status='active'
 and not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()))
 then raise exception 'user_not_eligible' using errcode='22023'; end if;
end; $$;

create function public.foundation_context() returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if not private.is_active_user() then raise exception 'access_denied' using errcode='42501'; end if;
 select jsonb_build_object(
 'profile',(select to_jsonb(p) from public.profiles p where id=auth.uid()),
 'roles',coalesce((select jsonb_agg(role) from public.platform_roles where user_id=auth.uid() and active),'[]'::jsonb),
 'organizations',coalesce((select jsonb_agg(to_jsonb(o) order by name) from public.organizations o),'[]'::jsonb),
 'memberships',coalesce((select jsonb_agg(to_jsonb(m)) from public.organization_members m where user_id=auth.uid()),'[]'::jsonb)
 ) into result;
 return result;
end; $$;

create function public.foundation_update_profile(p_name text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_authorize('self');
 if p_name is null or length(btrim(p_name)) not between 2 and 120 then raise exception 'invalid_name' using errcode='22023'; end if;
 update public.profiles set display_name=btrim(p_name) where id=auth.uid();
end; $$;

create function public.foundation_create_organization(p_name text,p_slug text,p_admin uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid;
begin
 perform private.lock_authorize('global');
 perform private.require_eligible_user(p_admin);
 insert into public.organizations(name,slug) values(btrim(p_name),p_slug) returning id into org;
 insert into public.organization_members(organization_id,user_id,role) values(org,p_admin,'admin_empresa');
 return org;
end; $$;

create function public.foundation_update_organization(p_org uuid,p_name text,p_status public.record_status) returns void language plpgsql security definer set search_path='' as $$
declare old_status public.record_status;
begin
 perform private.lock_authorize('org',p_org);
 select status into old_status from public.organizations where id=p_org;
 if not found then raise exception 'organization_not_found' using errcode='22023'; end if;
 if p_status is distinct from old_status and not private.has_global_role('super_admin') then raise exception 'access_denied' using errcode='42501'; end if;
 update public.organizations set name=btrim(p_name),status=p_status where id=p_org;
end; $$;

create function public.foundation_set_member(p_org uuid,p_user uuid,p_role public.member_role,p_status public.record_status) returns void language plpgsql security definer set search_path='' as $$
declare previous public.organization_members;
begin
 perform private.lock_authorize('org',p_org);
 if p_user=auth.uid() then raise exception 'cannot_change_own_membership' using errcode='42501'; end if;
 if p_status='active' then perform private.require_eligible_user(p_user); end if;
 select * into previous from public.organization_members where organization_id=p_org and user_id=p_user;
 if previous.role='admin_empresa' and previous.status='active' and (p_role<>'admin_empresa' or p_status<>'active') and
 not exists(select 1 from public.organization_members where organization_id=p_org and user_id<>p_user and role='admin_empresa' and status='active')
 then raise exception 'last_organization_admin' using errcode='23514'; end if;
 insert into public.organization_members(organization_id,user_id,role,status) values(p_org,p_user,p_role,p_status)
 on conflict(organization_id,user_id) do update set role=excluded.role,status=excluded.status;
end; $$;

create function public.foundation_set_attendant(p_org uuid,p_user uuid,p_kind public.attendant_kind,p_status public.record_status) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_authorize('global');
 if p_status='active' then
  perform private.require_eligible_user(p_user);
  if not exists(select 1 from public.platform_roles where user_id=p_user and role='atendente' and active) then raise exception 'attendant_role_required' using errcode='23514'; end if;
 end if;
 insert into public.attendant_organizations(organization_id,user_id,kind,status) values(p_org,p_user,p_kind,p_status)
 on conflict(organization_id,user_id) do update set kind=excluded.kind,status=excluded.status;
end; $$;

create function public.foundation_set_global_role(p_user uuid,p_role public.platform_role,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_authorize('global');
 if p_user=auth.uid() then raise exception 'cannot_change_own_global_role' using errcode='42501'; end if;
 if p_active then perform private.require_eligible_user(p_user); end if;
 insert into public.platform_roles(user_id,role,active) values(p_user,p_role,p_active)
 on conflict(user_id,role) do update set active=excluded.active;
 -- A disabled attendant role cannot silently regain old companies after reactivation.
 if p_role='atendente' and not p_active then
  update public.attendant_organizations set status='suspended' where user_id=p_user and status='active';
 end if;
end; $$;

create function public.foundation_set_profile_status(p_user uuid,p_status public.record_status) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_authorize('global');
 if p_user=auth.uid() then raise exception 'cannot_suspend_self' using errcode='42501'; end if;
 update public.profiles set status=p_status where id=p_user;
 if not found then raise exception 'profile_not_found' using errcode='22023'; end if;
end; $$;

revoke all on function private.lock_authorize(text,uuid),private.require_eligible_user(uuid) from public,anon,authenticated;
revoke all on function public.foundation_context() from public,anon,authenticated;
grant execute on function public.foundation_context() to authenticated;
revoke all on function public.foundation_update_profile(text) from public,anon,authenticated;
grant execute on function public.foundation_update_profile(text) to authenticated;
revoke all on function public.foundation_create_organization(text,text,uuid) from public,anon,authenticated;
grant execute on function public.foundation_create_organization(text,text,uuid) to authenticated;
revoke all on function public.foundation_update_organization(uuid,text,public.record_status) from public,anon,authenticated;
grant execute on function public.foundation_update_organization(uuid,text,public.record_status) to authenticated;
revoke all on function public.foundation_set_member(uuid,uuid,public.member_role,public.record_status) from public,anon,authenticated;
grant execute on function public.foundation_set_member(uuid,uuid,public.member_role,public.record_status) to authenticated;
revoke all on function public.foundation_set_attendant(uuid,uuid,public.attendant_kind,public.record_status) from public,anon,authenticated;
grant execute on function public.foundation_set_attendant(uuid,uuid,public.attendant_kind,public.record_status) to authenticated;
revoke all on function public.foundation_set_global_role(uuid,public.platform_role,boolean) from public,anon,authenticated;
grant execute on function public.foundation_set_global_role(uuid,public.platform_role,boolean) to authenticated;
revoke all on function public.foundation_set_profile_status(uuid,public.record_status) from public,anon,authenticated;
grant execute on function public.foundation_set_profile_status(uuid,public.record_status) to authenticated;
commit;

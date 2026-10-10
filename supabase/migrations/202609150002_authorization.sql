begin;
-- Helpers run as migration owner to avoid recursive membership policies.
-- Private is NOT in the PostgREST exposed schemas. Every helper checks auth.uid().
create function private.is_active_user() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
 where p.id=auth.uid() and p.status='active' and not coalesce(u.is_anonymous,false)
 and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())
 and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false);
$$;
create function private.has_global_role(p_role public.platform_role) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_user() and exists(select 1 from public.platform_roles where user_id=auth.uid() and role=p_role and active);
$$;
create function private.is_org_admin(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_user() and exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id
 where m.organization_id=p_org and m.user_id=auth.uid() and m.role='admin_empresa' and m.status='active' and o.status='active');
$$;
create function private.can_access_org(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_user() and (private.has_global_role('super_admin') or exists(
 select 1 from public.organizations o where o.id=p_org and o.status='active' and (
 exists(select 1 from public.organization_members m where m.organization_id=o.id and m.user_id=auth.uid() and m.status='active') or
 (private.has_global_role('atendente') and exists(select 1 from public.attendant_organizations a where a.organization_id=o.id and a.user_id=auth.uid() and a.status='active')))));
$$;
create function private.can_view_profile(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_user() and (p_user=auth.uid() or private.has_global_role('super_admin') or exists(
 select 1 from public.organization_members m where m.user_id=p_user and private.is_org_admin(m.organization_id)));
$$;
create policy profiles_read on public.profiles for select to authenticated using(private.can_view_profile(id));
create policy platform_roles_read on public.platform_roles for select to authenticated using(private.is_active_user() and (user_id=auth.uid() or private.has_global_role('super_admin')));
create policy organizations_read on public.organizations for select to authenticated using(private.can_access_org(id));
create policy organization_members_read on public.organization_members for select to authenticated using(
 private.is_active_user() and (private.has_global_role('super_admin') or (private.can_access_org(organization_id) and (user_id=auth.uid() or private.is_org_admin(organization_id)))));
create policy attendant_organizations_read on public.attendant_organizations for select to authenticated using(
 private.is_active_user() and (private.has_global_role('super_admin') or (private.can_access_org(organization_id) and (user_id=auth.uid() or private.is_org_admin(organization_id)))));
create policy audit_logs_read on public.audit_logs for select to authenticated using(
 private.is_active_user() and (private.has_global_role('super_admin') or private.is_org_admin(organization_id)));
-- No INSERT/UPDATE/DELETE policies. Direct writes are denied even if a future grant is accidentally added.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_active_user(), private.has_global_role(public.platform_role), private.is_org_admin(uuid),private.can_access_org(uuid),private.can_view_profile(uuid) to authenticated;
commit;

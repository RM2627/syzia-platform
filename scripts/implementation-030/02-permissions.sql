create function private.internal_exemption(p_org uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(e)-'request_key' from private.organization_exemptions e where organization_id=p_org and state='active';$$;
create function private.entitlement(p_org uuid,p_feature text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare e jsonb;s public.billing_subscriptions;begin
 if not exists(select 1 from public.organizations where id=p_org and status='active') then return false;end if;
 if p_feature='setup' then return true;end if;
 e=private.internal_exemption(p_org);if e is not null then return coalesce((e->'capabilities'->>p_feature)::boolean,false);end if;
 select * into s from public.billing_subscriptions where organization_id=p_org;
 if s.organization_id is not null then return private.billing_effective(s) in('active','trial') and coalesce((select (capabilities->>p_feature)::boolean from public.billing_plan_versions where id=s.plan_version_id),false);end if;
 -- Preserve the legacy software setup regime; shared service ALWAYS needs an explicit entitlement.
 return p_feature in('software','commercial_followups') and exists(select 1 from private.organization_verifications where organization_id=p_org and not required and state='legacy') and not exists(select 1 from private.trial_requests where organization_id=p_org);
end;$$;
create or replace function private.billing_feature(p_org uuid,p_feature text) returns boolean language sql stable security definer set search_path='' as $$select private.entitlement(p_org,p_feature);$$;
create function private.verification_ready(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.organization_verifications where organization_id=p_org and required and state<>'verified');$$;
create function private.permission_role(p_org uuid,p_user uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare r text;begin
 if not exists(select 1 from public.organizations o join public.profiles p on p.id=p_user join auth.users u on u.id=p.id where o.id=p_org and o.status='active' and p.status='active' and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now())) then return null;end if;
 if exists(select 1 from public.platform_roles where user_id=p_user and role='super_admin' and active) then return case when private.support_actor_allowed(p_org,p_user) then 'super_admin' end;end if;
 if not private.verification_ready(p_org) then return null;end if;
 select case when role='admin_empresa' then 'admin_empresa' when is_attendant then 'own_attendant' else 'colaborador_empresa' end into r from public.organization_members where organization_id=p_org and user_id=p_user and status='active';
 if r is not null then return r;end if;
 if private.entitlement(p_org,'human_support') and exists(select 1 from public.attendant_organizations a join public.platform_roles p on p.user_id=a.user_id and p.role='atendente' and p.active where a.organization_id=p_org and a.user_id=p_user and a.status='active') then return 'shared_attendant';end if;
 return null;
end;$$;
create function private.permission_allowed(p_org uuid,p_action text,p_record uuid default null) returns boolean language plpgsql stable security definer set search_path='' as $$
declare r text;c private.permission_catalog;g private.organization_permissions;begin
 if not private.is_active_user() or not private.access_scope(p_org) then return false;end if;
 select * into c from private.permission_catalog where action=p_action;if c.action is null or not private.entitlement(p_org,c.capability) then return false;end if;
 r=private.permission_role(p_org,auth.uid());if r is null or not r=any(c.roles) then return false;end if;
 if r in('super_admin','admin_empresa') then return true;end if;
 select * into g from private.organization_permissions where organization_id=p_org and user_id=auth.uid() and action=p_action and granted;
 if g.action is null or not g.scope=any(c.scopes) then return false;end if;
 if r='shared_attendant' and p_action like 'finance.%'and g.scope<>'assigned' then return false;end if;
 if g.scope='organization' then return true;end if;
 return p_record is not null and exists(select 1 from public.financial_accounts a where a.organization_id=p_org and a.id=p_record and
 (a.assigned_to=auth.uid() or exists(select 1 from public.tickets t where t.organization_id=p_org and t.request_id=a.request_id and t.assignee_id=auth.uid() and t.state not in('resolved','closed'))));
end;$$;
create function private.permission_require(p_org uuid,p_action text,p_record uuid default null) returns void language plpgsql security definer set search_path='' as $$begin
 if not private.permission_allowed(p_org,p_action,p_record) then raise exception 'permission_denied' using errcode='42501';end if;end;$$;
create function private.permission_enter(p_org uuid,p_action text) returns int language plpgsql security definer set search_path='' as $$declare d int;begin
 perform private.permission_require(p_org,p_action);
 select coalesce(max(depth),0)+1 into d from private.permission_frames where backend=pg_backend_pid() and transaction_id=txid_current();
 insert into private.permission_frames values(pg_backend_pid(),txid_current(),d,p_org,auth.uid(),p_action);return d;
end;$$;
create function private.permission_leave(p_depth int) returns void language sql security definer set search_path='' as $$delete from private.permission_frames where backend=pg_backend_pid() and transaction_id=txid_current() and depth=p_depth;$$;
create function private.permission_manager(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_user() and private.access_scope(p_org) and case when private.has_global_role('super_admin') then private.support_actor_allowed(p_org,auth.uid()) else private.verification_ready(p_org) and private.is_org_admin(p_org) end;$$;
create or replace function private.company_can_manage(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.permission_manager(p_org) or (exists(select 1 from private.permission_frames f join private.permission_catalog c on c.action=f.action and c.delegates_management where (private.permission_role(p_org,auth.uid())='colaborador_empresa' or (private.permission_role(p_org,auth.uid())in('own_attendant','shared_attendant')and f.action in('agenda.read','clients.read','quotes.read','analytics.operational')))and f.backend=pg_backend_pid() and f.transaction_id=txid_current() and f.organization_id=p_org and f.actor_id=auth.uid() and private.permission_allowed(p_org,f.action)));$$;
create or replace function private.company_can_read(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.permission_manager(p_org) or exists(select 1 from private.permission_catalog c where module in('home','services','settings','page','portfolio') and private.permission_allowed(p_org,c.action));$$;
create function private.permissions_seed() returns trigger language plpgsql security definer set search_path='' as $$
declare a text;begin
 -- Explicit grants preserve existing read access and the existing attendant workflow; sensitive totals are never seeded.
 foreach a in array case when tg_table_name='attendant_organizations' or (to_jsonb(new)->>'is_attendant')::boolean then
 array['central.read','central.reply','central.manage','quotes.read','quotes.values','quotes.manage','agenda.read','agenda.manage','followup.read','followup.manage','clients.read','finance.calculators']
 else array['services.read','settings.read'] end loop
 insert into private.organization_permissions(organization_id,user_id,action,scope,granted,updated_by) values(new.organization_id,new.user_id,a,'organization',true,auth.uid()) on conflict do nothing;
 end loop;return new;
end;$$;
create function public.permissions_context(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_active_user() or not private.access_scope(p_org) or private.permission_role(p_org,auth.uid()) is null then raise exception 'permission_denied' using errcode='42501';end if;
 return jsonb_build_object('timezone',(select timezone from public.organizations where id=p_org),'role',private.permission_role(p_org,auth.uid()),'actions',coalesce((select jsonb_object_agg(c.action,jsonb_build_object('allowed',private.permission_allowed(p_org,c.action) or exists(select 1 from private.organization_permissions g where g.organization_id=p_org and g.user_id=auth.uid() and g.action=c.action and g.granted and g.scope='assigned' and private.entitlement(p_org,c.capability) and private.permission_role(p_org,auth.uid())=any(c.roles)),'scope',case when private.permission_manager(p_org) then 'organization' else (select scope from private.organization_permissions where organization_id=p_org and user_id=auth.uid() and action=c.action and granted)end)) from private.permission_catalog c),'{}'::jsonb));
end;$$;
create function public.permissions_team(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 perform private.permission_require(p_org,'people.manage');
 return jsonb_build_object('catalog',(select jsonb_agg(to_jsonb(c) order by module,action) from private.permission_catalog c),
 'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.id,'name',p.display_name,'role',x.role,'revision',coalesce((select revision from private.permission_revisions where organization_id=p_org and user_id=p.id),0),'grants',coalesce((select jsonb_agg(jsonb_build_object('action',action,'scope',scope,'granted',granted) order by action) from private.organization_permissions where organization_id=p_org and user_id=p.id),'[]'::jsonb))) from (
 select user_id,case when role='admin_empresa' then 'admin_empresa' when is_attendant then 'own_attendant' else 'colaborador_empresa' end role from public.organization_members where organization_id=p_org and status='active'
 union all select user_id,'shared_attendant' from public.attendant_organizations where organization_id=p_org and status='active')x join public.profiles p on p.id=x.user_id),'[]'::jsonb));end;$$;
create function public.permissions_save(p_org uuid,p_user uuid,p_revision int,p_grants jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r text;g jsonb;prior private.permission_commands;payload jsonb;rev int;result_ jsonb;begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'people.manage');
 if p_user=auth.uid() or p_user is null or p_key is null or jsonb_typeof(p_grants)<>'array' then raise exception 'permission_invalid';end if;
 r=private.permission_role(p_org,p_user);if r is null or r in('admin_empresa','super_admin') then raise exception 'permission_role_ceiling' using errcode='42501';end if;
 payload=jsonb_build_array(p_user,p_revision,p_grants);select * into prior from private.permission_commands where organization_id=p_org and actor_id=auth.uid() and key=p_key;
 if found then if prior.payload<>payload then raise exception 'idempotency_conflict';end if;return prior.result;end if;
 insert into private.permission_revisions values(p_org,p_user,0) on conflict do nothing;
 select revision into rev from private.permission_revisions where organization_id=p_org and user_id=p_user for update;if rev is distinct from p_revision then raise exception 'permission_revision_conflict' using errcode='40001';end if;
 if (select count(*) from jsonb_array_elements(p_grants))<>(select count(distinct value->>'action')from jsonb_array_elements(p_grants))then raise exception 'permission_invalid';end if;
 for g in select * from jsonb_array_elements(p_grants) loop
 if r='shared_attendant'and (g->>'granted')::boolean and g->>'action'like 'finance.%'and g->>'scope'<>'assigned'then raise exception 'permission_role_ceiling'using errcode='42501';end if;
 if not exists(select 1 from private.permission_catalog c where c.action=g->>'action' and r=any(c.roles) and (g->>'scope')=any(c.scopes)) or jsonb_typeof(g->'granted')<>'boolean' then raise exception 'permission_role_ceiling' using errcode='42501';end if;
 end loop;
 -- Complete explicit set, revision checked. Existing sessions observe these rows on every RPC/RLS check.
 update private.organization_permissions set granted=false,revision=rev+1,updated_by=auth.uid(),updated_at=clock_timestamp() where organization_id=p_org and user_id=p_user;
 for g in select * from jsonb_array_elements(p_grants) loop
 insert into private.organization_permissions(organization_id,user_id,action,scope,granted,revision,updated_by) values(p_org,p_user,g->>'action',g->>'scope',(g->>'granted')::boolean,rev+1,auth.uid())
 on conflict(organization_id,user_id,action)do update set scope=excluded.scope,granted=excluded.granted,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=clock_timestamp();end loop;
 update private.permission_revisions set revision=rev+1 where organization_id=p_org and user_id=p_user;
 perform private.access_audit(p_org,auth.uid(),'permissions_changed',p_user);result_=jsonb_build_object('revision',rev+1);
 insert into private.permission_commands values(p_org,auth.uid(),p_key,payload,result_);return result_;
end;$$;

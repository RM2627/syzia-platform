begin;
-- Master specification: refine 028 without changing its history or tenant data.
-- Existing codes remain valid; only new organizations receive readable codes.
alter table private.enterprise_codes drop constraint enterprise_codes_code_check;
alter table private.enterprise_codes alter column code drop default;
alter table private.enterprise_codes add constraint enterprise_codes_code_check
 check(code ~ '^[A-F0-9]{12}$' or code ~ '^[A-Z0-9]{1,8}-[A-F0-9]{5}$');
create or replace function private.enterprise_code_new() returns trigger language plpgsql security definer set search_path='' as $$
declare prefix_ text; candidate text; i int;begin
 prefix_=left(regexp_replace(upper(normalize(new.name,NFKD)),'[^A-Z0-9]','','g'),8);
 if prefix_='' then prefix_='EMPRESA';end if;
 for i in 1..32 loop
  candidate=prefix_||'-'||upper(left(encode(extensions.gen_random_bytes(3),'hex'),5));
  insert into private.enterprise_codes(organization_id,code) values(new.id,candidate) on conflict(code) do nothing;
  if found then return new;end if;
 end loop;
 raise exception 'company_code_unavailable' using errcode='40001';
end;$$;

create table private.support_requests(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 requester_id uuid not null references public.profiles(id), request_key uuid not null,
 mode text not null check(mode in ('normal','emergency')), scope text not null default 'operation' check(scope='operation'),
 reason text not null check(length(btrim(reason)) between 15 and 500), hours int not null check(hours in (0,1,4,24)),
 state text not null check(state in ('pending','approved','denied','revoked')),
 created_at timestamptz not null default clock_timestamp(), decided_by uuid references public.profiles(id), decided_at timestamptz,
 expires_at timestamptz, revoked_by uuid references public.profiles(id), revoked_at timestamptz,
 unique(requester_id,request_key),
 check(mode='emergency' or decided_by is distinct from requester_id),
 check((mode='emergency' and hours=0) or (mode='normal' and hours in (1,4,24))),
 check(state<>'approved' or (decided_at is not null and expires_at>decided_at and decided_by is not null))
);
create index support_org_state on private.support_requests(organization_id,state,expires_at);
create table private.support_visits(
 id uuid primary key, organization_id uuid not null references public.organizations(id),
 actor_id uuid not null references public.profiles(id), grant_id uuid references private.support_requests(id),
 regime text not null check(regime in ('managed','normal','emergency')), entered_at timestamptz not null default clock_timestamp()
);
alter table private.support_requests enable row level security;
alter table private.support_requests force row level security;
alter table private.support_visits enable row level security;
alter table private.support_visits force row level security;
revoke all on private.support_requests,private.support_visits from public,anon,authenticated,service_role;
create trigger support_requests_no_delete before delete on private.support_requests for each row execute function private.consumer_deny_immutable();
create trigger support_requests_no_truncate before truncate on private.support_requests for each statement execute function private.consumer_deny_immutable();
create trigger support_visits_immutable before update or delete on private.support_visits for each row execute function private.consumer_deny_immutable();
create trigger support_visits_no_truncate before truncate on private.support_visits for each statement execute function private.consumer_deny_immutable();

-- Responsibility persists across password recovery and updated legal documents.
-- A pending FIRST activation is not responsibility. Legacy valid ADMs remain valid.
-- A membership predating its access account is legacy adoption, not a first provision.
create function private.support_audit(p_org uuid,p_actor uuid,p_event text,p_id uuid) returns void language sql security definer set search_path='' as $$
 insert into public.audit_logs(organization_id,actor_id,action,entity_table,entity_key,changed_fields)
 values(p_org,p_actor,p_event,case when p_event like 'support_enter_%' then 'support_visits' else 'support_requests' end,jsonb_build_object('id',p_id),array['state']);
$$;
revoke all on function private.support_audit(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
create function private.support_responsible(p_org uuid,p_user uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organization_members m join public.profiles p on p.id=m.user_id join auth.users u on u.id=m.user_id
 left join private.enterprise_accounts a on a.organization_id=m.organization_id and a.user_id=m.user_id
 where m.organization_id=p_org and (p_user is null or m.user_id=p_user) and m.role='admin_empresa' and m.status='active'
 and p.status='active' and not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())
 and (a.id is null or (a.state<>'disabled' and (a.activated_at is not null or m.created_at<a.created_at)))
 and (not coalesce((select legal_required from private.enterprise_codes where organization_id=p_org),false)
 or exists(select 1 from private.legal_acceptances where organization_id=p_org)));
$$;
create function private.support_actor_allowed(p_org uuid,p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id join public.platform_roles r on r.user_id=p.id
 join public.organizations o on o.id=p_org where p.id=p_actor and p.status='active' and o.status='active' and r.role='super_admin' and r.active
 and not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()))
 and (not private.support_responsible(p_org) or exists(select 1 from private.support_requests s where s.organization_id=p_org and s.requester_id=p_actor
 and s.state='approved' and s.expires_at>statement_timestamp() and (s.mode='emergency' or private.support_responsible(p_org,s.decided_by))));
$$;
create or replace function private.company_can_manage(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_user() and private.access_scope(p_org) and case when private.has_global_role('super_admin')
 then private.support_actor_allowed(p_org,auth.uid()) else private.is_org_admin(p_org) end;
$$;
create or replace function private.company_can_read(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_user() and private.access_scope(p_org) and exists(select 1 from public.organizations where id=p_org and status='active')
 and case when private.has_global_role('super_admin') then private.support_actor_allowed(p_org,auth.uid())
 else exists(select 1 from public.organization_members where organization_id=p_org and user_id=auth.uid() and status='active' and not is_attendant) end;
$$;
create or replace function private.inviter_eligible(p_org uuid,p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id join public.organizations o on o.id=p_org
 where p.id=p_actor and p.status='active' and o.status='active' and not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()))
 and case when exists(select 1 from public.platform_roles where user_id=p_actor and role='super_admin' and active)
 then private.support_actor_allowed(p_org,p_actor) else exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and role='admin_empresa' and status='active') end;
$$;
create or replace function private.commercial_can_operate(p_org uuid,p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path='' as $$
 select (p_user is distinct from auth.uid() or (private.is_active_user() and private.access_scope(p_org))) and
 (private.inviter_eligible(p_org,p_user) or (private.central_eligible(p_org,p_user) and exists(select 1 from public.attendant_permissions where organization_id=p_org and reviewed and 'follow_up'=any(allowed_actions))));
$$;
create or replace function private.central_eligible(p_org uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.access_base_central(p_org,p_user) and (p_user is distinct from auth.uid() or (private.is_active_user() and private.access_scope(p_org)))
 and (not exists(select 1 from public.platform_roles where user_id=p_user and role='super_admin' and active) or private.support_actor_allowed(p_org,p_user));
$$;
create or replace function private.own_attendant(p_org uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.access_base_own(p_org,p_user) and (p_user is distinct from auth.uid() or (private.is_active_user() and private.access_scope(p_org)))
 and (not exists(select 1 from public.platform_roles where user_id=p_user and role='super_admin' and active) or private.support_actor_allowed(p_org,p_user));
$$;

create function public.support_context(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare global_ boolean=private.has_global_role('super_admin');begin
 if not (global_ or (private.is_org_admin(p_org) and private.support_responsible(p_org,auth.uid())))
 or not private.access_scope(p_org) or not exists(select 1 from public.organizations where id=p_org and status='active') then raise exception 'access_denied' using errcode='42501';end if;
 return jsonb_build_object('responsible',private.support_responsible(p_org),'global',global_,'allowed',private.company_can_manage(p_org),
 'requests',coalesce((select jsonb_agg(to_jsonb(s)-'request_key'||jsonb_build_object('requester_name',p.display_name,'decider_name',d.display_name,
 'effective',s.state='approved' and s.expires_at>statement_timestamp() and (s.mode='emergency' or private.support_responsible(p_org,s.decided_by))) order by s.created_at desc)
 from private.support_requests s join public.profiles p on p.id=s.requester_id left join public.profiles d on d.id=s.decided_by where s.organization_id=p_org and (not global_ or s.requester_id=auth.uid())),'[]'::jsonb),
 'visits',coalesce((select jsonb_agg(to_jsonb(v)||jsonb_build_object('actor_name',p.display_name) order by v.entered_at desc) from
 (select * from private.support_visits where organization_id=p_org and (not global_ or actor_id=auth.uid()) order by entered_at desc limit 50) v join public.profiles p on p.id=v.actor_id),'[]'::jsonb));
end;$$;
create function public.support_request(p_org uuid,p_reason text,p_hours int,p_key uuid,p_emergency boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare s private.support_requests; mode_ text=case when p_emergency then 'emergency' else 'normal' end;begin
 perform private.lock_authorize('global');
 if p_key is null or p_emergency is null or p_reason is null or length(btrim(p_reason)) not between 15 and 500 or p_hours is null or p_hours not in (1,4,24)
 then raise exception 'support_invalid_request' using errcode='22023';end if;
 if not private.access_scope(p_org) or not exists(select 1 from public.organizations where id=p_org and status='active') then raise exception 'access_denied' using errcode='42501';end if;
 select * into s from private.support_requests where requester_id=auth.uid() and request_key=p_key;
 if s.id is not null then
 if s.organization_id<>p_org or s.reason<>btrim(p_reason) or s.mode<>mode_ or (not p_emergency and s.hours<>p_hours) then raise exception 'idempotency_conflict';end if;return s.id;end if;
 if not private.support_responsible(p_org) then raise exception 'support_not_required' using errcode='22023';end if;
 if (select count(*) from private.support_requests where requester_id=auth.uid() and created_at>clock_timestamp()-interval '1 day')>=10
 or (not p_emergency and (select count(*) from private.support_requests where requester_id=auth.uid() and organization_id=p_org and created_at>clock_timestamp()-interval '1 hour')>=3)
 or (p_emergency and (exists(select 1 from private.support_requests where organization_id=p_org and mode='emergency' and created_at>clock_timestamp()-interval '30 minutes')
 or (select count(*) from private.support_requests where requester_id=auth.uid() and mode='emergency' and created_at>clock_timestamp()-interval '1 day')>=3))
 then raise exception 'support_rate_limited' using errcode='P0001';end if;
 if not p_emergency and exists(select 1 from private.support_requests where requester_id=auth.uid() and organization_id=p_org and state='pending') then raise exception 'support_pending' using errcode='P0001';end if;
 insert into private.support_requests(organization_id,requester_id,request_key,mode,reason,hours,state,decided_by,decided_at,expires_at)
 values(p_org,auth.uid(),p_key,mode_,btrim(p_reason),case when p_emergency then 0 else p_hours end,case when p_emergency then 'approved' else 'pending' end,
 case when p_emergency then auth.uid() end,case when p_emergency then clock_timestamp() end,case when p_emergency then clock_timestamp()+interval '15 minutes' end) returning * into s;
 perform private.support_audit(p_org,auth.uid(),'support_'||case when p_emergency then 'emergency' else 'requested' end,s.id);return s.id;
end;$$;
create function public.support_decide(p_id uuid,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$
declare s private.support_requests;state_ text=case when p_approve then 'approved' else 'denied' end;begin
 perform pg_advisory_xact_lock(734921501);select * into s from private.support_requests where id=p_id for update;
 if s.id is null or p_approve is null or s.requester_id=auth.uid() or not private.is_org_admin(s.organization_id)
 or not private.support_responsible(s.organization_id,auth.uid()) then raise exception 'access_denied' using errcode='42501';end if;
 if s.state=state_ and s.decided_by=auth.uid() then return;end if;
 if s.state<>'pending' or s.mode<>'normal' then raise exception 'support_already_decided' using errcode='40001';end if;
 update private.support_requests set state=state_,decided_by=auth.uid(),decided_at=clock_timestamp(),expires_at=case when p_approve then clock_timestamp()+make_interval(hours=>s.hours) end where id=p_id;
 perform private.support_audit(s.organization_id,auth.uid(),'support_'||state_,s.id);
end;$$;
create function public.support_revoke(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare s private.support_requests;begin
 perform pg_advisory_xact_lock(734921501);select * into s from private.support_requests where id=p_id for update;
 if s.id is null or not ((private.has_global_role('super_admin') and s.requester_id=auth.uid() and private.access_scope(s.organization_id))
 or (private.is_org_admin(s.organization_id) and private.support_responsible(s.organization_id,auth.uid()))) then raise exception 'access_denied' using errcode='42501';end if;
 if s.state='revoked' then return;end if;
 if s.state not in ('pending','approved') then raise exception 'support_already_decided' using errcode='40001';end if;
 update private.support_requests set state='revoked',revoked_at=clock_timestamp(),revoked_by=auth.uid() where id=p_id;
 perform private.support_audit(s.organization_id,auth.uid(),'support_revoked',s.id);
end;$$;
create function public.support_enter(p_org uuid,p_key uuid) returns void language plpgsql security definer set search_path='' as $$
declare s private.support_requests; v private.support_visits; regime_ text='managed';begin
 perform private.lock_authorize('global');
 if not private.company_can_manage(p_org) or p_key is null then raise exception 'access_denied' using errcode='42501';end if;
 select * into v from private.support_visits where id=p_key;
 if v.id is not null then
 if v.actor_id<>auth.uid() or v.organization_id<>p_org then raise exception 'idempotency_conflict';end if;return;end if;
 if private.support_responsible(p_org) then
 select * into s from private.support_requests where organization_id=p_org and requester_id=auth.uid() and state='approved' and expires_at>clock_timestamp()
 and (mode='emergency' or private.support_responsible(p_org,decided_by)) order by (mode='normal') desc,expires_at desc limit 1;
 if s.id is null then raise exception 'access_denied' using errcode='42501';end if;regime_=s.mode;end if;
 insert into private.support_visits(id,organization_id,actor_id,grant_id,regime) values(p_key,p_org,auth.uid(),s.id,regime_);
 perform private.support_audit(p_org,auth.uid(),'support_enter_'||regime_,p_key);
end;$$;

-- Suspension invalidates grants permanently; reactivation never revives an old grant.
create function private.support_suspend() returns trigger language plpgsql security definer set search_path='' as $$
declare s record;begin
 if old.status='active' and new.status<>'active' then
 for s in update private.support_requests set state='revoked',revoked_at=clock_timestamp(),revoked_by=auth.uid()
 where organization_id=new.id and state in ('pending','approved') returning id loop
 perform private.support_audit(new.id,auth.uid(),'support_suspension_revoked',s.id);end loop;
 end if;return new;
end;$$;
create trigger support_suspend after update of status on public.organizations for each row execute function private.support_suspend();
revoke all on function private.support_responsible(uuid,uuid),private.support_actor_allowed(uuid,uuid),private.support_suspend() from public,anon,authenticated,service_role;
revoke all on function public.support_context(uuid),public.support_request(uuid,text,int,uuid,boolean),public.support_decide(uuid,boolean),public.support_revoke(uuid),public.support_enter(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.support_context(uuid),public.support_request(uuid,text,int,uuid,boolean),public.support_decide(uuid,boolean),public.support_revoke(uuid),public.support_enter(uuid,uuid) to authenticated;

-- Close direct operational RPC entry points; keep global cadastro/billing available.
create or replace function public.company_initialize(p_org uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_authorize('org',p_org);
 if not private.company_can_manage(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 insert into public.company_settings(organization_id) values(p_org) on conflict do nothing;
 insert into public.business_rules(organization_id) values(p_org) on conflict do nothing;
 insert into public.attendant_permissions(organization_id) values(p_org) on conflict do nothing;
end;$$;
create or replace function public.foundation_set_member(p_org uuid,p_user uuid,p_role public.member_role,p_status public.record_status) returns void language plpgsql security definer set search_path='' as $$
declare previous public.organization_members;
begin
 perform private.lock_authorize('org',p_org);
 if not private.company_can_manage(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 if p_user=auth.uid() then raise exception 'cannot_change_own_membership' using errcode='42501'; end if;
 if p_status='active' then perform private.require_eligible_user(p_user); end if;
 select * into previous from public.organization_members where organization_id=p_org and user_id=p_user;
 if previous.role='admin_empresa' and previous.status='active' and (p_role<>'admin_empresa' or p_status<>'active') and
 not exists(select 1 from public.organization_members where organization_id=p_org and user_id<>p_user and role='admin_empresa' and status='active')
 then raise exception 'last_organization_admin' using errcode='23514'; end if;
 insert into public.organization_members(organization_id,user_id,role,status) values(p_org,p_user,p_role,p_status)
 on conflict(organization_id,user_id) do update set role=excluded.role,status=excluded.status;
end; $$;
create or replace function public.access_reserve(p_org uuid,p_name text,p_slug text,p_display text,p_username text,p_email text,p_phone text,p_role text,p_key uuid,p_existing uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.lock_authorize(case when p_org is null then 'global' else 'org' end,p_org);
 if p_org is not null and not private.company_can_manage(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 if p_org is not null and not exists(select 1 from public.organizations where id=p_org and status='active') then raise exception 'access_denied';end if;
 return public.access_reserve_026(p_org,p_name,p_slug,p_display,p_username,p_email,p_phone,p_role,p_key,p_existing);end;$$;
create or replace function public.access_team(p_org uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 if not private.company_can_manage(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 result=public.access_team_026(p_org);
 return result||jsonb_build_object('accounts',coalesce((select jsonb_agg(x||jsonb_build_object('activated_at',(select activated_at from private.enterprise_accounts where id=(x->>'id')::uuid),'code_expires',(select code_expires from private.enterprise_accounts where id=(x->>'id')::uuid),'delivery',
 (select jsonb_build_object('state',d.state,'code',d.code,'attempted_at',d.attempted_at,'accepted_at',d.accepted_at) from private.access_deliveries d where d.account_id=(x->>'id')::uuid))) from jsonb_array_elements(result->'accounts') x),'[]'::jsonb));end;$$;
create or replace function public.access_manage(p_id uuid,p_action text,p_username text default null,p_email text default null,p_role text default null) returns void language plpgsql security definer set search_path='' as $$
declare a private.enterprise_accounts;begin
 perform pg_advisory_xact_lock(734921501);select * into a from private.enterprise_accounts where id=p_id for update;perform private.lock_authorize('org',a.organization_id);
 if not private.company_can_manage(a.organization_id) then raise exception 'access_denied' using errcode='42501';end if;
 if a.id is null or a.user_id=auth.uid() or a.state in ('changing','reserved') then raise exception 'access_change_unavailable';end if;
 if p_action='edit' then
 if p_role not in ('admin_empresa','colaborador_empresa','own_attendant') then raise exception 'access_denied';end if;
 -- Preserve admin email requirement during demotion/promotion; update contact first, role through existing command.
 update private.enterprise_accounts set contact_email=nullif(lower(btrim(p_email)),''),username=lower(btrim(p_username)) where id=p_id;
 perform public.foundation_set_member(a.organization_id,a.user_id,case when p_role='admin_empresa' then 'admin_empresa'::public.member_role else 'colaborador_empresa'::public.member_role end,(select status from public.organization_members where organization_id=a.organization_id and user_id=a.user_id));
 update public.organization_members set is_attendant=p_role='own_attendant' where organization_id=a.organization_id and user_id=a.user_id;
 update private.enterprise_accounts set role=p_role,generation=generation+1,code_hash=null,proof_hash=null where id=p_id;
 elsif p_action in ('disable','enable') then
 perform public.foundation_set_member(a.organization_id,a.user_id,case when a.role='admin_empresa' then 'admin_empresa'::public.member_role else 'colaborador_empresa'::public.member_role end,case when p_action='disable' then 'suspended'::public.record_status else 'active'::public.record_status end);
 else raise exception 'access_denied';end if;
 update private.enterprise_sessions set revoked=true where user_id=a.user_id and organization_id=a.organization_id;
 perform private.access_audit(a.organization_id,auth.uid(),'access_'||p_action,a.id);end;$$;
create or replace function public.access_resume(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare a private.enterprise_accounts;begin
 perform pg_advisory_xact_lock(734921501);select * into a from private.enterprise_accounts where id=p_id for update;
 if a.id is null or a.state<>'reserved' then raise exception 'access_change_unavailable';end if;
 perform private.lock_authorize('org',a.organization_id);
 if not private.company_can_manage(a.organization_id) then raise exception 'access_denied' using errcode='42501';end if;
 if (select count(*) from public.organization_members where user_id=a.user_id)>1 and not exists(select 1 from public.platform_roles where user_id=auth.uid() and role='super_admin' and active) then raise exception 'shared_identity_requires_superadmin';end if;
 update private.enterprise_accounts set requested_by=auth.uid(),request_key=gen_random_uuid() where id=p_id;
 perform private.access_audit(a.organization_id,auth.uid(),'access_provision_resumed',a.id);
 return jsonb_build_object('id',a.id,'user_id',a.user_id,'organization_id',a.organization_id,'state',a.state);end;$$;

-- Reuse the exact checklist, never infer readiness from an administrator account.
create or replace function private.onboarding_readiness(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.company_settings;checks jsonb;items jsonb;path text;human boolean;guide jsonb;
begin

 select * into c from public.company_settings where organization_id=p_org;checks=private.company_checklist(p_org);path='/painel/'||p_org;human=coalesce((c.support_configured or c.human_enabled) and c.support_mode in ('shared','mixed'),false);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'href',path||href,'complete',coalesce(complete,false),'required',required,'note',note) order by position),'[]') into items from (values
 (1,'company','Dados da empresa','/configuracao',coalesce(length(btrim(c.description))>=10 and length(btrim(c.service_regions))>=2 and length(btrim(c.payment_methods))>=2,false),true,'Apresente seu negócio e as informações comerciais.'),
 (2,'branding','Identidade visual','/consumidor#identidade',exists(select 1 from public.company_branding b join public.company_media l on l.id=b.logo_id and l.organization_id=p_org and l.state='ready' join public.company_media v on v.id=b.cover_id and v.organization_id=p_org and v.state='ready' where b.organization_id=p_org),false,'Recomendado: logo e capa deixam sua página com a sua cara.'),
 (3,'services','Serviços','/servicos',exists(select 1 from public.services where organization_id=p_org and active),true,'Cadastre o que sua empresa oferece.'),
 (4,'prices','Preços e modalidades','/servicos',exists(select 1 from public.services where organization_id=p_org and active) and not exists(select 1 from public.services where organization_id=p_org and active and (price_mode<>'quote' and price_cents is null)),true,'Preço fixo, a partir de ou sob consulta.'),
 (5,'hours','Horários','/configuracao#horarios',coalesce(jsonb_array_length(c.business_hours)>0,false),true,'Defina os horários em que a empresa atende.'),
 (6,'schedule','Agenda e disponibilidade','/consumidor#disponibilidade',exists(select 1 from public.schedule_resources where organization_id=p_org and active),exists(select 1 from public.services where organization_id=p_org and active and direct_booking),'Necessário quando houver agendamento online. Revise antecedência e intervalos.'),
 (7,'portfolio','Portfólio','/consumidor#portfolio',exists(select 1 from public.portfolio_items where organization_id=p_org and active),false,'Opcional: mostre seu trabalho com imagens autorizadas.'),
 (8,'page','Página pública','/consumidor#publicacao',exists(select 1 from public.consumer_pages where organization_id=p_org and enabled and publication_id is not null),true,'Revise o conteúdo antes de disponibilizá-lo na página da empresa.'),
 (9,'publication','Publicação e prontidão','/consumidor#publicacao',exists(select 1 from public.consumer_pages p join public.consumer_publications v on v.id=p.publication_id join public.manual_versions m on m.id=v.manual_id where p.organization_id=p_org and p.enabled and m.source_revision=c.operational_revision),true,'Rascunhos não substituem a versão aprovada para o consumidor.'),
 (10,'manual','Manual de Atendimento','/manual',coalesce((checks->>'manual_published')::boolean,false),human,'Para o atendimento humano: você orienta, nossa equipe segue.'),
 (11,'faq','FAQ','/faq',coalesce((checks->>'faq')::boolean,false),human,'Respostas claras às dúvidas recorrentes.'),
 (12,'rules','Regras empresariais','/regras',coalesce((checks->>'rules')::boolean,false),human,'Defina como agir em cancelamentos, prazos e exceções.'),
 (13,'autonomy','Autonomia da equipe','/autonomia',coalesce((checks->>'autonomy')::boolean,false),human,'Você decide os limites. Fora deles, a equipe consulta a empresa.'),
 (14,'human_ready','Prontidão do atendimento','/prontidao',coalesce(c.human_enabled,false) and not exists(select 1 from jsonb_each(checks) where value<>'true'::jsonb),human,'Revise manual, regras, equipe e disponibilidade antes de ativar.')
 ) x(position,id,label,href,complete,required,note) where position<10 or human;
 return jsonb_build_object('organization_id',p_org,'items',items,'shared_support',human,'ready',not exists(select 1 from jsonb_array_elements(items)i where (i->>'required')::boolean and not(i->>'complete')::boolean));
end;$$;
create or replace function public.onboarding_context(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare guide jsonb;begin
 if not private.company_can_manage(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 select to_jsonb(g)-array['user_id','organization_id'] into guide from public.organization_user_guides g where organization_id=p_org and user_id=auth.uid();
 return private.onboarding_readiness(p_org)||jsonb_build_object('guide',coalesce(guide,jsonb_build_object('status','not_started','step',0,'revision',0)));
end;$$;
revoke all on function private.onboarding_readiness(uuid) from public,anon,authenticated,service_role;

create or replace function public.analytics_platform(p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare bounds jsonb;lo timestamptz;hi timestamptz;r jsonb;begin
 if not private.has_global_role('super_admin') then raise exception 'access_denied' using errcode='42501';end if;
 bounds=private.analytics_period('UTC',p_from,p_to);lo=(bounds->>'from')::timestamptz;hi=(bounds->>'until')::timestamptz;
 select jsonb_build_object('period',bounds,'generated_at',statement_timestamp(),
 'organizations',count(*),'active_organizations',count(*) filter(where status='active'),'suspended_organizations',count(*) filter(where status<>'active'),
 'without_admin',count(*) filter(where not private.support_responsible(id)),
 'in_setup',count(*) filter(where not (private.onboarding_readiness(id)->>'ready')::boolean),
 'new_organizations',count(*) filter(where created_at>=lo and created_at<hi)) into r from public.organizations;
 return r||jsonb_build_object(
 'active_profiles',(select count(*) from public.profiles where status='active'),
 'active_enterprise_users',(select count(distinct m.user_id) from public.organization_members m join public.profiles p on p.id=m.user_id join public.organizations o on o.id=m.organization_id
 join auth.users u on u.id=m.user_id left join private.enterprise_accounts a on a.organization_id=m.organization_id and a.user_id=m.user_id where (a.id is null or a.state='active') and private.legal_ready(o.id) and u.email_confirmed_at is not null and m.status='active' and p.status='active' and o.status='active' and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now())),
 'recent_users',(select count(distinct s.user_id) from private.enterprise_sessions s join public.profiles p on p.id=s.user_id
 join auth.users u on u.id=s.user_id left join public.organizations o on o.id=s.organization_id left join private.enterprise_accounts a on a.id=s.account_id
 where not s.revoked and s.last_activity>statement_timestamp()-interval '30 minutes' and p.status='active' and (u.banned_until is null or u.banned_until<=now())
 and (s.organization_id is null and exists(select 1 from public.platform_roles where user_id=s.user_id and active) or o.status='active' and a.state='active' and a.generation=s.generation and private.legal_ready(o.id))),
 'activations',(select count(*) from private.enterprise_accounts where activated_at>=lo and activated_at<hi),
 'pending_activations',(select count(*) from private.enterprise_accounts where activated_at is null and state='pending'),
 'requests',(select count(*) from public.quote_requests where created_at>=lo and created_at<hi),
 'tickets',(select count(*) from public.tickets where created_at>=lo and created_at<hi),
 'appointments',(select count(*) from public.appointments where kind='booking' and created_at>=lo and created_at<hi),
 'published_organizations',(select count(*) from public.consumer_pages where enabled and publication_id is not null),
 'trial_organizations',(select count(*) from public.billing_subscriptions where private.billing_effective(billing_subscriptions)='trial'),
 'subscribers',(select count(*) from public.billing_subscriptions where private.billing_effective(billing_subscriptions)='active'),
 'trials_started',(select count(*) from private.trial_grants where starts_at>=lo and starts_at<hi),
 'trial_cohort_converted',(select count(*) from private.trial_grants where starts_at>=lo and starts_at<hi and status='converted'),
 'trials_expired',(select count(*) from private.trial_grants where ends_at>=lo and ends_at<hi and ends_at<=statement_timestamp() and status in ('active','ended')),
 'trial_extensions',(select count(*) from private.trial_extensions where created_at>=lo and created_at<hi),
 'delivery_failures',(select count(*) from private.access_deliveries where state='failed' and attempted_at>=lo and attempted_at<hi),
 'support_pending',(select count(*) from private.support_requests where state='pending'),
 'support_active',(select count(*) from private.support_requests where state='approved' and expires_at>statement_timestamp()
 and (mode='emergency' or private.support_responsible(organization_id,decided_by))),
 'emergencies',(select count(*) from private.support_requests where mode='emergency' and created_at>=lo and created_at<hi),
 'plans',coalesce((select jsonb_agg(x) from (select p.id,p.name,count(s.organization_id) subscriptions from public.billing_plans p
 left join public.billing_plan_versions v on v.plan_id=p.id left join public.billing_subscriptions s on s.plan_version_id=v.id and private.billing_effective(s) in ('active','trial') group by p.id,p.name order by p.name)x),'[]'::jsonb),
 'attention',coalesce((select jsonb_agg(x) from (select o.id,o.name,o.status,c.code,not private.support_responsible(o.id) without_admin,
 not (private.onboarding_readiness(o.id)->>'ready')::boolean in_setup,
 (select count(*) from private.support_requests where organization_id=o.id and state='pending') support_pending
 from public.organizations o join private.enterprise_codes c on c.organization_id=o.id where o.status<>'active' or not private.support_responsible(o.id)
 or not (private.onboarding_readiness(o.id)->>'ready')::boolean or exists(select 1 from private.support_requests where organization_id=o.id and state='pending')
 order by o.created_at desc,o.id limit 50)x),'[]'::jsonb),
 'billing','simulation_only','revenue_cents',null);
end;$$;
create or replace function public.access_organizations() returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.lock_authorize('global');
 return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'slug',o.slug,'status',o.status,'company_code',c.code,
 'responsible_admin',private.support_responsible(o.id),'onboarding_ready',(private.onboarding_readiness(o.id)->>'ready')::boolean,'operational_access',private.company_can_manage(o.id),
 'setup_state',case
 when private.support_responsible(o.id) then 'ready'
 when exists(select 1 from private.enterprise_accounts a where a.organization_id=o.id and a.role='admin_empresa' and a.state in ('reserved','changing','uncertain')) then 'incomplete'
 when exists(select 1 from private.enterprise_accounts a where a.organization_id=o.id and a.role='admin_empresa' and a.state='pending') then 'pending_activation'
 when not private.legal_ready(o.id) and exists(select 1 from public.organization_members m join public.profiles p on p.id=m.user_id join auth.users u on u.id=m.user_id
 where m.organization_id=o.id and m.role='admin_empresa' and m.status='active' and p.status='active'
 and not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())) then 'pending_legal'
 else 'awaiting_admin' end,
 'subscription',(select jsonb_build_object('status',s.state,'trial_used',s.trial_used) from public.billing_subscriptions s where s.organization_id=o.id)) order by o.name)
 from public.organizations o join private.enterprise_codes c on c.organization_id=o.id),'[]'::jsonb);end;$$;
-- Recovery is not another first activation; preserve its original timestamp.
create or replace function public.access_finish_activation(p_id uuid,p_operation uuid,p_success boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare a private.enterprise_accounts;begin
 perform pg_advisory_xact_lock(734921501);select * into a from private.enterprise_accounts where id=p_id and operation_id=p_operation and state='changing' for update;
 if a.id is null then return false;end if;
 update private.enterprise_accounts set state=case when p_success then 'active' else 'uncertain' end,activated_at=case when p_success then coalesce(activated_at,clock_timestamp()) else activated_at end,generation=generation+1 where id=p_id;
 -- A legacy Auth identity has one provider password. Only Super Admin may recover it across memberships.
 if p_success then update private.enterprise_accounts set operation_id=p_operation,generation=generation+1 where user_id=a.user_id and id<>a.id and state='active';end if;
 perform private.access_audit(a.organization_id,a.user_id,case when p_success then 'access_activated' else 'access_activation_uncertain' end,a.id);return p_success;end;$$;
commit;

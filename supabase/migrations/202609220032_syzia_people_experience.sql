-- SYZIA: independent identities, public appearance, schedule initialization and solo operation.
-- 001–031 remain immutable. See docs/syzia-032/architecture.md.
begin;
alter table public.company_branding add column theme text not null default 'light' check(theme in('light','dark'));
do $$declare d text;begin
 d=pg_get_functiondef('private.consumer_design_snapshot(uuid)'::regprocedure);
 d=replace(d,'''primary_color'',b.primary_color','''theme'',b.theme,''primary_color'',b.primary_color');execute d;
 d=pg_get_functiondef('private.v029_consumer_branding_save(uuid,integer,jsonb)'::regprocedure);
 d=replace(d,'''primary_color'',''logo''','''theme'',''primary_color'',''logo''');
 d=replace(d,'organization_id,primary_color,logo_id','organization_id,theme,primary_color,logo_id');
 d=replace(d,'values(p_org,coalesce(p_data->>''primary_color''','values(p_org,coalesce(p_data->>''theme'',''light''),coalesce(p_data->>''primary_color''');
 d=replace(d,'set primary_color=excluded.primary_color','set theme=excluded.theme,primary_color=excluded.primary_color');execute d;
 -- Existing wrapper retains agenda.manage, entitlement, session, and tenant checks.
 d=pg_get_functiondef('private.v029_consumer_schedule_config(uuid,integer,jsonb)'::regprocedure);
 d=replace(d,'perform private.company_lock(p_org);','perform private.presence_lock(p_org,''agenda.manage'');');
 d=replace(d,'select * into s from public.schedule_resources where organization_id=p_org;',
 'if p_expected_revision=0 then insert into public.schedule_resources(organization_id,active) values(p_org,false) on conflict(organization_id) do nothing; if not found then raise exception ''schedule_revision_conflict'' using errcode=''40001'';end if;end if;select * into s from public.schedule_resources where organization_id=p_org;');
 d=replace(d,'s.revision is distinct from p_expected_revision','s.revision is distinct from (case when p_expected_revision=0 then 1 else p_expected_revision end)');execute d;
end;$$;
-- An authorized administrator is an operator in their own company, without an attendant membership.
create or replace function private.central_eligible(p_org uuid,p_user uuid)returns boolean language sql stable security definer set search_path=''as $$
 select private.permission_actor(p_org,p_user,'central.read') and (private.permission_central_base(p_org,p_user) or
 (private.permission_role(p_org,p_user) in('admin_empresa','super_admin') and (p_user is distinct from auth.uid() or(private.is_active_user() and private.access_scope(p_org)))));
$$;
do $$declare d text;begin
 d=pg_get_functiondef('public.central_presence(text)'::regprocedure);
 d=replace(d,'private.has_global_role(''atendente'') or exists','private.has_global_role(''atendente'') or exists(select 1 from public.organizations o where private.permission_manager(o.id) and private.permission_allowed(o.id,''central.read'')) or exists');execute d;
end;$$;
-- Additional identity functions appended below, before final grants/commit.
alter table private.enterprise_accounts alter column organization_id drop not null;
alter table private.enterprise_accounts drop constraint enterprise_accounts_role_check;
alter table private.enterprise_accounts add constraint enterprise_accounts_role_check check(role in('admin_empresa','colaborador_empresa','own_attendant','person','syzia_staff'));
alter table private.enterprise_accounts add constraint enterprise_account_company_role check(organization_id is null or role in('admin_empresa','colaborador_empresa','own_attendant'));
create unique index people_username on private.enterprise_accounts(username) where organization_id is null;
create unique index people_identity on private.enterprise_accounts(user_id) where organization_id is null;
create table private.people_grants(user_id uuid primary key references public.profiles(id),permissions text[] not null default '{}',check(permissions <@ array['people.read','companies.read','shared.attend']::text[]));
alter table private.people_grants enable row level security;
alter table private.people_grants force row level security;
revoke all on private.people_grants from public,anon,authenticated,service_role;
create function private.people_root(p_user uuid)returns boolean language sql stable security definer set search_path=''as $$
 select exists(select 1 from public.platform_roles r join public.profiles p on p.id=r.user_id join auth.users u on u.id=p.id where r.user_id=p_user and r.role='super_admin' and r.active and p.status='active' and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now()));$$;
create function public.people_self()returns jsonb language sql stable security definer set search_path=''as $$
 select case when private.is_active_user() then jsonb_build_object('kind',coalesce((select role from private.enterprise_accounts where user_id=auth.uid() and organization_id is null),'person'),'permissions',coalesce((select to_jsonb(permissions)from private.people_grants where user_id=auth.uid()),'[]'::jsonb)) else '{}'::jsonb end;$$;
create function private.people_can(p_action text)returns boolean language sql stable security definer set search_path=''as $$
 select private.is_active_user() and(private.people_root(auth.uid())or exists(select 1 from private.people_grants where user_id=auth.uid() and p_action=any(permissions)));$$;
create function public.people_reserve(p_display text,p_username text,p_email text,p_phone text,p_role text,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare a private.enterprise_accounts;begin
 perform private.lock_authorize('global');
 if p_key is null or p_role not in('person','admin_empresa','syzia_staff') then raise exception 'access_invalid';end if;
 select * into a from private.enterprise_accounts where requested_by=auth.uid() and request_key=p_key;
 if a.id is not null then
 if a.organization_id is not null or a.display_name is distinct from btrim(p_display) or a.username is distinct from lower(btrim(p_username)) or a.role is distinct from p_role or a.contact_email is distinct from nullif(lower(btrim(p_email)),'') or a.phone is distinct from nullif(btrim(p_phone),'') then raise exception 'idempotency_conflict';end if;
 else
 insert into private.enterprise_accounts(user_id,username,display_name,contact_email,phone,role,requested_by,request_key)values(gen_random_uuid(),lower(btrim(p_username)),btrim(p_display),nullif(lower(btrim(p_email)),''),nullif(btrim(p_phone),''),p_role,auth.uid(),p_key) returning * into a;
 perform private.access_audit(null,auth.uid(),'person_reserved',a.id);
 end if;
 return jsonb_build_object('id',a.id,'user_id',a.user_id,'state',a.state,'organization_id',null);
end;$$;
-- Reuse provisioning and activation; a NULL organization is a personal account, never a synthetic company.
do $$declare d text;begin
 d=pg_get_functiondef('public.access_finish_provision(uuid,uuid,text)'::regprocedure);
 d=replace(d,'not private.inviter_eligible(a.organization_id,p_actor)','not ((a.organization_id is null and private.people_root(p_actor))or private.inviter_eligible(a.organization_id,p_actor))');
 d=replace(d,'insert into public.organization_members(','if a.organization_id is not null then insert into public.organization_members(');
 d=replace(d,'on conflict(organization_id,user_id) do nothing;','on conflict(organization_id,user_id) do nothing;end if;');
 d=replace(d,'''company_code'',(select code from private.enterprise_codes where organization_id=a.organization_id)','''company_code'',coalesce((select code from private.enterprise_codes where organization_id=a.organization_id),''SYZIA'')');execute d;
 d=pg_get_functiondef('public.access_lookup(text,text)'::regprocedure);
 execute replace(d,'FUNCTION public.access_lookup(','FUNCTION private.people_lookup_company(');
 d=pg_get_functiondef('public.access_verify_code(text,text,text,text)'::regprocedure);
 execute replace(d,'FUNCTION public.access_verify_code(','FUNCTION private.people_verify_company(');
 d=pg_get_functiondef('public.access_begin_activation(text)'::regprocedure);
 d=replace(d,'or not exists(select 1 from public.organization_members','or (a.organization_id is not null and not exists(select 1 from public.organization_members');
 d=replace(d,'p.status=''active'') then return null;','p.status=''active'')) or not exists(select 1 from public.profiles where id=a.user_id and status=''active'') then return null;');execute d;
 d=pg_get_functiondef('public.access_register_session(uuid,uuid,uuid,integer)'::regprocedure);
 d=replace(d,'a.id is null or not exists(select 1 from public.organization_members','a.id is null or (a.organization_id is not null and not exists(select 1 from public.organization_members');
 d=replace(d,'o.status=''active'') then return false;','o.status=''active'')) then return false;');execute d;
 d=pg_get_functiondef('private.access_session_valid(boolean)'::regprocedure);
 d=replace(d,'and (s.organization_id is null or','and (s.account_id is null or(a.state=''active'' and a.generation=s.generation)) and (s.organization_id is null or');execute d;
 d=pg_get_functiondef('private.access_scope(uuid)'::regprocedure);
 d=replace(d,'organization_id=p_org or organization_id is null','organization_id=p_org or (organization_id is null and exists(select 1 from public.platform_roles where user_id=auth.uid() and active and(role=''super_admin''or(private.legal_ready(p_org)and private.verification_ready(p_org)))))');execute d;
 d=pg_get_functiondef('public.access_reset(uuid,uuid,text)'::regprocedure);
 d=replace(d,'not private.inviter_eligible(a.organization_id,p_actor)','not ((a.organization_id is null and private.people_root(p_actor))or private.inviter_eligible(a.organization_id,p_actor))');
 d=replace(d,'''company_code'',(select code from private.enterprise_codes where organization_id=a.organization_id)','''company_code'',coalesce((select code from private.enterprise_codes where organization_id=a.organization_id),''SYZIA'')');execute d;
end;$$;
create or replace function public.access_lookup(p_code text,p_username text)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 if upper(btrim(p_code))<>'SYZIA' then return private.people_lookup_company(p_code,p_username);end if;
 return(select jsonb_build_object('id',a.id,'user_id',a.user_id,'generation',a.generation,'operation',a.operation_id,'email',u.email)from private.enterprise_accounts a join public.profiles p on p.id=a.user_id join auth.users u on u.id=p.id where a.organization_id is null and a.username=lower(btrim(p_username)) and a.state='active' and p.status='active' and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and(u.banned_until is null or u.banned_until<=now()));end;$$;
create or replace function public.access_verify_code(p_code text,p_username text,p_hash text,p_proof text)returns jsonb language plpgsql security definer set search_path=''as $$declare a private.enterprise_accounts;begin
 if upper(btrim(p_code))<>'SYZIA' then return private.people_verify_company(p_code,p_username,p_hash,p_proof);end if;
 perform pg_advisory_xact_lock(734921501);
 select x.* into a from private.enterprise_accounts x join public.profiles p on p.id=x.user_id where x.organization_id is null and x.username=lower(btrim(p_username)) and p.status='active' for update of x;
 if a.id is null or a.state<>'pending' or a.code_expires<=clock_timestamp() or a.attempts>=(select max_attempts from private.access_policy) then return null;end if;
 update private.enterprise_accounts set attempts=attempts+1 where id=a.id;
 if a.code_hash is distinct from p_hash or p_proof is null or p_proof !~ '^[a-f0-9]{64}$' then return null;end if;
 update private.enterprise_accounts set proof_hash=p_proof,proof_expires=clock_timestamp()+interval '5 minutes' where id=a.id;
 return jsonb_build_object('reset',a.activated_at is not null);end;$$;
create function public.people_directory()returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 if not private.people_can('people.read')then raise exception 'access_denied'using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.display_name,''),a.display_name,'Nome não informado'),'status',p.status,'account_id',a.id,'username',a.username,'email',a.contact_email,'phone',a.phone,'kind',coalesce(a.role,'person'),'state',a.state,'last_access',(select max(created_at)from private.enterprise_sessions where user_id=p.id),
 'roles',(select coalesce(jsonb_agg(role),'[]')from public.platform_roles where user_id=p.id and active),
 'permissions',coalesce((select to_jsonb(permissions)from private.people_grants where user_id=p.id),'[]'),
 'links',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'role',m.role,'status',m.status,'company_code',c.code))from public.organization_members m join public.organizations o on o.id=m.organization_id left join private.enterprise_codes c on c.organization_id=o.id where m.user_id=p.id),'[]'),
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'status',t.status,'kind',t.kind))from public.attendant_organizations t join public.organizations o on o.id=t.organization_id where t.user_id=p.id),'[]'),
 'audit',case when private.people_root(auth.uid())then coalesce((select jsonb_agg(to_jsonb(z))from(select action,created_at from public.audit_logs where (entity_key->>'id' in(select id::text from private.enterprise_accounts where user_id=p.id) or entity_key->>'id'=p.id::text or entity_key->>'user_id'=p.id::text) order by created_at desc limit 30)z),'[]')else '[]'::jsonb end)order by p.display_name,p.id)
 from public.profiles p join auth.users identity_ on identity_.id=p.id and not coalesce(identity_.is_anonymous,false) left join lateral(select * from private.enterprise_accounts where user_id=p.id order by (organization_id is null)desc,created_at limit 1)a on true),'[]');end;$$;
create function public.people_companies()returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 if not private.people_can('companies.read')then raise exception 'access_denied'using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status)order by name)from public.organizations),'[]');end;$$;
create function public.people_permissions(p_user uuid,p_permissions text[])returns void language plpgsql security definer set search_path=''as $$begin
 perform private.lock_authorize('global');perform private.require_eligible_user(p_user);
 if p_user=auth.uid() or not exists(select 1 from private.enterprise_accounts where user_id=p_user and organization_id is null and role='syzia_staff')then raise exception 'access_denied'using errcode='42501';end if;
 insert into private.people_grants values(p_user,p_permissions)on conflict(user_id)do update set permissions=excluded.permissions;
 perform public.foundation_set_global_role(p_user,'atendente','shared.attend'=any(p_permissions));
 -- Removing the function also suspends assignments, preserving their history.
 if not('shared.attend'=any(p_permissions))then update public.attendant_organizations set status='suspended'where user_id=p_user;end if;
 perform private.access_audit(null,auth.uid(),'person_permissions',(select id from private.enterprise_accounts where user_id=p_user and organization_id is null));
end;$$;
create function public.people_link(p_user uuid,p_org uuid,p_role text,p_active boolean)returns void language plpgsql security definer set search_path=''as $$
declare a private.enterprise_accounts;begin
 perform private.lock_authorize('global');
 if not private.company_can_manage(p_org)then raise exception 'access_denied'using errcode='42501';end if;
 if p_role not in('admin_empresa','colaborador_empresa','own_attendant')or p_active is null then raise exception 'access_invalid';end if;
 select * into a from private.enterprise_accounts where user_id=p_user order by(organization_id is null)desc,created_at limit 1;
 if a.id is null or a.state not in('active','pending') then raise exception 'access_change_unavailable';end if;
 if p_role='admin_empresa' and a.contact_email is null then raise exception 'administrator_email_required';end if;

 if not p_active then
 if p_user=auth.uid()then raise exception 'cannot_change_own_membership';end if;
 update public.organization_members set status='suspended'where organization_id=p_org and user_id=p_user;
 else perform public.foundation_set_member(p_org,p_user,case when p_role='admin_empresa'then 'admin_empresa'::public.member_role else 'colaborador_empresa'::public.member_role end,case when p_active then 'active'::public.record_status else 'suspended'::public.record_status end);end if;
 update public.organization_members set is_attendant=p_role='own_attendant'where organization_id=p_org and user_id=p_user;
 if p_active then
 if not exists(select 1 from private.enterprise_codes where organization_id=p_org)then raise exception 'company_code_unavailable';end if;
 insert into private.enterprise_accounts(organization_id,user_id,username,display_name,contact_email,phone,role,state,generation,operation_id,activated_at,requested_by,request_key)
 values(p_org,p_user,a.username,a.display_name,a.contact_email,a.phone,p_role,a.state,a.generation,a.operation_id,a.activated_at,auth.uid(),gen_random_uuid())
 on conflict(organization_id,user_id)do update set role=excluded.role;
 end if;
 update private.enterprise_sessions set revoked=true where user_id=p_user and(organization_id=p_org or organization_id is null);
 perform private.access_audit(p_org,auth.uid(),case when p_active then 'person_linked'else 'person_unlinked'end,a.id);
end;$$;
-- A single Auth password/activation is shared by explicitly attached accounts.
do $$declare d text;begin
 d=pg_get_functiondef('public.access_finish_activation(uuid,uuid,boolean)'::regprocedure);
 d=replace(d,'set operation_id=p_operation,generation=generation+1 where user_id=a.user_id and id<>a.id and state=''active''','set operation_id=p_operation,generation=generation+1,state=''active'',activated_at=coalesce(activated_at,clock_timestamp()),code_hash=null,proof_hash=null where user_id=a.user_id and id<>a.id and state in(''active'',''pending'')');execute d;
end;$$;
create function public.people_revoke(p_user uuid)returns void language plpgsql security definer set search_path=''as $$begin
 perform private.lock_authorize('global');if p_user=auth.uid()then raise exception 'access_change_unavailable';end if;
 update private.enterprise_sessions set revoked=true where user_id=p_user;
 perform private.access_audit(null,auth.uid(),'person_sessions_revoked',(select id from private.enterprise_accounts where user_id=p_user order by created_at limit 1));end;$$;
revoke all on function private.people_root(uuid),private.people_can(text),private.people_lookup_company(text,text),private.people_verify_company(text,text,text,text)from public,anon,authenticated,service_role;
revoke all on function public.people_self(),public.people_directory(),public.people_companies(),public.people_reserve(text,text,text,text,text,uuid),public.people_permissions(uuid,text[]),public.people_link(uuid,uuid,text,boolean),public.people_revoke(uuid)from public,anon,authenticated,service_role;
grant execute on function public.people_self(),public.people_directory(),public.people_companies(),public.people_reserve(text,text,text,text,text,uuid),public.people_permissions(uuid,text[]),public.people_link(uuid,uuid,text,boolean),public.people_revoke(uuid)to authenticated;
-- Solo owners receive customer conversations without enabling outsourced support.
do $$declare d text;begin
 d=pg_get_functiondef('private.central_open(uuid)'::regprocedure);
 d=replace(d,'and s.human_enabled)', 'and (s.human_enabled or exists(select 1 from public.organization_members m where m.organization_id=q.organization_id and m.role=''admin_empresa'' and m.status=''active'' and private.permission_actor(q.organization_id,m.user_id,''central.reply''))))');execute d;
 d=pg_get_functiondef('public.company_attendant_permission(uuid,text,integer)'::regprocedure);
 execute replace(d,'FUNCTION public.company_attendant_permission(','FUNCTION private.people_attendant_permission_base(');
end;$$;
create or replace function public.company_attendant_permission(p_org uuid,p_action text,p_discount integer default 0)returns boolean language sql stable security definer set search_path=''as $$
 select private.people_attendant_permission_base(p_org,p_action,p_discount)or(private.permission_manager(p_org) and p_discount between 0 and 100 and private.permission_allowed(p_org,case when p_action in('price_list','quote_create','quote_send','discount')then 'quotes.manage' when p_action in('schedule','reschedule','cancel')then 'agenda.manage' when p_action='follow_up'then 'followup.manage'else 'central.reply'end) and p_action in('price_list','quote_create','quote_send','discount','schedule','reschedule','cancel','follow_up','whatsapp'));
$$;
revoke all on function private.people_attendant_permission_base(uuid,text,integer)from public,anon,authenticated,service_role;
do $$declare d text;begin
 d=pg_get_functiondef('public.foundation_context()'::regprocedure);
 d=replace(d,'''memberships'',','''identity'',public.people_self(),''memberships'',');execute d;
end;$$;
create function private.people_solo_conversation(p_org uuid)returns boolean language sql stable security definer set search_path=''as $$
 select exists(select 1 from public.organization_members m where m.organization_id=p_org and m.role='admin_empresa' and m.status='active' and private.permission_actor(p_org,m.user_id,'central.reply'));$$;
do $$declare d text;begin
 d=pg_get_functiondef('private.central_on_submit()'::regprocedure);
 d=replace(d,'and human_enabled)','and(human_enabled or private.people_solo_conversation(new.organization_id)))');execute d;
 d=pg_get_functiondef('public.central_consumer_thread(text)'::regprocedure);
 d=replace(d,'and human_enabled)','and(human_enabled or private.people_solo_conversation(q.organization_id)))');execute d;
end;$$;
revoke all on function private.people_solo_conversation(uuid)from public,anon,authenticated,service_role;
-- Resume provisioning across gateway/provider interruptions with the same reserved identity.
do $$declare d text;begin
 d=pg_get_functiondef('public.access_resume(uuid)'::regprocedure);
 d=replace(d,'private.lock_authorize(''org'',a.organization_id)','private.lock_authorize(case when a.organization_id is null then ''global''else ''org''end,a.organization_id)');d=replace(d,'if not private.company_can_manage(a.organization_id)','if a.organization_id is not null and not private.company_can_manage(a.organization_id)');execute d;
end;$$;
create function public.people_reservations()returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 if not private.is_active_user()or not private.people_root(auth.uid())then raise exception 'access_denied'using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',display_name,'username',username))from private.enterprise_accounts where organization_id is null and state='reserved'),'[]');end;$$;
revoke all on function public.people_reservations()from public,anon,authenticated,service_role;
grant execute on function public.people_reservations()to authenticated;
-- Read schedule through the existing projection even for an agenda-only grant.
create or replace function public.consumer_admin_context(p_org uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare depth_ int;result_ jsonb;begin
 depth_=private.permission_enter(p_org,case when private.permission_allowed(p_org,'page.read')then 'page.read'when private.permission_allowed(p_org,'portfolio.read')then 'portfolio.read'else 'agenda.read'end);
 result_=private.permission_projection(p_org,'consumer_admin_context',private.v029_consumer_admin_context(p_org));perform private.permission_leave(depth_);return result_;end;$$;
commit;

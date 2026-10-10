begin;
-- Additive transition: credentials stay in Auth; all internal secrets are server-only.
create table private.access_policy (
 singleton boolean primary key default true check(singleton), idle_seconds int not null default 1800 check(idle_seconds between 300 and 14400),
 warning_seconds int not null default 60 check(warning_seconds between 15 and 120), code_hours int not null default 48 check(code_hours between 1 and 168),
 max_attempts int not null default 5 check(max_attempts between 3 and 10), check(warning_seconds<idle_seconds)
);
insert into private.access_policy default values;
create table private.enterprise_codes (
 organization_id uuid primary key references public.organizations(id), code text not null unique default upper(encode(extensions.gen_random_bytes(6),'hex')) check(code ~ '^[A-F0-9]{12}$'),
 legal_required boolean not null default false
);
insert into private.enterprise_codes(organization_id) select id from public.organizations;
create function private.enterprise_code_new() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into private.enterprise_codes(organization_id) values(new.id);return new;end;$$;
create trigger enterprise_code_new after insert on public.organizations for each row execute function private.enterprise_code_new();
create table private.enterprise_accounts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 user_id uuid not null, username text not null check(username=lower(username) and username ~ '^[a-z][a-z0-9]{1,29}[.][a-z0-9][a-z0-9.]{0,29}$' and username not like '%..%' and right(username,1)<>'.'),
 display_name text not null check(length(btrim(display_name)) between 3 and 120), contact_email text check(contact_email is null or (length(contact_email)<=254 and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
 phone text check(phone is null or length(phone)<=40), role text not null check(role in ('admin_empresa','colaborador_empresa','own_attendant')),
 state text not null default 'reserved' check(state in ('reserved','pending','active','disabled','changing','uncertain')),
 generation int not null default 1, code_hash text, code_expires timestamptz, attempts int not null default 0,
 proof_hash text, proof_expires timestamptz, operation_id uuid, requested_by uuid not null references public.profiles(id), request_key uuid not null,
 created_at timestamptz not null default now(), activated_at timestamptz,
 unique(organization_id,username),unique(organization_id,user_id),unique(requested_by,request_key),
 check(role<>'admin_empresa' or contact_email is not null)
);
create table private.access_enforced_users(user_id uuid primary key references public.profiles(id));
-- Existing ordinary Auth identities enter the explicit username adoption queue.
-- Global credentials are preserved; existing sessions reauthenticate through the gateway.
insert into private.access_enforced_users(user_id)
 select p.id from public.profiles p join auth.users u on u.id=p.id where not coalesce(u.is_anonymous,false);
create table private.enterprise_sessions(
 session_id uuid primary key, user_id uuid not null references public.profiles(id), organization_id uuid references public.organizations(id),
 account_id uuid references private.enterprise_accounts(id), generation int, last_activity timestamptz not null default clock_timestamp(), revoked boolean not null default false,
 created_at timestamptz not null default clock_timestamp()
);
create table private.access_limits(key text primary key, window_at timestamptz not null, attempts int not null);
create table public.legal_documents(
 kind text not null check(kind in ('terms','privacy')), version text not null, acceptance_version text not null,
 title text not null, body text not null, is_draft boolean not null default true, current boolean not null default false,
 created_at timestamptz not null default now(), primary key(kind,version)
);
create unique index legal_current on public.legal_documents(kind) where current;
create table private.legal_acceptances(
 organization_id uuid not null references public.organizations(id), user_id uuid not null references public.profiles(id),
 terms_version text not null, privacy_version text not null, terms_acceptance text not null, privacy_acceptance text not null,
 accepted_at timestamptz not null default clock_timestamp(), primary key(organization_id,terms_acceptance,privacy_acceptance)
);
-- No IP/user agent collection required for acceptance. Actor/version/time is sufficient here.
do $$declare n text;begin
 foreach n in array array['access_policy','enterprise_codes','enterprise_accounts','access_enforced_users','enterprise_sessions','access_limits','legal_acceptances'] loop
 execute format('alter table private.%I enable row level security',n);execute format('alter table private.%I force row level security',n);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);end loop;end;$$;
alter table public.legal_documents enable row level security;
alter table public.legal_documents force row level security;
revoke all on public.legal_documents from public,anon,authenticated,service_role;
grant select on public.legal_documents to anon,authenticated;
create policy legal_read on public.legal_documents for select to anon,authenticated using(true);
create function private.access_audit(p_org uuid,p_actor uuid,p_event text,p_id uuid) returns void language sql security definer set search_path='' as $$
 insert into public.audit_logs(organization_id,actor_id,action,entity_table,entity_key,changed_fields) values(p_org,p_actor,p_event,'enterprise_access',jsonb_build_object('id',p_id),array['state']);$$;
create function private.legal_ready(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not coalesce((select legal_required from private.enterprise_codes where organization_id=p_org),false) or exists(
 select 1 from private.legal_acceptances a join public.legal_documents t on t.kind='terms' and t.current and t.acceptance_version=a.terms_acceptance
 join public.legal_documents p on p.kind='privacy' and p.current and p.acceptance_version=a.privacy_acceptance where a.organization_id=p_org);
$$;
alter function private.is_active_user() rename to access_base_active;
create function private.access_session_valid(p_legal boolean default true) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.access_enforced_users where user_id=auth.uid()) or exists(
 select 1 from private.enterprise_sessions s cross join private.access_policy p
 left join private.enterprise_accounts a on a.id=s.account_id left join public.organizations o on o.id=s.organization_id
 where s.user_id=auth.uid() and s.session_id::text=auth.jwt()->>'session_id' and not s.revoked
 and s.last_activity>clock_timestamp()-make_interval(secs=>p.idle_seconds)
 and (s.organization_id is null or (o.status='active' and a.state='active' and a.generation=s.generation
 and exists(select 1 from public.organization_members m where m.organization_id=o.id and m.user_id=s.user_id and m.status='active')
 and (not p_legal or private.legal_ready(o.id)))));
$$;
create function private.is_active_user() returns boolean language sql stable security definer set search_path='' as $$select private.access_base_active() and private.access_session_valid();$$;
-- Existing function dependencies follow rename; replace references to the original OID with new guard.
do $$declare f record;definition text;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' and p.oid not in ('private.access_base_active()'::regprocedure,'private.is_active_user()'::regprocedure) loop
 definition=pg_get_functiondef(f.oid);
 if position('private.access_base_active()' in definition)>0 and position('access_session_valid' in definition)=0 then
 execute replace(definition,'private.access_base_active()','private.is_active_user()');end if;end loop;end;$$;
-- Scope applies even when an existing Auth identity has memberships in several tenants.
create function private.access_scope(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.access_enforced_users where user_id=auth.uid()) or exists(select 1 from private.enterprise_sessions where user_id=auth.uid() and session_id::text=auth.jwt()->>'session_id' and (organization_id=p_org or organization_id is null));$$;
alter function private.can_access_org(uuid) rename to access_base_org;
create function private.can_access_org(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$select private.access_base_org(p_org) and private.access_scope(p_org);$$;
alter function private.is_org_admin(uuid) rename to access_base_admin;
create function private.is_org_admin(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$select private.access_base_admin(p_org) and private.access_scope(p_org);$$;
-- Existing policies bound to renamed helpers are replaced with wrappers, preserving their expressions.
do $$declare x record;exp text;begin
 for x in select schemaname,tablename,policyname,qual from pg_policies where schemaname='public' loop
 exp=replace(replace(replace(x.qual,'access_base_active()','is_active_user()'),'access_base_org(','can_access_org('),'access_base_admin(','is_org_admin(');
 if exp is distinct from x.qual then execute format('alter policy %I on %I.%I using (%s)',x.policyname,x.schemaname,x.tablename,exp);end if;end loop;end;$$;
-- SQL/plpgsql bodies are resolved at runtime; scope check is also required for modules using member tables directly.
create function private.access_member_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.enterprise_accounts a where a.organization_id=new.organization_id and a.user_id=new.user_id) then
 if new.role='admin_empresa' and not exists(select 1 from private.enterprise_accounts a where a.organization_id=new.organization_id and a.user_id=new.user_id and a.contact_email is not null) then raise exception 'administrator_email_required';end if;
 if tg_op='UPDATE' and (new.status is distinct from old.status or new.role is distinct from old.role or new.is_attendant is distinct from old.is_attendant) then
 update private.enterprise_sessions set revoked=true where user_id=new.user_id and organization_id=new.organization_id;
 update private.enterprise_accounts set generation=generation+1,code_hash=null,proof_hash=null,
 role=case when new.role='admin_empresa' then 'admin_empresa' when new.is_attendant then 'own_attendant' else 'colaborador_empresa' end,
 state=case when new.status<>'active' then 'disabled' when state='disabled' then 'pending' else state end
 where organization_id=new.organization_id and user_id=new.user_id;
 end if;end if;return new;end;$$;
create trigger access_member_guard before insert or update on public.organization_members for each row execute function private.access_member_guard();
create function public.access_rate(p_key text,p_limit int,p_seconds int) returns boolean language plpgsql security definer set search_path='' as $$
declare n int;begin
 if length(p_key)<>64 or p_limit not between 1 and 1000 or p_seconds not between 1 and 3600 then return false;end if;
 insert into private.access_limits(key,window_at,attempts) values(p_key,clock_timestamp(),1) on conflict(key) do update set
 attempts=case when access_limits.window_at<clock_timestamp()-make_interval(secs=>p_seconds) then 1 else access_limits.attempts+1 end,
 window_at=case when access_limits.window_at<clock_timestamp()-make_interval(secs=>p_seconds) then clock_timestamp() else access_limits.window_at end returning attempts into n;
 delete from private.access_limits where window_at<clock_timestamp()-interval '1 day';return n<=p_limit;end;$$;
create function public.access_reserve(p_org uuid,p_name text,p_slug text,p_display text,p_username text,p_email text,p_phone text,p_role text,p_key uuid,p_existing uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.enterprise_accounts;o uuid=p_org;begin
 perform private.lock_authorize(case when p_org is null then 'global' else 'org' end,p_org);
 select * into a from private.enterprise_accounts where requested_by=auth.uid() and request_key=p_key;
 if a.id is not null then
 if a.username<>lower(btrim(p_username)) or a.display_name<>btrim(p_display) or a.contact_email is distinct from nullif(lower(btrim(p_email)),'') or a.role<>p_role or (p_org is not null and a.organization_id<>p_org) or (p_org is null and not exists(select 1 from public.organizations where id=a.organization_id and name=p_name and slug=p_slug)) then raise exception 'idempotency_conflict';end if;
 return jsonb_build_object('id',a.id,'user_id',a.user_id,'organization_id',a.organization_id,'state',a.state);end if;
 if p_org is null then
 if p_role<>'admin_empresa' then raise exception 'access_denied';end if;
 insert into public.organizations(name,slug) values(p_name,p_slug) returning id into o;
 update private.enterprise_codes set legal_required=true where organization_id=o;
 end if;
 if p_existing is not null then
 if (select count(*) from public.organization_members where user_id=p_existing)>1 and not exists(select 1 from public.platform_roles where user_id=auth.uid() and role='super_admin' and active) then raise exception 'shared_identity_requires_superadmin';end if;
 if not exists(select 1 from public.organization_members where organization_id=o and user_id=p_existing) or exists(select 1 from public.platform_roles where user_id=p_existing and active) then raise exception 'access_denied';end if;
 -- Adoption never changes an existing role or status.
 if not exists(select 1 from public.organization_members where organization_id=o and user_id=p_existing and status='active' and case when role='admin_empresa' then 'admin_empresa' when is_attendant then 'own_attendant' else 'colaborador_empresa' end=p_role) then raise exception 'access_denied';end if;
 end if;
 insert into private.enterprise_accounts(organization_id,user_id,username,display_name,contact_email,phone,role,requested_by,request_key)
 values(o,coalesce(p_existing,gen_random_uuid()),lower(btrim(p_username)),btrim(p_display),nullif(lower(btrim(p_email)),''),nullif(btrim(p_phone),''),p_role,auth.uid(),p_key) returning * into a;
 perform private.access_audit(o,auth.uid(),'access_reserved',a.id);
 return jsonb_build_object('id',a.id,'user_id',a.user_id,'organization_id',o,'state',a.state);end;$$;
create function public.access_finish_provision(p_id uuid,p_actor uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.enterprise_accounts;begin
 perform pg_advisory_xact_lock(734921501);select * into a from private.enterprise_accounts where id=p_id for update;
 if a.id is null or a.state<>'reserved' or a.requested_by<>p_actor or not private.inviter_eligible(a.organization_id,p_actor) or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'access_denied';end if;
 if (select count(*) from public.organization_members where user_id=a.user_id)>1 and not exists(select 1 from public.platform_roles where user_id=p_actor and role='super_admin' and active) then raise exception 'shared_identity_requires_superadmin';end if;
 perform private.require_eligible_user(a.user_id);
 insert into private.access_enforced_users values(a.user_id) on conflict do nothing;
 update private.enterprise_accounts set state='pending',code_hash=p_hash,code_expires=clock_timestamp()+make_interval(hours=>(select code_hours from private.access_policy)) where id=p_id;
 insert into public.organization_members(organization_id,user_id,role,is_attendant) values(a.organization_id,a.user_id,case when a.role='admin_empresa' then 'admin_empresa'::public.member_role else 'colaborador_empresa'::public.member_role end,a.role='own_attendant') on conflict(organization_id,user_id) do nothing;
 update public.profiles set display_name=a.display_name where id=a.user_id;
 perform private.access_audit(a.organization_id,p_actor,'access_provisioned',a.id);
 return jsonb_build_object('company_code',(select code from private.enterprise_codes where organization_id=a.organization_id),'company_name',(select name from public.organizations where id=a.organization_id),'username',a.username,'expires_at',(select code_expires from private.enterprise_accounts where id=p_id));end;$$;
create function public.access_lookup(p_code text,p_username text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'user_id',a.user_id,'generation',a.generation,'operation',a.operation_id,'email',u.email) from private.enterprise_accounts a join private.enterprise_codes c on c.organization_id=a.organization_id join public.organizations o on o.id=c.organization_id join auth.users u on u.id=a.user_id join public.profiles p on p.id=u.id join public.organization_members m on m.organization_id=o.id and m.user_id=u.id
 where c.code=upper(btrim(p_code)) and a.username=lower(btrim(p_username)) and a.state='active' and o.status='active' and p.status='active' and m.status='active' and (u.banned_until is null or u.banned_until<=now());$$;
create function public.access_verify_code(p_code text,p_username text,p_hash text,p_proof text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.enterprise_accounts;begin
 perform pg_advisory_xact_lock(734921501);
 select x.* into a from private.enterprise_accounts x join private.enterprise_codes c on c.organization_id=x.organization_id join public.organizations o on o.id=c.organization_id join public.organization_members m on m.organization_id=o.id and m.user_id=x.user_id join public.profiles p on p.id=x.user_id where c.code=upper(btrim(p_code)) and x.username=lower(btrim(p_username)) and o.status='active' and m.status='active' and p.status='active' for update of x;
 if a.id is null or a.state<>'pending' or a.code_expires<=clock_timestamp() or a.attempts>=(select max_attempts from private.access_policy) then return null;end if;
 update private.enterprise_accounts set attempts=attempts+1 where id=a.id;
 if a.code_hash is distinct from p_hash or p_proof is null or p_proof !~ '^[a-f0-9]{64}$' then return null;end if;
 update private.enterprise_accounts set proof_hash=p_proof,proof_expires=clock_timestamp()+interval '5 minutes' where id=a.id;
 return jsonb_build_object('reset',a.activated_at is not null);end;$$;
create function public.access_begin_activation(p_proof text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.enterprise_accounts;op uuid=gen_random_uuid();begin
 perform pg_advisory_xact_lock(734921501);select * into a from private.enterprise_accounts where proof_hash=p_proof and state='pending' and proof_expires>clock_timestamp() and code_expires>clock_timestamp() for update;
 if a.id is null or exists(select 1 from private.enterprise_accounts where user_id=a.user_id and id<>a.id and state='changing') or not exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id join public.profiles p on p.id=m.user_id where m.organization_id=a.organization_id and m.user_id=a.user_id and m.status='active' and o.status='active' and p.status='active') then return null;end if;
 update private.enterprise_accounts set state='changing',operation_id=op,proof_hash=null,code_hash=null where id=a.id;
 update private.enterprise_sessions set revoked=true where user_id=a.user_id;
 return jsonb_build_object('id',a.id,'user_id',a.user_id,'operation',op);end;$$;
create function public.access_finish_activation(p_id uuid,p_operation uuid,p_success boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare a private.enterprise_accounts;begin
 perform pg_advisory_xact_lock(734921501);select * into a from private.enterprise_accounts where id=p_id and operation_id=p_operation and state='changing' for update;
 if a.id is null then return false;end if;
 update private.enterprise_accounts set state=case when p_success then 'active' else 'uncertain' end,activated_at=case when p_success then clock_timestamp() else activated_at end,generation=generation+1 where id=p_id;
 -- A legacy Auth identity has one provider password. Only Super Admin may recover it across memberships.
 if p_success then update private.enterprise_accounts set operation_id=p_operation,generation=generation+1 where user_id=a.user_id and id<>a.id and state='active';end if;
 perform private.access_audit(a.organization_id,a.user_id,case when p_success then 'access_activated' else 'access_activation_uncertain' end,a.id);return p_success;end;$$;
create function public.access_register_session(p_user uuid,p_session uuid,p_account uuid,p_generation int) returns boolean language plpgsql security definer set search_path='' as $$
declare a private.enterprise_accounts;begin
 perform pg_advisory_xact_lock(734921501);
 if p_session is null then return false;end if;
 perform private.require_eligible_user(p_user);
 if p_account is null then
 if not exists(select 1 from public.platform_roles where user_id=p_user and active) then return false;end if;
 else
 select * into a from private.enterprise_accounts where id=p_account and user_id=p_user and state='active' and generation=p_generation;
 if a.id is null or not exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.user_id=p_user and m.organization_id=a.organization_id and m.status='active' and o.status='active') then return false;end if;
 end if;
 insert into private.access_enforced_users values(p_user) on conflict do nothing;
 insert into private.enterprise_sessions(session_id,user_id,organization_id,account_id,generation) values(p_session,p_user,a.organization_id,a.id,a.generation) on conflict do nothing;
 return true;end;$$;
create function public.access_session(p_activity boolean default false,p_logout boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.enterprise_sessions;result jsonb;begin
 if p_logout then update private.enterprise_sessions set revoked=true where user_id=auth.uid() and session_id::text=auth.jwt()->>'session_id';return '{}'::jsonb;end if;
 if not private.access_base_active() or not private.access_session_valid(false) then raise exception 'access_denied' using errcode='42501';end if;
 select * into s from private.enterprise_sessions where user_id=auth.uid() and session_id::text=auth.jwt()->>'session_id';
 if p_activity then update private.enterprise_sessions set last_activity=clock_timestamp() where session_id=s.session_id returning * into s;end if;
 return jsonb_build_object('idle_seconds',(select idle_seconds from private.access_policy),'warning_seconds',(select warning_seconds from private.access_policy),'last_activity',s.last_activity,'organization_id',s.organization_id,'organization_name',(select name from public.organizations where id=s.organization_id),'legal_required',s.organization_id is not null and not private.legal_ready(s.organization_id),'can_accept',exists(select 1 from public.organization_members where organization_id=s.organization_id and user_id=auth.uid() and role='admin_empresa' and status='active'));
end;$$;
create function public.access_legal_accept(p_terms text,p_privacy text) returns void language plpgsql security definer set search_path='' as $$
declare s private.enterprise_sessions;t public.legal_documents;p public.legal_documents;begin
 perform pg_advisory_xact_lock(734921501);
 if not private.access_base_active() or not private.access_session_valid(false) then raise exception 'access_denied';end if;
 select * into s from private.enterprise_sessions where user_id=auth.uid() and session_id::text=auth.jwt()->>'session_id';
 if s.organization_id is null or not exists(select 1 from public.organization_members where organization_id=s.organization_id and user_id=auth.uid() and role='admin_empresa' and status='active') then raise exception 'access_denied';end if;
 select * into t from public.legal_documents where kind='terms' and current and version=p_terms;select * into p from public.legal_documents where kind='privacy' and current and version=p_privacy;
 if t.version is null or p.version is null then raise exception 'legal_version_changed';end if;
 insert into private.legal_acceptances(organization_id,user_id,terms_version,privacy_version,terms_acceptance,privacy_acceptance) values(s.organization_id,auth.uid(),t.version,p.version,t.acceptance_version,p.acceptance_version) on conflict do nothing;
 perform private.access_audit(s.organization_id,auth.uid(),'legal_accepted',s.user_id);end;$$;
create function public.access_team(p_org uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.lock_authorize('org',p_org);
 return jsonb_build_object('company_code',(select code from private.enterprise_codes where organization_id=p_org),'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'user_id',a.user_id,'name',a.display_name,'username',a.username,'role',a.role,'state',a.state,'email',a.contact_email,'phone',a.phone)) from private.enterprise_accounts a where a.organization_id=p_org),'[]'::jsonb),'legacy',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',p.display_name,'role',case when m.role='admin_empresa' then 'admin_empresa' when m.is_attendant then 'own_attendant' else 'colaborador_empresa' end)) from public.organization_members m join public.profiles p on p.id=m.user_id where m.organization_id=p_org and not exists(select 1 from private.enterprise_accounts a where a.organization_id=p_org and a.user_id=m.user_id)),'[]'::jsonb),'acceptances',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('responsible_name',p.display_name)) from private.legal_acceptances l join public.profiles p on p.id=l.user_id where l.organization_id=p_org),'[]'::jsonb));end;$$;
create function public.access_manage(p_id uuid,p_action text,p_username text default null,p_email text default null,p_role text default null) returns void language plpgsql security definer set search_path='' as $$
declare a private.enterprise_accounts;begin
 perform pg_advisory_xact_lock(734921501);select * into a from private.enterprise_accounts where id=p_id for update;perform private.lock_authorize('org',a.organization_id);
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
create function public.access_reset(p_id uuid,p_actor uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.enterprise_accounts;begin
 perform pg_advisory_xact_lock(734921501);select * into a from private.enterprise_accounts where id=p_id for update;
 if a.id is null or (a.state in ('disabled','reserved') or (a.state='changing' and a.proof_expires>clock_timestamp()-interval '10 minutes')) or a.user_id=p_actor or not private.inviter_eligible(a.organization_id,p_actor) or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'access_denied';end if;
 if (select count(*) from public.organization_members where user_id=a.user_id)>1 and not exists(select 1 from public.platform_roles where user_id=p_actor and role='super_admin' and active) then raise exception 'shared_identity_requires_superadmin';end if;
 -- Company administrators may reset peers except the first administrator, reserved to platform Super Admin.
 if a.id=(select id from private.enterprise_accounts where organization_id=a.organization_id and role='admin_empresa' order by created_at,id limit 1) and not exists(select 1 from public.platform_roles where user_id=p_actor and role='super_admin' and active) then raise exception 'access_denied';end if;
 update private.enterprise_accounts set state='pending',generation=generation+1,code_hash=p_hash,code_expires=clock_timestamp()+make_interval(hours=>(select code_hours from private.access_policy)),attempts=0,proof_hash=null,proof_expires=null,operation_id=null where id=p_id;
 update private.enterprise_sessions set revoked=true where user_id=a.user_id;
 perform private.access_audit(a.organization_id,p_actor,'access_reset',a.id);
 return jsonb_build_object('company_code',(select code from private.enterprise_codes where organization_id=a.organization_id),'company_name',(select name from public.organizations where id=a.organization_id),'username',a.username,'expires_at',(select code_expires from private.enterprise_accounts where id=p_id));end;$$;

-- Helpers may evaluate another attendant for assignment; scope only the current actor, not candidate eligibility.
alter function private.central_eligible(uuid,uuid) rename to access_base_central;
create function private.central_eligible(p_org uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.access_base_central(p_org,p_user) and (p_user is distinct from auth.uid() or (private.is_active_user() and private.access_scope(p_org)));$$;
alter function private.own_attendant(uuid,uuid) rename to access_base_own;
create function private.own_attendant(p_org uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.access_base_own(p_org,p_user) and (p_user is distinct from auth.uid() or (private.is_active_user() and private.access_scope(p_org)));$$;
revoke all on function private.central_eligible(uuid,uuid),private.own_attendant(uuid,uuid),private.access_base_central(uuid,uuid),private.access_base_own(uuid,uuid) from public,anon,authenticated,service_role;


-- Retire active email invitation commands, retain history and authorized revocation.
revoke execute on function public.foundation_invite(uuid,text,text,text,uuid),public.foundation_provision_organization(text,text,text,text,uuid),public.foundation_accept_invitation(uuid) from authenticated;
revoke execute on function public.foundation_claim_invitation_delivery(uuid,uuid),public.foundation_finish_invitation_delivery(uuid,uuid,boolean) from service_role;

create or replace function private.company_can_read(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_user() and private.access_scope(p_org) and exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.organization_id=p_org and m.user_id=auth.uid() and m.status='active' and o.status='active' and not m.is_attendant);$$;
create function public.access_policy_set(p_idle int,p_warning int,p_hours int,p_attempts int) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.lock_authorize('global');update private.access_policy set idle_seconds=p_idle,warning_seconds=p_warning,code_hours=p_hours,max_attempts=p_attempts;
 perform private.access_audit(null,auth.uid(),'access_policy_changed',auth.uid());end;$$;

-- Explicit grants, no private table access, no authenticated grants on server operations.
do $$declare f record;begin
 for f in select p.oid,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname like 'access_%') or (n.nspname='private' and (p.proname like 'access_%' or p.proname in ('legal_ready','enterprise_code_new','is_active_user','can_access_org','is_org_admin'))) loop
 execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',f.nspname,f.proname,f.args);
 if f.nspname='public' then execute format('grant execute on function public.%I(%s) to %s',f.proname,f.args,case when f.proname in ('access_reserve','access_team','access_manage','access_session','access_legal_accept','access_policy_set') then 'authenticated' else 'service_role' end);end if;end loop;end;$$;
grant execute on function private.is_active_user(),private.can_access_org(uuid),private.is_org_admin(uuid) to authenticated;
insert into public.legal_documents(kind,version,acceptance_version,title,body,is_draft,current) values
('terms','draft-2026-09-19','draft-1','Termos de Uso',$legal$MINUTA — homologação técnica. Revisão jurídica e dados do fornecedor pendentes; não é contrato comercial final.

1. Identificação e objeto. VIRELOQ reúne presença digital e operação administrativa de prestadores de serviços. Razão social, CNPJ, endereço e canal contratual: [A PREENCHER PELO PROPRIETÁRIO].
2. Contas empresariais. O responsável recebe acesso provisionado, define senha pessoal e administra os acessos autorizados da equipe. A identidade técnica não comprova propriedade do e-mail de contato. Não compartilhe senhas nem códigos de ativação.
3. Uso permitido e proibido. Usar para os serviços e fluxos disponíveis; não tentar acessar outras empresas, contornar segurança ou inserir conteúdo ilícito. A plataforma não é prontuário nem sistema clínico.
4. Trial, planos e cobrança. O trial depende da elegibilidade e das condições apresentadas na assinatura; criar usuário ou redefinir acesso não renova o benefício. Na versão de demonstração, cobranças são fictícias. Condições comerciais, valores, renovação, inadimplência e cancelamento: [REVISAR ANTES DO LANÇAMENTO]. Não há gateway real concluído nesta entrega.
5. Suspensão e encerramento. Restrições de acesso seguem estado da empresa, usuário e assinatura. Expiração de trial não apaga automaticamente os dados. Procedimentos de cancelamento, exportação, retenção e encerramento definitivo: [DEFINIR E REVISAR].
6. Disponibilidade e manutenção. Não se declara disponibilidade garantida ou SLA contratual inexistente. Suporte, manutenção programada e compromissos comerciais: [DEFINIR].
7. Conteúdo e responsabilidades. A empresa responde pelas informações e permissões que cadastra, inclusive orientações de atendimento. O manual delimita a atuação da equipe. Direitos sobre conteúdos da empresa e licença de uso do software devem ser descritos nos instrumentos finais, preservando direitos dos respectivos titulares.
8. Responsabilidade. Limitações, responsabilidades e remédios jurídicos dependem de revisão conforme a relação contratual e legislação aplicável. Nenhuma exoneração genérica é estabelecida por esta minuta.
9. Alterações. Cada documento possui versão. Mudanças materiais podem exigir novo aceite; correções editoriais podem manter a versão de aceite.
10. Contato, legislação e foro. [CONTATO A DEFINIR]. Qualificação jurídica, legislação aplicável e eventual foro devem ser revisados por profissional habilitado, sem dados fictícios no instrumento final.

O registro nesta homologação demonstra o fluxo de aceite de uma minuta; não equivale à aprovação jurídica do contrato final.$legal$,true,true),
('privacy','draft-2026-09-19','draft-1','Política de Privacidade',$legal$MINUTA — homologação técnica. Revisar à luz da LGPD e das condições efetivas antes do lançamento.

1. Identificação e papéis. Responsável pela VIRELOQ, contato e eventual encarregado: [A DEFINIR]. Os papéis da VIRELOQ, das empresas clientes e dos provedores no tratamento dependem da finalidade e do contrato; não se presume qualificação jurídica definitiva nesta minuta.
2. Dados envolvidos. Nome e username de administradores/equipe; e-mail de contato obrigatório de administradores, opcional para demais usuários; telefone opcional; dados necessários de clientes, solicitações, orçamento, agenda e atendimento inseridos nos fluxos existentes; registros de autorização, auditoria, versões e aceite. Não é sistema clínico e não deve receber prontuários ou diagnósticos.
3. Autenticação. Senhas são processadas pelo provedor de autenticação. Códigos temporários são armazenados somente em hash e possuem limite de uso, prazo e tentativas. E-mail cadastrado não significa endereço verificado.
4. Finalidades. Operação solicitada, autenticação, autorização, segurança, organização de serviços e atendimento, e comprovação de ações. Bases legais, responsabilidades e avisos específicos: [VALIDAR POR FINALIDADE]. Consentimento operacional não autoriza marketing automaticamente.
5. Provedores e compartilhamento. A implementação prepara uso de Supabase Auth, banco e Storage; a instalação concreta, hospedagem, regiões e demais provedores serão definidos pelo proprietário. Não há contratação ou integração financeira real realizada nesta entrega.
6. Armazenamento local. A aplicação usa armazenamento do navegador para sessão Auth, identificação não secreta de empresa lembrada e coordenação de atividade entre abas. Rascunhos autenticados ficam em memória e são descartados ao encerrar ou trocar identidade. Não há captura de teclas digitadas nem vigilância de funcionários; eventos de interação apenas renovam a referência de inatividade.
7. Segurança. Autorizações, isolamento entre empresas, armazenamento privado e registros de auditoria compõem as medidas implementadas. Nenhuma certificação ou garantia absoluta é afirmada.
8. Retenção e exclusão. Prazos e procedimentos: [DEFINIR POR CATEGORIA]. Histórico de trial e auditoria não é apagado automaticamente por cancelamento. Pedidos de exclusão exigem avaliação das obrigações aplicáveis e de outros titulares.
9. Direitos e contato. Canal de solicitações: [A DEFINIR]. O responsável deverá estabelecer verificação de identidade, avaliação e atendimento de pedidos sobre dados conforme a legislação aplicável. Esta versão não declara um portal automático de direitos inexistente.
10. Atualizações. Versões ficam registradas. Alterações materiais poderão exigir nova ciência/aceite institucional, conforme regra configurada.

A minuta exige revisão antes de uso comercial. Não inserir dados reais para testar este fluxo.$legal$,true,true);

create function public.access_before_user_created(event jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if coalesce((event->'user'->>'is_anonymous')::boolean,false) then return '{}'::jsonb;end if;
 if event->'user'->'app_metadata'->>'vireloq_provisioned'='true' and exists(select 1 from private.enterprise_accounts where user_id::text=event->'user'->>'id' and state='reserved') then return '{}'::jsonb;end if;
 return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Acesso empresarial requer provisionamento.'));end;$$;
revoke all on function public.access_before_user_created(jsonb) from public,anon,authenticated,service_role;
do $$begin if exists(select 1 from pg_roles where rolname='supabase_auth_admin') then grant usage on schema public to supabase_auth_admin;grant execute on function public.access_before_user_created(jsonb) to supabase_auth_admin;end if;end;$$;


create function private.legal_immutable() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'legal_history_immutable';end if;
 if (to_jsonb(new)-'current') is distinct from (to_jsonb(old)-'current') then raise exception 'legal_version_immutable';end if;return new;end;$$;
create trigger legal_immutable before update or delete on public.legal_documents for each row execute function private.legal_immutable();
revoke all on function private.legal_immutable() from public,anon,authenticated,service_role;


-- Preserve the verified session when historical media helpers install their user context.
-- Without this, managed accounts would correctly fail closed but could not access portfolio media.
do $$declare f record;d text;begin
 for f in select oid from pg_proc where oid in ('public.consumer_gateway_company_media(text,uuid,boolean)'::regprocedure,'public.consumer_gateway_attachment(text,uuid,boolean)'::regprocedure) loop
 d=pg_get_functiondef(f.oid);
 execute replace(d, 'jsonb_build_object(''sub'',p_user)::text', 'jsonb_build_object(''sub'',p_user,''session_id'',case when auth.uid()=p_user then auth.jwt()->>''session_id'' else null end)::text');
 end loop;end;$$;
create function public.access_media(p_user uuid,p_session uuid,p_operation text,p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'session_id',p_session)::text,true);
 if exists(select 1 from private.access_enforced_users where user_id=p_user) and not private.is_active_user() then raise exception 'access_denied' using errcode='42501';end if;
 case p_operation
 when 'consumer_gateway_company_media' then return public.consumer_gateway_company_media(p_args->>'p_code',p_user,(p_args->>'p_write')::boolean);
 when 'consumer_gateway_attachment' then return public.consumer_gateway_attachment(p_args->>'p_code',p_user,(p_args->>'p_write')::boolean);
 when 'consumer_gateway_download' then return public.consumer_gateway_download(p_args->>'p_code',p_user,p_args->>'p_ticket');
 when 'consumer_finalize_company_media' then perform public.consumer_finalize_company_media(p_args->>'p_code',p_user,p_args->>'p_sha256',(p_args->>'p_size')::int,(p_args->>'p_width')::int,(p_args->>'p_height')::int);return 'null'::jsonb;
 when 'consumer_finalize_attachment' then perform public.consumer_finalize_attachment(p_args->>'p_code',p_user,p_args->>'p_sha256',(p_args->>'p_size')::int,(p_args->>'p_width')::int,(p_args->>'p_height')::int);return 'null'::jsonb;
 else raise exception 'access_denied' using errcode='42501';end case;end;$$;
revoke all on function public.access_media(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.access_media(uuid,uuid,text,jsonb) to service_role;

-- Resume an interrupted provision without creating another Auth identity or membership.
create function public.access_resume(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare a private.enterprise_accounts;begin
 perform pg_advisory_xact_lock(734921501);select * into a from private.enterprise_accounts where id=p_id for update;
 if a.id is null or a.state<>'reserved' then raise exception 'access_change_unavailable';end if;
 perform private.lock_authorize('org',a.organization_id);
 if (select count(*) from public.organization_members where user_id=a.user_id)>1 and not exists(select 1 from public.platform_roles where user_id=auth.uid() and role='super_admin' and active) then raise exception 'shared_identity_requires_superadmin';end if;
 update private.enterprise_accounts set requested_by=auth.uid(),request_key=gen_random_uuid() where id=p_id;
 perform private.access_audit(a.organization_id,auth.uid(),'access_provision_resumed',a.id);
 return jsonb_build_object('id',a.id,'user_id',a.user_id,'organization_id',a.organization_id,'state',a.state);end;$$;
revoke all on function public.access_resume(uuid) from public,anon,service_role;
grant execute on function public.access_resume(uuid) to authenticated;
commit;

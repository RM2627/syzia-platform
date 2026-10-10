-- SYZIA 042: incremental upgrade over 041. No reset.
begin;

-- Additive configuration; defaults preserve every existing service and appointment.
alter table public.services add column execution_mode text not null default 'continuous' check(execution_mode in('continuous','split')),
 add column execution_max_periods integer check(execution_max_periods between 2 and 30),
 add column price_max_cents integer check(price_max_cents is null or(price_mode='from'and price_max_cents>=price_cents));
alter table public.quote_versions add column execution_mode text check(execution_mode in('continuous','split')),
 add column execution_max_periods integer check(execution_max_periods between 2 and 30);
alter table public.appointments add column execution_group uuid,add column part_number integer not null default 1 check(part_number between 1 and 30),
 add column service_minutes integer check(service_minutes between 1 and 10080),
 add constraint appointment_period_metadata check((execution_group is null and part_number=1)or(kind='booking'and service_minutes is not null));
-- Existing single-period rows remain unique at part 1. Only guarded commands create groups.
drop index public.one_active_booking_per_request;
create unique index one_active_booking_per_request_part on public.appointments(request_id,part_number)where kind='booking'and state='confirmed';
create index appointment_execution_group on public.appointments(organization_id,execution_group)where execution_group is not null;

alter table public.quote_requests add column desired_periods jsonb check(desired_periods is null or jsonb_typeof(desired_periods)='array');
-- "negotiate" now means explaining published conditions, with no price mutation.
-- The price lock still forbids every discount and nonzero discount cap.
do $$declare c record;begin for c in select conname from pg_constraint where conrelid='public.attendant_permissions'::regclass and pg_get_constraintdef(oid)like '%never_change_price%'loop execute format('alter table public.attendant_permissions drop constraint %I',c.conname);end loop;end;$$;
alter table public.attendant_permissions add constraint attendant_fixed_price_autonomy check(not never_change_price or(max_discount_percent=0 and not('discount'=any(allowed_actions))));

create function private.syzia_identity(p_user uuid)returns boolean language sql stable security definer set search_path=''as $$
 select exists(select 1 from private.enterprise_accounts where user_id=p_user and organization_id is null and role='syzia_staff')or exists(select 1 from public.platform_roles where user_id=p_user and role='atendente');$$;
create function private.syzia_identity_guard(p_user uuid,p_actor uuid)returns void language plpgsql stable security definer set search_path=''as $$begin
 if private.syzia_identity(p_user)and not private.people_root(p_actor)then raise exception 'shared_identity_requires_superadmin'using errcode='42501';end if;end;$$;
create or replace function public.access_team(p_org uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare d integer;r jsonb;begin d=private.permission_enter(p_org,'people.read');r=private.v029_access_team(p_org);
 r=r||jsonb_build_object('accounts',coalesce((select jsonb_agg(x||jsonb_build_object('can_attend',private.central_eligible(p_org,(x->>'user_id')::uuid),'can_reply',private.permission_actor(p_org,(x->>'user_id')::uuid,'central.reply'),'scope','organization'))from jsonb_array_elements(r->'accounts')x where not private.syzia_identity((x->>'user_id')::uuid)),'[]'),
 'legacy',coalesce((select jsonb_agg(x||jsonb_build_object('can_attend',private.central_eligible(p_org,(x->>'user_id')::uuid),'can_reply',private.permission_actor(p_org,(x->>'user_id')::uuid,'central.reply'),'scope','organization'))from jsonb_array_elements(r->'legacy')x where not private.syzia_identity((x->>'user_id')::uuid)),'[]'),
 'shared',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.id,'name',p.display_name,'identity_kind','syzia_staff','status',coalesce(a.status::text,'unassigned'),'kind',a.kind,'can_attend',private.central_eligible(p_org,p.id),'can_reply',private.permission_actor(p_org,p.id,'central.reply'),'scope','organization')order by p.display_name)from public.profiles p left join public.attendant_organizations a on a.user_id=p.id and a.organization_id=p_org where private.syzia_identity(p.id)and(a.user_id is not null or exists(select 1 from public.organization_members m where m.user_id=p.id and m.organization_id=p_org))),'[]'));
 perform private.permission_leave(d);return r;end;$$;
create or replace function public.company_attendant_permission(p_org uuid,p_action text,p_discount integer default 0)returns boolean language plpgsql stable security definer set search_path=''as $$
declare r text;grant_ text;live public.attendant_permissions;snapshot jsonb;cap integer;begin
 r=private.permission_role(p_org,auth.uid());if r is null or p_discount is null or p_discount not between 0 and 100 then return false;end if;
 grant_=case when p_action in('price_list','price_range')then 'quotes.values'when p_action in('quote_create','quote_send','quote_items','discount')then 'quotes.manage'when p_action in('schedule','reschedule','cancel','fit_in')then 'agenda.manage'when p_action in('follow_up','aftercare')then 'followup.manage'when p_action in('whatsapp','negotiate')then 'central.reply'else null end;
 if grant_ is null or not private.permission_allowed(p_org,grant_)then return false;end if;
 if p_action in('quote_create','quote_send','quote_items','discount')and not private.permission_allowed(p_org,'quotes.values')then return false;end if;
 if r in('admin_empresa','super_admin')then return p_action in('price_range','price_list','quote_create','quote_send','quote_items','discount','schedule','reschedule','cancel','fit_in','follow_up','whatsapp','aftercare','negotiate');end if;
 if not private.central_eligible(p_org,auth.uid())then return false;end if;
 select *into live from public.attendant_permissions where organization_id=p_org;
 select v.snapshot into snapshot from public.company_settings cs join public.manual_versions v on v.id=cs.published_manual_id where cs.organization_id=p_org;
 if not coalesce(live.reviewed and p_action=any(live.allowed_actions)and(snapshot->'permissions'->'allowed_actions')?p_action,false)then return false;end if;
 if p_action='price_range'and not exists(select 1 from jsonb_array_elements(snapshot->'services')s where s->>'price_mode'='from'and s->>'price_max_cents'is not null and(s->>'price_max_cents')::integer>=(s->>'price_cents')::integer)then return false;end if;
 -- negotiate is information about published conditions only, never a price-edit capability.
 if p_action='discount'then cap=least(live.max_discount_percent,coalesce((snapshot->'permissions'->>'max_discount_percent')::integer,0));return not live.never_change_price and not coalesce((snapshot->'permissions'->>'never_change_price')::boolean,true)and p_discount<=cap;end if;
 return p_discount=0;
end;$$;

CREATE OR REPLACE FUNCTION private.permission_role(p_org uuid, p_user uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r text;begin
 if not exists(select 1 from public.organizations o join public.profiles p on p.id=p_user join auth.users u on u.id=p.id where o.id=p_org and o.status='active' and p.status='active' and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now())) then return null;end if;
 if exists(select 1 from public.platform_roles where user_id=p_user and role='super_admin' and active) then return case when private.support_actor_allowed(p_org,p_user) then 'super_admin' end;end if;
 if not private.verification_ready(p_org) then return null;end if;
 if private.syzia_identity(p_user)then return case when private.entitlement(p_org,'human_support')and exists(select 1 from public.attendant_organizations a join public.platform_roles p on p.user_id=a.user_id and p.role='atendente'and p.active where a.organization_id=p_org and a.user_id=p_user and a.status='active')then 'shared_attendant'end;end if;
 select case when role='admin_empresa' then 'admin_empresa' when is_attendant then 'own_attendant' else 'colaborador_empresa' end into r from public.organization_members where organization_id=p_org and user_id=p_user and status='active';
 if r is not null then return r;end if;
 if private.entitlement(p_org,'human_support') and exists(select 1 from public.attendant_organizations a join public.platform_roles p on p.user_id=a.user_id and p.role='atendente' and p.active where a.organization_id=p_org and a.user_id=p_user and a.status='active') then return 'shared_attendant';end if;
 return null;
end;$function$;

CREATE OR REPLACE FUNCTION public.access_team_026(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$begin
 perform private.lock_authorize('org',p_org);
 return jsonb_build_object('company_code',(select code from private.enterprise_codes where organization_id=p_org),'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'user_id',a.user_id,'name',a.display_name,'username',a.username,'role',a.role,'state',a.state,'email',a.contact_email,'phone',a.phone)) from private.enterprise_accounts a where a.organization_id=p_org and not private.syzia_identity(a.user_id)),'[]'::jsonb),'legacy',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',p.display_name,'role',case when m.role='admin_empresa' then 'admin_empresa' when m.is_attendant then 'own_attendant' else 'colaborador_empresa' end)) from public.organization_members m join public.profiles p on p.id=m.user_id where m.organization_id=p_org and not private.syzia_identity(m.user_id) and not exists(select 1 from private.enterprise_accounts a where a.organization_id=p_org and a.user_id=m.user_id)),'[]'::jsonb),'acceptances',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('responsible_name',p.display_name)) from private.legal_acceptances l join public.profiles p on p.id=l.user_id where l.organization_id=p_org),'[]'::jsonb));end;$function$;

CREATE OR REPLACE FUNCTION public.access_reset(p_id uuid, p_actor uuid, p_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a private.enterprise_accounts;begin
 perform pg_advisory_xact_lock(734921501);select * into a from private.enterprise_accounts where id=p_id for update;perform private.syzia_identity_guard(a.user_id,p_actor);
 if a.id is null or (a.state in ('disabled','reserved') or (a.state='changing' and a.proof_expires>clock_timestamp()-interval '10 minutes')) or a.user_id=p_actor or not ((a.organization_id is null and private.people_root(p_actor))or private.inviter_eligible(a.organization_id,p_actor)) or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'access_denied';end if;
 if (select count(*) from public.organization_members where user_id=a.user_id)>1 and not exists(select 1 from public.platform_roles where user_id=p_actor and role='super_admin' and active) then raise exception 'shared_identity_requires_superadmin';end if;
 -- Company administrators may reset peers except the first administrator, reserved to platform Super Admin.
 if a.id=(select id from private.enterprise_accounts where organization_id=a.organization_id and role='admin_empresa' order by created_at,id limit 1) and not exists(select 1 from public.platform_roles where user_id=p_actor and role='super_admin' and active) then raise exception 'access_denied';end if;
 update private.enterprise_accounts set state='pending',generation=generation+1,code_hash=p_hash,code_expires=clock_timestamp()+make_interval(hours=>(select code_hours from private.access_policy)),attempts=0,proof_hash=null,proof_expires=null,operation_id=null where id=p_id;
 update private.enterprise_sessions set revoked=true where user_id=a.user_id;
 perform private.access_audit(a.organization_id,p_actor,'access_reset',a.id);
 return jsonb_build_object('company_code',coalesce((select code from private.enterprise_codes where organization_id=a.organization_id),'SYZIA'),'company_name',(select name from public.organizations where id=a.organization_id),'username',a.username,'expires_at',(select code_expires from private.enterprise_accounts where id=p_id));end;$function$;

CREATE OR REPLACE FUNCTION public.access_finish_provision(p_id uuid, p_actor uuid, p_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a private.enterprise_accounts;begin
 perform pg_advisory_xact_lock(734921501);select * into a from private.enterprise_accounts where id=p_id for update;perform private.syzia_identity_guard(a.user_id,p_actor);
 if a.id is null or a.state<>'reserved' or a.requested_by<>p_actor or not ((a.organization_id is null and private.people_root(p_actor))or private.inviter_eligible(a.organization_id,p_actor)) or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'access_denied';end if;
 if (select count(*) from public.organization_members where user_id=a.user_id)>1 and not exists(select 1 from public.platform_roles where user_id=p_actor and role='super_admin' and active) then raise exception 'shared_identity_requires_superadmin';end if;
 perform private.require_eligible_user(a.user_id);
 insert into private.access_enforced_users values(a.user_id) on conflict do nothing;
 update private.enterprise_accounts set state='pending',code_hash=p_hash,code_expires=clock_timestamp()+make_interval(hours=>(select code_hours from private.access_policy)) where id=p_id;
 if a.organization_id is not null then insert into public.organization_members(organization_id,user_id,role,is_attendant) values(a.organization_id,a.user_id,case when a.role='admin_empresa' then 'admin_empresa'::public.member_role else 'colaborador_empresa'::public.member_role end,a.role='own_attendant') on conflict(organization_id,user_id) do nothing;end if;
 update public.profiles set display_name=a.display_name where id=a.user_id;
 perform private.access_audit(a.organization_id,p_actor,'access_provisioned',a.id);
 return jsonb_build_object('company_code',coalesce((select code from private.enterprise_codes where organization_id=a.organization_id),'SYZIA'),'company_name',(select name from public.organizations where id=a.organization_id),'username',a.username,'expires_at',(select code_expires from private.enterprise_accounts where id=p_id));end;$function$;

CREATE OR REPLACE FUNCTION public.access_delivery_prepare(p_id uuid, p_actor uuid, p_hash text, p_rotate boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a private.enterprise_accounts;d private.access_deliveries;result jsonb;attempt uuid=gen_random_uuid();begin
 perform pg_advisory_xact_lock(734921501);select * into a from private.enterprise_accounts where id=p_id for update;perform private.syzia_identity_guard(a.user_id,p_actor);
 if a.id is null or a.role<>'admin_empresa' or a.state<>'pending' or not private.inviter_eligible(a.organization_id,p_actor) then raise exception 'access_denied';end if;
 select * into d from private.access_deliveries where account_id=p_id;
 if d.attempted_at>clock_timestamp()-interval '60 seconds' then raise exception 'delivery_cooldown';end if;
 if d.window_at>clock_timestamp()-interval '1 hour' and d.window_attempts>=5 then raise exception 'delivery_rate_limited';end if;
 if p_rotate then
 result=public.access_reset(p_id,p_actor,p_hash);
 else
 if a.code_hash is distinct from p_hash or a.code_expires<=clock_timestamp() then raise exception 'activation_invalid';end if;
 result=jsonb_build_object('company_code',(select code from private.enterprise_codes where organization_id=a.organization_id),
 'company_name',(select name from public.organizations where id=a.organization_id),'username',a.username,'expires_at',a.code_expires);
 end if;
 insert into private.access_deliveries(account_id,attempt_id,state) values(p_id,attempt,'sending')
 on conflict(account_id) do update set attempt_id=attempt,state='sending',code=null,attempted_at=clock_timestamp(),
 window_attempts=case when access_deliveries.window_at<=clock_timestamp()-interval '1 hour' then 1 else access_deliveries.window_attempts+1 end,
 window_at=case when access_deliveries.window_at<=clock_timestamp()-interval '1 hour' then clock_timestamp() else access_deliveries.window_at end;
 perform private.access_audit(a.organization_id,p_actor,'access_delivery_attempt',a.id);
 return result||jsonb_build_object('attempt_id',attempt,'email',a.contact_email,'administrator_name',a.display_name,'organization_id',a.organization_id);
 end;$function$;

CREATE OR REPLACE FUNCTION public.access_manage(p_id uuid, p_action text, p_username text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_role text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a private.enterprise_accounts;begin
 perform pg_advisory_xact_lock(734921501);select * into a from private.enterprise_accounts where id=p_id for update;perform private.syzia_identity_guard(a.user_id,auth.uid());if exists(select 1 from private.enterprise_accounts where user_id=a.user_id and organization_id is null and role='syzia_staff')then raise exception 'shared_identity_requires_superadmin'using errcode='42501';end if;perform private.lock_authorize('org',a.organization_id);
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
 perform private.access_audit(a.organization_id,auth.uid(),'access_'||p_action,a.id);end;$function$;

CREATE OR REPLACE FUNCTION public.access_resume(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare a private.enterprise_accounts;begin
 perform pg_advisory_xact_lock(734921501);select * into a from private.enterprise_accounts where id=p_id for update;perform private.syzia_identity_guard(a.user_id,auth.uid());
 if a.id is null or a.state<>'reserved' then raise exception 'access_change_unavailable';end if;
 perform private.lock_authorize(case when a.organization_id is null then 'global'else 'org'end,a.organization_id);
 if a.organization_id is not null and not private.company_can_manage(a.organization_id) then raise exception 'access_denied' using errcode='42501';end if;
 if (select count(*) from public.organization_members where user_id=a.user_id)>1 and not exists(select 1 from public.platform_roles where user_id=auth.uid() and role='super_admin' and active) then raise exception 'shared_identity_requires_superadmin';end if;
 update private.enterprise_accounts set requested_by=auth.uid(),request_key=gen_random_uuid() where id=p_id;
 perform private.access_audit(a.organization_id,auth.uid(),'access_provision_resumed',a.id);
 return jsonb_build_object('id',a.id,'user_id',a.user_id,'organization_id',a.organization_id,'state',a.state);end;$function$;

CREATE OR REPLACE FUNCTION public.access_reserve(p_org uuid, p_name text, p_slug text, p_display text, p_username text, p_email text, p_phone text, p_role text, p_key uuid, p_existing uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$begin if private.syzia_identity(p_existing)then raise exception 'platform_staff_requires_assignment'using errcode='42501';end if;
 if p_org is null then perform private.lock_authorize('global');elsif not private.company_can_manage(p_org)then raise exception 'access_denied'using errcode='42501';end if;
 if p_existing is null and not exists(select 1 from private.enterprise_accounts where requested_by=auth.uid()and request_key=p_key)and public.access_identity_exists(p_email)then raise exception 'identity_exists_select_person';end if;
 return private.access_reserve_032(p_org,p_name,p_slug,p_display,p_username,p_email,p_phone,p_role,p_key,p_existing);end;$function$;

CREATE OR REPLACE FUNCTION public.foundation_set_member(p_org uuid, p_user uuid, p_role member_role, p_status record_status)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare org_ uuid;depth_ int; begin perform private.syzia_identity_guard(p_user,auth.uid());org_=p_org;depth_=private.permission_enter(org_,'people.manage');perform private.v029_foundation_set_member(p_org,p_user,p_role,p_status);perform private.permission_leave(depth_);return;end;$function$;

CREATE OR REPLACE FUNCTION public.operations_set_attendant(p_org uuid, p_user uuid, p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare org_ uuid;depth_ int; begin perform private.syzia_identity_guard(p_user,auth.uid());org_=p_org;depth_=private.permission_enter(org_,'people.manage');perform private.v029_operations_set_attendant(p_org,p_user,p_enabled);perform private.permission_leave(depth_);return;end;$function$;

CREATE OR REPLACE FUNCTION public.permissions_team(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$begin
 perform private.permission_require(p_org,'people.manage');
 return jsonb_build_object('catalog',(select jsonb_agg(to_jsonb(c) order by module,action) from private.permission_catalog c),
 'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.id,'name',p.display_name,'role',x.role,'can_attend',private.central_eligible(p_org,p.id),'can_reply',private.permission_actor(p_org,p.id,'central.reply'),'revision',coalesce((select revision from private.permission_revisions where organization_id=p_org and user_id=p.id),0),'grants',coalesce((select jsonb_agg(jsonb_build_object('action',action,'scope',scope,'granted',granted) order by action) from private.organization_permissions where organization_id=p_org and user_id=p.id),'[]'::jsonb))) from (
 select user_id,case when role='admin_empresa' then 'admin_empresa' when is_attendant then 'own_attendant' else 'colaborador_empresa' end role from public.organization_members where organization_id=p_org and status='active'and not private.syzia_identity(user_id)
 union all select user_id,'shared_attendant' from public.attendant_organizations where organization_id=p_org and status='active')x join public.profiles p on p.id=x.user_id),'[]'::jsonb));end;$function$;

CREATE OR REPLACE FUNCTION private.v030_company_save(p_org uuid, p_entity text, p_id uuid, p_expected_revision integer, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target uuid; old_row jsonb; candidate jsonb;
begin
 if p_expected_revision is null then raise exception 'company_revision_required' using errcode='22023'; end if;
 if p_entity='service'then perform private.presence_lock(p_org,'services.manage',p_expected_revision);else perform private.company_lock(p_org,p_expected_revision);end if;
 target=coalesce(p_id,gen_random_uuid());
 if p_entity='settings' then
  perform private.company_keys(p_data,array['legal_name','description','public_phone','public_email','public_address','service_regions','payment_methods','business_hours','human_hours','exception_contact_name','exception_contact']);
  if p_id is not null then raise exception 'invalid_company_fields' using errcode='22023'; end if;
  select to_jsonb(t) into old_row from public.company_settings t where organization_id=p_org;
  candidate=coalesce(old_row,'{}'::jsonb)||p_data;
   update public.company_settings t set legal_name=r.legal_name,description=r.description,public_phone=r.public_phone,public_email=r.public_email,public_address=r.public_address,service_regions=r.service_regions,payment_methods=r.payment_methods,business_hours=r.business_hours,human_hours=r.human_hours,exception_contact_name=r.exception_contact_name,exception_contact=r.exception_contact from jsonb_populate_record(null::public.company_settings,candidate) r where t.organization_id=p_org;
 elsif p_entity='rules' then
  perform private.company_keys(p_data,array['pricing_policy','payment_policy','cancellation_policy','rescheduling_policy','service_policy','deadlines_policy','exception_policy']);
  if p_id is not null then raise exception 'invalid_company_fields' using errcode='22023'; end if;
  select to_jsonb(t) into old_row from public.business_rules t where organization_id=p_org;
  candidate=coalesce(old_row,'{}'::jsonb)||p_data;
   update public.business_rules t set pricing_policy=r.pricing_policy,payment_policy=r.payment_policy,cancellation_policy=r.cancellation_policy,rescheduling_policy=r.rescheduling_policy,service_policy=r.service_policy,deadlines_policy=r.deadlines_policy,exception_policy=r.exception_policy from jsonb_populate_record(null::public.business_rules,candidate) r where t.organization_id=p_org;
 elsif p_entity='permissions' then
  perform private.company_keys(p_data,array['allowed_actions','never_change_price','max_discount_percent','reviewed']);
  if p_id is not null then raise exception 'invalid_company_fields' using errcode='22023'; end if;
  select to_jsonb(t) into old_row from public.attendant_permissions t where organization_id=p_org;
  candidate=coalesce(old_row,'{}'::jsonb)||p_data;
   update public.attendant_permissions t set allowed_actions=r.allowed_actions,never_change_price=r.never_change_price,max_discount_percent=r.max_discount_percent,reviewed=r.reviewed from jsonb_populate_record(null::public.attendant_permissions,candidate) r where t.organization_id=p_org;
 elsif p_entity='service' then
  perform private.company_keys(p_data,array['name','category','category_id','description','image_url','price_mode','price_cents','duration_minutes','availability','notes','active','quotes_allowed','direct_booking','contract_mode','photo_policy','photo_instructions','execution_mode','execution_max_periods','price_max_cents']);
  select to_jsonb(t) into old_row from public.services t where id=p_id and organization_id=p_org;
  if p_id is not null and old_row is null then raise exception 'company_target_not_found' using errcode='22023'; end if;
  candidate=coalesce(old_row,'{"category": "", "description": "", "image_url": "", "price_mode": "quote", "price_cents": null, "duration_minutes": null, "availability": "", "notes": "", "active": true, "quotes_allowed": true, "direct_booking": false}'::jsonb)||p_data;
  if candidate->>'contract_mode'='immediate' then candidate=candidate||jsonb_build_object('direct_booking',candidate->>'price_mode'='fixed'and candidate->>'duration_minutes' is not null);elsif candidate->>'contract_mode'='evaluation'then candidate=candidate||'{"direct_booking":false,"quotes_allowed":true}';end if;
  if old_row is null then
   insert into public.services(id,organization_id,name,category,category_id,description,image_url,price_mode,price_cents,duration_minutes,availability,notes,active,quotes_allowed,direct_booking,contract_mode,photo_policy,photo_instructions,execution_mode,execution_max_periods,price_max_cents) select target,p_org,r.name,r.category,r.category_id,r.description,r.image_url,r.price_mode,r.price_cents,r.duration_minutes,r.availability,r.notes,r.active,r.quotes_allowed,r.direct_booking,r.contract_mode,coalesce(r.photo_policy,'none'),coalesce(r.photo_instructions,''),coalesce(r.execution_mode,'continuous'),r.execution_max_periods,r.price_max_cents from jsonb_populate_record(null::public.services,candidate) r;
  else
   update public.services t set name=r.name,category=r.category,category_id=r.category_id,description=r.description,image_url=r.image_url,price_mode=r.price_mode,price_cents=r.price_cents,duration_minutes=r.duration_minutes,availability=r.availability,notes=r.notes,active=r.active,quotes_allowed=r.quotes_allowed,direct_booking=r.direct_booking,contract_mode=r.contract_mode,photo_policy=coalesce(r.photo_policy,'none'),photo_instructions=coalesce(r.photo_instructions,''),execution_mode=coalesce(r.execution_mode,'continuous'),execution_max_periods=r.execution_max_periods,price_max_cents=r.price_max_cents from jsonb_populate_record(null::public.services,candidate) r where t.organization_id=p_org and t.id=p_id;
  end if;
 elsif p_entity='addon' then
  perform private.company_keys(p_data,array['service_id','name','price_mode','price_cents','duration_minutes','active']);
  select to_jsonb(t) into old_row from public.service_addons t where id=p_id and organization_id=p_org;
  if p_id is not null and old_row is null then raise exception 'company_target_not_found' using errcode='22023'; end if;
  candidate=coalesce(old_row,'{"price_mode": "quote", "price_cents": null, "duration_minutes": 0, "active": true}'::jsonb)||p_data;
  if old_row is null then
   insert into public.service_addons(id,organization_id,service_id,name,price_mode,price_cents,duration_minutes,active) select target,p_org,r.service_id,r.name,r.price_mode,r.price_cents,r.duration_minutes,r.active from jsonb_populate_record(null::public.service_addons,candidate) r;
  else
   update public.service_addons t set service_id=r.service_id,name=r.name,price_mode=r.price_mode,price_cents=r.price_cents,duration_minutes=r.duration_minutes,active=r.active from jsonb_populate_record(null::public.service_addons,candidate) r where t.organization_id=p_org and t.id=p_id;
  end if;
 elsif p_entity='field' then
  perform private.company_keys(p_data,array['service_id','label','kind','required','options','position','active','instruction','multiline','condition_field','condition_value']);
  select to_jsonb(t) into old_row from public.service_intake_fields t where id=p_id and organization_id=p_org;
  if p_id is not null and old_row is null then raise exception 'company_target_not_found' using errcode='22023'; end if;
  candidate=coalesce(old_row,'{"kind": "text", "required": true, "options": [], "position": 0, "active": true}'::jsonb)||p_data;
  if candidate->>'condition_field' is not null and not exists(select 1 from public.service_intake_fields f where f.id=(candidate->>'condition_field')::uuid and f.id<>target and f.organization_id=p_org and f.service_id=(candidate->>'service_id')::uuid and f.active and f.condition_field is null and f.kind in('boolean','choice')and case when f.kind='boolean'then jsonb_typeof(candidate->'condition_value')='boolean'else (candidate->'condition_value')in(select value from jsonb_array_elements(f.options))end)then raise exception 'invalid_question_condition'using errcode='22023';end if;
  if old_row is null then
   insert into public.service_intake_fields(id,organization_id,service_id,label,kind,required,options,position,active,instruction,multiline,condition_field,condition_value) select target,p_org,r.service_id,r.label,r.kind,r.required,r.options,r.position,r.active,coalesce(r.instruction,''),coalesce(r.multiline,false),r.condition_field,r.condition_value from jsonb_populate_record(null::public.service_intake_fields,candidate) r;
  else
   update public.service_intake_fields t set service_id=r.service_id,label=r.label,kind=r.kind,required=r.required,options=r.options,position=r.position,active=r.active,instruction=coalesce(r.instruction,''),multiline=coalesce(r.multiline,false),condition_field=r.condition_field,condition_value=r.condition_value from jsonb_populate_record(null::public.service_intake_fields,candidate) r where t.organization_id=p_org and t.id=p_id;
  end if;
 elsif p_entity='faq' then
  perform private.company_keys(p_data,array['question','answer','active','position']);
  select to_jsonb(t) into old_row from public.faqs t where id=p_id and organization_id=p_org;
  if p_id is not null and old_row is null then raise exception 'company_target_not_found' using errcode='22023'; end if;
  candidate=coalesce(old_row,'{"active": true, "position": 0}'::jsonb)||p_data;
  if old_row is null then
   insert into public.faqs(id,organization_id,question,answer,active,position) select target,p_org,r.question,r.answer,r.active,r.position from jsonb_populate_record(null::public.faqs,candidate) r;
  else
   update public.faqs t set question=r.question,answer=r.answer,active=r.active,position=r.position from jsonb_populate_record(null::public.faqs,candidate) r where t.organization_id=p_org and t.id=p_id;
  end if;
 elsif p_entity='reply' then
  perform private.company_keys(p_data,array['title','body','active']);
  select to_jsonb(t) into old_row from public.quick_replies t where id=p_id and organization_id=p_org;
  if p_id is not null and old_row is null then raise exception 'company_target_not_found' using errcode='22023'; end if;
  candidate=coalesce(old_row,'{"active": true}'::jsonb)||p_data;
  if old_row is null then
   insert into public.quick_replies(id,organization_id,title,body,active) select target,p_org,r.title,r.body,r.active from jsonb_populate_record(null::public.quick_replies,candidate) r;
  else
   update public.quick_replies t set title=r.title,body=r.body,active=r.active from jsonb_populate_record(null::public.quick_replies,candidate) r where t.organization_id=p_org and t.id=p_id;
  end if;
 elsif p_entity='section' then
  perform private.company_keys(p_data,array['content']);
  select to_jsonb(t) into old_row from public.manual_sections t where id=p_id and organization_id=p_org;
  if p_id is not null and old_row is null then raise exception 'company_target_not_found' using errcode='22023'; end if;
  if old_row is null then raise exception 'company_target_not_found' using errcode='22023'; end if;
  candidate=coalesce(old_row,'{}'::jsonb)||p_data;
  if old_row is null then
   insert into public.manual_sections(id,organization_id,content) select target,p_org,r.content from jsonb_populate_record(null::public.manual_sections,candidate) r;
  else
   update public.manual_sections t set content=r.content from jsonb_populate_record(null::public.manual_sections,candidate) r where t.organization_id=p_org and t.id=p_id;
  end if;
 else raise exception 'invalid_company_entity' using errcode='22023';
 end if;
 perform private.company_touch(p_org,p_entity<>'section');
 return case when p_entity in ('settings','rules','permissions') then p_org else target end;
end; $function$;

CREATE OR REPLACE FUNCTION private.presence_payload(p_org uuid, p_show_prices boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.organizations;snap jsonb;payload jsonb;begin
 select * into o from public.organizations where id=p_org;
 snap=jsonb_build_object('settings',(select to_jsonb(s)from public.company_settings s where organization_id=p_org),
 'services',coalesce((select jsonb_agg(to_jsonb(s)order by name,id)from public.services s where organization_id=p_org and active),'[]'::jsonb),
 'addons',coalesce((select jsonb_agg(to_jsonb(a)order by name,id)from public.service_addons a where organization_id=p_org and active),'[]'::jsonb),
 'fields',coalesce((select jsonb_agg(to_jsonb(f)order by position,id)from public.service_intake_fields f where organization_id=p_org and active),'[]'::jsonb),
 'faqs',coalesce((select jsonb_agg(jsonb_build_object('question',question,'answer',answer)order by position,id)from public.faqs where organization_id=p_org and active),'[]'::jsonb));
 payload=jsonb_build_object('name',o.name,'slug',o.slug,'description',snap->'settings'->>'description','phone',snap->'settings'->>'public_phone','email',snap->'settings'->>'public_email','address',snap->'settings'->>'public_address','regions',snap->'settings'->>'service_regions','payments',snap->'settings'->>'payment_methods','hours',snap->'settings'->'business_hours','timezone',o.timezone,'faqs',snap->'faqs','public_information',jsonb_build_object('service',coalesce((select service_policy from public.business_rules where organization_id=p_org),''),'cancellation',coalesce((select cancellation_policy from public.business_rules where organization_id=p_org),''),'rescheduling',coalesce((select rescheduling_policy from public.business_rules where organization_id=p_org),'')),'quick_replies',coalesce((select jsonb_agg(jsonb_build_object('title',title,'body',body))from public.quick_replies where organization_id=p_org and active),'[]'),'notice_version','consumer-v1',
 'services',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('s',(s->>'id')::uuid),'name',s->>'name','category',s->>'category','description',s->>'description','image_url',s->>'image_url','image_media',(select public_code from public.company_media where organization_id=p_org and id=(s->>'image_media_id')::uuid and state='ready'),'price_mode',case when p_show_prices then s->>'price_mode' else 'quote' end,'price_cents',case when p_show_prices then s->'price_cents' else 'null'::jsonb end,'duration_minutes',s->'duration_minutes','contract_mode',coalesce(s->>'contract_mode',case when(s->>'direct_booking')::boolean then 'immediate'else 'evaluation'end),'execution_mode',coalesce(s->>'execution_mode','continuous'),'execution_max_periods',s->'execution_max_periods','price_max_cents',case when p_show_prices then s->'price_max_cents' else 'null'::jsonb end,'photo_policy',coalesce(s->>'photo_policy','none'),'photo_instructions',coalesce(s->>'photo_instructions',''),'availability',s->>'availability','quotes_allowed',s->'quotes_allowed','direct_booking',p_show_prices and (s->>'direct_booking')::boolean,
 'addons',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('a',(a->>'id')::uuid),'name',a->>'name','price_mode',case when p_show_prices then a->>'price_mode' else 'quote' end,'price_cents',case when p_show_prices then a->'price_cents' else 'null'::jsonb end,'duration_minutes',a->'duration_minutes')) from jsonb_array_elements(snap->'addons') a where a->>'service_id'=s->>'id'),'[]'::jsonb),
 'questions',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('f',(f->>'id')::uuid),'label',f->>'label','instruction',coalesce(f->>'instruction',''),'multiline',coalesce((f->>'multiline')::boolean,false),'condition_field',case when f->>'condition_field' is not null then private.consumer_code('f',(f->>'condition_field')::uuid)end,'condition_value',f->'condition_value','kind',f->>'kind','required',f->'required','options',f->'options') order by (f->>'position')::integer) from jsonb_array_elements(snap->'fields') f where f->>'service_id'=s->>'id'),'[]'::jsonb)) order by s->>'category',s->>'name') from jsonb_array_elements(snap->'services') s),'[]'::jsonb));
 payload=payload||private.consumer_design_snapshot(p_org);

 -- Category entities are canonical. Legacy snapshots are not changed.
 payload=jsonb_set(payload,'{branding,category_order}',coalesce((select jsonb_agg(name order by position,name,id)from public.service_categories where organization_id=p_org),'[]'::jsonb));
 return payload;
end;$function$;

CREATE OR REPLACE FUNCTION private.v029_consumer_publish_page(p_org uuid, p_manual uuid, p_enabled boolean, p_show_prices boolean, p_expected_revision integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.manual_versions;o public.organizations;p public.consumer_pages;v public.consumer_publications;payload jsonb;
begin perform private.company_lock(p_org);if p_enabled is null or p_show_prices is null or p_expected_revision is null then raise exception 'invalid_company_fields' using errcode='22023';end if;
 select * into p from public.consumer_pages where organization_id=p_org;
 if coalesce(p.revision,0)<>p_expected_revision then raise exception 'company_revision_conflict' using errcode='40001';end if;
 select * into m from public.manual_versions where id=p_manual and organization_id=p_org and status='published';if m.id is null then raise exception 'company_published_manual_required' using errcode='23514';end if;
 select * into o from public.organizations where id=p_org;
 payload=jsonb_build_object('name',o.name,'slug',o.slug,'description',m.snapshot->'settings'->>'description','phone',m.snapshot->'settings'->>'public_phone','email',m.snapshot->'settings'->>'public_email','address',m.snapshot->'settings'->>'public_address','regions',m.snapshot->'settings'->>'service_regions','payments',m.snapshot->'settings'->>'payment_methods','hours',m.snapshot->'settings'->'business_hours','timezone',o.timezone,'faqs',m.snapshot->'faqs','public_information',jsonb_build_object('service',coalesce((select service_policy from public.business_rules where organization_id=p_org),''),'cancellation',coalesce((select cancellation_policy from public.business_rules where organization_id=p_org),''),'rescheduling',coalesce((select rescheduling_policy from public.business_rules where organization_id=p_org),'')),'quick_replies',coalesce((select jsonb_agg(jsonb_build_object('title',title,'body',body))from public.quick_replies where organization_id=p_org and active),'[]'),'notice_version','consumer-v1',
 'services',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('s',(s->>'id')::uuid),'name',s->>'name','category',s->>'category','description',s->>'description','image_url',s->>'image_url','image_media',(select public_code from public.company_media where organization_id=p_org and id=(s->>'image_media_id')::uuid and state='ready'),'price_mode',case when p_show_prices then s->>'price_mode' else 'quote' end,'price_cents',case when p_show_prices then s->'price_cents' else 'null'::jsonb end,'duration_minutes',s->'duration_minutes','contract_mode',coalesce(s->>'contract_mode',case when(s->>'direct_booking')::boolean then 'immediate'else 'evaluation'end),'execution_mode',coalesce(s->>'execution_mode','continuous'),'execution_max_periods',s->'execution_max_periods','price_max_cents',case when p_show_prices then s->'price_max_cents' else 'null'::jsonb end,'photo_policy',coalesce(s->>'photo_policy','none'),'photo_instructions',coalesce(s->>'photo_instructions',''),'availability',s->>'availability','quotes_allowed',s->'quotes_allowed','direct_booking',p_show_prices and (s->>'direct_booking')::boolean,
 'addons',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('a',(a->>'id')::uuid),'name',a->>'name','price_mode',case when p_show_prices then a->>'price_mode' else 'quote' end,'price_cents',case when p_show_prices then a->'price_cents' else 'null'::jsonb end,'duration_minutes',a->'duration_minutes')) from jsonb_array_elements(m.snapshot->'addons') a where a->>'service_id'=s->>'id'),'[]'::jsonb),
 'questions',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('f',(f->>'id')::uuid),'label',f->>'label','instruction',coalesce(f->>'instruction',''),'multiline',coalesce((f->>'multiline')::boolean,false),'condition_field',case when f->>'condition_field' is not null then private.consumer_code('f',(f->>'condition_field')::uuid)end,'condition_value',f->'condition_value','kind',f->>'kind','required',f->'required','options',f->'options') order by (f->>'position')::integer) from jsonb_array_elements(m.snapshot->'fields') f where f->>'service_id'=s->>'id'),'[]'::jsonb)) order by s->>'category',s->>'name') from jsonb_array_elements(m.snapshot->'services') s),'[]'::jsonb));
 payload=payload||private.consumer_design_snapshot(p_org);
 insert into public.consumer_publications(organization_id,manual_id,payload,show_prices,published_by) values(p_org,p_manual,payload,p_show_prices,auth.uid()) returning * into v;
 insert into public.consumer_pages(organization_id,enabled,publication_id) values(p_org,p_enabled,v.id) on conflict(organization_id) do update set enabled=excluded.enabled,publication_id=excluded.publication_id,revision=consumer_pages.revision+1;
 insert into public.schedule_resources(organization_id) values(p_org) on conflict do nothing;return v.public_code;
end;$function$;

CREATE OR REPLACE FUNCTION private.execution_slot_allowed(p_pub uuid, p_start timestamp with time zone, p_minutes integer, p_ignore uuid[] DEFAULT '{}'::uuid[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.consumer_publications;s public.schedule_resources;local_start timestamp;local_end timestamp;finish timestamptz;
begin select * into v from public.consumer_publications where id=p_pub;select * into s from public.schedule_resources where organization_id=v.organization_id;
 if s.id is null or not s.active or p_start is null or p_minutes is null or p_minutes<1 or p_start<now()+make_interval(mins=>s.lead_minutes) or p_start>now()+make_interval(days=>s.horizon_days) then return false;end if;
 finish=p_start+make_interval(mins=>p_minutes+s.buffer_minutes);local_start=p_start at time zone (v.payload->>'timezone');local_end=finish at time zone (v.payload->>'timezone');
 if local_start::date<>local_end::date or extract(second from local_start)<>0 or extract(minute from local_start)::integer%s.step_minutes<>0 then return false;end if;
 return exists(select 1 from jsonb_array_elements(v.payload->'hours') h where (h->>'day')::integer=extract(dow from local_start) and local_start::time>=(h->>'open')::time and local_end::time<=(h->>'close')::time)
 and not exists(select 1 from public.appointments a where a.resource_id=s.id and a.state='confirmed' and not(a.id=any(coalesce(p_ignore,'{}'::uuid[]))) and a.slot&&tstzrange(p_start,finish,'[)'));
end;$function$;

-- Home calls permission-framed commands, which write transaction-local permission rows.
-- VOLATILE lets the RPC gateway use a read/write transaction for that internal work.
alter function public.operations_home(uuid)volatile;
create function public.operations_home_section(p_org uuid,p_section text)returns jsonb language plpgsql volatile security definer set search_path=''as $$
declare tz text;today_ date;r jsonb;items jsonb='[]';begin
 perform private.permission_require(p_org,'home.read');select timezone into tz from public.organizations where id=p_org;today_=(now()at time zone tz)::date;
 if p_section='header'then return jsonb_build_object('today',today_,'timezone',tz,'company',(select name from public.organizations where id=p_org));
 elsif p_section='agenda'then
 if not private.permission_allowed(p_org,'agenda.read')then return jsonb_build_object('today',today_,'appointments','[]'::jsonb,'available',false);end if;
 r=public.operations_agenda(p_org,today_,today_+1);
 return r||jsonb_build_object('today',today_,'available',true,'next',(select jsonb_build_object('id',a.id,'starts_at',a.starts_at,'customer',c.name,'service',s.name)from public.appointments a join public.customers c on c.id=a.customer_id join public.quote_requests q on q.id=a.request_id join public.services s on s.id=q.service_id where a.organization_id=p_org and a.kind='booking'and a.state='confirmed'and a.execution_state<>'completed'and a.ends_at>now()order by a.starts_at limit 1));
 elsif p_section='attention'then
 if private.permission_allowed(p_org,'pending.read')then items=items||coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'customer',c.name,'reason','Decisão solicitada','detail',e.question,'action','Responder à equipe','href','/painel/'||p_org||'/pendencias?ticket='||t.public_code))from public.ticket_escalations e join public.tickets t on t.id=e.ticket_id join public.customers c on c.id=t.customer_id where e.organization_id=p_org and e.responded_at is null),'[]');end if;
 if private.permission_allowed(p_org,'quotes.read')then items=items||coalesce((select jsonb_agg(x)from(select jsonb_build_object('id',q.id,'customer',c.name,'reason',case when q.accepted_version_id is not null then 'Proposta aprovada · falta agendar'when q.state='quoted'then 'Proposta enviada · acompanhar'else 'Solicitação para analisar'end,'detail',s.name,'action',case when q.accepted_version_id is not null then 'Concluir agendamento'else 'Abrir solicitação'end,'href','/painel/'||p_org||'/orcamentos?pedido='||q.public_code)x from public.quote_requests q join public.customers c on c.id=q.customer_id join public.services s on s.id=q.service_id where q.organization_id=p_org and q.state in('submitted','under_review','quoted','approved')and not exists(select 1 from public.appointments a where a.request_id=q.id and a.kind='booking'and a.state='confirmed')order by q.created_at limit 30)x),'[]');end if;
 if private.permission_allowed(p_org,'central.read')then items=items||coalesce((select jsonb_agg(x)from(select jsonb_build_object('id',t.id,'customer',c.name,'reason','Cliente aguardando atendimento','detail',case when t.next_action='review'then 'Revisar continuidade do atendimento'else 'Acompanhar solicitação e responder'end,'action','Abrir conversa','href','/painel/'||p_org||'/atendimento?ticket='||t.public_code)x from public.tickets t join public.customers c on c.id=t.customer_id where t.organization_id=p_org and t.state not in('resolved','closed','waiting_customer','waiting_company')and private.journey_ticket_visible(t.id)order by t.waiting_since limit 20)x),'[]');end if;
 if private.permission_allowed(p_org,'followup.read')then items=items||coalesce((select jsonb_agg(jsonb_build_object('id',x->>'task','customer',x->>'customer','reason','Retorno pendente','detail',case when(x->>'overdue')::boolean then 'Retorno vencido'else 'Retorno para hoje'end,'action','Revisar retorno','href','/painel/'||p_org||'/comercial?op='||(x->>'code')))from jsonb_array_elements(public.commercial_list(jsonb_build_object('org',p_org,'view','today'),0)->'items')x where x->>'task'is not null),'[]');end if;
 return jsonb_build_object('items',items);
 elsif p_section='updates'then return jsonb_build_object('notifications',coalesce((select jsonb_agg(to_jsonb(n))from(select n.*,exists(select 1 from public.notification_reads r where r.notification_id=n.id and r.user_id=auth.uid())as read from public.notifications n where n.organization_id=p_org and private.permission_manager(p_org)order by n.created_at desc limit 5)n),'[]'));
 else raise exception 'invalid_home_section'using errcode='22023';end if;end;$$;
revoke all on function public.operations_home_section(uuid,text)from public,anon;grant execute on function public.operations_home_section(uuid,text)to authenticated;

-- A plan is derived from published service rules, never from caller-supplied durations.
create function private.execution_policy(p_pub uuid,p_items jsonb)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare v public.consumer_publications;s jsonb;i jsonb;mode_ text='split';max_ integer=30;begin
 select *into v from public.consumer_publications where id=p_pub;
 if coalesce(jsonb_array_length(p_items),0)=0 then return jsonb_build_object('mode','continuous','max_periods',1);end if;
 for i in select value from jsonb_array_elements(p_items)loop
 select x into s from jsonb_array_elements(v.payload->'services')x where x->>'code'=i->>'service';
 if coalesce(s->>'execution_mode','continuous')<>'split'then mode_='continuous';end if;
 max_=least(max_,coalesce((s->>'execution_max_periods')::integer,30));end loop;
 return jsonb_build_object('mode',mode_,'max_periods',case when mode_='continuous'then 1 else max_ end);end;$$;
create function private.execution_request_policy(q public.quote_requests)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare v public.quote_versions;policy jsonb;begin
 policy=private.execution_policy(q.publication_id,coalesce(q.requested_items,jsonb_build_array(jsonb_build_object('service',q.service_code))));
 if q.accepted_version_id is not null then select *into v from public.quote_versions where id=q.accepted_version_id;if v.execution_mode is not null then policy=jsonb_build_object('mode',v.execution_mode,'max_periods',coalesce(v.execution_max_periods,case when v.execution_mode='split'then 30 else 1 end));end if;end if;return policy;end;$$;
create function private.execution_minutes(q public.quote_requests)returns integer language plpgsql stable security definer set search_path=''as $$
declare c jsonb;n integer;begin
 c=private.consumer_request_selection(q);
 if q.state not in('submitted','under_review','quoted','approved')then raise exception 'request_not_submitted'using errcode='22023';end if;
 if q.accepted_version_id is not null then select duration_minutes into n from public.quote_versions where id=q.accepted_version_id;
 elsif q.state in('submitted','under_review')and(c->>'direct_booking')::boolean and c->>'price_mode'='fixed'and q.publication_id=(private.consumer_publication((select slug from public.organizations where id=q.organization_id))).id then n=(c->>'duration_minutes')::integer;
 else raise exception 'booking_requires_approved_quote'using errcode='22023';end if;return n;end;$$;
create function private.execution_plan(p_pub uuid,p_start timestamptz,p_minutes integer,p_mode text,p_max integer,p_ignore uuid[] default '{}')returns jsonb language plpgsql stable security definer set search_path=''as $$
declare v public.consumer_publications;s public.schedule_resources;cursor_ timestamptz;limit_ timestamptz;remaining integer=p_minutes;lo integer;hi integer;mid integer;parts jsonb='[]';finish timestamptz;candidate timestamptz;found_ boolean;begin
 select *into v from public.consumer_publications where id=p_pub;select *into s from public.schedule_resources where organization_id=v.organization_id;
 if s.id is null or p_minutes is null or p_minutes not between 1 and 10080 or p_start is null then return parts;end if;
 if p_mode<>'split'then if private.execution_slot_allowed(p_pub,p_start,p_minutes,p_ignore)then return jsonb_build_array(jsonb_build_object('start',p_start,'minutes',p_minutes,'end',p_start+make_interval(mins=>p_minutes),'reserved_until',p_start+make_interval(mins=>p_minutes+s.buffer_minutes)));else return parts;end if;end if;
 cursor_=p_start;limit_=now()+make_interval(days=>s.horizon_days);
 while remaining>0 loop
 if jsonb_array_length(parts)>=least(coalesce(p_max,30),30)then return '[]';end if;
 if not private.execution_slot_allowed(p_pub,cursor_,1,p_ignore)then
 if jsonb_array_length(parts)=0 then return '[]';end if;
 found_=false;
 for candidate in select x from generate_series((cursor_ at time zone(v.payload->>'timezone'))::date,(limit_ at time zone(v.payload->>'timezone'))::date,interval '1 day')d cross join lateral jsonb_array_elements(v.payload->'hours')h cross join lateral generate_series((d::date+(h->>'open')::time)at time zone(v.payload->>'timezone'),((d::date+(h->>'close')::time)at time zone(v.payload->>'timezone'))-make_interval(mins=>s.buffer_minutes+1),interval '1 minute')x where(h->>'day')::integer=extract(dow from d)and x>=cursor_ and x<=limit_ and extract(minute from x at time zone(v.payload->>'timezone'))::integer%s.step_minutes=0 order by x loop
 if private.execution_slot_allowed(p_pub,candidate,1,p_ignore)then cursor_=candidate;found_=true;exit;end if;end loop;
 if not found_ then return '[]';end if;end if;
 lo=1;hi=remaining;
 while lo<hi loop mid=(lo+hi+1)/2;if private.execution_slot_allowed(p_pub,cursor_,mid,p_ignore)then lo=mid;else hi=mid-1;end if;end loop;
 finish=cursor_+make_interval(mins=>lo+s.buffer_minutes);
 parts=parts||jsonb_build_array(jsonb_build_object('start',cursor_,'minutes',lo,'end',cursor_+make_interval(mins=>lo),'reserved_until',finish));remaining=remaining-lo;
 -- The existing grid aligns minutes inside each hour (also for non-divisor steps).
 cursor_=date_trunc('hour',finish at time zone(v.payload->>'timezone'))at time zone(v.payload->>'timezone');
 while cursor_<finish loop cursor_=cursor_+interval '1 minute';end loop;
 while extract(minute from cursor_ at time zone(v.payload->>'timezone'))::integer%s.step_minutes<>0 loop cursor_=cursor_+interval '1 minute';end loop;
 end loop;return parts;end;$$;
create function private.execution_options(p_pub uuid,p_minutes integer,p_policy jsonb,p_day date,p_next boolean,p_ignore uuid[] default '{}')returns jsonb language plpgsql stable security definer set search_path=''as $$
declare v public.consumer_publications;s public.schedule_resources;day_ date=p_day;end_day date;at_ timestamptz;plan jsonb;plans jsonb='[]';hours_ integer;reason_ text;begin
 select *into v from public.consumer_publications where id=p_pub;select *into s from public.schedule_resources where organization_id=v.organization_id;
 if p_day is null or s.id is null then raise exception 'invalid_day'using errcode='22023';end if;
 end_day=least(p_day+case when coalesce(p_next,false)then s.horizon_days else 0 end,(now()at time zone(v.payload->>'timezone'))::date+s.horizon_days);
 while day_<=end_day loop
 for at_ in select x from generate_series(day_::timestamp at time zone(v.payload->>'timezone'),(day_+1)::timestamp at time zone(v.payload->>'timezone')-interval '1 minute',interval '1 minute')x where extract(minute from x at time zone(v.payload->>'timezone'))::integer%s.step_minutes=0 loop
 plan=private.execution_plan(p_pub,at_,p_minutes,p_policy->>'mode',(p_policy->>'max_periods')::integer,p_ignore);
 if jsonb_array_length(plan)>0 then plans=plans||jsonb_build_array(jsonb_build_object('start',at_,'periods',plan));end if;
 end loop;
 if jsonb_array_length(plans)>0 then exit;end if;day_=day_+1;end loop;
 select coalesce(max(extract(epoch from((h->>'close')::time-(h->>'open')::time))/60),0)::integer into hours_ from jsonb_array_elements(v.payload->'hours')h where(h->>'day')::integer=extract(dow from p_day);
 reason_=case when jsonb_array_length(plans)>0 then null when p_policy->>'mode'='continuous'and p_minutes+s.buffer_minutes>hours_ and hours_>0 then 'does_not_fit'when hours_=0 then 'closed'else 'occupied'end;
 return jsonb_build_object('plans',plans,'slots',coalesce((select jsonb_agg(x->'start')from jsonb_array_elements(plans)x),'[]'),'day',case when jsonb_array_length(plans)>0 then day_ else p_day end,'reason',reason_,'duration_minutes',p_minutes,'execution_mode',p_policy->>'mode','max_periods',p_policy->'max_periods');end;$$;
create function private.execution_request_options(p_code text,p_day date,p_next boolean)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare q public.quote_requests;v public.consumer_publications;ids uuid[];n integer;begin
 select *into q from public.quote_requests where public_code=p_code;n=private.execution_minutes(q);v=private.consumer_publication((select slug from public.organizations where id=q.organization_id));
 select coalesce(array_agg(id),'{}')into ids from public.appointments where request_id=q.id and state='confirmed'and kind='booking';
 return private.execution_options(v.id,n,private.execution_request_policy(q),p_day,p_next,ids);end;$$;
create or replace function private.central_request_slots_core(p_code text,p_day date)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 return private.execution_request_options(p_code,p_day,false)->'slots';exception when sqlstate '22023'then return '[]';end;$$;
create function private.execution_validate_plan(q public.quote_requests,p_start timestamptz,p_periods jsonb,p_minutes integer default null)returns void language plpgsql stable security definer set search_path=''as $$
declare v public.consumer_publications;policy jsonb;actual jsonb;ids uuid[];begin
 v=private.consumer_publication((select slug from public.organizations where id=q.organization_id));policy=private.execution_request_policy(q);
 select coalesce(array_agg(id),'{}')into ids from public.appointments where request_id=q.id and state='confirmed'and kind='booking';
 actual=private.execution_plan(v.id,p_start,coalesce(p_minutes,private.execution_minutes(q)),policy->>'mode',(policy->>'max_periods')::integer,ids);
 if p_periods is null or jsonb_array_length(actual)=0 or actual is distinct from p_periods then raise exception 'execution_plan_changed'using errcode='23P01';end if;end;$$;
create or replace function private.central_book_core(p_code text,p_start timestamptz,p_previous text,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare q public.quote_requests;v public.consumer_publications;s public.schedule_resources;a public.appointments;part jsonb;plan jsonb;policy jsonb;n integer;ids uuid[]='{}';group_ uuid;ordinal_ integer=0;prior jsonb;payload jsonb;r jsonb;begin
 perform pg_advisory_xact_lock(734921501);select *into q from public.quote_requests where public_code=p_code for update;payload=jsonb_build_array(p_code,p_start,p_previous);prior=private.consumer_idem(q.organization_id,'book',p_key,payload);if prior is not null then return prior;end if;
 n=private.execution_minutes(q);policy=private.execution_request_policy(q);v=private.consumer_publication((select slug from public.organizations where id=q.organization_id));select *into s from public.schedule_resources where organization_id=q.organization_id;
 if p_previous is not null then
 select *into a from public.appointments where request_id=q.id and public_code=p_previous and state='confirmed'and kind='booking';
 if a.id is null or exists(select 1 from public.appointments where request_id=q.id and state='confirmed'and kind='booking'and(execution_state<>'scheduled'or starts_at<now()+make_interval(mins=>s.cancel_minutes)))then raise exception 'reschedule_not_allowed'using errcode='22023';end if;
 select array_agg(id)into ids from public.appointments where request_id=q.id and state='confirmed'and kind='booking';
 elsif exists(select 1 from public.appointments where request_id=q.id and state='confirmed'and kind='booking')then raise exception 'booking_already_exists'using errcode='22023';end if;
 plan=private.execution_plan(v.id,p_start,n,policy->>'mode',(policy->>'max_periods')::integer,ids);
 if jsonb_array_length(plan)=0 then raise exception 'slot_unavailable'using errcode='23P01';end if;
 -- Preserve the existing appointment identity for ordinary single-window remarcations.
 if p_previous is not null and a.execution_group is null and jsonb_array_length(plan)=1 then
 part=plan->0;update public.appointments set starts_at=(part->>'start')::timestamptz,ends_at=(part->>'reserved_until')::timestamptz,service_minutes=(part->>'minutes')::integer where id=a.id returning *into a;
 perform private.consumer_event(q.organization_id,q.id,'rescheduled');r=jsonb_build_object('code',a.public_code,'starts_at',a.starts_at,'ends_at',a.ends_at,'periods',plan,'execution_group',null);perform private.consumer_remember(q.organization_id,'book',p_key,payload,r);return r;end if;
 group_=case when jsonb_array_length(plan)>1 then coalesce(a.execution_group,gen_random_uuid())else null end;
 if p_previous is not null then update public.appointments set state='cancelled'where id=any(ids);end if;
 for part in select value from jsonb_array_elements(plan)loop
 ordinal_=ordinal_+1;
 if not private.execution_slot_allowed(v.id,(part->>'start')::timestamptz,(part->>'minutes')::integer,'{}')then raise exception 'slot_unavailable'using errcode='23P01';end if;
 insert into public.appointments(organization_id,resource_id,kind,request_id,customer_id,starts_at,ends_at,execution_group,part_number,service_minutes)values(q.organization_id,s.id,'booking',q.id,q.customer_id,(part->>'start')::timestamptz,(part->>'reserved_until')::timestamptz,group_,ordinal_,(part->>'minutes')::integer)returning *into a;
 if ordinal_=1 then r=jsonb_build_object('code',a.public_code,'starts_at',a.starts_at,'ends_at',a.ends_at);end if;
 end loop;
 perform private.consumer_event(q.organization_id,q.id,case when p_previous is null then 'booked'else 'rescheduled'end);update public.opportunities set stage='contracted'where id=q.opportunity_id;
 r=r||jsonb_build_object('periods',plan,'execution_group',group_);perform private.consumer_remember(q.organization_id,'book',p_key,payload,r);return r;end;$$;
create function public.consumer_execution_options(p_code text,p_day date,p_next boolean default false)returns jsonb language plpgsql stable security definer set search_path=''as $$begin perform private.consumer_request(p_code,true);return private.execution_request_options(p_code,p_day,p_next);end;$$;
create function public.consumer_book_execution(p_code text,p_start timestamptz,p_previous text,p_periods jsonb,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare q public.quote_requests;r jsonb;payload jsonb;begin perform private.consumer_lock();q=private.consumer_request(p_code,true);payload=jsonb_build_array(p_code,p_start,p_previous,p_periods);r=private.consumer_idem(q.organization_id,'book_execution',p_key,payload);if r is not null then return r;end if;
 perform private.execution_validate_plan(q,p_start,p_periods);r=private.central_book_core(p_code,p_start,p_previous,p_key);perform private.consumer_remember(q.organization_id,'book_execution',p_key,payload,r);return r;end;$$;
create function public.consumer_complete_execution(p_code text,p_start timestamptz,p_attachment_count integer,p_periods jsonb,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare q public.quote_requests;c jsonb;r jsonb;payload jsonb;begin perform private.consumer_lock();q=private.consumer_request(p_code,true);payload=jsonb_build_array(p_code,p_start,p_attachment_count,p_periods);r=private.consumer_idem(q.organization_id,'complete_execution',p_key,payload);if r is not null then return r;end if;
 c=private.consumer_request_selection(q);perform private.execution_validate_plan(q,p_start,p_periods,coalesce((c->>'duration_minutes')::integer,(select step_minutes from public.schedule_resources where organization_id=q.organization_id)));
 update public.quote_requests set desired_periods=p_periods where id=q.id;r=public.consumer_complete_journey(p_code,p_start,p_attachment_count,p_key);perform private.consumer_remember(q.organization_id,'complete_execution',p_key,payload,r);return r;end;$$;
create function public.consumer_journey_options(p_slug text,p_revision text,p_items jsonb,p_day date,p_next boolean default false)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare v public.consumer_publications;c jsonb;n integer;begin
 if not private.consumer_identity()then raise exception 'consumer_session_required'using errcode='42501';end if;
 v=private.consumer_publication(p_slug);if v.public_code is distinct from p_revision then raise exception 'published_price_changed'using errcode='40001';end if;
 c=private.consumer_multi_selection(v.id,p_items);select coalesce((c->>'duration_minutes')::integer,step_minutes)into n from public.schedule_resources where organization_id=v.organization_id;
 return private.execution_options(v.id,n,private.execution_policy(v.id,p_items),p_day,p_next)||jsonb_build_object('journey',case when(c->>'direct_booking')::boolean then 'direct'else 'review'end,'total_cents',c->'total_cents');end;$$;
create function public.central_execution_options(p_code text,p_day date,p_next boolean default false)returns jsonb language plpgsql security definer set search_path=''as $$
declare t public.tickets;d integer;r jsonb;begin t=private.central_ticket(p_code);d=private.permission_enter(t.organization_id,'agenda.read');r=private.execution_request_options((select public_code from public.quote_requests where id=t.request_id),p_day,p_next);perform private.permission_leave(d);return r;end;$$;
create function public.central_book_execution(p_code text,p_revision integer,p_action text,p_start timestamptz,p_appointment text,p_periods jsonb,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare t public.tickets;q public.quote_requests;r jsonb;payload jsonb;begin perform private.central_lock();t=private.central_ticket(p_code);perform private.permission_require(t.organization_id,'agenda.manage');if not public.company_attendant_permission(t.organization_id,p_action)then raise exception 'central_permission_denied'using errcode='42501';end if;
 payload=jsonb_build_array(p_code,p_revision,p_action,p_start,p_appointment,p_periods);r=private.consumer_idem(t.organization_id,'central_book_execution',p_key,payload);if r is not null then return r;end if;
 select *into q from public.quote_requests where id=t.request_id;if p_action<>'cancel'then perform private.execution_validate_plan(q,p_start,p_periods);end if;
 r=public.central_booking(p_code,p_revision,p_action,p_start,p_appointment,p_key);perform private.consumer_remember(t.organization_id,'central_book_execution',p_key,payload,r);return r;end;$$;
revoke all on function public.consumer_execution_options(text,date,boolean),public.consumer_book_execution(text,timestamptz,text,jsonb,uuid),public.consumer_complete_execution(text,timestamptz,integer,jsonb,uuid),public.consumer_journey_options(text,text,jsonb,date,boolean),public.central_execution_options(text,date,boolean),public.central_book_execution(text,integer,text,timestamptz,text,jsonb,uuid)from public,anon;
grant execute on function public.consumer_execution_options(text,date,boolean),public.consumer_book_execution(text,timestamptz,text,jsonb,uuid),public.consumer_complete_execution(text,timestamptz,integer,jsonb,uuid),public.consumer_journey_options(text,text,jsonb,date,boolean),public.central_execution_options(text,date,boolean),public.central_book_execution(text,integer,text,timestamptz,text,jsonb,uuid)to authenticated;
create function public.operations_execution_options(p_org uuid,p_code text,p_day date,p_next boolean default false)returns jsonb language plpgsql volatile security definer set search_path=''as $$
declare d integer;r jsonb;begin d=private.permission_enter(p_org,'agenda.read');
 if not exists(select 1 from public.quote_requests where organization_id=p_org and public_code=p_code)then raise exception 'request_access_denied'using errcode='42501';end if;
 r=private.execution_request_options(p_code,p_day,p_next);perform private.permission_leave(d);return r;end;$$;
create function public.operations_book_execution(p_org uuid,p_code text,p_start timestamptz,p_previous text,p_revision integer,p_periods jsonb,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare d integer;q public.quote_requests;a public.appointments;r jsonb;payload jsonb;begin
 d=private.permission_enter(p_org,'agenda.manage');perform private.company_lock(p_org);select *into q from public.quote_requests where organization_id=p_org and public_code=p_code;
 if q.id is null then raise exception 'request_access_denied'using errcode='42501';end if;
 payload=jsonb_build_array(p_code,p_start,p_previous,p_revision,p_periods);r=private.consumer_idem(p_org,'operations_book_execution',p_key,payload);if r is not null then perform private.permission_leave(d);return r;end if;
 if p_previous is not null then select *into a from public.appointments where organization_id=p_org and request_id=q.id and public_code=p_previous;if a.id is null or a.revision is distinct from p_revision then raise exception 'appointment_revision_conflict'using errcode='40001';end if;end if;
 perform private.execution_validate_plan(q,p_start,p_periods);r=private.central_book_core(p_code,p_start,p_previous,p_key);r=r||jsonb_build_object('id',(select id from public.appointments where public_code=r->>'code'and organization_id=p_org));
 perform private.consumer_remember(p_org,'operations_book_execution',p_key,payload,r);perform private.permission_leave(d);return r;end;$$;
revoke all on function public.operations_execution_options(uuid,text,date,boolean),public.operations_book_execution(uuid,text,timestamptz,text,integer,jsonb,uuid)from public,anon;
grant execute on function public.operations_execution_options(uuid,text,date,boolean),public.operations_book_execution(uuid,text,timestamptz,text,integer,jsonb,uuid)to authenticated;

create function private.quote_explanation_required(q public.quote_requests,p_items jsonb,p_discount jsonb)returns boolean language plpgsql stable security definer set search_path=''as $$
declare i jsonb;o public.quote_items;begin
 if coalesce((p_discount->>'value')::numeric,0)>0 or jsonb_array_length(p_items)<>(select count(*)from public.quote_items i join public.quote_versions v on v.id=i.version_id where v.request_id=q.id and v.kind='estimate'and v.version=1)then return true;end if;
 if (select count(distinct value->>'position')from jsonb_array_elements(p_items))<>jsonb_array_length(p_items)then return true;end if;
 for i in select value from jsonb_array_elements(p_items)loop
 if i->>'kind'<>'original'or coalesce((i->>'discount_cents')::numeric,0)>0 or btrim(coalesce(i->>'note',''))<>''then return true;end if;
 select qi.*into o from public.quote_items qi join public.quote_versions v on v.id=qi.version_id where v.request_id=q.id and v.kind='estimate'and v.version=1 and qi.position=(i->>'position')::integer;
 if o.id is null or o.unit_cents is distinct from(i->>'unit_cents')::integer or o.quantity is distinct from(i->>'quantity')::integer or coalesce(o.duration_minutes,0)is distinct from(i->>'duration_minutes')::integer then return true;end if;
 end loop;return false;end;$$;
create function private.execution_quote_policy(q public.quote_requests,p_items jsonb)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare r jsonb;s public.services;i jsonb;begin
 r=private.execution_policy(q.publication_id,coalesce(q.requested_items,jsonb_build_array(jsonb_build_object('service',q.service_code))));
 for i in select value from jsonb_array_elements(p_items)loop
 if i->>'kind'='manual'then return jsonb_build_object('mode','continuous','max_periods',1);end if;
 if i->>'kind'in('service','addon')then
 select sv.*into s from public.services sv where sv.organization_id=q.organization_id and (private.consumer_code('s',sv.id)=i->>'code'or exists(select 1 from public.service_addons a where a.service_id=sv.id and private.consumer_code('a',a.id)=i->>'code'));
 if s.id is null or s.execution_mode<>'split'then return jsonb_build_object('mode','continuous','max_periods',1);end if;
 r=jsonb_set(r,'{max_periods}',to_jsonb(least((r->>'max_periods')::integer,coalesce(s.execution_max_periods,30))));end if;
 end loop;return r;end;$$;

create or replace function public.consumer_journey_slots(p_slug text,p_revision text,p_items jsonb,p_day date)returns jsonb language sql stable security definer set search_path=''as $$select public.consumer_journey_options(p_slug,p_revision,p_items,p_day,false);$$;

CREATE OR REPLACE FUNCTION public.consumer_complete_journey(p_code text, p_start timestamp with time zone, p_attachment_count integer, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quote_requests;c jsonb;prior jsonb;payload jsonb;r jsonb;a jsonb;t public.tickets;begin
 perform private.consumer_lock();q=private.consumer_request(p_code,true);payload=jsonb_build_array(p_code,p_start,p_attachment_count);prior=private.consumer_idem(q.organization_id,'complete_journey',p_key,payload);if prior is not null then return prior;end if;
 if q.state<>'draft'or q.help_only then raise exception 'request_state_changed'using errcode='22023';end if;
 if p_start is null or p_start<=now()then raise exception 'desired_time_required'using errcode='22023';end if;
 c=private.consumer_request_selection(q);perform private.journey_require_photos(q);
 update public.quote_requests set journey=case when(c->>'direct_booking')::boolean then 'direct'else 'review'end,desired_start=p_start where id=q.id;
 r=public.consumer_submit_request(p_code,p_attachment_count,p_key);
 if(c->>'direct_booking')::boolean then a=private.central_book_core(p_code,p_start,null,p_key);r=r||jsonb_build_object('booking',a,'journey','direct');
 else
 -- A preference is not a reservation; only current opening/lead rules are required here.
 if jsonb_array_length(private.execution_plan(q.publication_id,p_start,coalesce((c->>'duration_minutes')::integer,(select step_minutes from public.schedule_resources where organization_id=q.organization_id)),private.execution_request_policy(q)->>'mode',(private.execution_request_policy(q)->>'max_periods')::integer))=0 then raise exception 'slot_unavailable'using errcode='23P01';end if;
 t=private.central_open(q.id);perform private.journey_route(t.id,'Avaliação de preço ou condição necessária');r=r||jsonb_build_object('journey','review','desired_start',p_start);end if;
 perform private.consumer_remember(q.organization_id,'complete_journey',p_key,payload,r);return r;end;$function$;

CREATE OR REPLACE FUNCTION public.consumer_approve_quote(p_code text, p_version text, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quote_requests;v public.quote_versions;payload jsonb;prior jsonb;r jsonb;reservation jsonb;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);payload=jsonb_build_array(p_code,p_version);prior=private.consumer_idem(q.organization_id,'approve',p_key,payload);if prior is not null then return prior;end if;
 select * into v from public.quote_versions where request_id=q.id and id=q.current_version_id and public_code=p_version and kind='final' and state='sent';
 if v.id is null then raise exception 'quote_version_invalid' using errcode='22023';end if;
 if q.accepted_version_id=v.id then return jsonb_build_object('code',p_code,'state','approved');end if;
 if q.state<>'quoted' or v.expires_at<=now() then raise exception 'quote_expired_or_invalid' using errcode='22023';end if;
 perform private.consumer_request_selection(q);
 update public.quote_requests set accepted_version_id=v.id,state='approved',revision=revision+1 where id=q.id;update public.opportunities set stage='contracted' where id=q.opportunity_id;perform private.consumer_event(q.organization_id,q.id,'approved');r=jsonb_build_object('code',p_code,'state','approved');if q.desired_start is not null then begin if q.desired_periods is not null then perform private.execution_validate_plan((select x from public.quote_requests x where id=q.id),q.desired_start,q.desired_periods);elsif private.execution_request_policy(q)->>'mode'='split'then raise exception 'execution_confirmation_required'using errcode='23P01';end if;reservation=private.central_book_core(p_code,q.desired_start,null,gen_random_uuid());r=r||jsonb_build_object('booking',reservation,'booking_state','confirmed');exception when exclusion_violation or unique_violation then r=r||jsonb_build_object('booking_state','choose_another_time');end;end if; perform private.consumer_remember(q.organization_id,'approve',p_key,payload,r);return r;
end;$function$;

CREATE OR REPLACE FUNCTION private.central_cancel_booking_core(p_code text, p_appointment text, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quote_requests;a public.appointments;s public.schedule_resources;payload jsonb;prior jsonb;r jsonb;
begin select * into q from public.quote_requests where public_code=p_code;payload=jsonb_build_array(p_code,p_appointment);prior=private.consumer_idem(q.organization_id,'cancel_booking',p_key,payload);if prior is not null then return prior;end if;
 select * into a from public.appointments where request_id=q.id and public_code=p_appointment and kind='booking';select * into s from public.schedule_resources where organization_id=q.organization_id;
 if a.id is null or (a.state='confirmed' and exists(select 1 from public.appointments x where x.request_id=q.id and x.state='confirmed'and x.kind='booking'and(x.starts_at<now()+make_interval(mins=>s.cancel_minutes)or x.execution_state<>'scheduled'))) then raise exception 'cancel_not_allowed' using errcode='22023';end if;
 if a.state='confirmed' then update public.appointments set state='cancelled' where request_id=q.id and kind='booking'and state='confirmed';perform private.consumer_event(q.organization_id,q.id,'cancelled');end if;r=jsonb_build_object('code',p_appointment,'state','cancelled');perform private.consumer_remember(q.organization_id,'cancel_booking',p_key,payload,r);return r;
end;$function$;

CREATE OR REPLACE FUNCTION private.operations_appointment_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ev text;label text;
begin
 if tg_op='INSERT' then ev=case when new.kind='block' then 'blocked' else 'booked' end;
 elsif new.execution_state is distinct from old.execution_state then ev=case new.execution_state when 'in_progress' then 'started' when 'completed' then 'completed' end;
 elsif new.state='cancelled' and old.state<>'cancelled' then ev='cancelled';
 elsif new.starts_at<>old.starts_at or new.ends_at<>old.ends_at then ev='rescheduled';else return new;end if;
 insert into public.appointment_events(organization_id,appointment_id,actor_id,event,previous_start,previous_end,starts_at,ends_at)
 values(new.organization_id,new.id,auth.uid(),ev,case when tg_op='UPDATE' then old.starts_at end,case when tg_op='UPDATE' then old.ends_at end,new.starts_at,new.ends_at);
 if new.request_id is not null and ev in ('started','completed')and(ev='started'or not exists(select 1 from public.appointments a where a.request_id=new.request_id and a.state='confirmed'and a.execution_state<>'completed')) then perform private.consumer_event(new.organization_id,new.request_id,'service_'||ev);end if;
 label=case ev when 'booked' then 'Novo agendamento' when 'blocked' then 'Período bloqueado' when 'cancelled' then 'Agendamento cancelado' when 'rescheduled' then 'Horário alterado' when 'started' then 'Serviço em execução' when 'completed' then 'Serviço concluído' end;
 insert into public.notifications(organization_id,kind,object_id,title,href) values(new.organization_id,'appointment',new.id,label,'/painel/'||new.organization_id||'/agenda?ficha='||new.id);
 return new;
end;$function$;

CREATE OR REPLACE FUNCTION private.v029_operations_appointment_act(p_org uuid, p_id uuid, p_revision integer, p_action text, p_data jsonb, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.appointments;v public.consumer_publications;s public.schedule_resources;prior jsonb;payload jsonb;ts timestamptz;minutes integer;q public.quote_requests;
begin perform private.company_lock(p_org);
 select * into a from public.appointments where id=p_id and organization_id=p_org for update;if a.id is null then raise exception 'access_denied' using errcode='42501';end if;
 payload=jsonb_build_array(p_id,p_revision,p_action,p_data);prior=private.consumer_idem(p_org,'operations_appointment_act',p_key,payload);if prior is not null then return prior;end if;
 if a.revision is distinct from p_revision then raise exception 'appointment_revision_conflict' using errcode='40001';end if;
 if a.state<>'confirmed' then raise exception 'invalid_service_transition' using errcode='22023';end if;
 if p_action='reschedule' then
  perform private.company_keys(p_data,array['start']);if a.execution_state<>'scheduled' then raise exception 'service_already_started' using errcode='22023';end if;
  ts=(p_data->>'start')::timestamptz;select * into s from public.schedule_resources where organization_id=p_org;minutes=extract(epoch from(a.ends_at-a.starts_at))/60-s.buffer_minutes;
  v=private.consumer_publication((select slug from public.organizations where id=p_org));
  if not private.consumer_slot_allowed(v.id,ts,minutes,a.id) then raise exception 'slot_unavailable' using errcode='23P01';end if;
  if a.request_id is not null then select * into q from public.quote_requests where id=a.request_id;perform private.consumer_request_selection(q);end if;
  update public.appointments set starts_at=ts,ends_at=ts+(a.ends_at-a.starts_at) where id=a.id returning * into a;
  if a.request_id is not null then perform private.consumer_event(p_org,a.request_id,'rescheduled');end if;
 else
  perform private.company_keys(p_data,array[]::text[]);
  case p_action
  when 'start' then
   if a.kind<>'booking' or a.execution_state<>'scheduled' or a.starts_at>now()+interval '15 minutes' then raise exception 'invalid_service_transition' using errcode='22023';end if;
   update public.appointments set execution_state='in_progress',started_at=clock_timestamp() where id=a.id returning * into a;
  when 'complete' then
   if a.kind<>'booking' or a.execution_state<>'in_progress' then raise exception 'invalid_service_transition' using errcode='22023';end if;
   update public.appointments set execution_state='completed',completed_at=clock_timestamp() where id=a.id returning * into a;
  when 'cancel' then
   if a.execution_state<>'scheduled'or exists(select 1 from public.appointments x where x.request_id=a.request_id and x.state='confirmed'and x.execution_state<>'scheduled')then raise exception 'service_already_started'using errcode='22023';end if;
   update public.appointments set state='cancelled'where id=a.id or(request_id=a.request_id and kind='booking'and state='confirmed');select *into a from public.appointments where id=p_id;
   if a.request_id is not null then perform private.consumer_event(p_org,a.request_id,'cancelled');end if;
  else raise exception 'invalid_service_transition' using errcode='22023';end case;
 end if;
 perform private.consumer_remember(p_org,'operations_appointment_act',p_key,payload,to_jsonb(a));return to_jsonb(a);
end;$function$;

CREATE OR REPLACE FUNCTION private.central_request_context_core(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quote_requests;c public.customers;
begin select * into q from public.quote_requests where public_code=p_code;select * into c from public.customers where id=q.customer_id and organization_id=q.organization_id;
 return jsonb_build_object('desired_periods',q.desired_periods,'execution',private.execution_request_policy(q),'journey',q.journey,'desired_start',q.desired_start,'help_only',q.help_only,'photo_request',q.photo_request,'photos_received',exists(select 1 from public.attachments where request_id=q.id and state='ready'and created_at>=q.photo_requested_at),'booking',private.consumer_booking_status(q),'branding',(select pub.payload->'branding'from public.consumer_pages page join public.consumer_publications pub on pub.id=page.publication_id where page.organization_id=q.organization_id),'code',q.public_code,'state',q.state,'revision',q.revision,'name',c.name,'notes',q.notes,'requested_items',private.consumer_requested_items(q),'review_alerts',q.review_alerts,'can_manage',private.consumer_access(q.id,true),'is_owner',c.user_id=auth.uid(),'company',(select jsonb_build_object('name',name,'slug',slug) from public.organizations where id=q.organization_id),'current_version',(select public_code from public.quote_versions where id=q.current_version_id),'accepted_version',(select public_code from public.quote_versions where id=q.accepted_version_id),
 'answers',coalesce((select jsonb_agg(jsonb_build_object('label',f->>'label','answer',q.answers->(f->>'code'))) from public.consumer_publications cp cross join lateral jsonb_array_elements(cp.payload->'services') sv cross join lateral jsonb_array_elements(sv->'questions') f where cp.id=q.publication_id and sv->>'code'=q.service_code),'[]'::jsonb),
 'versions',coalesce((select jsonb_agg(jsonb_build_object('code',v.public_code,'version',v.version,'kind',v.kind,'desired_start',v.desired_start,'subtotal_cents',coalesce(v.subtotal_cents,v.total_cents),'discount_cents',v.discount_cents,'customer_explanation',v.customer_explanation,'price_mode',v.price_mode,'total_cents',v.total_cents,'execution_mode',v.execution_mode,'execution_max_periods',v.execution_max_periods,'duration_minutes',v.duration_minutes,'expires_at',v.expires_at,'created_at',v.created_at,'items',(select jsonb_agg(jsonb_build_object('name',i.name,'quantity',i.quantity,'unit_cents',i.unit_cents,'price_mode',i.price_mode,'duration_minutes',i.duration_minutes,'discount_cents',i.discount_cents,'source_kind',i.source_kind,'source_code',i.source_code,'public_note',i.public_note) order by i.position) from public.quote_items i where i.version_id=v.id)) order by v.version desc) from public.quote_versions v where v.request_id=q.id and v.state='sent'),'[]'::jsonb),
 'appointments',coalesce((select jsonb_agg(jsonb_build_object('code',a.public_code,'starts_at',a.starts_at,'ends_at',a.ends_at,'state',a.state,'execution_group',a.execution_group,'part_number',a.part_number,'service_minutes',a.service_minutes,'work_end',case when a.service_minutes is not null then a.starts_at+make_interval(mins=>a.service_minutes)else a.ends_at end,'execution_state',a.execution_state) order by a.created_at desc) from public.appointments a where a.request_id=q.id),'[]'::jsonb),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('code',a.public_code,'mime',a.mime,'size_bytes',a.size_bytes,'state',a.state,'service',a.service_code) order by a.created_at) from public.attachments a where a.request_id=q.id and (a.state='ready' or(a.state='pending' and a.expires_at>now()))),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('event',event,'at',created_at) order by created_at,id) from public.request_events where request_id=q.id),'[]'::jsonb),
 'contact_authorized',exists(select 1 from public.customer_consents where customer_id=c.id and purpose='request_contact' and revoked_at is null));
end;$function$;

CREATE OR REPLACE FUNCTION private.v029_operations_detail(p_org uuid, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.appointments;q public.quote_requests;pub public.consumer_publications;v public.quote_versions;
begin
 if not private.company_can_manage(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 select * into a from public.appointments where id=p_id and organization_id=p_org;if a.id is null then raise exception 'access_denied' using errcode='42501';end if;
 select * into q from public.quote_requests where id=a.request_id and organization_id=p_org;
 select * into pub from public.consumer_publications where id=q.publication_id;
 select * into v from public.quote_versions where organization_id=p_org and request_id=q.id order by (id=q.accepted_version_id) desc nulls last,version desc limit 1;
 return jsonb_build_object('appointment',to_jsonb(a),'request',to_jsonb(q),'customer',(select jsonb_build_object('id',id,'name',name,'whatsapp',whatsapp,'email',email) from public.customers where id=a.customer_id and organization_id=p_org),
 'quote',to_jsonb(v),'accepted',q.accepted_version_id is not null,'items',coalesce((select jsonb_agg(to_jsonb(i) order by position) from public.quote_items i where organization_id=p_org and version_id=v.id),'[]'::jsonb),
 'questions',(select s->'questions' from jsonb_array_elements(pub.payload->'services')s where s->>'code'=q.service_code),'source',(select source from public.opportunity_context where organization_id=p_org and opportunity_id=q.opportunity_id),
 'periods',coalesce((select jsonb_agg(to_jsonb(x)order by x.part_number)from public.appointments x where x.organization_id=p_org and x.request_id=a.request_id and x.state='confirmed'),'[]'),'history',coalesce((select jsonb_agg(to_jsonb(e) order by created_at) from public.appointment_events e where organization_id=p_org and (appointment_id=a.id or appointment_id in(select id from public.appointments where request_id=a.request_id and organization_id=p_org))),'[]'::jsonb));
end;$function$;

CREATE OR REPLACE FUNCTION private.financial_totals(p_org uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b jsonb;lo timestamptz;hi timestamptz;received bigint;expenses bigint;quoted bigint;approved bigint;performed bigint;balance bigint;overdue bigint;today date;num bigint;begin
 b=private.analytics_period((select timezone from public.organizations where id=p_org),p_from,p_to);lo=(b->>'from')::timestamptz;hi=(b->>'until')::timestamptz;select(now()at time zone timezone)::date into today from public.organizations where id=p_org;
 select coalesce(sum(case kind when 'receipt'then amount_cents else -amount_cents end),0)into received from public.financial_receipts where organization_id=p_org and effective_date between p_from and p_to;
 select coalesce(sum(amount_cents),0)into expenses from public.financial_expenses where organization_id=p_org and effective_date between p_from and p_to and cancelled_at is null;
 select coalesce(sum(total_cents),0)into quoted from(select distinct on(request_id)total_cents from public.quote_versions where organization_id=p_org and kind='final'and state='sent'and created_at>=lo and created_at<hi order by request_id,version desc)x;
 select coalesce(sum(v.total_cents),0)into approved from public.quote_requests q join public.quote_versions v on v.id=q.accepted_version_id and v.organization_id=p_org where q.organization_id=p_org and exists(select 1 from public.request_events e where e.organization_id=p_org and e.request_id=q.id and e.event='approved'and e.created_at>=lo and e.created_at<hi);
 select coalesce(sum(v.total_cents),0)into performed from public.quote_requests q join public.quote_versions v on v.id=q.accepted_version_id and v.organization_id=p_org where q.organization_id=p_org and exists(select 1 from public.appointments a where a.request_id=q.id and a.state='confirmed'and a.execution_state='completed')and not exists(select 1 from public.appointments a where a.request_id=q.id and a.state='confirmed'and a.execution_state<>'completed')and(select max(completed_at)from public.appointments where request_id=q.id and state='confirmed')>=lo and(select max(completed_at)from public.appointments where request_id=q.id and state='confirmed')<hi;
 select coalesce(sum(a.total_cents-private.financial_received(p_org,a.id)),0),coalesce(sum(a.total_cents-private.financial_received(p_org,a.id))filter(where a.due_date<today),0),count(*)filter(where a.total_cents>private.financial_received(p_org,a.id))into balance,overdue,num from public.financial_accounts a where a.organization_id=p_org and a.cancelled_at is null;
 return jsonb_build_object('period',b,'quoted_cents',quoted,'approved_cents',approved,'performed_cents',performed,'received_cents',received,'expenses_cents',expenses,'result_cents',received-expenses,'receivable_cents',balance,'overdue_cents',overdue,'pending_count',num,'average_receipt_cents',(select round(avg(amount_cents))from public.financial_receipts where organization_id=p_org and kind='receipt'and effective_date between p_from and p_to and not exists(select 1 from public.financial_receipts rev where rev.original_id=financial_receipts.id)),'basis','manual_ledger_effective_dates;receivables_current_snapshot;quotes_issued_in_period;result_not_accounting_profit');
end;$function$;

CREATE OR REPLACE FUNCTION private.journey_quote_calculation(p_org uuid, p_code text, p_items jsonb, p_discount jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quote_requests;i jsonb;out_items jsonb='[]';item jsonb;catalog jsonb;quantity integer;unit_ bigint;minutes integer;disc bigint;subtotal bigint=0;item_discount bigint=0;global_discount bigint=0;duration integer=0;max_percent integer;original public.quote_items;mode text;value_ numeric;implicit_discount bigint=0;reference_unit bigint;services_ text[]='{}';begin
 perform private.journey_quote_authorize(p_org);select *into q from public.quote_requests where organization_id=p_org and public_code=p_code;if q.id is null then raise exception 'request_access_denied'using errcode='42501';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array'or jsonb_array_length(p_items)not between 1 and 30 then raise exception 'invalid_quote_item'using errcode='22023';end if;
 max_percent=(public.operations_quote_catalog(p_org)->>'max_discount_percent')::integer;
 for i in select value from jsonb_array_elements(p_items)loop
 perform private.company_keys(i,array['kind','code','position','name','quantity','unit_cents','duration_minutes','discount_cents','note']);
 if i->>'kind' not in('original','service','addon','manual')or i->>'kind'is null or jsonb_typeof(i->'quantity')is distinct from 'number'or jsonb_typeof(i->'unit_cents')is distinct from 'number'or jsonb_typeof(i->'duration_minutes')is distinct from 'number'or jsonb_typeof(i->'discount_cents')is distinct from 'number'then raise exception 'invalid_quote_item'using errcode='22023';end if;
 if exists(select 1 from jsonb_each(i) where key in('quantity','unit_cents','duration_minutes','discount_cents')and(value#>>'{}')::numeric<>trunc((value#>>'{}')::numeric))then raise exception 'invalid_quote_item'using errcode='22023';end if;
 quantity=(i->>'quantity')::integer;unit_=(i->>'unit_cents')::bigint;minutes=(i->>'duration_minutes')::integer;disc=(i->>'discount_cents')::bigint;
 if quantity not between 1 and 100 or unit_ not between 0 and 100000000 or minutes not between 0 and 10080 or disc<0 or disc>quantity*unit_ or length(coalesce(i->>'note',''))>500 then raise exception 'invalid_quote_item'using errcode='22023';end if;
 item=i;catalog=null;reference_unit=null;
 if i->>'kind'='original'then select qi.*into original from public.quote_items qi join public.quote_versions v on v.id=qi.version_id where v.request_id=q.id and v.kind='estimate'and v.version=1 and qi.position=(i->>'position')::integer;
 if original.id is null then raise exception 'invalid_quote_source'using errcode='22023';end if;item=item||jsonb_build_object('name',original.name);if original.price_mode='fixed'then reference_unit=original.unit_cents;if minutes<coalesce(original.duration_minutes,0)then raise exception 'quote_duration_too_short'using errcode='22023';end if;end if;
 elsif i->>'kind'='service'then select to_jsonb(s)into catalog from public.services s where organization_id=p_org and active and private.consumer_code('s',s.id)=i->>'code';
 if catalog is null then raise exception 'service_unavailable'using errcode='22023';end if;services_=array_append(services_,i->>'code');item=item||jsonb_build_object('name',catalog->>'name');
 elsif i->>'kind'='addon'then select to_jsonb(a)into catalog from public.service_addons a where organization_id=p_org and active and private.consumer_code('a',a.id)=i->>'code';
 if catalog is null or not exists(select 1 from public.services s where id=(catalog->>'service_id')::uuid and organization_id=p_org and active)then raise exception 'addon_unavailable'using errcode='22023';end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(q.requested_items,'[]'))x where x->>'service'=private.consumer_code('s',(catalog->>'service_id')::uuid))and not exists(select 1 from jsonb_array_elements(p_items)x where x->>'kind'='service'and x->>'code'=private.consumer_code('s',(catalog->>'service_id')::uuid))then raise exception 'addon_not_applicable'using errcode='22023';end if;item=item||jsonb_build_object('name',catalog->>'name');
 end if;
 if length(btrim(coalesce(item->>'name','')))not between 2 and 300 then raise exception 'invalid_quote_item'using errcode='22023';end if;
 -- An additional catalogue item keeps its configured duration. Manual and evaluated originals have an explicit final duration.
 if catalog is not null and catalog->>'duration_minutes'is not null and minutes<(catalog->>'duration_minutes')::integer then raise exception 'quote_duration_too_short'using errcode='22023';end if;
 if catalog->>'price_mode'='fixed'then reference_unit=(catalog->>'price_cents')::bigint;end if;implicit_discount=implicit_discount+greatest(coalesce(reference_unit,unit_)-unit_,0)*quantity;subtotal=subtotal+quantity*unit_;item_discount=item_discount+disc;duration=duration+quantity*minutes;out_items=out_items||jsonb_build_array(item);
 end loop;
 if duration not between 1 and 10080 then raise exception 'invalid_quote_duration'using errcode='22023';end if;
 if p_discount is null or jsonb_typeof(p_discount)<>'object'then raise exception 'invalid_discount'using errcode='22023';end if;perform private.company_keys(p_discount,array['mode','value']);mode=p_discount->>'mode';
 if mode not in('none','percent','amount')or mode is null or jsonb_typeof(p_discount->'value')is distinct from 'number'then raise exception 'invalid_discount'using errcode='22023';end if;
 value_=(p_discount->>'value')::numeric;if value_<0 or value_>100000000 or value_<>trunc(value_)or(mode='percent'and value_>100)or(mode='none'and value_<>0)then raise exception 'invalid_discount'using errcode='22023';end if;
 global_discount=case mode when 'percent'then floor((subtotal-item_discount)*value_/100)when 'amount'then value_ else 0 end;
 if item_discount+global_discount>subtotal or(item_discount+global_discount+implicit_discount)*100>(subtotal+implicit_discount)*max_percent then raise exception 'central_discount_denied'using errcode='42501';end if;
 return jsonb_build_object('explanation_required',private.quote_explanation_required(q,p_items,p_discount),'execution',private.execution_quote_policy(q,p_items),'items',out_items,'subtotal_cents',subtotal,'item_discount_cents',item_discount,'discount_cents',item_discount+global_discount,'total_cents',subtotal-item_discount-global_discount,'duration_minutes',duration,'desired_start',q.desired_start);end;$function$;

CREATE OR REPLACE FUNCTION public.operations_send_calculated_quote(p_org uuid, p_code text, p_items jsonb, p_discount jsonb, p_expires timestamp with time zone, p_expected_revision integer, p_explanation text, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quote_requests;c jsonb;v public.quote_versions;i jsonb;pos integer=0;prior jsonb;payload jsonb;r jsonb;begin
 perform private.central_lock();perform private.journey_quote_authorize(p_org);select *into q from public.quote_requests where organization_id=p_org and public_code=p_code;
 if q.id is null then raise exception 'request_access_denied'using errcode='42501';end if;
 payload=jsonb_build_array(p_code,p_items,p_discount,p_expires,p_expected_revision,p_explanation);prior=private.consumer_idem(p_org,'send_calculated_quote',p_key,payload);if prior is not null then return prior;end if;
 if q.journey='direct'and exists(select 1 from public.appointments where request_id=q.id and state='confirmed')then raise exception 'direct_booking_already_confirmed'using errcode='22023';end if;
 if q.revision is distinct from p_expected_revision then raise exception 'request_revision_conflict'using errcode='40001';end if;
 if q.state not in('submitted','under_review','quoted','declined')or p_expires is null or p_expires<=now()or p_expires>now()+interval '30 days'or length(btrim(coalesce(p_explanation,'')))>2000 then raise exception 'invalid_final_quote'using errcode='22023';end if;
 c=private.journey_quote_calculation(p_org,p_code,p_items,p_discount);if(c->>'explanation_required')::boolean and length(btrim(coalesce(p_explanation,'')))<2 then raise exception 'quote_explanation_required'using errcode='22023';end if;p_explanation=coalesce(btrim(p_explanation),'');
 insert into public.quote_versions(organization_id,request_id,version,kind,price_mode,total_cents,subtotal_cents,discount_cents,duration_minutes,expires_at,created_by,customer_explanation,desired_start,execution_mode,execution_max_periods)values(p_org,q.id,(select coalesce(max(version),0)+1 from public.quote_versions where request_id=q.id),'final','fixed',(c->>'total_cents')::bigint,(c->>'subtotal_cents')::bigint,(c->>'discount_cents')::bigint,(c->>'duration_minutes')::integer,p_expires,auth.uid(),p_explanation,q.desired_start,c->'execution'->>'mode',case when c->'execution'->>'mode'='split'then(c->'execution'->>'max_periods')::integer end)returning *into v;
 for i in select value from jsonb_array_elements(c->'items')loop insert into public.quote_items(organization_id,version_id,position,name,quantity,unit_cents,price_mode,duration_minutes,discount_cents,source_kind,source_code,public_note)values(p_org,v.id,pos,i->>'name',(i->>'quantity')::int,(i->>'unit_cents')::integer,'fixed',(i->>'duration_minutes')::int,(i->>'discount_cents')::bigint,i->>'kind',coalesce(i->>'code',i->>'position'),coalesce(i->>'note',''));pos=pos+1;end loop;
 update public.quote_versions set state='sent'where id=v.id;update public.quote_requests set current_version_id=v.id,state='quoted',revision=revision+1 where id=q.id;update public.opportunities set stage='quoted'where id=q.opportunity_id;
 update public.tickets set state='waiting_customer',next_action='customer',revision=revision+1,last_staff_at=clock_timestamp(),waiting_since=clock_timestamp()where request_id=q.id and state not in('closed','resolved');
 perform private.consumer_event(p_org,q.id,'quote_sent');r=jsonb_build_object('code',v.public_code,'total_cents',v.total_cents);perform private.consumer_remember(p_org,'send_calculated_quote',p_key,payload,r);return r;end;$function$;

CREATE OR REPLACE FUNCTION public.operations_quote_catalog(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$begin perform private.journey_quote_authorize(p_org);
 return jsonb_build_object('services',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('s',id),'name',name,'price_mode',price_mode,'price_cents',price_cents,'duration_minutes',duration_minutes))from public.services where organization_id=p_org and active),'[]'),
 'addons',coalesce((select jsonb_agg(jsonb_build_object('code',private.consumer_code('a',id),'service',private.consumer_code('s',service_id),'name',name,'price_mode',price_mode,'price_cents',price_cents,'duration_minutes',duration_minutes))from public.service_addons where organization_id=p_org and active),'[]'),
 'max_daily_minutes',(select coalesce(max(extract(epoch from((h->>'close')::time-(h->>'open')::time))/60),0)from public.company_settings cs cross join lateral jsonb_array_elements(cs.business_hours)h where cs.organization_id=p_org),'max_discount_percent',case when private.permission_manager(p_org)then 100 else coalesce((select(v.snapshot->'permissions'->>'max_discount_percent')::integer from public.company_settings cs join public.manual_versions v on v.id=cs.published_manual_id where cs.organization_id=p_org and(v.snapshot->'permissions'->'allowed_actions')?'discount'and not coalesce((v.snapshot->'permissions'->>'never_change_price')::boolean,true)),0)end);end;$function$;

CREATE OR REPLACE FUNCTION private.is_org_admin(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select not private.syzia_identity(auth.uid())and private.verification_ready(p_org) and private.access_base_admin(p_org) and private.access_scope(p_org);$function$;

CREATE OR REPLACE FUNCTION public.consumer_draft_context(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quote_requests;c public.customers;begin q=private.consumer_request(p_code,true);if q.state<>'draft'then raise exception 'request_state_changed'using errcode='22023';end if;select *into c from public.customers where id=q.customer_id;
 return jsonb_build_object('code',p_code,'help_only',q.help_only,'items',coalesce(q.help_context->'items',q.requested_items,jsonb_build_array(jsonb_build_object('service',q.service_code,'addons',to_jsonb(q.addon_codes),'answers',q.answers,'notes',''))),'stage',q.help_context->>'stage','notes',q.notes,'name',c.name,'whatsapp',c.whatsapp,'email',c.email,'desired_start',q.desired_start,'desired_periods',q.desired_periods,'attachments',(select coalesce(jsonb_agg(jsonb_build_object('code',public_code,'service',service_code)),'[]')from public.attachments where request_id=q.id and state='ready'));end;$function$;

CREATE OR REPLACE FUNCTION private.commercial_can_operate(p_org uuid, p_user uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select private.permission_commercial_base(p_org,p_user)and private.permission_actor(p_org,p_user,'followup.manage')and(private.permission_role(p_org,p_user)in('admin_empresa','super_admin')or exists(select 1 from public.attendant_permissions a join public.company_settings cs on cs.organization_id=a.organization_id join public.manual_versions v on v.id=cs.published_manual_id where a.organization_id=p_org and a.reviewed and 'follow_up'=any(a.allowed_actions)and(v.snapshot->'permissions'->'allowed_actions')?'follow_up'));$function$;

CREATE OR REPLACE FUNCTION private.v029_central_context(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.tickets;q public.quote_requests;m public.manual_versions;s public.central_settings;ctx jsonb;
begin t=private.central_ticket(p_code);select * into q from public.quote_requests where id=t.request_id;select v.* into m from public.company_settings cs join public.manual_versions v on v.id=cs.published_manual_id and v.organization_id=cs.organization_id where cs.organization_id=t.organization_id and v.status='published';select * into s from public.central_settings where organization_id=t.organization_id;
 ctx=private.central_request_context_core(q.public_code);
 return jsonb_build_object('ticket',to_jsonb(t),'request',ctx,'me',auth.uid(),'admin',private.company_can_manage(t.organization_id),'can_request_photos',private.journey_company_actor(t.organization_id,auth.uid())and private.permission_allowed(t.organization_id,'central.reply'),'can_price',private.journey_can_price(t.organization_id),'operator_name',(select display_name from public.profiles where id=auth.uid()),
 'organization',(select jsonb_build_object('id',id,'name',name,'slug',slug,'timezone',timezone) from public.organizations where id=t.organization_id),
 'customer',jsonb_build_object('name',(select name from public.customers where id=t.customer_id),'whatsapp',case when(ctx->>'contact_authorized')::boolean and public.company_attendant_permission(t.organization_id,'whatsapp')then (select whatsapp from public.customers where id=t.customer_id) end,'request_count',(select count(*) from public.quote_requests where customer_id=t.customer_id),'previous_requests',coalesce((select jsonb_agg(jsonb_build_object('code',public_code,'state',state,'created_at',created_at)) from(select public_code,state,created_at from public.quote_requests where customer_id=t.customer_id and id<>q.id order by created_at desc limit 5) recent),'[]'::jsonb)),
 'customer_context',case when coalesce(s.share_customer_context,false) or private.company_can_manage(t.organization_id) then(select jsonb_build_object('tags',tags,'preferred_time',preferred_time,'operational_note',operational_note,'origin_context',origin_context) from public.customer_context where customer_id=t.customer_id) else null end,
 'origin',(select jsonb_build_object('source',source,'detail',source_detail) from public.opportunity_context where opportunity_id=q.opportunity_id),
 'manual',jsonb_build_object('id',m.id,'version',m.version,'title',m.title,'snapshot',m.snapshot,'sections',coalesce((select jsonb_agg(jsonb_build_object('key',section_key,'content',content) order by section_key) from public.manual_sections where manual_id=m.id),'[]'::jsonb)),
 'permissions',coalesce((select jsonb_object_agg(action,public.company_attendant_permission(t.organization_id,action)) from unnest(array['price_list','quote_create','quote_send','schedule','reschedule','cancel','whatsapp']) action),'{}'::jsonb),
 'settings',coalesce(to_jsonb(s),jsonb_build_object('revision',1,'quick_reply_edit',false,'share_customer_context',false)),
 'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'kind',a.kind)) from (select user_id,kind::text kind from public.attendant_organizations where organization_id=t.organization_id union select user_id,'own' from public.organization_members where organization_id=t.organization_id and is_attendant) a join public.profiles p on p.id=a.user_id where private.central_eligible(t.organization_id,p.id)and(t.routing_scope<>'company'or private.journey_company_actor(t.organization_id,p.id))),'[]'::jsonb),
 'messages',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'name',author_name,'body',body,'at',created_at) order by created_at,id) from public.ticket_messages where ticket_id=t.id),'[]'::jsonb),
 'notes',coalesce((select jsonb_agg(jsonb_build_object('body',n.body,'author',p.display_name,'at',n.created_at) order by n.created_at,n.id) from public.ticket_notes n join public.profiles p on p.id=n.author_id where ticket_id=t.id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('event',e.event,'author',p.display_name,'from',e.from_assignee,'to',e.to_assignee,'state',e.state,'at',e.created_at) order by e.created_at,e.id) from public.ticket_events e left join public.profiles p on p.id=e.actor_id where ticket_id=t.id),'[]'::jsonb),
 'escalations',coalesce((select jsonb_agg(jsonb_build_object('reason',reason,'summary',summary,'question',question,'response',response,'at',created_at,'responded_at',responded_at) order by created_at desc) from public.ticket_escalations where ticket_id=t.id),'[]'::jsonb),
 'financial',jsonb_build_object('operational',false,'label','Preparação: nenhum pagamento processado pela Central','records',coalesce((select jsonb_agg(jsonb_build_object('status',status,'origin',origin,'confirmation_method',confirmation_method,'amount_cents',amount_cents,'confirmed_cents',confirmed_cents)) from public.payments where request_id=q.id),'[]'::jsonb)));
end;$function$;

CREATE OR REPLACE FUNCTION private.v029_commercial_context(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o private.commercial_op;q public.quote_requests;tk text;cfg jsonb;begin select * into o from private.commercial_op where commercial_code=p_code;if o.id is null or not private.central_staff(o.organization_id) then raise exception 'commercial_access_denied' using errcode='42501';end if;
 select * into q from public.quote_requests where opportunity_id=o.id order by created_at desc limit 1;select public_code into tk from public.tickets where request_id=q.id order by created_at desc limit 1;cfg=private.commercial_effective(o.organization_id,o.service_id,case when q.state='quoted' then 'quote_followup' when q.state='draft' then 'abandoned' when q.state='approved' then 'approval_followup' else 'first_contact' end);
 return jsonb_build_object('code',p_code,'organization_id',o.organization_id,'company',(select name from public.organizations where id=o.organization_id),'timezone',(select timezone from public.organizations where id=o.organization_id),'state',o.commercial_state,'revision',o.commercial_revision,'criterion',coalesce(o.commercial_conversion_criterion,cfg->>'conversion_criterion'),'loss_reason',o.commercial_loss_reason,'converted_at',o.commercial_converted_at,'last_contact',o.commercial_last_contact_at,
 'customer',(select name from public.customers where id=o.customer_id),'contact',case when (private.commercial_contact_ok(o.id)and public.company_attendant_permission(o.organization_id,'whatsapp')) then(select whatsapp from public.customers where id=o.customer_id) end,'contact_allowed',(private.commercial_contact_ok(o.id)and public.company_attendant_permission(o.organization_id,'whatsapp')),'request',q.public_code,'request_state',q.state,'ticket',tk,'can_operate',private.commercial_can_operate(o.organization_id),'admin',private.company_can_manage(o.organization_id),'me',auth.uid(),'config',cfg,
 'service',coalesce((select x->>'name' from public.consumer_publications p cross join lateral jsonb_array_elements(p.payload->'services') x where p.id=q.publication_id and x->>'code'=q.service_code),'Serviço'),
 'source',coalesce((select source from public.opportunity_context where opportunity_id=o.id),'direct'),'value',(select total_cents from public.quote_versions where request_id=q.id order by version desc limit 1),
 'tasks',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('assignee_name',(select display_name from public.profiles where id=t.assignee_id),'assignee_eligible',private.commercial_can_operate(o.organization_id,t.assignee_id)) order by t.created_at desc) from public.commercial_tasks t where opportunity_id=o.id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(jsonb_build_object('event',e.event,'state',e.state,'reason',e.reason,'at',e.created_at,'actor',p.display_name) order by e.event_sequence) from public.commercial_events e left join public.profiles p on p.id=e.actor_id where opportunity_id=o.id),'[]'::jsonb),
 'attempts',coalesce((select jsonb_agg(jsonb_build_object('outcome',a.outcome,'note',a.note,'next_due_at',a.next_due_at,'at',a.created_at,'actor',p.display_name) order by a.created_at) from public.commercial_attempts a join public.commercial_tasks t on t.id=a.task_id left join public.profiles p on p.id=a.actor_id where t.opportunity_id=o.id),'[]'::jsonb),
 'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name)) from public.profiles p where private.commercial_can_operate(o.organization_id,p.id) and private.central_eligible(o.organization_id,p.id)),'[]'::jsonb),
 'loss_reasons',coalesce((select to_jsonb(loss_reasons) from public.commercial_settings where organization_id=o.organization_id),'[]'::jsonb));end;$function$;

CREATE OR REPLACE FUNCTION private.v029_analytics_company(p_org uuid, p_from date, p_to date, p_service uuid DEFAULT NULL::uuid, p_source text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb;b jsonb;count_ bigint;
begin
 if not private.company_can_manage(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 r=public.analytics_company_before_operations(p_org,p_from,p_to,p_service,p_source);b=r->'period';
 select count(distinct q.id) into count_ from public.request_events e join public.quote_requests q on q.id=e.request_id left join public.opportunity_context oc on oc.opportunity_id=q.opportunity_id
 where e.organization_id=p_org and e.event='service_completed' and e.created_at>=(b->>'from')::timestamptz and e.created_at<(b->>'until')::timestamptz and(p_service is null or q.service_id=p_service) and(p_source is null or coalesce(oc.source,'unknown')=p_source);
 return r||jsonb_build_object('execution',jsonb_build_object('completed',count_,'basis','completion_events_in_period','revenue_cents',null));
end;$function$;

do $$declare r record;begin for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'and(p.proname like 'execution_%'or p.proname like 'syzia_%'or p.proname like 'v041_%'or p.proname like 'quote_explanation_%')loop execute format('revoke all on function %s from public,anon,authenticated',r.signature);end loop;end;$$;

notify pgrst,'reload schema';commit;

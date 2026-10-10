begin;
-- Incremental correction of 026. Historical migrations remain unchanged.
-- A retained identifier lets append-only audit rows survive deletion of an empty organization.
create table private.organization_retention (
 id uuid primary key, created_at timestamptz not null default clock_timestamp(),
 deleted_at timestamptz, deleted_by uuid references public.profiles(id)
);
insert into private.organization_retention(id,created_at) select id,created_at from public.organizations;
create function private.organization_retain() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into private.organization_retention(id,created_at) values(new.id,new.created_at);return new;end;$$;
create trigger organization_retain before insert on public.organizations for each row execute function private.organization_retain();
alter table public.audit_logs drop constraint audit_logs_organization_id_fkey;
alter table public.audit_logs add constraint audit_logs_organization_id_fkey foreign key(organization_id) references private.organization_retention(id) on delete restrict;
create table private.organization_creation_requests (
 actor_id uuid not null references public.profiles(id), request_key uuid not null,
 organization_id uuid not null references private.organization_retention(id), name text not null, slug text not null,
 primary key(actor_id,request_key)
);
create table private.access_deliveries (
 account_id uuid primary key references private.enterprise_accounts(id), attempt_id uuid not null,
 state text not null check(state in ('sending','accepted','failed')), code text,
 attempted_at timestamptz not null default clock_timestamp(), accepted_at timestamptz,
 window_at timestamptz not null default clock_timestamp(), window_attempts int not null default 1
);
do $$declare n text;begin
 foreach n in array array['organization_retention','organization_creation_requests','access_deliveries'] loop
 execute format('alter table private.%I enable row level security',n);
 execute format('alter table private.%I force row level security',n);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);
 end loop;end;$$;

create function public.access_create_organization(p_name text,p_slug text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.organization_creation_requests;o uuid;begin
 perform private.lock_authorize('global');
 select * into r from private.organization_creation_requests where actor_id=auth.uid() and request_key=p_key;
 if r.organization_id is not null then
 if r.name<>btrim(p_name) or r.slug<>p_slug then raise exception 'idempotency_conflict';end if;
 if not exists(select 1 from public.organizations where id=r.organization_id) then raise exception 'organization_deleted';end if;
 o=r.organization_id;
 else
 insert into public.organizations(name,slug) values(btrim(p_name),p_slug) returning id into o;
 update private.enterprise_codes set legal_required=true where organization_id=o;
 insert into private.organization_creation_requests values(auth.uid(),p_key,o,btrim(p_name),p_slug);
 perform private.access_audit(o,auth.uid(),'organization_prepared',o);
 end if;
 return jsonb_build_object('organization_id',o,'company_name',(select name from public.organizations where id=o),
 'company_code',(select code from private.enterprise_codes where organization_id=o),'state','awaiting_admin');end;$$;

create function public.access_organizations() returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.lock_authorize('global');
 return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'slug',o.slug,'status',o.status,'company_code',c.code,
 'setup_state',case
 when exists(select 1 from private.enterprise_accounts a where a.organization_id=o.id and a.role='admin_empresa' and a.state in ('reserved','changing','uncertain')) then 'incomplete'
 when exists(select 1 from private.enterprise_accounts a where a.organization_id=o.id and a.role='admin_empresa' and a.state='pending') then 'pending_activation'
 when exists(select 1 from public.organization_members m where m.organization_id=o.id and m.role='admin_empresa' and m.status='active') then case when private.legal_ready(o.id) then 'ready' else 'pending_legal' end
 else 'awaiting_admin' end,
 'subscription',(select jsonb_build_object('status',s.state,'trial_used',s.trial_used) from public.billing_subscriptions s where s.organization_id=o.id)) order by o.name)
 from public.organizations o join private.enterprise_codes c on c.organization_id=o.id),'[]'::jsonb);end;$$;

-- Preserve 026 reservation/idempotency, adding an active-organization precondition.
alter function public.access_reserve(uuid,text,text,text,text,text,text,text,uuid,uuid) rename to access_reserve_026;
create function public.access_reserve(p_org uuid,p_name text,p_slug text,p_display text,p_username text,p_email text,p_phone text,p_role text,p_key uuid,p_existing uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.lock_authorize(case when p_org is null then 'global' else 'org' end,p_org);
 if p_org is not null and not exists(select 1 from public.organizations where id=p_org and status='active') then raise exception 'access_denied';end if;
 return public.access_reserve_026(p_org,p_name,p_slug,p_display,p_username,p_email,p_phone,p_role,p_key,p_existing);end;$$;
revoke all on function public.access_reserve_026(uuid,text,text,text,text,text,text,text,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.access_reserve(uuid,text,text,text,text,text,text,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.access_reserve(uuid,text,text,text,text,text,text,text,uuid,uuid) to authenticated;

-- Explicit endpoint for the global page; tenant-scoped RLS history remains separate.
create function public.foundation_global_audit() returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.lock_authorize('global');
 return coalesce((select jsonb_agg(to_jsonb(a)) from (select * from public.audit_logs order by created_at desc,id desc limit 100) a),'[]'::jsonb);end;$$;

-- Fail closed on every current or future tenant table. No cascades, no identity deletion.
create function private.organization_delete_blocked(p_org uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare t record;found_rows boolean;begin
 for t in select n.nspname,c.relname,a.attname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
 where n.nspname in ('public','private') and c.relkind='r' and a.attname='organization_id' and a.atttypid='uuid'::regtype
 and not (n.nspname='public' and c.relname='audit_logs')
 and not (n.nspname='private' and c.relname in ('enterprise_codes','organization_creation_requests')) loop
 execute format('select exists(select 1 from %I.%I where %I=$1)',t.nspname,t.relname,t.attname) into found_rows using p_org;
 if found_rows then return true;end if;end loop;
 -- Creation/status audit is retained. Any business/access history makes deletion ineligible.
 return exists(select 1 from public.audit_logs where organization_id=p_org and not (
 entity_table='organizations' and action in ('insert','update') or
 entity_table='enterprise_access' and action in ('organization_prepared','organization_deletion_denied')));
 end;$$;
create function public.access_delete_organization(p_org uuid,p_confirmation text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.organizations;begin
 perform private.lock_authorize('global');select * into o from public.organizations where id=p_org for update;
 if o.id is null then raise exception 'organization_not_found';end if;
 if p_confirmation is distinct from o.name then raise exception 'organization_confirmation_required';end if;
 if private.organization_delete_blocked(p_org) then
 perform private.access_audit(p_org,auth.uid(),'organization_deletion_denied',p_org);
 return jsonb_build_object('deleted',false,'reason','organization_history_requires_preservation');end if;
 delete from private.enterprise_codes where organization_id=p_org;
 update private.organization_retention set deleted_at=clock_timestamp(),deleted_by=auth.uid() where id=p_org;
 delete from public.organizations where id=p_org;
 perform private.access_audit(p_org,auth.uid(),'organization_deleted',p_org);
 return jsonb_build_object('deleted',true);end;$$;

-- Suspension revokes existing enterprise sessions permanently; reactivation needs a fresh login.
create function private.organization_revoke_sessions() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='suspended' and old.status is distinct from new.status then
 update private.enterprise_sessions set revoked=true where organization_id=new.id;end if;return new;end;$$;
create trigger organization_revoke_sessions after update of status on public.organizations for each row execute function private.organization_revoke_sessions();

-- Sender receives only the current generation. No plaintext secret is stored in SQL.
create function public.access_delivery_prepare(p_id uuid,p_actor uuid,p_hash text,p_rotate boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.enterprise_accounts;d private.access_deliveries;result jsonb;attempt uuid=gen_random_uuid();begin
 perform pg_advisory_xact_lock(734921501);select * into a from private.enterprise_accounts where id=p_id for update;
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
 end;$$;
create function public.access_delivery_finish(p_id uuid,p_attempt uuid,p_result text) returns boolean language plpgsql security definer set search_path='' as $$declare updated boolean;begin
 if p_result not in ('accepted','email_not_configured','email_delivery_failed','email_rate_limited','email_temporary_failure') then raise exception 'access_invalid';end if;
 update private.access_deliveries set state=case when p_result='accepted' then 'accepted' else 'failed' end,code=p_result,
 accepted_at=case when p_result='accepted' then clock_timestamp() else accepted_at end
 where account_id=p_id and attempt_id=p_attempt and state='sending';updated=found;
 if updated then perform private.access_audit((select organization_id from private.enterprise_accounts where id=p_id),null,'access_delivery_'||p_result,p_id);end if;
 return updated;end;$$;
-- Preserve the original authorized team projection, extending only delivery metadata.
alter function public.access_team(uuid) rename to access_team_026;
create function public.access_team(p_org uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 result=public.access_team_026(p_org);
 return result||jsonb_build_object('accounts',coalesce((select jsonb_agg(x||jsonb_build_object('delivery',
 (select jsonb_build_object('state',d.state,'code',d.code,'attempted_at',d.attempted_at,'accepted_at',d.accepted_at) from private.access_deliveries d where d.account_id=(x->>'id')::uuid))) from jsonb_array_elements(result->'accounts') x),'[]'::jsonb));end;$$;
revoke all on function public.access_team_026(uuid) from public,anon,authenticated,service_role;
revoke all on function private.organization_retain(),private.organization_delete_blocked(uuid),private.organization_revoke_sessions() from public,anon,authenticated,service_role;
revoke all on function public.access_create_organization(text,text,uuid),public.access_organizations(),public.foundation_global_audit(),public.access_delete_organization(uuid,text),public.access_team(uuid),public.access_delivery_prepare(uuid,uuid,text,boolean),public.access_delivery_finish(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.access_create_organization(text,text,uuid),public.access_organizations(),public.foundation_global_audit(),public.access_delete_organization(uuid,text),public.access_team(uuid) to authenticated;
grant execute on function public.access_delivery_prepare(uuid,uuid,text,boolean),public.access_delivery_finish(uuid,uuid,text) to service_role;
commit;

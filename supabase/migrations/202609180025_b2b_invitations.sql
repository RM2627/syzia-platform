begin;
-- Additive B2B access. An invitation ID is a locator, NEVER an authentication credential.
alter table public.organizations add column activated_at timestamptz;
update public.organizations o set activated_at=o.created_at where exists(select 1 from public.organization_members m where m.organization_id=o.id and m.role='admin_empresa');
create table public.organization_invitations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 invited_by uuid not null references public.profiles(id), name text not null check(length(btrim(name)) between 2 and 120),
 email text not null check(email=lower(btrim(email)) and length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 role text not null check(role in ('admin_empresa','colaborador_empresa','own_attendant')),
 state text not null default 'pending' check(state in ('pending','accepted','revoked')),
 request_key uuid not null, expires_at timestamptz not null default (now()+interval '7 days'),
 accepted_by uuid references public.profiles(id), accepted_at timestamptz,
 delivery_state text not null default 'not_sent' check(delivery_state in ('not_sent','sending','sent','failed')),
 delivery_lease uuid, delivery_at timestamptz, delivery_attempts integer not null default 0 check(delivery_attempts between 0 and 5),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(invited_by,request_key), check((state='accepted')=(accepted_by is not null and accepted_at is not null))
);
create unique index invitation_pending_email on public.organization_invitations(organization_id,email) where state='pending';
alter table public.organization_invitations enable row level security;
alter table public.organization_invitations force row level security;
revoke all on public.organization_invitations from public,anon,authenticated,service_role;
grant select on public.organization_invitations to authenticated;
create policy invitation_managers_read on public.organization_invitations for select to authenticated using(private.has_global_role('super_admin') or private.is_org_admin(organization_id));
create trigger invitation_updated before update on public.organization_invitations for each row execute function private.set_updated_at();
create function private.invitation_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.audit_logs(organization_id,actor_id,action,entity_table,entity_key,changed_fields)
 values(new.organization_id,auth.uid(),case when tg_op='INSERT' then 'invitation_created' else 'invitation_updated' end,'organization_invitations',jsonb_build_object('id',new.id),case when tg_op='INSERT' then array['role','state'] else array['state','delivery_state'] end);return new;end;$$;
create trigger invitation_audit after insert or update on public.organization_invitations for each row execute function private.invitation_audit();
create function private.inviter_eligible(p_org uuid,p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id join public.organizations o on o.id=p_org where p.id=p_actor and p.status='active' and o.status='active' and not u.is_anonymous and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()) and (
 exists(select 1 from public.platform_roles r where r.user_id=p_actor and r.role='super_admin' and r.active) or exists(select 1 from public.organization_members m where m.organization_id=p_org and m.user_id=p_actor and m.role='admin_empresa' and m.status='active')));
$$;
create function public.foundation_invite(p_org uuid,p_name text,p_email text,p_role text,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare prior public.organization_invitations;id_ uuid;begin
 perform private.lock_authorize('org',p_org);
 if not private.inviter_eligible(p_org,auth.uid()) then raise exception 'access_denied' using errcode='42501';end if;
 if p_key is null or p_name is null or p_email is null or p_role is null then raise exception 'invitation_invalid' using errcode='22023';end if;
 select * into prior from public.organization_invitations where invited_by=auth.uid() and request_key=p_key;
 if prior.id is not null then
 if prior.organization_id<>p_org or prior.name<>btrim(p_name) or prior.email<>lower(btrim(p_email)) or prior.role<>p_role then raise exception 'idempotency_conflict' using errcode='22023';end if;return prior.id;end if;
 if exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id where m.organization_id=p_org and lower(u.email)=lower(btrim(p_email))) then raise exception 'invitation_member_exists' using errcode='22023';end if;
 update public.organization_invitations set state='revoked' where organization_id=p_org and email=lower(btrim(p_email)) and state='pending' and expires_at<=now();
 if (select count(*) from public.organization_invitations where organization_id=p_org and state='pending' and expires_at>now())>=50 then raise exception 'invitation_limit' using errcode='23514';end if;
 insert into public.organization_invitations(organization_id,invited_by,name,email,role,request_key) values(p_org,auth.uid(),btrim(p_name),lower(btrim(p_email)),p_role,p_key) returning id into id_;return id_;
end;$$;
create function public.foundation_provision_organization(p_name text,p_slug text,p_admin_name text,p_email text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;inv uuid;prior public.organization_invitations;begin
 perform private.lock_authorize('global');
 select * into prior from public.organization_invitations where invited_by=auth.uid() and request_key=p_key;
 if prior.id is not null then
 if prior.name<>btrim(p_admin_name) or prior.email<>lower(btrim(p_email)) or not exists(select 1 from public.organizations where id=prior.organization_id and name=btrim(p_name) and slug=p_slug) then raise exception 'idempotency_conflict' using errcode='22023';end if;
 return jsonb_build_object('organization_id',prior.organization_id,'invitation_id',prior.id);end if;
 insert into public.organizations(name,slug) values(btrim(p_name),p_slug) returning id into org;
 inv=public.foundation_invite(org,p_admin_name,p_email,'admin_empresa',p_key);
 return jsonb_build_object('organization_id',org,'invitation_id',inv);
end;$$;
create function public.foundation_revoke_invitation(p_invite uuid) returns void language plpgsql security definer set search_path='' as $$
declare i public.organization_invitations;begin
 perform pg_advisory_xact_lock(734921501);select * into i from public.organization_invitations where id=p_invite for update;
 perform private.lock_authorize('org',i.organization_id);
 if i.id is null or i.state<>'pending' then raise exception 'invitation_unavailable' using errcode='22023';end if;
 update public.organization_invitations set state='revoked',delivery_lease=null where id=i.id;
end;$$;
create function public.foundation_accept_invitation(p_invite uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.organization_invitations;mail text;begin
 perform pg_advisory_xact_lock(734921501);perform private.require_eligible_user(auth.uid());
 select lower(email) into mail from auth.users where id=auth.uid();
 select * into i from public.organization_invitations where id=p_invite for update;
 if i.id is null or mail is null or mail<>i.email or not private.inviter_eligible(i.organization_id,i.invited_by) then raise exception 'invitation_unavailable' using errcode='42501';end if;
 if i.state='accepted' and i.accepted_by=auth.uid() then return i.organization_id;end if;
 if i.state<>'pending' or i.expires_at<=now() then raise exception 'invitation_unavailable' using errcode='42501';end if;
 -- Never overwrite or reactivate an existing membership through an old/new invitation.
 if exists(select 1 from public.organization_members where organization_id=i.organization_id and user_id=auth.uid()) then raise exception 'invitation_member_exists' using errcode='42501';end if;
 insert into public.organization_members(organization_id,user_id,role,is_attendant) values(i.organization_id,auth.uid(),case when i.role='admin_empresa' then 'admin_empresa'::public.member_role else 'colaborador_empresa'::public.member_role end,i.role='own_attendant');
 update public.profiles set display_name=i.name where id=auth.uid() and display_name='';
 update public.organization_invitations set state='accepted',accepted_by=auth.uid(),accepted_at=clock_timestamp(),delivery_lease=null where id=i.id;
 if i.role='admin_empresa' then update public.organizations set activated_at=coalesce(activated_at,clock_timestamp()) where id=i.organization_id;end if;
 -- Trial is not granted here. Existing eligibility and explicit trial commands remain authoritative.
 return i.organization_id;
end;$$;
create function public.foundation_claim_invitation_delivery(p_invite uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.organization_invitations;lease_ uuid=gen_random_uuid();begin
 perform pg_advisory_xact_lock(734921501);select * into i from public.organization_invitations where id=p_invite for update;
 if i.id is null or i.state<>'pending' or i.expires_at<=now() or not private.inviter_eligible(i.organization_id,p_actor) or not private.inviter_eligible(i.organization_id,i.invited_by) then raise exception 'invitation_unavailable' using errcode='42501';end if;
 if i.delivery_attempts>=5 or i.delivery_at>now()-interval '1 minute' then raise exception 'invitation_rate_limit' using errcode='23514';end if;
 update public.organization_invitations set delivery_state='sending',delivery_lease=lease_,delivery_at=clock_timestamp(),delivery_attempts=delivery_attempts+1 where id=i.id;
 return jsonb_build_object('id',i.id,'email',i.email,'name',i.name,'lease',lease_);
end;$$;
create function public.foundation_finish_invitation_delivery(p_invite uuid,p_lease uuid,p_sent boolean) returns void language plpgsql security definer set search_path='' as $$
begin update public.organization_invitations set delivery_state=case when p_sent then 'sent' else 'failed' end,delivery_lease=null where id=p_invite and state='pending' and delivery_lease=p_lease;
 if not found then raise exception 'invitation_delivery_conflict' using errcode='40001';end if;end;$$;
revoke all on function private.inviter_eligible(uuid,uuid),private.invitation_audit() from public,anon,authenticated,service_role;
revoke all on function public.foundation_invite(uuid,text,text,text,uuid),public.foundation_provision_organization(text,text,text,text,uuid),public.foundation_revoke_invitation(uuid),public.foundation_accept_invitation(uuid),public.foundation_claim_invitation_delivery(uuid,uuid),public.foundation_finish_invitation_delivery(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.foundation_invite(uuid,text,text,text,uuid),public.foundation_provision_organization(text,text,text,text,uuid),public.foundation_revoke_invitation(uuid),public.foundation_accept_invitation(uuid) to authenticated;
grant execute on function public.foundation_claim_invitation_delivery(uuid,uuid),public.foundation_finish_invitation_delivery(uuid,uuid,boolean) to service_role;
-- Existing-user provisioning also activates on the first active administrator.
create function private.activate_organization_membership() returns trigger language plpgsql security definer set search_path='' as $$
begin if new.role='admin_empresa' and new.status='active' then
 update public.organizations set activated_at=coalesce(activated_at,clock_timestamp()) where id=new.organization_id and activated_at is null;
end if;return new;end;$$;
create trigger organization_first_admin after insert or update on public.organization_members for each row execute function private.activate_organization_membership();
revoke all on function private.activate_organization_membership() from public,anon,authenticated,service_role;
commit;

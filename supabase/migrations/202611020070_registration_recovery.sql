-- Registration recovery only. No financial objects, historical edits or public grants.
begin;
create table private.registration_activation_contexts (
 invite_id uuid primary key references private.commercial_invites(id),
 email_hash text not null check(email_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp()
);
alter table private.registration_activation_contexts enable row level security;
alter table private.registration_activation_contexts force row level security;
revoke all on private.registration_activation_contexts from public,anon,authenticated,service_role;

-- A return hint, never an identity/ownership grant. Only the backend may remember it.
create function public.access_activation_remember(p_hash text,p_email text) returns void
language plpgsql security definer set search_path='' as $$
declare i private.commercial_invites; d private.commercial_demos; h text;
begin
 perform pg_advisory_xact_lock(734921554);
 h=encode(extensions.digest(lower(btrim(p_email)),'sha256'),'hex');
 select * into i from private.commercial_invites where token_hash=p_hash and purpose='activation';
 select * into d from private.commercial_demos where id=i.demo_id;
 if i.id is null or i.revoked_at is not null or i.expires_at<=clock_timestamp()
 or d.state<>'available' or d.generation<>i.generation or d.expires_at<=clock_timestamp()
 or not exists(select 1 from private.commercial_versions where id=i.version_id and demo_id=i.demo_id)
 or h is distinct from i.email_hash
 or not exists(select 1 from private.acquisition_leads where id=i.lead_id and encode(extensions.digest(lower(btrim(email)),'sha256'),'hex')=h)
 then raise exception 'registration_invitation_invalid';end if;
 insert into private.registration_activation_contexts(invite_id,email_hash) values(i.id,h) on conflict do nothing;
end;$$;
revoke all on function public.access_activation_remember(text,text) from public,anon,authenticated,service_role;
grant execute on function public.access_activation_remember(text,text) to service_role;

create function public.access_registration_profile(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u auth.users; a private.enterprise_accounts; n text; un text;
begin
 perform private.require_eligible_user(p_user);
 select * into u from auth.users where id=p_user;
 select * into a from private.enterprise_accounts where user_id=p_user and organization_id is null and state='active';
 n=coalesce(nullif(btrim(a.display_name),''),nullif(btrim(u.raw_user_meta_data->>'display_name'),''),
 (select nullif(btrim(display_name),'') from public.profiles where id=p_user),'');
 un=coalesce(a.username,u.raw_user_meta_data->>'syzia_username','');
 return jsonb_build_object('name',left(n,120),'username',left(un,61),
 'missing_name',length(n)<3 or length(n)>120,
 'missing_username',un !~ '^[a-z][a-z0-9]{1,29}[.][a-z0-9][a-z0-9.]{0,29}$' or un like '%..%' or right(un,1)='.');
end;$$;
revoke all on function public.access_registration_profile(uuid) from public,anon,authenticated,service_role;
grant execute on function public.access_registration_profile(uuid) to service_role;

create function public.commercial_activation_pending() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u auth.users;
begin
 if private.is_active_user() is not true then raise exception 'access_denied' using errcode='42501';end if;
 select * into u from auth.users where id=auth.uid();
 if u.email_confirmed_at is null or u.is_anonymous is true then raise exception 'commercial_email_confirmation_required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'company',d.name) order by r.created_at,i.id)
 from private.registration_activation_contexts r
 join private.commercial_invites i on i.id=r.invite_id
 join private.commercial_demos d on d.id=i.demo_id
 join private.acquisition_leads l on l.id=i.lead_id
 where r.email_hash=encode(extensions.digest(lower(btrim(u.email)),'sha256'),'hex')
 and i.email_hash=r.email_hash and encode(extensions.digest(lower(btrim(l.email)),'sha256'),'hex')=r.email_hash
 and i.purpose='activation' and i.revoked_at is null and i.expires_at>clock_timestamp()
 and d.state='available' and d.generation=i.generation and d.expires_at>clock_timestamp()
 and (i.claimed_by is null or i.claimed_by=u.id)
 and not exists(select 1 from private.commercial_claims q where q.invite_id=i.id and q.state='rejected')),'[]');
end;$$;
create function public.commercial_activation_resume(p_invite uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i private.commercial_invites; q jsonb;
begin
 perform pg_advisory_xact_lock(734921554);
 if not exists(select 1 from jsonb_array_elements(public.commercial_activation_pending()) x where x->>'id'=p_invite::text)
 then raise exception 'commercial_invite_invalid';end if;
 select * into i from private.commercial_invites where id=p_invite;
 -- Existing RPC checks current recipient, session, revocation, version and concurrency again.
 q=public.commercial_claim_request(i.token_hash,null);
 return public.commercial_claim_context((q->>'id')::uuid);
end;$$;
revoke all on function public.commercial_activation_pending(),public.commercial_activation_resume(uuid) from public,anon,authenticated,service_role;
grant execute on function public.commercial_activation_pending(),public.commercial_activation_resume(uuid) to authenticated;
commit;

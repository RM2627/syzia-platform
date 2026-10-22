-- 057: invitation authorizes this recipient to prepare a NEW organization.
-- No financial confirmation, entitlement or trial is created by this migration.
begin;
alter table private.commercial_claims add column authorization_method text not null default 'manual_review'
 check(authorization_method in('manual_review','verified_invitation'));
alter table private.commercial_claims add column recipient_verified_at timestamptz;
alter table private.commercial_claims alter column statement drop not null;
alter table private.commercial_claims add constraint commercial_claim_statement_source
 check(statement is not null or (authorization_method='verified_invitation' and recipient_verified_at is not null));

create function private.commercial_activation_identity(p_invite uuid) returns void
language plpgsql stable security definer set search_path='' as $$
declare i private.commercial_invites; u auth.users; current_email text;
begin
 if auth.uid() is null then raise exception 'session_required' using errcode='42501'; end if;
 select * into u from auth.users where id=auth.uid();
 if u.id is null or u.is_anonymous is true or u.email_confirmed_at is null or nullif(btrim(u.email),'') is null
 then raise exception 'commercial_email_confirmation_required' using errcode='42501'; end if;
 if private.is_active_user() is not true then raise exception 'access_denied' using errcode='42501'; end if;
 select * into i from private.commercial_invites where id=p_invite and purpose='activation';
 select email into current_email from private.acquisition_leads where id=i.lead_id;
 if i.id is null or i.email_hash is distinct from encode(extensions.digest(lower(btrim(u.email)),'sha256'),'hex')
 or i.email_hash is distinct from encode(extensions.digest(lower(btrim(current_email)),'sha256'),'hex')
 then raise exception 'commercial_recipient_mismatch' using errcode='42501'; end if;
end;$$;
revoke all on function private.commercial_activation_identity(uuid) from public,anon,authenticated,service_role;

-- Keep the existing RPC signature for compatible clients. No statement is required
-- or fabricated. Existing statements and decisions remain historical records.
create or replace function public.commercial_claim_request(p_hash text,p_statement text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i private.commercial_invites; d private.commercial_demos; q private.commercial_claims; v private.commercial_versions;
begin
 if auth.uid() is null then raise exception 'session_required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(734921554);
 select * into i from private.commercial_invites where token_hash=p_hash and purpose='activation' for update;
 select * into d from private.commercial_demos where id=i.demo_id;
 select * into v from private.commercial_versions where id=i.version_id and demo_id=i.demo_id;
 if i.id is null or v.id is null or i.revoked_at is not null or i.expires_at<=clock_timestamp()
 or d.state<>'available' or d.generation<>i.generation or d.expires_at<=clock_timestamp()
 then raise exception 'commercial_invite_invalid'; end if;
 perform private.commercial_activation_identity(i.id);
 if i.claimed_by is not null and i.claimed_by<>auth.uid() then raise exception 'commercial_claim_conflict'; end if;
 if exists(select 1 from private.commercial_claims q2 join private.commercial_invites i2 on i2.id=q2.invite_id
 where q2.demo_id=d.id and i2.lead_id=i.lead_id and q2.organization_id is not null and q2.invite_id<>i.id)
 then raise exception 'commercial_already_activated'; end if;
 select * into q from private.commercial_claims where invite_id=i.id for update;
 if q.id is not null and q.user_id<>auth.uid() then raise exception 'commercial_claim_conflict'; end if;
 -- A prior explicit rejection is never silently overturned by reopening the link.
 if q.state='rejected' then raise exception 'commercial_activation_rejected'; end if;
 if q.id is null then
  update private.commercial_invites set claimed_by=auth.uid() where id=i.id;
  insert into private.commercial_claims(invite_id,demo_id,user_id,snapshot_hash,statement,state,version_id,lead_id,authorization_method,recipient_verified_at)
  values(i.id,d.id,auth.uid(),v.snapshot_hash,null,'approved',v.id,i.lead_id,'verified_invitation',clock_timestamp()) returning * into q;
  perform private.access_audit(null,auth.uid(),'commercial_invitation_verified',q.id);
  update private.commercial_contacts set stage='registration_started',revision=revision+1 where lead_id=i.lead_id;
 elsif q.state='requested' then
  if q.version_id is distinct from v.id or q.snapshot_hash is distinct from v.snapshot_hash then raise exception 'commercial_review_stale'; end if;
  update private.commercial_claims set state='approved',authorization_method='verified_invitation',recipient_verified_at=clock_timestamp(),lead_id=i.lead_id
  where id=q.id returning * into q;
  perform private.access_audit(null,auth.uid(),'commercial_invitation_verified',q.id);
 end if;
 return jsonb_build_object('id',q.id,'state',q.state);
end;$$;

-- Reuse the entire existing context and completion contracts. Private predecessors
-- cannot be invoked directly through PostgREST or by authenticated/service roles.
alter function public.commercial_claim_context(uuid) rename to commercial_claim_context_pre057;
revoke all on function public.commercial_claim_context_pre057(uuid) from public,anon,authenticated,service_role;
create function public.commercial_claim_context(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q private.commercial_claims; r jsonb;
begin
 select * into q from private.commercial_claims where id=p_id and user_id=auth.uid();
 if q.id is null or private.is_active_user() is not true then raise exception 'access_denied' using errcode='42501'; end if;
 if q.organization_id is null then perform private.commercial_activation_identity(q.invite_id); end if;
 r=public.commercial_claim_context_pre057(p_id);
 return r||jsonb_build_object('authorization_method',q.authorization_method);
end;$$;

alter function public.commercial_claim_complete(uuid,text,uuid,integer,boolean,text,boolean) rename to commercial_claim_complete_pre057;
revoke all on function public.commercial_claim_complete_pre057(uuid,text,uuid,integer,boolean,text,boolean) from public,anon,authenticated,service_role;
create function public.commercial_claim_complete(p_id uuid,p_snapshot text,p_draft uuid,p_revision integer,p_consent boolean,p_conditions text,p_reviewed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q private.commercial_claims;
begin
 if private.is_active_user() is not true then raise exception 'access_denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(734921501); perform pg_advisory_xact_lock(734921554);
 select * into q from private.commercial_claims where id=p_id and user_id=auth.uid() for update;
 if q.id is null then raise exception 'access_denied' using errcode='42501'; end if;
 if q.organization_id is null then perform private.commercial_activation_identity(q.invite_id); end if;
 return public.commercial_claim_complete_pre057(p_id,p_snapshot,p_draft,p_revision,p_consent,p_conditions,p_reviewed);
end;$$;
revoke all on function public.commercial_claim_request(text,text),public.commercial_claim_context(uuid),public.commercial_claim_complete(uuid,text,uuid,integer,boolean,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.commercial_claim_request(text,text),public.commercial_claim_context(uuid),public.commercial_claim_complete(uuid,text,uuid,integer,boolean,text,boolean) to authenticated;
-- Existing automatic recovery failed with 42702: alias b collided with PL/pgSQL variable b.
-- Only the pending-query alias changes; financial checks/import behavior are identical.
create or replace function public.commercial_materialization_service(p_action text,p_org uuid default null,p_assets jsonb default '{}')returns jsonb language plpgsql security definer set search_path=''as $$
declare m private.commercial_materializations;q private.commercial_claims;v private.commercial_versions;b private.billing047_contracts;cfg jsonb;media jsonb;paths jsonb='{}';path_ text;ext text;begin
 if p_action='pending'then
  return coalesce((select jsonb_agg(jsonb_build_object('organization_id',x.organization_id))from private.commercial_materializations x join private.billing047_contracts confirmed_contract on confirmed_contract.organization_id=x.organization_id and confirmed_contract.current where x.state='pending'and confirmed_contract.provider_id is not null and confirmed_contract.state in('trialing','active')),'[]');
 end if;
 if p_action not in('context','complete')or p_org is null then raise exception 'commercial_invalid';end if;
 perform pg_advisory_xact_lock(734921501);perform pg_advisory_xact_lock(734921554);
 select *into m from private.commercial_materializations where organization_id=p_org for update;
 if m.organization_id is null then return jsonb_build_object('pending',false);end if;
 if m.state='done'then return jsonb_build_object('pending',false,'reused',true);end if;
 select *into q from private.commercial_claims where id=m.claim_id;
 select *into v from private.commercial_versions where id=m.version_id and demo_id=q.demo_id;
 select *into b from private.billing047_contracts where organization_id=p_org and current;
 if v.id is null or q.state<>'prepared'or q.organization_id<>p_org or q.snapshot_hash<>v.snapshot_hash then raise exception 'commercial_configuration_invalid';end if;
 if b.id is null or b.provider_id is null or b.state not in('trialing','active')or not private.entitlement(p_org,'software')then return jsonb_build_object('pending',true,'financial_confirmation_required',true);end if;
 perform private.commercial_plan_validate(v.configuration,b.plan_version_id);
 -- The same global lock used by company commands prevents a concurrent edit
 -- between this comparison and the transactional import. Never overwrite a
 -- configuration the owner changed while financial confirmation was pending.
 if private.commercial_config_export(p_org)is distinct from m.destination_configuration then raise exception 'commercial_destination_changed';end if;
 if p_action='context'then return jsonb_build_object('pending',true,'ready',true,'organization_id',p_org,'claim_id',q.id,'demo_id',q.demo_id,'version_id',v.id,'configuration',v.configuration);end if;
 cfg=v.configuration;
 for media in select value from jsonb_array_elements(coalesce(cfg->'tables'->'company_media','[]'))loop
  ext=case media->>'mime'when'image/jpeg'then'jpg'when'image/png'then'png'when'image/webp'then'webp'end;
  path_=p_org::text||'/commercial/'||q.id::text||'/'||(media->>'sha256')||'.'||ext;
  if ext is null or p_assets->>(media->>'id')is distinct from path_ then raise exception 'commercial_media_invalid';end if;
  paths=paths||jsonb_build_object(media->>'id',path_);
 end loop;
 if p_assets is distinct from paths then raise exception 'commercial_media_invalid';end if;
 if cfg->'tables'?'company_media'then
  cfg=jsonb_set(cfg,'{tables,company_media}',coalesce((select jsonb_agg(x||jsonb_build_object('object_path',paths->>(x->>'id')))from jsonb_array_elements(cfg->'tables'->'company_media')x),'[]'));
 end if;
 -- One PostgreSQL transaction imports the approved configuration or rolls it all back.
 perform private.commercial_config_apply(p_org,cfg,q.user_id);
 update private.commercial_materializations set state='done',asset_paths=paths,plan_version_id=b.plan_version_id,finished_at=clock_timestamp()where organization_id=p_org;
 update private.commercial_claims set state='materialized'where id=q.id;
 insert into private.commercial_preparation_events(demo_id,actor_id,event,version_id)values(q.demo_id,q.user_id,'materialized',v.id);
 perform private.access_audit(p_org,q.user_id,'commercial_configuration_imported',q.id);
 return jsonb_build_object('pending',false,'activated',true);
end;$$;
commit;

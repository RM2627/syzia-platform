-- Catalog presentation and explicit recipient-free activation. No provider writes.
begin;
set local lock_timeout='5s';
select pg_advisory_xact_lock(734921501);
select pg_advisory_xact_lock(734921554);

alter table public.billing_plans add column catalog_revision integer not null default 1;
-- Publish the approved commercial product; availability/financial switches remain unchanged.
update public.billing_plans p set active=true,site_visible=true,self_service=true,self_service_trial=true
where exists(select 1 from private.billing069_offers o join public.billing_plan_versions v on v.id=o.plan_version_id where v.plan_id=p.id);

create function private.billing071_catalog(p_all boolean default false) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',p.id,'code',o.code,'product_name','SYZIA Completa','name',p.name,'description',p.description,
 'modality',case o.code when 'monthly' then 'Mensal' when 'semiannual' then 'Semestral' else 'Anual' end,
 'provider','stripe','version_id',v.id,'version',to_jsonb(v),'price_cents',o.amount_cents,'interval_months',o.months,
 'member_limit',v.member_limit,'service_limit',v.service_limit,'request_limit',v.request_limit,
 'capabilities',v.capabilities,'active',p.active,'site_visible',p.site_visible,'available',p.available,
 'self_service',p.self_service,'trial_eligible',p.self_service_trial,'catalog_revision',p.catalog_revision,
 'featured',p.featured,'featured_label',p.featured_label,
 'saving_cents',monthly.amount_cents*o.months-o.amount_cents,
 'discount_percent',round(100.0*(monthly.amount_cents*o.months-o.amount_cents)/(monthly.amount_cents*o.months),2),
 'checkout_available',p.active and p.site_visible and p.available and p.self_service and r.checkout_mode='stripe' and r.confirmation_enabled
  and exists(select 1 from private.billing069_mappings m where m.environment=r.environment and m.code=o.code)
 )order by o.months),'[]'::jsonb)
 from private.billing069_offers o join public.billing_plan_versions v on v.id=o.plan_version_id
 join public.billing_plans p on p.id=v.plan_id cross join private.billing069_runtime r
 cross join private.billing069_offers monthly
 where monthly.code='monthly' and (p_all or(p.active and p.site_visible));
$$;
create or replace function public.acquisition_plans() returns jsonb language sql stable security definer set search_path='' as $$select private.billing071_catalog(false);$$;
create function public.commercial_catalog_admin() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if private.people_root(auth.uid()) is not true or private.is_active_user() is not true then raise exception 'access_denied' using errcode='42501';end if;
 return private.billing071_catalog(true);
end;$$;
create function public.commercial_catalog_save(p_id uuid,p_revision integer,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$begin
 if private.people_root(auth.uid()) is not true or private.is_active_user() is not true then raise exception 'access_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(734921501);
 perform private.company_keys(p_data,array['description','active','site_visible','available']);
 if jsonb_typeof(p_data) is distinct from 'object' or jsonb_typeof(p_data->'description') is distinct from 'string' or length(p_data->>'description')>2000
 or jsonb_typeof(p_data->'active') is distinct from 'boolean' or jsonb_typeof(p_data->'site_visible') is distinct from 'boolean' or jsonb_typeof(p_data->'available') is distinct from 'boolean'
 then raise exception 'billing_payload_invalid';end if;
 update public.billing_plans p set description=p_data->>'description',active=(p_data->>'active')::boolean,
 site_visible=(p_data->>'site_visible')::boolean,available=(p_data->>'available')::boolean,catalog_revision=catalog_revision+1
 where p.id=p_id and p.catalog_revision=p_revision and exists(select 1 from private.billing069_offers o join public.billing_plan_versions v on v.id=o.plan_version_id where v.plan_id=p.id);
 if not found then raise exception 'billing_revision_conflict' using errcode='40001';end if;
 perform private.access_audit(null,auth.uid(),'commercial_catalog_updated',p_id);
end;$$;
-- The former general editor must not create divergent financial versions for mapped Stripe offers.
alter function public.billing_plan_save(uuid,integer,jsonb) rename to billing_plan_save_pre071;
revoke all on function public.billing_plan_save_pre071(uuid,integer,jsonb) from public,anon,authenticated,service_role;
create function public.billing_plan_save(p_id uuid,p_revision integer,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$begin
 perform private.lock_authorize('global');
 if exists(select 1 from private.billing069_offers o join public.billing_plan_versions v on v.id=o.plan_version_id where v.plan_id=p_id)then raise exception 'billing_catalog_managed';end if;
 return public.billing_plan_save_pre071(p_id,p_revision,p_data);
end;$$;
alter function public.billing069_context(uuid) rename to billing069_context_pre071;
revoke all on function public.billing069_context_pre071(uuid) from public,anon,authenticated,service_role;
create function public.billing069_context(p_org uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;begin
 r=public.billing069_context_pre071(p_org); -- Preserves permission, contract and historical provider selection.
 return r||jsonb_build_object('catalog',public.acquisition_plans());
end;$$;
alter function public.billing069_prepare(uuid,text,uuid,boolean,boolean) rename to billing069_prepare_pre071;
revoke all on function public.billing069_prepare_pre071(uuid,text,uuid,boolean,boolean) from public,anon,authenticated,service_role;
create function public.billing069_prepare(p_org uuid,p_offer text,p_key uuid,p_trial boolean,p_accepted boolean) returns uuid language plpgsql security definer set search_path='' as $$begin
 perform private.permission_require(p_org,'billing.manage');perform private.company_lock(p_org);perform pg_advisory_xact_lock(734921501);
 -- Existing operations remain governed by their frozen contract, even if an offer is later hidden.
 if not exists(select 1 from private.billing047_contracts where organization_id=p_org and current)
 and not exists(select 1 from jsonb_array_elements(public.acquisition_plans()) x where x->>'code'=p_offer and (x->>'checkout_available')::boolean)
 then raise exception 'billing_checkout_disabled';end if;
 return public.billing069_prepare_pre071(p_org,p_offer,p_key,p_trial,p_accepted);
end;$$;

-- Replace only the catalog lookup in the existing draft engine, retaining identity/document/idempotency rules.
do $$declare d text;old_ text=$q$select pv.*into v from public.billing_plan_versions pv join public.billing_plans p on p.id=pv.plan_id and p.revision=pv.version where p.id=p_plan and p.active and p.available and p.site_visible and p.self_service;$q$;begin
 d=pg_get_functiondef('public.selfservice_save(uuid,integer,text,text,text,text,text,uuid,uuid)'::regprocedure);
 if position(old_ in d)=0 then raise exception 'catalog071_predecessor_mismatch';end if;
 execute replace(d,old_,$q$select pv.*into v from public.billing_plan_versions pv where exists(select 1 from jsonb_array_elements(public.acquisition_plans()) x where (x->>'id')::uuid=p_plan and (x->>'version_id')::uuid=pv.id and (x->>'self_service')::boolean);$q$);
end;$$;
-- Reuse pending-organization creation, never the old mock/free-trial path for Stripe.
do $$declare d text;begin
 d=pg_get_functiondef('public.selfservice_complete(uuid,integer,boolean,text)'::regprocedure);
 if position('perform private.billing047_offer(d.plan_version_id);' in d)=0 or position('p_conditions<>''billing-047''' in d)=0 then raise exception 'catalog071_predecessor_mismatch';end if;
 d=replace(d,'if(select mock_enabled from private.billing_runtime)then', $q$if(select mock_enabled from private.billing_runtime) and not exists(select 1 from private.selfservice_drafts sd join private.billing069_offers o on o.plan_version_id=sd.plan_version_id where sd.id=p_id)then$q$);
 d=replace(d,'p_conditions<>''billing-047''',$q$p_conditions<>(case when exists(select 1 from private.billing069_offers where plan_version_id=d.plan_version_id) then 'stripe-completa-1' else 'billing-047' end) $q$);
 d=replace(d,'perform private.billing047_offer(d.plan_version_id);',$q$if exists(select 1 from private.billing069_offers where plan_version_id=d.plan_version_id)then
 if not exists(select 1 from jsonb_array_elements(public.acquisition_plans()) x where (x->>'version_id')::uuid=d.plan_version_id and (x->>'checkout_available')::boolean)then raise exception 'billing_checkout_disabled';end if;
 else perform private.billing047_offer(d.plan_version_id);end if;$q$);
 execute d;
end;$$;

-- Only explicitly issued activation invitations may collect a recipient later.
alter table private.commercial_invites add column recipient_mode text not null default 'email'
 check(recipient_mode in('email','confirmed_signup') and(recipient_mode='email' or purpose='activation'));
create table private.registration071_candidates(
 invite_id uuid not null references private.commercial_invites(id),email_hash text not null check(email_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),primary key(invite_id,email_hash)
);
alter table private.registration071_candidates enable row level security;
alter table private.registration071_candidates force row level security;
revoke all on private.registration071_candidates from public,anon,authenticated,service_role;
-- Existing links are never broadened, including recipient-free demonstration links.
alter function public.commercial_invite_for_contact(uuid,uuid,text,uuid,text,timestamptz) rename to commercial_invite_for_contact_pre071;
revoke all on function public.commercial_invite_for_contact_pre071(uuid,uuid,text,uuid,text,timestamptz) from public,anon,authenticated,service_role;
create function public.commercial_invite_for_contact(p_demo uuid,p_lead uuid,p_purpose text,p_id uuid,p_hash text,p_expires timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.commercial_demos;l private.acquisition_leads;begin
 perform pg_advisory_xact_lock(734921554);
 d=private.commercial_demo_require(p_demo,'commercial.manage');perform private.commercial_require('commercial.manage',p_lead);
 select * into l from private.acquisition_leads where id=p_lead;
 if p_purpose is distinct from 'activation' or nullif(btrim(l.email),'') is not null then return public.commercial_invite_for_contact_pre071(p_demo,p_lead,p_purpose,p_id,p_hash,p_expires);end if;
 if d.state<>'available' or d.published_version_id is null or d.expires_at<=clock_timestamp() or p_expires is null or p_expires<=clock_timestamp() or p_expires>d.expires_at or p_expires>clock_timestamp()+interval '30 days' then raise exception 'commercial_expired';end if;
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_id is null then raise exception 'commercial_invalid';end if;
 if not exists(select 1 from private.commercial_demo_contacts where demo_id=d.id and lead_id=p_lead)then raise exception 'commercial_contact_not_linked';end if;
 if not exists(select 1 from private.commercial_contacts where lead_id=p_lead and stage in('wants_trial','activation_sent','registration_started'))then raise exception 'commercial_interest_required';end if;
 if exists(select 1 from private.commercial_claims where demo_id=d.id and lead_id=p_lead and organization_id is not null)then raise exception 'commercial_already_activated';end if;
 insert into private.commercial_invites(id,lead_id,demo_id,purpose,token_hash,generation,email_hash,expires_at,created_by,version_id,recipient_mode)
 values(p_id,p_lead,d.id,'activation',p_hash,d.generation,null,p_expires,auth.uid(),d.published_version_id,'confirmed_signup');
 insert into private.commercial_contact_events(lead_id,actor_id,event,detail)values(p_lead,auth.uid(),'link_issued','Ativação individual: destinatário será vinculado após confirmação da identidade.');
 return jsonb_build_object('id',p_id,'lead_id',p_lead,'demo_id',d.id,'slug',d.slug,'company',d.name,'expires_at',p_expires,'purpose','activation','recipient_mode','confirmed_signup');
end;$$;
alter function public.access_activation_remember(text,text) rename to access_activation_remember_pre071;
revoke all on function public.access_activation_remember_pre071(text,text) from public,anon,authenticated,service_role;
create function public.access_activation_remember(p_hash text,p_email text) returns void language plpgsql security definer set search_path='' as $$
declare i private.commercial_invites;d private.commercial_demos;h text;current_email text;begin
 perform pg_advisory_xact_lock(734921554);
 select * into i from private.commercial_invites where token_hash=p_hash and purpose='activation';
 if i.recipient_mode is distinct from 'confirmed_signup' then perform public.access_activation_remember_pre071(p_hash,p_email);return;end if;
 select * into d from private.commercial_demos where id=i.demo_id;
 select email into current_email from private.acquisition_leads where id=i.lead_id;
 h=encode(extensions.digest(lower(btrim(p_email)),'sha256'),'hex');
 if i.id is null or i.revoked_at is not null or i.expires_at<=clock_timestamp() or d.state<>'available' or d.generation<>i.generation or d.expires_at<=clock_timestamp()
 or not exists(select 1 from private.commercial_versions where id=i.version_id and demo_id=i.demo_id)
 or p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or(i.email_hash is not null and i.email_hash<>h) or(current_email is not null and encode(extensions.digest(lower(btrim(current_email)),'sha256'),'hex')<>h)
 then raise exception 'registration_invitation_invalid';end if;
 -- An unverified address is just a return candidate: cannot claim, reserve or exclude another address.
 insert into private.registration071_candidates(invite_id,email_hash) values(i.id,h) on conflict do nothing;
end;$$;
alter function private.commercial_activation_identity(uuid) rename to commercial_activation_identity_pre071;
create function private.commercial_activation_identity(p_invite uuid) returns void language plpgsql security definer set search_path='' as $$
declare i private.commercial_invites;u auth.users;h text;current_email text;begin
 perform pg_advisory_xact_lock(734921554);
 select * into i from private.commercial_invites where id=p_invite and purpose='activation' for update;
 if i.recipient_mode is distinct from 'confirmed_signup' then perform private.commercial_activation_identity_pre071(p_invite);return;end if;
 select * into u from auth.users where id=auth.uid();
 if private.is_active_user() is not true then raise exception 'access_denied' using errcode='42501';end if;
 if u.id is null or u.is_anonymous is true or u.email_confirmed_at is null or nullif(btrim(u.email),'') is null then raise exception 'commercial_email_confirmation_required';end if;
 h=encode(extensions.digest(lower(btrim(u.email)),'sha256'),'hex');
 select email into current_email from private.acquisition_leads where id=i.lead_id;
 if(i.email_hash is not null and i.email_hash<>h) or(i.claimed_by is not null and i.claimed_by<>u.id)
 or(current_email is not null and encode(extensions.digest(lower(btrim(current_email)),'sha256'),'hex')<>h)
 then raise exception 'commercial_recipient_mismatch' using errcode='42501';end if;
 if i.email_hash is null then
 update private.commercial_invites set email_hash=h,claimed_by=u.id where id=i.id;
 perform private.access_audit(null,u.id,'activation_recipient_confirmed',i.id);
 end if;
end;$$;
create or replace function public.commercial_activation_pending() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u auth.users;h text;begin
 if private.is_active_user() is not true then raise exception 'access_denied' using errcode='42501';end if;
 select * into u from auth.users where id=auth.uid();
 if u.email_confirmed_at is null or u.is_anonymous is true then raise exception 'commercial_email_confirmation_required' using errcode='42501';end if;
 h=encode(extensions.digest(lower(btrim(u.email)),'sha256'),'hex');
 return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'company',d.name) order by i.created_at,i.id)
 from private.commercial_invites i join private.commercial_demos d on d.id=i.demo_id join private.acquisition_leads l on l.id=i.lead_id
 where i.purpose='activation' and i.revoked_at is null and i.expires_at>clock_timestamp() and d.state='available' and d.generation=i.generation and d.expires_at>clock_timestamp()
 and(i.claimed_by is null or i.claimed_by=u.id) and not exists(select 1 from private.commercial_claims q where q.invite_id=i.id and q.state='rejected')
 and((i.recipient_mode='email' and i.email_hash=h and encode(extensions.digest(lower(btrim(l.email)),'sha256'),'hex')=h and exists(select 1 from private.registration_activation_contexts r where r.invite_id=i.id and r.email_hash=h))
 or(i.recipient_mode='confirmed_signup' and(i.email_hash is null or i.email_hash=h) and(l.email is null or encode(extensions.digest(lower(btrim(l.email)),'sha256'),'hex')=h)
 and exists(select 1 from private.registration071_candidates r where r.invite_id=i.id and r.email_hash=h)))),'[]');
end;$$;

-- Safe invitation metadata only; previous visitor/session rules are retained.
alter function public.commercial_service(text,jsonb) rename to commercial_service_pre071;
revoke all on function public.commercial_service_pre071(text,jsonb) from public,anon,authenticated,service_role;
create function public.commercial_service(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;begin
 r=public.commercial_service_pre071(p_action,p_data);
 if p_action='invite' then r=r||jsonb_build_object('recipient_mode',(select recipient_mode from private.commercial_invites where id=(r->>'id')::uuid));end if;
 return r;
end;$$;
revoke all on function public.commercial_service(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.commercial_service(text,jsonb) to service_role;

revoke all on function private.billing071_catalog(boolean),private.commercial_activation_identity(uuid),private.commercial_activation_identity_pre071(uuid) from public,anon,authenticated,service_role;
revoke all on function public.commercial_catalog_admin(),public.commercial_catalog_save(uuid,integer,jsonb),public.billing_plan_save(uuid,integer,jsonb),public.billing069_context(uuid),public.billing069_prepare(uuid,text,uuid,boolean,boolean),public.commercial_invite_for_contact(uuid,uuid,text,uuid,text,timestamptz),public.access_activation_remember(text,text) from public,anon,authenticated,service_role;
grant execute on function public.commercial_catalog_admin(),public.commercial_catalog_save(uuid,integer,jsonb),public.billing_plan_save(uuid,integer,jsonb),public.billing069_context(uuid),public.billing069_prepare(uuid,text,uuid,boolean,boolean),public.commercial_invite_for_contact(uuid,uuid,text,uuid,text,timestamptz) to authenticated;
grant execute on function public.access_activation_remember(text,text),public.acquisition_plans() to service_role;
commit;

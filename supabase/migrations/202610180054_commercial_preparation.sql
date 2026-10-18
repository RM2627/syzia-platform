-- Commercial 054. Upgrade creates no tenant or financial entitlement automatically.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

alter table private.people_grants drop constraint people_grants_permissions_check;
alter table private.people_grants add constraint people_grants_permissions_check check(permissions <@ array['people.read','companies.read','shared.attend','acquisition.read','acquisition.manage','commercial.read','commercial.manage','commercial.send']::text[]);
-- An optional WhatsApp must not be represented by an invented number.
alter table private.acquisition_leads alter column phone drop not null;
create table private.commercial_contacts(
 lead_id uuid primary key references private.acquisition_leads(id),
 owner_id uuid not null references public.profiles(id),
 segment text not null default '' check(length(segment)<=120),
 instagram text not null default '' check(instagram='' or instagram~'^@[A-Za-z0-9._]{1,30}$'),
 first_contact date not null default current_date,
 stage text not null default 'prospect' check(stage in('prospect','contacted','interested','preparing','demo_sent','demo_accessed','wants_trial','activation_sent','registration_started','trialing','paying','not_interested','archived')),
 notes text not null default '' check(length(notes)<=4000),
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default clock_timestamp()
);
create table private.commercial_contact_events(
 id uuid primary key default gen_random_uuid(),lead_id uuid not null references private.acquisition_leads(id),actor_id uuid references public.profiles(id),
 event text not null check(event in('created','updated','assigned','contact','response','authorization','suppressed','demo_prepared','demo_revised','link_issued','link_revoked','mail_queued','mail_accepted','mail_failed','mail_uncertain','mail_cancelled','demo_accessed')),
 detail text not null default '' check(length(detail)<=1000),created_at timestamptz not null default clock_timestamp()
);
create table private.commercial_authorizations(
 lead_id uuid not null references private.acquisition_leads(id),purpose text not null check(purpose in('demonstration','activation')),
 authorized boolean not null,notice_version text not null check(length(notice_version)between 1 and 80),
 evidence text not null check(length(btrim(evidence))between 10 and 500),expires_at timestamptz not null,actor_id uuid not null references public.profiles(id),updated_at timestamptz not null default clock_timestamp(),primary key(lead_id,purpose)
);
create table private.commercial_authorization_history(
 id uuid primary key default gen_random_uuid(),lead_id uuid not null references private.acquisition_leads(id),purpose text not null,
 email_hash text not null,authorized boolean not null,notice_version text not null,evidence text not null,expires_at timestamptz not null,
 actor_id uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp()
);
create table private.commercial_suppressions(
 email_hash text primary key,created_at timestamptz not null default clock_timestamp(),actor_id uuid references public.profiles(id)
);
create table private.commercial_commands(request_key uuid primary key,actor_id uuid not null references public.profiles(id),payload_hash text not null check(payload_hash~'^[0-9a-f]{64}$'),lead_id uuid not null references private.acquisition_leads(id));
create function private.commercial_allowed(p_action text)returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_user() and (private.people_root(auth.uid()) or
 (exists(select 1 from private.enterprise_accounts where user_id=auth.uid() and organization_id is null and role='syzia_staff' and state='active') and private.people_can(p_action)));
$$;
create function private.commercial_require(p_action text,p_lead uuid default null)returns void language plpgsql security definer set search_path='' as $$begin
 if not private.commercial_allowed(p_action) then raise exception 'access_denied' using errcode='42501';end if;
 if p_lead is not null and not exists(select 1 from private.commercial_contacts where lead_id=p_lead and(owner_id=auth.uid()or private.people_root(auth.uid())))then raise exception 'access_denied'using errcode='42501';end if;
end;$$;
create function public.commercial_contact_save(p_id uuid,p_revision integer,p_key uuid,p_data jsonb)returns jsonb language plpgsql security definer set search_path=''as $$
declare id_ uuid;c private.commercial_contacts;l private.acquisition_leads;stage_ text;owner_ uuid;prior_ private.commercial_commands;payload_ jsonb;begin
 perform private.commercial_require('commercial.manage');perform pg_advisory_xact_lock(734921554);
 if p_key is null or p_data is null or jsonb_typeof(p_data)<>'object' or (p_data-array['name','company','phone','email','segment','instagram','first_contact','stage','notes','owner_id'])<>'{}'::jsonb then raise exception 'commercial_invalid';end if;
 payload_=jsonb_build_object('id',p_id,'revision',p_revision,'data',p_data);
 select *into prior_ from private.commercial_commands where request_key=p_key;
 if prior_.request_key is not null then
 if prior_.actor_id is distinct from auth.uid()or prior_.payload_hash is distinct from encode(extensions.digest(payload_::text,'sha256'),'hex') then raise exception 'idempotency_conflict';end if;
 perform private.commercial_require('commercial.manage',prior_.lead_id);return jsonb_build_object('id',prior_.lead_id,'reused',true);end if;
 stage_=coalesce(p_data->>'stage',(select stage from private.commercial_contacts where lead_id=p_id),'prospect');
 if stage_ not in('prospect','contacted','interested','preparing','wants_trial','not_interested','archived')and(p_id is null or p_data->>'stage'is not null)then raise exception 'commercial_event_required';end if;
 if length(coalesce(p_data->>'name',''))not between 2 and 120 or length(coalesce(p_data->>'company',''))not between 2 and 160 or coalesce(p_data->>'email','')!~'^[^[:space:]@<>,;:()\[\]\\"]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then raise exception 'commercial_invalid';end if;
 owner_=coalesce((p_data->>'owner_id')::uuid,(select owner_id from private.commercial_contacts where lead_id=p_id),auth.uid());
 if owner_<>auth.uid() and not private.people_root(auth.uid())then raise exception 'access_denied'using errcode='42501';end if;
 if not private.people_root(owner_) and not exists(select 1 from private.enterprise_accounts where user_id=owner_ and organization_id is null and role='syzia_staff'and state='active')then raise exception 'commercial_owner_invalid';end if;
 if p_id is null then
  select *into l from private.acquisition_leads where request_key=p_key;
  if l.id is not null then
   perform private.commercial_require('commercial.manage',l.id);
   if l.name is distinct from btrim(p_data->>'name') or l.company is distinct from btrim(p_data->>'company') or l.email is distinct from lower(btrim(p_data->>'email'))then raise exception 'idempotency_conflict';end if;
   return jsonb_build_object('id',l.id,'reused',true);
  end if;
  insert into private.acquisition_leads(request_key,name,company,phone,email,interest)values(p_key,btrim(p_data->>'name'),btrim(p_data->>'company'),nullif(btrim(p_data->>'phone'),''),lower(btrim(p_data->>'email')),'Contato comercial SYZIA')returning id into id_;
  insert into private.commercial_contacts(lead_id,owner_id)values(id_,owner_);
 else
  id_=p_id;perform private.commercial_require('commercial.manage',id_);
  select *into c from private.commercial_contacts where lead_id=id_ for update;
  if c.revision is distinct from p_revision then raise exception 'commercial_revision_conflict'using errcode='40001';end if;
  -- Changing a destination does not carry authorization from the old recipient.
  if exists(select 1 from private.acquisition_leads where id=id_ and email<>lower(btrim(p_data->>'email')))then delete from private.commercial_authorizations where lead_id=id_;end if;
  update private.acquisition_leads set name=btrim(p_data->>'name'),company=btrim(p_data->>'company'),phone=nullif(btrim(p_data->>'phone'),''),email=lower(btrim(p_data->>'email')),revision=revision+1 where id=id_;
 end if;
 update private.commercial_contacts set owner_id=owner_,segment=coalesce(p_data->>'segment',''),instagram=coalesce(p_data->>'instagram',''),first_contact=coalesce((p_data->>'first_contact')::date,current_date),stage=stage_,notes=coalesce(p_data->>'notes',''),revision=case when p_id is null then 1 else revision+1 end,updated_at=clock_timestamp()where lead_id=id_;
 insert into private.commercial_commands values(p_key,auth.uid(),encode(extensions.digest(payload_::text,'sha256'),'hex'),id_);
 insert into private.commercial_contact_events(lead_id,actor_id,event)values(id_,auth.uid(),case when p_id is null then 'created'else 'updated'end);
 return jsonb_build_object('id',id_,'reused',false);
end;$$;
-- Adoption preserves the existing public lead instead of duplicating it.
create function public.commercial_contact_adopt(p_id uuid)returns void language plpgsql security definer set search_path=''as $$begin
 perform private.commercial_require('commercial.manage');
 if not private.people_root(auth.uid())then raise exception 'access_denied'using errcode='42501';end if;
 insert into private.commercial_contacts(lead_id,owner_id,stage)select id,auth.uid(),case state when 'contacted'then 'contacted'when 'qualified'then 'interested'when 'closed'then 'archived'else 'prospect'end from private.acquisition_leads where id=p_id on conflict(lead_id)do nothing;
end;$$;
create function public.commercial_contact_note(p_id uuid,p_event text,p_detail text)returns void language plpgsql security definer set search_path=''as $$begin
 perform private.commercial_require('commercial.manage',p_id);
 if p_event not in('contact','response')or length(btrim(p_detail))not between 1 and 1000 then raise exception 'commercial_invalid';end if;
 insert into private.commercial_contact_events(lead_id,actor_id,event,detail)values(p_id,auth.uid(),p_event,btrim(p_detail));
end;$$;
create function public.commercial_contact_authorize(p_id uuid,p_purpose text,p_authorized boolean,p_notice text,p_evidence text,p_expires timestamptz)returns void language plpgsql security definer set search_path=''as $$begin
 perform private.commercial_require('commercial.manage',p_id);
 if p_expires<=clock_timestamp()or p_authorized is null then raise exception 'commercial_invalid';end if;
 insert into private.commercial_authorization_history(lead_id,purpose,email_hash,authorized,notice_version,evidence,expires_at,actor_id)select p_id,p_purpose,encode(extensions.digest(lower(email),'sha256'),'hex'),p_authorized,p_notice,p_evidence,p_expires,auth.uid()from private.acquisition_leads where id=p_id;
 insert into private.commercial_authorizations values(p_id,p_purpose,p_authorized,p_notice,p_evidence,p_expires,auth.uid(),clock_timestamp())on conflict(lead_id,purpose)do update set authorized=excluded.authorized,notice_version=excluded.notice_version,evidence=excluded.evidence,expires_at=excluded.expires_at,actor_id=excluded.actor_id,updated_at=excluded.updated_at;
 insert into private.commercial_contact_events(lead_id,actor_id,event)values(p_id,auth.uid(),'authorization');
end;$$;
create function public.commercial_contact_suppress(p_id uuid)returns void language plpgsql security definer set search_path=''as $$begin
 perform private.commercial_require('commercial.manage',p_id);
 insert into private.commercial_suppressions(email_hash,actor_id)select encode(extensions.digest(lower(email),'sha256'),'hex'),auth.uid()from private.acquisition_leads where id=p_id on conflict do nothing;
 update private.commercial_authorizations set authorized=false,updated_at=clock_timestamp()where lead_id=p_id;
 insert into private.commercial_contact_events(lead_id,actor_id,event)values(p_id,auth.uid(),'suppressed');
end;$$;
create function public.commercial_context()returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 perform private.commercial_require('commercial.read');
 return jsonb_build_object('can_manage',private.commercial_allowed('commercial.manage'),'can_send',private.commercial_allowed('commercial.send'),'is_root',private.people_root(auth.uid()),
 'contacts',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('id',l.id,'name',l.name,'company',l.company,'phone',l.phone,'email',l.email,'suppressed',exists(select 1 from private.commercial_suppressions s where s.email_hash=encode(extensions.digest(lower(l.email),'sha256'),'hex')),'authorizations',coalesce((select jsonb_agg(to_jsonb(a)-'actor_id')from private.commercial_authorizations a where a.lead_id=l.id),'[]'))order by c.updated_at desc)from private.commercial_contacts c join private.acquisition_leads l on l.id=c.lead_id where c.owner_id=auth.uid()or private.people_root(auth.uid())),'[]'),
 'unassigned',case when private.people_root(auth.uid())then coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'company',l.company))from private.acquisition_leads l where not exists(select 1 from private.commercial_contacts c where c.lead_id=l.id)),'[]')else'[]'::jsonb end);
end;$$;
create function public.commercial_contact_history(p_id uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 perform private.commercial_require('commercial.read',p_id);
 return coalesce((select jsonb_agg(to_jsonb(e)order by e.created_at desc,e.id)from private.commercial_contact_events e where lead_id=p_id),'[]');
end;$$;

-- Layout choice is part of the existing draft / review / publish contract.
create table private.company_page_templates(organization_id uuid primary key references public.organizations(id),template text not null check(template in('current','modern','minimal','catalog')),revision integer not null default 1);
create function public.company_page_template_set(p_org uuid,p_template text,p_revision integer)returns void language plpgsql security definer set search_path=''as $$declare current_ integer;begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'page.manage');
 select revision into current_ from private.company_page_templates where organization_id=p_org;
 if coalesce(current_,0)is distinct from p_revision then raise exception 'page_draft_changed'using errcode='40001';end if;
 insert into private.company_page_templates values(p_org,p_template,1)on conflict(organization_id)do update set template=excluded.template,revision=company_page_templates.revision+1;
end;$$;
alter function public.consumer_page_draft(uuid,boolean)rename to consumer_page_draft_pre054;
revoke all on function public.consumer_page_draft_pre054(uuid,boolean)from public,anon,authenticated,service_role;
create function public.consumer_page_draft(p_org uuid,p_show_prices boolean default true)returns jsonb language plpgsql stable security definer set search_path=''as $$declare d jsonb;t private.company_page_templates;begin
 d=public.consumer_page_draft_pre054(p_org,p_show_prices);
 select *into t from private.company_page_templates where organization_id=p_org;
 d=jsonb_set(d,'{preview,template}',to_jsonb(coalesce(t.template,'current')));
 d=d||jsonb_build_object('template_revision',coalesce(t.revision,0),'changed',(d->'published_payload') is distinct from((d->'preview')-'revision'-'booking_policy'));
 -- Preserve every predecessor check, extending the revision token with the layout selection.
 return jsonb_set(d,'{token}',to_jsonb(encode(extensions.digest((d->>'token')||':'||coalesce(t.template,'current')||':'||coalesce(t.revision,0)::text,'sha256'),'hex')));
end;$$;

alter function public.consumer_public_page(text)rename to consumer_public_page_pre054;
revoke all on function public.consumer_public_page_pre054(text)from public,anon,authenticated,service_role;
create function public.consumer_public_page(p_slug text)returns jsonb language plpgsql stable security definer set search_path=''as $$declare d jsonb;t text;begin
 d=public.consumer_public_page_pre054(p_slug);if d is null then return null;end if;
 select pub.payload->>'template'into t from public.organizations o join public.consumer_pages p on p.organization_id=o.id join public.consumer_publications pub on pub.id=p.publication_id and pub.organization_id=o.id where o.slug=p_slug;
 return d||jsonb_build_object('template',coalesce(t,'current'));
end;$$;
revoke all on function public.consumer_public_page(text)from public,anon,authenticated,service_role;
grant execute on function public.consumer_public_page(text)to anon,authenticated;

do $$declare n text;begin foreach n in array array['commercial_contacts','commercial_contact_events','commercial_authorizations','commercial_suppressions','commercial_authorization_history','commercial_commands','company_page_templates']loop
 execute format('alter table private.%I enable row level security',n);execute format('alter table private.%I force row level security',n);execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);
end loop;end;$$;
revoke all on function private.commercial_allowed(text),private.commercial_require(text,uuid)from public,anon,authenticated,service_role;
revoke all on function public.commercial_contact_save(uuid,integer,uuid,jsonb),public.commercial_contact_adopt(uuid),public.commercial_contact_note(uuid,text,text),public.commercial_contact_authorize(uuid,text,boolean,text,text,timestamptz),public.commercial_contact_suppress(uuid),public.commercial_context(),public.commercial_contact_history(uuid),public.company_page_template_set(uuid,text,integer),public.consumer_page_draft(uuid,boolean)from public,anon,authenticated,service_role;
grant execute on function public.commercial_contact_save(uuid,integer,uuid,jsonb),public.commercial_contact_adopt(uuid),public.commercial_contact_note(uuid,text,text),public.commercial_contact_authorize(uuid,text,boolean,text,text,timestamptz),public.commercial_contact_suppress(uuid),public.commercial_context(),public.commercial_contact_history(uuid),public.company_page_template_set(uuid,text,integer),public.consumer_page_draft(uuid,boolean)to authenticated;
-- D01-A / D02 / D09: commercial control plane; demo operations live in a separate database.
create table private.commercial_demos(
 id uuid primary key default gen_random_uuid(),lead_id uuid not null references private.commercial_contacts(lead_id),
 name text not null check(length(btrim(name)) between 2 and 160),slug text not null unique check(slug~'^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
 plan_version_id uuid not null references public.billing_plan_versions(id),revision integer not null default 1,
 generation integer not null default 1,state text not null default 'draft'check(state in('draft','available','revoked')),
 expires_at timestamptz not null,configuration jsonb,snapshot_hash text,created_by uuid not null references public.profiles(id),request_key uuid not null unique,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create table private.commercial_invites(
 id uuid primary key,lead_id uuid not null references private.commercial_contacts(lead_id),demo_id uuid not null references private.commercial_demos(id),
 purpose text not null check(purpose in('demonstration','activation')),token_hash text not null unique check(token_hash~'^[0-9a-f]{64}$'),
 generation integer not null,email_hash text not null,expires_at timestamptz not null,revoked_at timestamptz,claimed_by uuid references public.profiles(id),
 created_by uuid not null references public.profiles(id),sealed_token text,created_at timestamptz not null default clock_timestamp()
);
create table private.commercial_claims(
 id uuid primary key default gen_random_uuid(),invite_id uuid not null unique references private.commercial_invites(id),demo_id uuid not null references private.commercial_demos(id),
 user_id uuid not null references public.profiles(id),snapshot_hash text not null,
 statement text not null check(length(btrim(statement))between 20 and 1000),state text not null default 'requested'check(state in('requested','approved','rejected','materialized')),
 reviewed_by uuid references public.profiles(id),review_note text check(length(review_note)<=1000),reviewed_at timestamptz,
 organization_id uuid unique references public.organizations(id),assets_ready boolean not null default false,created_at timestamptz not null default clock_timestamp()
);
create unique index commercial_one_materialization on private.commercial_claims(demo_id)where state='materialized';
create table private.commercial_claim_reviews(
 id uuid primary key default gen_random_uuid(),claim_id uuid not null references private.commercial_claims(id),
 actor_id uuid not null references public.profiles(id),previous_state text not null,approved boolean not null,
 note text not null check(length(btrim(note))between 20 and 1000),snapshot_hash text not null,created_at timestamptz not null default clock_timestamp()
);
create table private.commercial_deliveries(
 id uuid primary key default gen_random_uuid(),batch_key uuid not null,lead_id uuid not null references private.commercial_contacts(lead_id),invite_id uuid not null references private.commercial_invites(id),
 actor_id uuid not null references public.profiles(id),state text not null default 'queued'check(state in('queued','sending','accepted','failed','uncertain','cancelled')),
 error_code text,attempted_at timestamptz,created_at timestamptz not null default clock_timestamp(),unique(batch_key,lead_id)
);
create table private.commercial_batch_confirmations(
 id uuid primary key,actor_id uuid not null references public.profiles(id),selection_hash text not null,expires_at timestamptz not null,
 used_at timestamptz,created_at timestamptz not null default clock_timestamp()
);
-- Snapshot is a configuration graph, never an operational database dump.
create function private.commercial_config_validate(p_config jsonb)returns void language plpgsql immutable set search_path=''as $$begin
 if p_config is null or jsonb_typeof(p_config)<>'object' or p_config->>'format'is distinct from 'syzia-config-054' or
 (p_config-array['format','tables','template'])<>'{}'::jsonb or jsonb_typeof(p_config->'tables')is distinct from 'object' or
 ((p_config->'tables')-array['company_settings','business_rules','services','service_categories','service_addons','service_intake_fields','service_relations','faqs','quick_replies','company_branding','portfolio_items','schedule_resources','company_media','service_checklist_models','service_checklist_items'])<>'{}'::jsonb or
 coalesce(p_config->>'template','')not in('current','modern','minimal','catalog') or octet_length(p_config::text)>2097152 then raise exception 'commercial_configuration_invalid';end if;
end;$$;
create function private.commercial_demo_require(p_id uuid,p_action text)returns private.commercial_demos language plpgsql stable security definer set search_path=''as $$declare d private.commercial_demos;begin
 select *into d from private.commercial_demos where id=p_id;if d.id is null then raise exception 'commercial_not_found';end if;
 perform private.commercial_require(p_action,d.lead_id);return d;
end;$$;
create function public.commercial_demo_save(p_id uuid,p_revision integer,p_key uuid,p_lead uuid,p_name text,p_slug text,p_plan uuid,p_expires timestamptz)returns jsonb language plpgsql security definer set search_path=''as $$declare d private.commercial_demos;begin
 perform private.commercial_require('commercial.manage',p_lead);perform pg_advisory_xact_lock(734921554);
 if p_key is null or p_expires<=clock_timestamp()or p_expires>clock_timestamp()+interval '90 days'or p_slug in('api','admin','app','assets','health','login','entrar','cadastrar','ativar','billing')then raise exception 'commercial_invalid';end if;
 if not exists(select 1 from private.billing047_offers o join public.billing_plan_versions v on v.id=o.plan_version_id where o.plan_version_id=p_plan)then raise exception 'commercial_plan_unavailable';end if;
 if p_id is null then
 select *into d from private.commercial_demos where request_key=p_key;
 if found then if d.created_by<>auth.uid()or d.lead_id<>p_lead or d.name<>p_name or d.slug<>p_slug or d.plan_version_id<>p_plan then raise exception 'idempotency_conflict';end if;return jsonb_build_object('id',d.id,'revision',d.revision);end if;
 insert into private.commercial_demos(lead_id,name,slug,plan_version_id,expires_at,created_by,request_key)values(p_lead,p_name,p_slug,p_plan,p_expires,auth.uid(),p_key)returning *into d;
 else
 d=private.commercial_demo_require(p_id,'commercial.manage');if d.revision<>p_revision or d.lead_id<>p_lead then raise exception 'commercial_revision_conflict';end if;
 if exists(select 1 from private.commercial_claims where demo_id=d.id and state='materialized')then raise exception 'commercial_already_activated';end if;
 update private.commercial_demos set name=p_name,slug=p_slug,plan_version_id=p_plan,expires_at=p_expires,revision=revision+1,generation=generation+1,state='draft',configuration=null,snapshot_hash=null,updated_at=clock_timestamp()where id=p_id returning *into d;
 end if;
 insert into private.commercial_contact_events(lead_id,actor_id,event)values(p_lead,auth.uid(),'demo_prepared');
 return jsonb_build_object('id',d.id,'revision',d.revision);
end;$$;
create function public.commercial_demo_publish(p_id uuid,p_revision integer,p_config jsonb)returns jsonb language plpgsql security definer set search_path=''as $$declare d private.commercial_demos;h text;begin
 perform pg_advisory_xact_lock(734921554);d=private.commercial_demo_require(p_id,'commercial.manage');
 if d.revision<>p_revision then raise exception 'commercial_revision_conflict';end if;
 if d.expires_at<=clock_timestamp()then raise exception 'commercial_expired';end if;
 perform private.commercial_config_validate(p_config);h=encode(extensions.digest(p_config::text,'sha256'),'hex');
 update private.commercial_demos set configuration=p_config,snapshot_hash=h,revision=revision+1,generation=generation+1,state='available',updated_at=clock_timestamp()where id=p_id returning *into d;
 insert into private.commercial_contact_events(lead_id,actor_id,event)values(d.lead_id,auth.uid(),'demo_revised');
 return jsonb_build_object('id',d.id,'revision',d.revision,'generation',d.generation);
end;$$;
create function public.commercial_demo_revoke(p_id uuid,p_revision integer)returns void language plpgsql security definer set search_path=''as $$declare d private.commercial_demos;begin
 perform pg_advisory_xact_lock(734921554);d=private.commercial_demo_require(p_id,'commercial.manage');if d.revision<>p_revision then raise exception 'commercial_revision_conflict';end if;
 update private.commercial_demos set state='revoked',generation=generation+1,revision=revision+1 where id=p_id;
 update private.commercial_invites set revoked_at=clock_timestamp()where demo_id=p_id and revoked_at is null;
 insert into private.commercial_contact_events(lead_id,actor_id,event)values(d.lead_id,auth.uid(),'link_revoked');
end;$$;
create function public.commercial_management()returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 perform private.commercial_require('commercial.read');
 return public.commercial_context()||jsonb_build_object(
 'contacts',coalesce((select jsonb_agg(item||jsonb_build_object('display_stage',case
 when exists(select 1 from private.commercial_claims q join private.commercial_demos d on d.id=q.demo_id join private.billing047_contracts b on b.organization_id=q.organization_id where d.lead_id=(item->>'id')::uuid and q.state='materialized'and b.current and b.provider_id is not null and b.state='active'and b.paid_until>clock_timestamp())then'paying'
 when exists(select 1 from private.commercial_claims q join private.commercial_demos d on d.id=q.demo_id join private.billing047_contracts b on b.organization_id=q.organization_id where d.lead_id=(item->>'id')::uuid and q.state='materialized'and b.current and b.provider_id is not null and b.state='trialing'and b.trial_end>clock_timestamp())then'trialing'
 else item->>'stage'end))from jsonb_array_elements(public.commercial_context()->'contacts')item),'[]'),
 'demos',coalesce((select jsonb_agg(to_jsonb(d)-'configuration'-'snapshot_hash')from private.commercial_demos d join private.commercial_contacts c on c.lead_id=d.lead_id where c.owner_id=auth.uid()or private.people_root(auth.uid())),'[]'),
 'invites',coalesce((select jsonb_agg(to_jsonb(i)-'token_hash'-'email_hash'-'sealed_token')from private.commercial_invites i join private.commercial_contacts c on c.lead_id=i.lead_id where c.owner_id=auth.uid()or private.people_root(auth.uid())),'[]'),
 'deliveries',coalesce((select jsonb_agg(to_jsonb(d))from private.commercial_deliveries d join private.commercial_contacts c on c.lead_id=d.lead_id where c.owner_id=auth.uid()or private.people_root(auth.uid())),'[]'),
 'claims',coalesce((select jsonb_agg(to_jsonb(q)||jsonb_build_object('company',d.name,'responsible',(select display_name from public.profiles where id=q.user_id),'reviews',coalesce((select jsonb_agg(to_jsonb(h)order by created_at)from private.commercial_claim_reviews h where h.claim_id=q.id),'[]')))from private.commercial_claims q join private.commercial_demos d on d.id=q.demo_id join private.commercial_contacts c on c.lead_id=d.lead_id where c.owner_id=auth.uid()or private.people_root(auth.uid())),'[]'),
 'plans',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'name',p.name,'capabilities',v.capabilities,'member_limit',v.member_limit))from private.billing047_offers o join public.billing_plan_versions v on v.id=o.plan_version_id join public.billing_plans p on p.id=v.plan_id),'[]'),
 'conversions',coalesce((select jsonb_agg(jsonb_build_object('lead_id',d.lead_id,'organization_id',q.organization_id,'trialing',exists(select 1 from private.billing047_contracts b where b.organization_id=q.organization_id and b.current and b.provider_id is not null and b.state='trialing'),'paying',exists(select 1 from private.billing047_contracts b where b.organization_id=q.organization_id and b.current and b.provider_id is not null and b.state='active'and b.paid_until>clock_timestamp())))from private.commercial_claims q join private.commercial_demos d on d.id=q.demo_id join private.commercial_contacts c on c.lead_id=d.lead_id where q.state='materialized'and(c.owner_id=auth.uid()or private.people_root(auth.uid()))),'[]'));
end;$$;
create function public.commercial_demo_edit_context(p_id uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$declare d private.commercial_demos;begin
 d=private.commercial_demo_require(p_id,'commercial.manage');return to_jsonb(d)||jsonb_build_object('plan',(select to_jsonb(v) from public.billing_plan_versions v where id=d.plan_version_id));
end;$$;
create function private.commercial_mail_eligible(p_lead uuid,p_purpose text)returns boolean language sql stable security definer set search_path=''as $$
 select exists(select 1 from private.commercial_contacts c join private.acquisition_leads l on l.id=c.lead_id join private.commercial_authorizations a on a.lead_id=c.lead_id and a.purpose=p_purpose where c.lead_id=p_lead and c.stage not in('not_interested','archived')and a.authorized and a.expires_at>clock_timestamp()and not exists(select 1 from private.commercial_suppressions s where s.email_hash=encode(extensions.digest(lower(l.email),'sha256'),'hex')));
$$;
create function public.commercial_invite_prepare(p_demo uuid,p_purpose text,p_id uuid,p_hash text,p_expires timestamptz)returns jsonb language plpgsql security definer set search_path=''as $$declare d private.commercial_demos;l private.acquisition_leads;begin
 perform pg_advisory_xact_lock(734921554);d=private.commercial_demo_require(p_demo,'commercial.manage');
 if d.state<>'available'or d.expires_at<=clock_timestamp()or p_expires<=clock_timestamp()or p_expires>d.expires_at or p_expires>clock_timestamp()+interval '30 days'then raise exception 'commercial_expired';end if;
 if not private.commercial_mail_eligible(d.lead_id,p_purpose)then raise exception 'commercial_contact_not_authorized';end if;
 if p_purpose='activation'and exists(select 1 from private.commercial_claims where demo_id=d.id and state='materialized')then raise exception 'commercial_already_activated';end if;
 if p_purpose='activation'and not exists(select 1 from private.commercial_contacts where lead_id=d.lead_id and stage in('wants_trial','activation_sent','registration_started'))then raise exception 'commercial_interest_required';end if;
 select *into l from private.acquisition_leads where id=d.lead_id;
 insert into private.commercial_invites(id,lead_id,demo_id,purpose,token_hash,generation,email_hash,expires_at,created_by)values(p_id,d.lead_id,d.id,p_purpose,p_hash,d.generation,encode(extensions.digest(lower(l.email),'sha256'),'hex'),p_expires,auth.uid());
 insert into private.commercial_contact_events(lead_id,actor_id,event)values(d.lead_id,auth.uid(),'link_issued');
 return jsonb_build_object('id',p_id,'demo_id',d.id,'slug',d.slug,'company',d.name,'expires_at',p_expires,'purpose',p_purpose);
end;$$;
create function public.commercial_invite_revoke(p_id uuid)returns void language plpgsql security definer set search_path=''as $$declare i private.commercial_invites;begin
 select *into i from private.commercial_invites where id=p_id;perform private.commercial_require('commercial.manage',i.lead_id);if i.id is null then raise exception 'commercial_not_found';end if;
 update private.commercial_invites set revoked_at=clock_timestamp()where id=p_id;insert into private.commercial_contact_events(lead_id,actor_id,event)values(i.lead_id,auth.uid(),'link_revoked');
end;$$;
create function public.commercial_claim_request(p_hash text,p_statement text)returns jsonb language plpgsql security definer set search_path=''as $$declare i private.commercial_invites;d private.commercial_demos;q private.commercial_claims;begin
 if not private.is_active_user()then raise exception 'access_denied';end if;perform pg_advisory_xact_lock(734921554);
 select *into i from private.commercial_invites where token_hash=p_hash and purpose='activation'for update;select *into d from private.commercial_demos where id=i.demo_id;
 if i.id is null or i.revoked_at is not null or i.expires_at<=clock_timestamp()or d.state<>'available'or d.generation<>i.generation or d.expires_at<=clock_timestamp()then raise exception 'commercial_invite_invalid';end if;
 if i.claimed_by is not null and i.claimed_by<>auth.uid()then raise exception 'commercial_claim_conflict';end if;
 select *into q from private.commercial_claims where invite_id=i.id;
 if q.id is null then
 update private.commercial_invites set claimed_by=auth.uid()where id=i.id;
 insert into private.commercial_claims(invite_id,demo_id,user_id,snapshot_hash,statement)values(i.id,d.id,auth.uid(),d.snapshot_hash,p_statement)returning *into q;
 update private.commercial_contacts set stage='registration_started',revision=revision+1 where lead_id=i.lead_id;
 end if;
 return jsonb_build_object('id',q.id,'state',q.state);
end;$$;
create function public.commercial_claim_review(p_id uuid,p_approve boolean,p_note text)returns void language plpgsql security definer set search_path=''as $$declare q private.commercial_claims;d private.commercial_demos;begin
 if not private.is_active_user()or not private.people_root(auth.uid())then raise exception 'access_denied';end if;perform pg_advisory_xact_lock(734921554);
 select *into q from private.commercial_claims where id=p_id for update;select *into d from private.commercial_demos where id=q.demo_id;
 if q.id is null or q.state='materialized'or length(btrim(p_note))not between 20 and 1000 or p_approve is null then raise exception 'commercial_invalid';end if;
 if q.snapshot_hash is distinct from d.snapshot_hash or d.state<>'available'or d.expires_at<=clock_timestamp()or not exists(select 1 from private.commercial_invites where id=q.invite_id and revoked_at is null and expires_at>clock_timestamp()and generation=d.generation)then raise exception 'commercial_review_stale';end if;
 insert into private.commercial_claim_reviews(claim_id,actor_id,previous_state,approved,note,snapshot_hash)values(q.id,auth.uid(),q.state,p_approve,p_note,q.snapshot_hash);
 update private.commercial_claims set state=case when p_approve then 'approved'else'rejected'end,reviewed_by=auth.uid(),review_note=p_note,reviewed_at=clock_timestamp()where id=p_id;
 perform private.access_audit(null,q.user_id,'commercial_claim_reviewed',q.id);
end;$$;
create function public.commercial_claim_context(p_id uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$declare q private.commercial_claims;d private.commercial_demos;begin
 select *into q from private.commercial_claims where id=p_id and user_id=auth.uid();if not private.is_active_user()or q.id is null then raise exception 'access_denied';end if;
 select *into d from private.commercial_demos where id=q.demo_id;
 return jsonb_build_object('id',q.id,'demo_id',d.id,'state',q.state,'company',d.name,'snapshot_hash',d.snapshot_hash,'configuration',d.configuration,'organization_id',q.organization_id,'stale',q.snapshot_hash is distinct from d.snapshot_hash or d.state<>'available'or d.expires_at<=clock_timestamp()or not exists(select 1 from private.commercial_invites where id=q.invite_id and revoked_at is null and expires_at>clock_timestamp()and generation=d.generation));
end;$$;
-- Server-only resolver: no notification, request payload or email proves conversion.
create function public.commercial_service(p_action text,p_data jsonb)returns jsonb language plpgsql security definer set search_path=''as $$declare d private.commercial_demos;i private.commercial_invites;e private.commercial_deliveries;l private.acquisition_leads;begin
 if p_action='demo' then
 select *into d from private.commercial_demos where (id=(p_data->>'id')::uuid or slug=p_data->>'slug')and state='available'and expires_at>clock_timestamp();
 if d.id is null then raise exception 'commercial_demo_unavailable';end if;
 return to_jsonb(d)||jsonb_build_object('plan',(select to_jsonb(v)from public.billing_plan_versions v where id=d.plan_version_id));
 elsif p_action='invite' then
 select *into i from private.commercial_invites where token_hash=p_data->>'hash'and revoked_at is null and expires_at>clock_timestamp();select *into d from private.commercial_demos where id=i.demo_id;
 if i.id is null or d.state<>'available'or d.generation<>i.generation or d.expires_at<=clock_timestamp()then raise exception 'commercial_invite_invalid';end if;
 return jsonb_build_object('id',i.id,'demo_id',d.id,'slug',d.slug,'company',d.name,'purpose',i.purpose,'expires_at',i.expires_at);
 elsif p_action='unsubscribe' then
 select *into i from private.commercial_invites where token_hash=p_data->>'hash';if i.id is null then return '{}'::jsonb;end if;
 insert into private.commercial_suppressions(email_hash)values(i.email_hash)on conflict do nothing;return '{}'::jsonb;
 elsif p_action='invite_store' then
 if length(p_data->>'sealed')>4096 then raise exception 'commercial_invalid';end if;
 update private.commercial_invites set sealed_token=p_data->>'sealed'where id=(p_data->>'id')::uuid and sealed_token is null;return '{}'::jsonb;
 elsif p_action='mail_envelope' then
 select *into e from private.commercial_deliveries where id=(p_data->>'id')::uuid;select *into i from private.commercial_invites where id=e.invite_id;
 if e.id is null or e.state<>'queued'or i.sealed_token is null then raise exception 'commercial_delivery_unavailable';end if;return jsonb_build_object('sealed',i.sealed_token,'invite_id',i.id);
 elsif p_action='demo_accessed' then
 select *into i from private.commercial_invites where token_hash=p_data->>'hash'and purpose='demonstration'and revoked_at is null and expires_at>clock_timestamp();
 if i.id is not null then insert into private.commercial_contact_events(lead_id,event)values(i.lead_id,'demo_accessed');update private.commercial_contacts set stage='demo_accessed',revision=revision+1 where lead_id=i.lead_id and stage='demo_sent';end if;return '{}'::jsonb;
 elsif p_action='mail_begin' then
 perform pg_advisory_xact_lock(734921554);select *into e from private.commercial_deliveries where id=(p_data->>'id')::uuid for update;
 if e.id is null or e.state<>'queued'then raise exception 'commercial_delivery_unavailable';end if;
 select *into i from private.commercial_invites where id=e.invite_id;select *into d from private.commercial_demos where id=i.demo_id;select *into l from private.acquisition_leads where id=e.lead_id;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',e.actor_id,'is_anonymous',false)::text,true);
 if not private.commercial_allowed('commercial.send')or not exists(select 1 from private.commercial_contacts where lead_id=e.lead_id and(owner_id=e.actor_id or private.people_root(e.actor_id)))or not private.commercial_mail_eligible(e.lead_id,i.purpose)or i.revoked_at is not null or i.expires_at<=clock_timestamp()or d.state<>'available'or d.generation<>i.generation or i.email_hash<>encode(extensions.digest(lower(l.email),'sha256'),'hex')then update private.commercial_deliveries set state='cancelled'where id=e.id;insert into private.commercial_contact_events(lead_id,actor_id,event)values(e.lead_id,e.actor_id,'mail_cancelled');return jsonb_build_object('cancelled',true);end if;
 update private.commercial_deliveries set state='sending',attempted_at=clock_timestamp()where id=e.id;
 return jsonb_build_object('id',e.id,'email',l.email,'name',l.name,'company',d.name,'slug',d.slug,'purpose',i.purpose,'expires_at',i.expires_at);
 elsif p_action='mail_finish' then
 if p_data->>'state'not in('accepted','failed','uncertain')or coalesce(p_data->>'error','')not in('','email_not_configured','email_rate_limited','email_temporary_failure','email_delivery_failed')then raise exception 'commercial_invalid';end if;
 update private.commercial_deliveries set state=p_data->>'state',error_code=nullif(p_data->>'error','')where id=(p_data->>'id')::uuid and state in('sending','queued')returning *into e;
 if e.id is not null then
 select *into i from private.commercial_invites where id=e.invite_id;
 insert into private.commercial_contact_events(lead_id,actor_id,event)values(e.lead_id,e.actor_id,case e.state when'accepted'then'mail_accepted'when'failed'then'mail_failed'else'mail_uncertain'end);
 if e.state='accepted'then update private.commercial_contacts set stage=case i.purpose when'activation'then'activation_sent'else'demo_sent'end,revision=revision+1 where lead_id=e.lead_id and((i.purpose='demonstration'and stage in('prospect','contacted','interested','preparing','demo_sent'))or(i.purpose='activation'and stage in('wants_trial','activation_sent')));end if;end if;return '{}'::jsonb;
 elsif p_action='assets_ready' then
 update private.commercial_claims q set assets_ready=true from private.commercial_demos d where q.id=(p_data->>'claim_id')::uuid and d.id=q.demo_id and q.state='approved'and q.snapshot_hash=p_data->>'snapshot'and d.snapshot_hash=q.snapshot_hash;
 if not found then raise exception 'commercial_review_required';end if;return '{}'::jsonb;
 elsif p_action='recover_deliveries' then
 with recovered as(update private.commercial_deliveries set state='uncertain',error_code='email_temporary_failure'where state in('queued','sending')and created_at<clock_timestamp()-interval '15 minutes'returning lead_id,actor_id)insert into private.commercial_contact_events(lead_id,actor_id,event)select lead_id,actor_id,'mail_uncertain'from recovered;return '{}'::jsonb;
 else raise exception 'commercial_invalid';end if;
end;$$;
create function public.commercial_batch_confirm(p_id uuid,p_items jsonb)returns jsonb language plpgsql security definer set search_path=''as $$declare h text;begin
 perform private.commercial_require('commercial.send');if jsonb_typeof(p_items)<>'array'or jsonb_array_length(p_items)not between 1 and 100 then raise exception 'commercial_invalid';end if;
 h=encode(extensions.digest(p_items::text,'sha256'),'hex');
 insert into private.commercial_batch_confirmations values(p_id,auth.uid(),h,clock_timestamp()+interval '10 minutes',null,clock_timestamp());return jsonb_build_object('id',p_id,'hash',h);
end;$$;
create function public.commercial_batch_queue(p_id uuid,p_hash text,p_items jsonb,p_limit integer)returns jsonb language plpgsql security definer set search_path=''as $$declare b private.commercial_batch_confirmations;x jsonb;i private.commercial_invites;ids jsonb='[]';n int;begin
 perform private.commercial_require('commercial.send');perform pg_advisory_xact_lock(734921554);
 select *into b from private.commercial_batch_confirmations where id=p_id and actor_id=auth.uid()for update;
 if b.id is null or b.selection_hash<>p_hash or b.selection_hash<>encode(extensions.digest(p_items::text,'sha256'),'hex') or b.expires_at<=clock_timestamp()then raise exception 'commercial_confirmation_required';end if;
 if b.used_at is not null then return jsonb_build_object('reused',true,'deliveries',coalesce((select jsonb_agg(jsonb_build_object('id',id,'invite_id',invite_id,'lead_id',lead_id,'state',state))from private.commercial_deliveries where batch_key=p_id),'[]'));end if;
 n=jsonb_array_length(p_items);if n<1 or n>least(greatest(p_limit,1),100)or n<>(select count(distinct value->>'lead_id')from jsonb_array_elements(p_items))then raise exception 'commercial_batch_invalid';end if;
 if n<>(select count(distinct lower(l.email))from jsonb_array_elements(p_items) selected join private.acquisition_leads l on l.id=(selected.value->>'lead_id')::uuid)then raise exception 'commercial_duplicate_recipient';end if;
 if (select count(*)from private.commercial_deliveries where actor_id=auth.uid()and created_at>clock_timestamp()-interval '1 hour')+n>100 then raise exception 'commercial_rate_limited';end if;
 for x in select value from jsonb_array_elements(p_items)loop
 select *into i from private.commercial_invites where id=(x->>'invite_id')::uuid;perform private.commercial_require('commercial.send',i.lead_id);
 if i.id is null or i.created_by<>auth.uid()or i.lead_id<>(x->>'lead_id')::uuid or not private.commercial_mail_eligible(i.lead_id,i.purpose)then raise exception 'commercial_contact_not_authorized';end if;
 if exists(select 1 from private.commercial_deliveries e join private.commercial_invites old on old.id=e.invite_id where e.lead_id=i.lead_id and old.purpose=i.purpose and e.created_at>clock_timestamp()-interval '15 minutes'and e.state in('queued','sending','accepted','uncertain'))then raise exception 'commercial_recent_delivery';end if;
 insert into private.commercial_deliveries(batch_key,lead_id,invite_id,actor_id)values(p_id,i.lead_id,i.id,auth.uid());
 insert into private.commercial_contact_events(lead_id,actor_id,event)values(i.lead_id,auth.uid(),'mail_queued');
 end loop;
 update private.commercial_batch_confirmations set used_at=clock_timestamp()where id=p_id;
 return jsonb_build_object('reused',false,'deliveries',(select jsonb_agg(jsonb_build_object('id',id,'invite_id',invite_id,'lead_id',lead_id,'state',state))from private.commercial_deliveries where batch_key=p_id));
end;$$;
create function public.commercial_editor_service(p_demo uuid,p_actor uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare r jsonb;begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'is_anonymous',false)::text,true);
 r=public.commercial_demo_edit_context(p_demo);return r;
end;$$;
create function public.commercial_editor_publish(p_demo uuid,p_actor uuid,p_generation integer,p_revision integer,p_config jsonb)returns jsonb language plpgsql security definer set search_path=''as $$declare d private.commercial_demos;begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'is_anonymous',false)::text,true);
 d=private.commercial_demo_require(p_demo,'commercial.manage');if d.generation<>p_generation then raise exception 'demo_session_expired';end if;
 return public.commercial_demo_publish(p_demo,p_revision,p_config);
end;$$;
create table private.commercial_imports(organization_id uuid primary key references public.organizations(id),services jsonb not null default '[]',finished_at timestamptz,created_at timestamptz not null default clock_timestamp());
alter table private.commercial_imports enable row level security;alter table private.commercial_imports force row level security;revoke all on private.commercial_imports from public,anon,authenticated,service_role;

create function private.commercial_config_fields()returns jsonb language sql immutable set search_path=''as $$select '{"company_settings":["legal_name","description","public_phone","public_email","public_address","service_regions","payment_methods","business_hours","human_hours","exception_contact_name","exception_contact"],"business_rules":["pricing_policy","payment_policy","cancellation_policy","rescheduling_policy","service_policy","deadlines_policy","exception_policy"],"service_categories":["id","name","position","active"],"company_media":["id","public_code","object_path","mime","size_bytes","state","sha256","width","height"],"services":["id","name","category","description","image_url","price_mode","price_cents","duration_minutes","availability","notes","active","quotes_allowed","direct_booking","category_id","image_media_id","contract_mode","photo_policy","photo_instructions","execution_mode","execution_max_periods","price_max_cents"],"service_addons":["id","service_id","name","price_mode","price_cents","duration_minutes","active"],"service_intake_fields":["id","service_id","label","kind","required","options","position","active","instruction","multiline","condition_field","condition_value"],"service_relations":["id","source_id","target_id","kind"],"faqs":["id","question","answer","active","position"],"quick_replies":["id","title","body","active"],"company_branding":["primary_color","logo_id","cover_id","category_order","service_order","theme"],"portfolio_items":["id","title","description","service_id","position","active","format","media_ids"],"schedule_resources":["active","lead_minutes","horizon_days","step_minutes","buffer_minutes","cancel_minutes"],"service_checklist_models":["service_id","revision"],"service_checklist_items":["id","service_id","title","position","removed"]}'::jsonb;$$;
create function private.commercial_config_export(p_org uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$declare t text;fields text[];r jsonb;data_ jsonb='{}';begin
 for t, r in select key,value from jsonb_each(private.commercial_config_fields())loop
 fields=array(select jsonb_array_elements_text(r));
 if t='service_checklist_items'then
 select coalesce(jsonb_agg(to_jsonb(x)),'[]')into r from private.service_checklist_items x join private.service_checklist_models m on m.service_id=x.service_id where m.organization_id=p_org and not x.removed;
 else
 execute format('select coalesce(jsonb_agg((select jsonb_object_agg(key,value)from jsonb_each(to_jsonb(x))where key=any($2))),''[]'')from %I.%I x where organization_id=$1',case when t='service_checklist_models'then'private'else'public'end,t)into r using p_org,fields;
 end if;
 data_=data_||jsonb_build_object(t,r);
 end loop;
 return jsonb_build_object('format','syzia-config-054','tables',data_,'template',coalesce((select template from private.company_page_templates where organization_id=p_org),'current'));
end;$$;
create function private.commercial_remap(p_value jsonb,p_map jsonb)returns jsonb language plpgsql immutable set search_path=''as $$declare r jsonb;k text;v jsonb;begin
 if jsonb_typeof(p_value)='string'then return coalesce(p_map->(p_value#>>'{}'),p_value);
 elsif jsonb_typeof(p_value)='array'then select coalesce(jsonb_agg(private.commercial_remap(value,p_map)),'[]')into r from jsonb_array_elements(p_value);return r;
 elsif jsonb_typeof(p_value)='object'then r='{}';for k,v in select key,value from jsonb_each(p_value)loop r=r||jsonb_build_object(k,private.commercial_remap(v,p_map));end loop;return r;
 else return p_value;end if;
end;$$;
create function private.commercial_config_apply(p_org uuid,p_config jsonb,p_actor uuid)returns void language plpgsql security definer set search_path=''as $$declare t text;row_ jsonb;data_ jsonb;keys_ text;columns_ text;fields_ text[];mapping_ jsonb='{}';spec jsonb;schema_ text;begin
 perform private.commercial_config_validate(p_config);spec=private.commercial_config_fields();
 for t,data_ in select key,value from jsonb_each(p_config->'tables')loop
 if jsonb_typeof(data_)<>'array'or jsonb_array_length(data_)>200 then raise exception 'commercial_configuration_invalid';end if;
 fields_=array(select jsonb_array_elements_text(spec->t));
 for row_ in select value from jsonb_array_elements(data_)loop
 if jsonb_typeof(row_)<>'object'or(row_-fields_)<>'{}'then raise exception 'commercial_configuration_invalid';end if;
 if row_?'id'then if mapping_?(row_->>'id')then raise exception 'commercial_configuration_invalid';end if;mapping_=mapping_||jsonb_build_object(row_->>'id',gen_random_uuid());mapping_=mapping_||jsonb_build_object(private.consumer_code('s',(row_->>'id')::uuid),private.consumer_code('s',(mapping_->>(row_->>'id'))::uuid));end if;
 end loop;end loop;
 -- Dependencies are ordered; generated identifiers never reference the source tenant.
 foreach t in array array['company_settings','business_rules','service_categories','company_media','services','service_addons','service_intake_fields','service_relations','faqs','quick_replies','company_branding','portfolio_items','schedule_resources','service_checklist_models','service_checklist_items']loop
 for row_ in select value from jsonb_array_elements(coalesce(p_config->'tables'->t,'[]'))loop
 row_=private.commercial_remap(row_,mapping_);if t<>'service_checklist_items'then row_=row_||jsonb_build_object('organization_id',p_org);end if;schema_=case when t in('service_checklist_models','service_checklist_items')then'private'else'public'end;
 if t='company_media'then
 if row_->>'state'<>'ready'or coalesce(row_->>'sha256','')!~'^[0-9a-f]{64}$'or row_->>'mime'not in('image/jpeg','image/png','image/webp')then raise exception 'commercial_configuration_invalid';end if;
 row_=(row_-'public_code')||jsonb_build_object('uploaded_by',p_actor,'expires_at',clock_timestamp()+interval '100 years');
 end if;
 if t='services'and not private.entitlement(p_org,'software')then
 insert into private.commercial_imports(organization_id,services)values(p_org,jsonb_build_array(jsonb_build_object('id',row_->>'id','active',coalesce((row_->>'active')::boolean,true))))on conflict(organization_id)do update set services=commercial_imports.services||excluded.services;
 row_=row_||jsonb_build_object('active',false);
 end if;
 select string_agg(format('%I',key),','order by key),string_agg(format('r.%I',key),','order by key)into keys_,columns_ from jsonb_each(row_);
 if t in('company_settings','business_rules','company_branding','schedule_resources')then
 execute format('delete from public.%I where organization_id=$1',t)using p_org;
 end if;
 execute format('insert into %I.%I(%s)select %s from jsonb_populate_record(null::%I.%I,$1)r',schema_,t,keys_,columns_,schema_,t)using row_;
 end loop;end loop;
 insert into private.company_page_templates(organization_id,template)values(p_org,p_config->>'template')on conflict(organization_id)do update set template=excluded.template,revision=company_page_templates.revision+1;
 -- Media, member, publication and operational data are not implicitly enabled.
 update public.company_settings set human_enabled=false,support_mode='own',support_configured=true where organization_id=p_org;
end;$$;
create function public.commercial_claim_complete(p_id uuid,p_snapshot text,p_draft uuid,p_revision integer,p_consent boolean,p_conditions text,p_reviewed boolean)returns jsonb language plpgsql security definer set search_path=''as $$declare q private.commercial_claims;d private.commercial_demos;s private.selfservice_drafts;r jsonb;begin
 if not private.is_active_user()then raise exception 'access_denied';end if;perform pg_advisory_xact_lock(734921554);
 select *into q from private.commercial_claims where id=p_id and user_id=auth.uid()for update;if q.id is null then raise exception 'access_denied';end if;
 if q.state='materialized'then return jsonb_build_object('state','completed','organization_id',q.organization_id,'reused',true,'billing047',true);end if;
 if exists(select 1 from private.commercial_claims where demo_id=q.demo_id and state='materialized')then raise exception 'commercial_already_activated';end if;
 select *into d from private.commercial_demos where id=q.demo_id;
 if q.state<>'approved'or q.snapshot_hash is distinct from d.snapshot_hash or p_snapshot is distinct from d.snapshot_hash or p_reviewed is distinct from true or d.state<>'available'or d.expires_at<=clock_timestamp()or not exists(select 1 from private.commercial_invites where id=q.invite_id and claimed_by=auth.uid()and revoked_at is null and expires_at>clock_timestamp()and generation=d.generation)then raise exception 'commercial_review_required';end if;
 if jsonb_array_length(coalesce(d.configuration->'tables'->'company_media','[]'))>0 and not q.assets_ready then raise exception 'commercial_assets_pending';end if;
 select *into s from private.selfservice_drafts where id=p_draft and user_id=auth.uid();if s.id is null or s.state='completed'then raise exception 'commercial_draft_invalid';end if;
 -- Existing registration/identity/plan/consent checks and pending subscription are authoritative.
 if(select mock_enabled from private.billing_runtime)then raise exception 'commercial_financial_mode_invalid';end if;
 r=public.selfservice_complete(p_draft,p_revision,p_consent,p_conditions);
 perform private.commercial_config_apply((r->>'organization_id')::uuid,d.configuration,auth.uid());
 update private.commercial_claims set state='materialized',organization_id=(r->>'organization_id')::uuid where id=q.id;
 perform private.access_audit((r->>'organization_id')::uuid,auth.uid(),'commercial_configuration_imported',q.id);
 return r;
end;$$;

create function public.commercial_import_finalize(p_org uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare i private.commercial_imports;x jsonb;begin
 if not private.is_active_user()or not private.is_org_admin(p_org)then raise exception 'access_denied';end if;perform pg_advisory_xact_lock(734921554);
 select *into i from private.commercial_imports where organization_id=p_org for update;
 if i.organization_id is null or i.finished_at is not null then return jsonb_build_object('pending',false);end if;
 if not private.entitlement(p_org,'software')or not exists(select 1 from private.billing047_contracts where organization_id=p_org and current and provider_id is not null and state in('trialing','active'))then return jsonb_build_object('pending',true,'financial_confirmation_required',true);end if;
 for x in select value from jsonb_array_elements(i.services)loop update public.services set active=(x->>'active')::boolean where organization_id=p_org and id=(x->>'id')::uuid;end loop;
 update private.commercial_imports set finished_at=clock_timestamp()where organization_id=p_org;
 perform private.access_audit(p_org,auth.uid(),'commercial_catalog_enabled',p_org);return jsonb_build_object('pending',false,'activated',true);
end;$$;
revoke all on function public.commercial_import_finalize(uuid)from public,anon,authenticated,service_role;grant execute on function public.commercial_import_finalize(uuid)to authenticated;

do $$declare n text;r record;begin
 foreach n in array array['commercial_demos','commercial_invites','commercial_claims','commercial_claim_reviews','commercial_deliveries','commercial_batch_confirmations']loop
 execute format('alter table private.%I enable row level security',n);execute format('alter table private.%I force row level security',n);execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);end loop;
 for r in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private')loop
 if r.proname in('commercial_config_validate','commercial_demo_require','commercial_config_fields','commercial_config_export','commercial_config_apply','commercial_remap','commercial_mail_eligible','commercial_demo_save','commercial_demo_publish','commercial_demo_revoke','commercial_management','commercial_demo_edit_context','commercial_invite_prepare','commercial_invite_revoke','commercial_claim_request','commercial_claim_review','commercial_claim_context','commercial_claim_complete','commercial_service','commercial_batch_confirm','commercial_batch_queue','commercial_editor_service','commercial_editor_publish')then
 execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
 if r.nspname='public'then execute format('grant execute on function %s to %I',r.signature,case when r.proname in('commercial_service','commercial_editor_service','commercial_editor_publish')then 'service_role'else'authenticated'end);end if;
 end if;end loop;
end;$$;
commit;

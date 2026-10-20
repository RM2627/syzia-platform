-- 055: preparation is independent from prospects and commercial plans.
-- Historical migrations and the financial authority remain unchanged.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

alter table private.commercial_demos alter column lead_id drop not null;
alter table private.commercial_demos alter column plan_version_id drop not null;
alter table private.commercial_demos drop constraint commercial_demos_state_check;
alter table private.commercial_demos add constraint commercial_demos_state_check
 check(state in('draft','ready','available','suspended','expired','archived','revoked'));
alter table private.commercial_demos add column draft_configuration jsonb;
alter table private.commercial_demos add column reviewed_hash text;
create table private.commercial_versions(
 id uuid primary key default gen_random_uuid(),demo_id uuid not null references private.commercial_demos(id),
 version integer not null check(version>0),name text not null,configuration jsonb not null,snapshot_hash text not null check(snapshot_hash~'^[a-f0-9]{64}$'),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),unique(demo_id,version),unique(demo_id,id)
);
alter table private.commercial_demos add column published_version_id uuid references private.commercial_versions(id);
alter table private.commercial_invites add column version_id uuid references private.commercial_versions(id);
alter table private.commercial_claims add column version_id uuid references private.commercial_versions(id);
create table private.commercial_demo_contacts(
 demo_id uuid not null references private.commercial_demos(id),lead_id uuid not null references private.commercial_contacts(lead_id),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),primary key(demo_id,lead_id)
);
create table private.commercial_preparation_events(
 id uuid primary key default gen_random_uuid(),demo_id uuid not null references private.commercial_demos(id),actor_id uuid references public.profiles(id),
 event text not null check(event in('created','saved','reviewed','published','suspended','archived','linked','prepared','materialized')),
 version_id uuid references private.commercial_versions(id),created_at timestamptz not null default clock_timestamp()
);
-- Preserve already published configurations and their historic invitations.
insert into private.commercial_versions(demo_id,version,name,configuration,snapshot_hash,created_by)
 select id,1,name,configuration,snapshot_hash,created_by from private.commercial_demos where configuration is not null and snapshot_hash is not null;
update private.commercial_demos d set published_version_id=v.id,draft_configuration=d.configuration from private.commercial_versions v where v.demo_id=d.id;
update private.commercial_invites i set version_id=d.published_version_id from private.commercial_demos d where d.id=i.demo_id;
update private.commercial_claims q set version_id=i.version_id from private.commercial_invites i where i.id=q.invite_id;
insert into private.commercial_demo_contacts(demo_id,lead_id,created_by)select id,lead_id,created_by from private.commercial_demos where lead_id is not null;
create function private.commercial_version_immutable()returns trigger language plpgsql set search_path=''as $$begin raise exception 'commercial_version_immutable';end;$$;
create trigger commercial_version_immutable before update or delete on private.commercial_versions for each row execute function private.commercial_version_immutable();

create or replace function private.commercial_demo_require(p_id uuid,p_action text)returns private.commercial_demos language plpgsql stable security definer set search_path=''as $$declare d private.commercial_demos;begin
 perform private.commercial_require(p_action);
 select *into d from private.commercial_demos where id=p_id;
 if d.id is null then raise exception 'commercial_not_found';end if;
 if d.created_by<>auth.uid()and not private.people_root(auth.uid())then raise exception 'access_denied'using errcode='42501';end if;
 return d;
end;$$;

create or replace function public.commercial_demo_save(p_id uuid,p_revision integer,p_key uuid,p_lead uuid,p_name text,p_slug text,p_plan uuid,p_expires timestamptz)returns jsonb language plpgsql security definer set search_path=''as $$
declare d private.commercial_demos;s text;base_ text;n integer=1;begin
 perform private.commercial_require('commercial.manage');perform pg_advisory_xact_lock(734921554);
 if p_key is null or p_expires is null or p_expires<=clock_timestamp()or p_expires>clock_timestamp()+interval '90 days'or length(btrim(p_name))not between 2 and 160 then raise exception 'commercial_invalid';end if;
 if p_plan is not null then raise exception 'commercial_plan_selected_at_activation';end if;
 if p_id is null then
  select *into d from private.commercial_demos where request_key=p_key;
  if found then
   if d.created_by<>auth.uid()or d.name is distinct from btrim(p_name)or d.expires_at is distinct from p_expires or(p_slug is not null and p_slug<>''and d.slug<>p_slug)then raise exception 'idempotency_conflict';end if;
   return jsonb_build_object('id',d.id,'revision',d.revision,'slug',d.slug,'reused',true);
  end if;
  s=nullif(btrim(p_slug),'');
  if s is null then
   base_=trim(both '-'from regexp_replace(translate(lower(btrim(p_name)),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'[^a-z0-9]+','-','g'));
   base_=rtrim(left(base_,65),'-');if length(base_)<3 then base_='empresa-'||substr(encode(extensions.digest(p_key::text,'sha256'),'hex'),1,12);end if;
   s=base_;
   while exists(select 1 from private.commercial_demos where slug=s)or s=any(array['api','admin','app','assets','health','login','entrar','cadastrar','ativar','billing','painel','empresa','acompanhar','minhas-solicitacoes','convites'])loop n=n+1;s=base_||'-'||n;end loop;
  end if;
  if s!~'^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'or s=any(array['api','admin','app','assets','health','login','entrar','cadastrar','ativar','billing','painel','empresa','acompanhar','minhas-solicitacoes','convites'])then raise exception 'commercial_slug_invalid';end if;
  if exists(select 1 from private.commercial_demos where slug=s)then raise exception 'commercial_slug_taken';end if;
  insert into private.commercial_demos(name,slug,expires_at,created_by,request_key)values(btrim(p_name),s,p_expires,auth.uid(),p_key)returning *into d;
  insert into private.commercial_preparation_events(demo_id,actor_id,event)values(d.id,auth.uid(),'created');
 else
  d=private.commercial_demo_require(p_id,'commercial.manage');
  if d.revision is distinct from p_revision then raise exception 'commercial_revision_conflict';end if;
  -- Stable links and existing visitor versions are unaffected by draft edits.
  if nullif(p_slug,'') is not null and p_slug<>d.slug then raise exception 'commercial_slug_immutable';end if;
  update private.commercial_demos set name=btrim(p_name),expires_at=p_expires,revision=revision+1,reviewed_hash=null,updated_at=clock_timestamp()where id=d.id returning *into d;
 end if;
 if p_lead is not null then
  perform private.commercial_require('commercial.manage',p_lead);
  insert into private.commercial_demo_contacts(demo_id,lead_id,created_by)values(d.id,p_lead,auth.uid())on conflict do nothing;
 end if;
 return jsonb_build_object('id',d.id,'revision',d.revision,'slug',d.slug,'reused',false);
end;$$;

create function public.commercial_demo_link(p_demo uuid,p_lead uuid)returns void language plpgsql security definer set search_path=''as $$begin
 perform private.commercial_demo_require(p_demo,'commercial.manage');perform private.commercial_require('commercial.manage',p_lead);
 if p_lead is null then raise exception 'commercial_invalid';end if;
 insert into private.commercial_demo_contacts(demo_id,lead_id,created_by)values(p_demo,p_lead,auth.uid())on conflict do nothing;
 if found then insert into private.commercial_preparation_events(demo_id,actor_id,event)values(p_demo,auth.uid(),'linked');end if;
end;$$;

create function public.commercial_demo_draft(p_id uuid,p_revision integer,p_config jsonb,p_review boolean default false)returns jsonb language plpgsql security definer set search_path=''as $$declare d private.commercial_demos;h text;begin
 perform pg_advisory_xact_lock(734921554);d=private.commercial_demo_require(p_id,'commercial.manage');
 if d.revision is distinct from p_revision then raise exception 'commercial_revision_conflict';end if;
 perform private.commercial_config_validate(p_config);h=encode(extensions.digest(p_config::text,'sha256'),'hex');
 update private.commercial_demos set draft_configuration=p_config,reviewed_hash=case when p_review then h else null end,
 state=case when state in('draft','ready')then case when p_review then 'ready'else'draft'end else state end,
 revision=revision+1,updated_at=clock_timestamp()where id=p_id returning *into d;
 insert into private.commercial_preparation_events(demo_id,actor_id,event)values(p_id,auth.uid(),case when p_review then 'reviewed'else'saved'end);
 return jsonb_build_object('id',d.id,'revision',d.revision,'snapshot_hash',h,'reviewed',p_review);
end;$$;

create or replace function public.commercial_demo_publish(p_id uuid,p_revision integer,p_config jsonb)returns jsonb language plpgsql security definer set search_path=''as $$declare d private.commercial_demos;v private.commercial_versions;h text;begin
 perform pg_advisory_xact_lock(734921554);d=private.commercial_demo_require(p_id,'commercial.manage');
 if d.revision is distinct from p_revision then raise exception 'commercial_revision_conflict';end if;
 if d.expires_at<=clock_timestamp()or d.state in('archived','expired')then raise exception 'commercial_expired';end if;
 perform private.commercial_config_validate(p_config);h=encode(extensions.digest(p_config::text,'sha256'),'hex');
 if h is distinct from d.reviewed_hash or p_config is distinct from d.draft_configuration then raise exception 'commercial_review_required';end if;
 insert into private.commercial_versions(demo_id,version,name,configuration,snapshot_hash,created_by)
 select d.id,coalesce(max(version),0)+1,d.name,p_config,h,auth.uid()from private.commercial_versions where demo_id=d.id returning *into v;
 update private.commercial_demos set configuration=p_config,snapshot_hash=h,published_version_id=v.id,revision=revision+1,generation=generation+1,state='available',updated_at=clock_timestamp()where id=p_id returning *into d;
 insert into private.commercial_preparation_events(demo_id,actor_id,event,version_id)values(p_id,auth.uid(),'published',v.id);
 return jsonb_build_object('id',d.id,'revision',d.revision,'generation',d.generation,'version_id',v.id);
end;$$;

create or replace function public.commercial_demo_revoke(p_id uuid,p_revision integer)returns void language plpgsql security definer set search_path=''as $$declare d private.commercial_demos;begin
 perform pg_advisory_xact_lock(734921554);d=private.commercial_demo_require(p_id,'commercial.manage');if d.revision is distinct from p_revision then raise exception 'commercial_revision_conflict';end if;
 update private.commercial_demos set state='suspended',generation=generation+1,revision=revision+1,reviewed_hash=null where id=p_id;
 update private.commercial_invites set revoked_at=clock_timestamp()where demo_id=p_id and revoked_at is null;
 insert into private.commercial_preparation_events(demo_id,actor_id,event)values(p_id,auth.uid(),'suspended');
end;$$;

create or replace function public.commercial_demo_edit_context(p_id uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$declare d private.commercial_demos;begin
 d=private.commercial_demo_require(p_id,'commercial.manage');
 if d.state in('archived','expired')or d.expires_at<=clock_timestamp()then raise exception 'commercial_expired';end if;
 return to_jsonb(d)||jsonb_build_object('schema_version',55,'configuration',coalesce(d.draft_configuration,d.configuration));
end;$$;
-- No synthetic operator identities: every editor request uses the original JWT.
revoke all on function public.commercial_editor_service(uuid,uuid),public.commercial_editor_publish(uuid,uuid,integer,integer,jsonb)from public,anon,authenticated,service_role;

do $$declare n text;begin foreach n in array array['commercial_versions','commercial_demo_contacts','commercial_preparation_events']loop
 execute format('alter table private.%I enable row level security',n);execute format('alter table private.%I force row level security',n);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);
end loop;end;$$;
revoke all on function private.commercial_version_immutable(),public.commercial_demo_link(uuid,uuid),public.commercial_demo_draft(uuid,integer,jsonb,boolean)from public,anon,authenticated,service_role;
grant execute on function public.commercial_demo_link(uuid,uuid),public.commercial_demo_draft(uuid,integer,jsonb,boolean)to authenticated;
-- Remaining 055 functions follow before COMMIT.
create or replace function public.commercial_management()returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 perform private.commercial_require('commercial.read');
 return public.commercial_context()||jsonb_build_object(
 'contacts',coalesce((select jsonb_agg(item||jsonb_build_object('display_stage',case
 when exists(select 1 from private.commercial_claims q join private.commercial_demos d on d.id=q.demo_id join private.billing047_contracts b on b.organization_id=q.organization_id where exists(select 1 from private.commercial_invites qi where qi.id=q.invite_id and qi.lead_id=(item->>'id')::uuid) and q.state='materialized'and b.current and b.provider_id is not null and b.state='active'and b.paid_until>clock_timestamp())then'paying'
 when exists(select 1 from private.commercial_claims q join private.commercial_demos d on d.id=q.demo_id join private.billing047_contracts b on b.organization_id=q.organization_id where exists(select 1 from private.commercial_invites qi where qi.id=q.invite_id and qi.lead_id=(item->>'id')::uuid) and q.state='materialized'and b.current and b.provider_id is not null and b.state='trialing'and b.trial_end>clock_timestamp())then'trialing'
 else item->>'stage'end))from jsonb_array_elements(public.commercial_context()->'contacts')item),'[]'),
 'demos',coalesce((select jsonb_agg(to_jsonb(d)-'configuration'-'draft_configuration'-'snapshot_hash'-'reviewed_hash')from private.commercial_demos d where d.created_by=auth.uid()or private.people_root(auth.uid())),'[]'),
 'invites',coalesce((select jsonb_agg(to_jsonb(i)-'token_hash'-'email_hash'-'sealed_token')from private.commercial_invites i join private.commercial_contacts c on c.lead_id=i.lead_id where c.owner_id=auth.uid()or private.people_root(auth.uid())),'[]'),
 'deliveries',coalesce((select jsonb_agg(to_jsonb(d))from private.commercial_deliveries d join private.commercial_contacts c on c.lead_id=d.lead_id where c.owner_id=auth.uid()or private.people_root(auth.uid())),'[]'),
 'claims',coalesce((select jsonb_agg(to_jsonb(q)||jsonb_build_object('company',(select name from private.commercial_versions where id=q.version_id),'responsible',(select display_name from public.profiles where id=q.user_id),'reviews',coalesce((select jsonb_agg(to_jsonb(h)order by created_at)from private.commercial_claim_reviews h where h.claim_id=q.id),'[]')))from private.commercial_claims q join private.commercial_demos d on d.id=q.demo_id join private.commercial_invites qi on qi.id=q.invite_id join private.commercial_contacts c on c.lead_id=qi.lead_id where c.owner_id=auth.uid()or private.people_root(auth.uid())),'[]'),
 'links',coalesce((select jsonb_agg(to_jsonb(l))from private.commercial_demo_contacts l join private.commercial_demos d on d.id=l.demo_id join private.commercial_contacts c on c.lead_id=l.lead_id where (d.created_by=auth.uid()or private.people_root(auth.uid()))and(c.owner_id=auth.uid()or private.people_root(auth.uid()))),'[]'),
 'plans',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'name',p.name,'capabilities',v.capabilities,'member_limit',v.member_limit))from private.billing047_offers o join public.billing_plan_versions v on v.id=o.plan_version_id join public.billing_plans p on p.id=v.plan_id),'[]'),
 'conversions',coalesce((select jsonb_agg(jsonb_build_object('lead_id',qi.lead_id,'organization_id',q.organization_id,'trialing',exists(select 1 from private.billing047_contracts b where b.organization_id=q.organization_id and b.current and b.provider_id is not null and b.state='trialing'),'paying',exists(select 1 from private.billing047_contracts b where b.organization_id=q.organization_id and b.current and b.provider_id is not null and b.state='active'and b.paid_until>clock_timestamp())))from private.commercial_claims q join private.commercial_demos d on d.id=q.demo_id join private.commercial_invites qi on qi.id=q.invite_id join private.commercial_contacts c on c.lead_id=qi.lead_id where q.state='materialized'and(c.owner_id=auth.uid()or private.people_root(auth.uid()))),'[]'));
end;$$;

create or replace function public.commercial_invite_for_contact(p_demo uuid,p_lead uuid,p_purpose text,p_id uuid,p_hash text,p_expires timestamptz)returns jsonb language plpgsql security definer set search_path=''as $$declare d private.commercial_demos;l private.acquisition_leads;begin
 perform pg_advisory_xact_lock(734921554);d=private.commercial_demo_require(p_demo,'commercial.manage');
 if d.state<>'available'or d.expires_at<=clock_timestamp()or p_expires<=clock_timestamp()or p_expires>d.expires_at or p_expires>clock_timestamp()+interval '30 days'then raise exception 'commercial_expired';end if;
 perform private.commercial_require('commercial.manage',p_lead);
 if not exists(select 1 from private.commercial_demo_contacts where demo_id=d.id and lead_id=p_lead)then raise exception 'commercial_contact_not_linked';end if;
 if not private.commercial_mail_eligible(p_lead,p_purpose)then raise exception 'commercial_contact_not_authorized';end if;
 if p_purpose='activation'and exists(select 1 from private.commercial_claims q join private.commercial_invites qi on qi.id=q.invite_id where q.demo_id=d.id and qi.lead_id=p_lead and q.organization_id is not null)then raise exception 'commercial_already_activated';end if;
 if p_purpose='activation'and not exists(select 1 from private.commercial_contacts where lead_id=p_lead and stage in('wants_trial','activation_sent','registration_started'))then raise exception 'commercial_interest_required';end if;
 select *into l from private.acquisition_leads where id=p_lead;
 insert into private.commercial_invites(id,lead_id,demo_id,purpose,token_hash,generation,email_hash,expires_at,created_by,version_id)values(p_id,p_lead,d.id,p_purpose,p_hash,d.generation,encode(extensions.digest(lower(l.email),'sha256'),'hex'),p_expires,auth.uid(),d.published_version_id);
 insert into private.commercial_contact_events(lead_id,actor_id,event)values(p_lead,auth.uid(),'link_issued');
 return jsonb_build_object('id',p_id,'lead_id',p_lead,'demo_id',d.id,'slug',d.slug,'company',(select name from private.commercial_versions where id=d.published_version_id),'expires_at',p_expires,'purpose',p_purpose);
end;$$;

create or replace function public.commercial_service(p_action text,p_data jsonb)returns jsonb language plpgsql security definer set search_path=''as $$declare d private.commercial_demos;i private.commercial_invites;e private.commercial_deliveries;l private.acquisition_leads;begin
 if p_action='demo' then
 select *into d from private.commercial_demos where (id=(p_data->>'id')::uuid or slug=p_data->>'slug')and state='available'and expires_at>clock_timestamp();
 if d.id is null then raise exception 'commercial_demo_unavailable';end if;
 return to_jsonb(d)-'draft_configuration'-'reviewed_hash'||jsonb_build_object('schema_version',55,'version_id',d.published_version_id,'name',(select name from private.commercial_versions where id=d.published_version_id));
 elsif p_action='invite' then
 select *into i from private.commercial_invites where token_hash=p_data->>'hash'and revoked_at is null and expires_at>clock_timestamp();select *into d from private.commercial_demos where id=i.demo_id;
 if i.id is null or i.version_id is null or d.state<>'available'or d.generation<>i.generation or d.expires_at<=clock_timestamp()then raise exception 'commercial_invite_invalid';end if;
 return jsonb_build_object('id',i.id,'demo_id',d.id,'slug',d.slug,'company',(select name from private.commercial_versions where id=i.version_id),'purpose',i.purpose,'expires_at',i.expires_at);
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
 elsif p_action='mail_begin' then raise exception 'session_required';
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

create function public.commercial_mail_begin(p_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare d private.commercial_demos;i private.commercial_invites;e private.commercial_deliveries;l private.acquisition_leads;begin

 perform pg_advisory_xact_lock(734921554);select *into e from private.commercial_deliveries where id=p_id for update;
 if e.id is null or e.state<>'queued'then raise exception 'commercial_delivery_unavailable';end if;
 select *into i from private.commercial_invites where id=e.invite_id;select *into d from private.commercial_demos where id=i.demo_id;select *into l from private.acquisition_leads where id=e.lead_id;
 if not private.is_active_user()or auth.uid()is distinct from e.actor_id then raise exception 'access_denied';end if;
 if not private.commercial_allowed('commercial.send')or not exists(select 1 from private.commercial_contacts where lead_id=e.lead_id and(owner_id=e.actor_id or private.people_root(e.actor_id)))or not private.commercial_mail_eligible(e.lead_id,i.purpose)or i.revoked_at is not null or i.expires_at<=clock_timestamp()or d.state<>'available'or d.generation<>i.generation or i.email_hash<>encode(extensions.digest(lower(l.email),'sha256'),'hex')then update private.commercial_deliveries set state='cancelled'where id=e.id;insert into private.commercial_contact_events(lead_id,actor_id,event)values(e.lead_id,e.actor_id,'mail_cancelled');return jsonb_build_object('cancelled',true);end if;
 update private.commercial_deliveries set state='sending',attempted_at=clock_timestamp()where id=e.id;
 return jsonb_build_object('id',e.id,'email',l.email,'name',l.name,'company',(select name from private.commercial_versions where id=i.version_id),'slug',d.slug,'purpose',i.purpose,'expires_at',i.expires_at);
end;$$;

create or replace function public.commercial_claim_request(p_hash text,p_statement text)returns jsonb language plpgsql security definer set search_path=''as $$declare i private.commercial_invites;d private.commercial_demos;q private.commercial_claims;begin
 if not private.is_active_user()then raise exception 'access_denied';end if;perform pg_advisory_xact_lock(734921554);
 select *into i from private.commercial_invites where token_hash=p_hash and purpose='activation'for update;select *into d from private.commercial_demos where id=i.demo_id;
 if i.id is null or i.version_id is null or i.revoked_at is not null or i.expires_at<=clock_timestamp()or d.state<>'available'or d.generation<>i.generation or d.expires_at<=clock_timestamp()then raise exception 'commercial_invite_invalid';end if;
 if i.claimed_by is not null and i.claimed_by<>auth.uid()then raise exception 'commercial_claim_conflict';end if;
 if exists(select 1 from private.commercial_claims q2 join private.commercial_invites i2 on i2.id=q2.invite_id where q2.demo_id=d.id and i2.lead_id=i.lead_id and q2.organization_id is not null and q2.invite_id<>i.id)then raise exception 'commercial_already_activated';end if;
 select *into q from private.commercial_claims where invite_id=i.id;
 if q.id is null then
 update private.commercial_invites set claimed_by=auth.uid()where id=i.id;
 insert into private.commercial_claims(invite_id,demo_id,user_id,snapshot_hash,statement,version_id)values(i.id,d.id,auth.uid(),(select snapshot_hash from private.commercial_versions where id=i.version_id),p_statement,i.version_id)returning *into q;
 update private.commercial_contacts set stage='registration_started',revision=revision+1 where lead_id=i.lead_id;
 end if;
 return jsonb_build_object('id',q.id,'state',q.state);
end;$$;

create or replace function public.commercial_claim_review(p_id uuid,p_approve boolean,p_note text)returns void language plpgsql security definer set search_path=''as $$declare q private.commercial_claims;d private.commercial_demos;begin
 if not private.is_active_user()or not private.people_root(auth.uid())then raise exception 'access_denied';end if;perform pg_advisory_xact_lock(734921554);
 select *into q from private.commercial_claims where id=p_id for update;select *into d from private.commercial_demos where id=q.demo_id;
 if q.id is null or q.organization_id is not null or length(btrim(p_note))not between 20 and 1000 or p_approve is null then raise exception 'commercial_invalid';end if;
 if not exists(select 1 from private.commercial_versions where id=q.version_id and demo_id=d.id and snapshot_hash=q.snapshot_hash) or d.state<>'available'or d.expires_at<=clock_timestamp()or not exists(select 1 from private.commercial_invites where id=q.invite_id and revoked_at is null and expires_at>clock_timestamp()and generation=d.generation)then raise exception 'commercial_review_stale';end if;
 insert into private.commercial_claim_reviews(claim_id,actor_id,previous_state,approved,note,snapshot_hash)values(q.id,auth.uid(),q.state,p_approve,p_note,q.snapshot_hash);
 update private.commercial_claims set state=case when p_approve then 'approved'else'rejected'end,reviewed_by=auth.uid(),review_note=p_note,reviewed_at=clock_timestamp()where id=p_id;
 perform private.access_audit(null,q.user_id,'commercial_claim_reviewed',q.id);
end;$$;

create or replace function public.commercial_claim_context(p_id uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$declare q private.commercial_claims;d private.commercial_demos;begin
 select *into q from private.commercial_claims where id=p_id and user_id=auth.uid();if not private.is_active_user()or q.id is null then raise exception 'access_denied';end if;
 select *into d from private.commercial_demos where id=q.demo_id;
 return jsonb_build_object('id',q.id,'demo_id',d.id,'state',q.state,'company',(select name from private.commercial_versions where id=q.version_id),'snapshot_hash',q.snapshot_hash,'configuration',(select configuration from private.commercial_versions where id=q.version_id),'version_id',q.version_id,'organization_id',q.organization_id,'stale',not exists(select 1 from private.commercial_versions where id=q.version_id and demo_id=d.id and snapshot_hash=q.snapshot_hash) or d.state<>'available'or d.expires_at<=clock_timestamp()or not exists(select 1 from private.commercial_invites where id=q.invite_id and revoked_at is null and expires_at>clock_timestamp()and generation=d.generation));
end;$$;

alter table private.commercial_claims drop constraint commercial_claims_state_check;
alter table private.commercial_claims add constraint commercial_claims_state_check check(state in('requested','approved','rejected','prepared','materialized'));
drop index private.commercial_one_materialization;
alter table private.commercial_claims add column lead_id uuid references private.commercial_contacts(lead_id);
update private.commercial_claims q set lead_id=i.lead_id from private.commercial_invites i where i.id=q.invite_id;
create unique index commercial_one_organization_per_contact on private.commercial_claims(demo_id,lead_id)where organization_id is not null;
create table private.commercial_materializations(
 organization_id uuid primary key references public.organizations(id),claim_id uuid not null unique references private.commercial_claims(id),
 version_id uuid not null references private.commercial_versions(id),plan_version_id uuid not null references public.billing_plan_versions(id),
 state text not null default 'pending'check(state in('pending','done')),asset_paths jsonb not null default '{}',destination_configuration jsonb not null,
 created_at timestamptz not null default clock_timestamp(),finished_at timestamptz
);
alter table private.commercial_materializations enable row level security;
alter table private.commercial_materializations force row level security;
revoke all on private.commercial_materializations from public,anon,authenticated,service_role;

create function private.commercial_plan_validate(p_config jsonb,p_plan uuid)returns void language plpgsql stable security definer set search_path=''as $$declare v public.billing_plan_versions;n integer;begin
 perform private.commercial_config_validate(p_config);
 select *into v from public.billing_plan_versions where id=p_plan;
 select count(*)into n from jsonb_array_elements(coalesce(p_config->'tables'->'services','[]'))x where coalesce((x->>'active')::boolean,true);
 if v.id is null or not coalesce((v.capabilities->>'software')::boolean,false)or(v.service_limit is not null and n>v.service_limit)then raise exception 'commercial_plan_incompatible';end if;
end;$$;

create or replace function public.commercial_claim_complete(p_id uuid,p_snapshot text,p_draft uuid,p_revision integer,p_consent boolean,p_conditions text,p_reviewed boolean)returns jsonb language plpgsql security definer set search_path=''as $$
declare q private.commercial_claims;d private.commercial_demos;v private.commercial_versions;i private.commercial_invites;s private.selfservice_drafts;r jsonb;org uuid;begin
 if not private.is_active_user()then raise exception 'access_denied';end if;
 perform pg_advisory_xact_lock(734921501);perform pg_advisory_xact_lock(734921554);
 select *into q from private.commercial_claims where id=p_id and user_id=auth.uid()for update;if q.id is null then raise exception 'access_denied';end if;
 if q.organization_id is not null then return jsonb_build_object('state','completed','organization_id',q.organization_id,'reused',true,'billing047',true);end if;
 select *into d from private.commercial_demos where id=q.demo_id;
 select *into v from private.commercial_versions where id=q.version_id and demo_id=q.demo_id;
 select *into i from private.commercial_invites where id=q.invite_id;
 if q.state<>'approved'or v.id is null or p_snapshot is distinct from v.snapshot_hash or q.snapshot_hash is distinct from v.snapshot_hash or p_reviewed is distinct from true or d.state<>'available'or d.expires_at<=clock_timestamp()or i.claimed_by is distinct from auth.uid()or i.revoked_at is not null or i.expires_at<=clock_timestamp()or i.generation<>d.generation then raise exception 'commercial_review_required';end if;
 if exists(select 1 from private.commercial_claims q2 join private.commercial_invites i2 on i2.id=q2.invite_id where q2.demo_id=d.id and i2.lead_id=i.lead_id and q2.organization_id is not null)then raise exception 'commercial_already_activated';end if;
 select *into s from private.selfservice_drafts where id=p_draft and user_id=auth.uid();
 if s.id is null or s.state='completed'then raise exception 'commercial_draft_invalid';end if;
 perform private.commercial_plan_validate(v.configuration,s.plan_version_id);
 if(select mock_enabled from private.billing_runtime)then raise exception 'commercial_financial_mode_invalid';end if;
 -- Existing identity, consent, legal acceptance, registration and plan checks remain authoritative.
 r=public.selfservice_complete(p_draft,p_revision,p_consent,p_conditions);org=(r->>'organization_id')::uuid;
 insert into private.commercial_materializations(organization_id,claim_id,version_id,plan_version_id,destination_configuration)values(org,q.id,v.id,s.plan_version_id,private.commercial_config_export(org));
 update private.commercial_claims set state='prepared',organization_id=org,lead_id=i.lead_id where id=q.id;
 insert into private.commercial_preparation_events(demo_id,actor_id,event,version_id)values(d.id,auth.uid(),'prepared',v.id);
 perform private.access_audit(org,auth.uid(),'commercial_pending_organization',q.id);
 return r;
end;$$;

create function public.commercial_materialization_context(p_org uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 if not private.is_active_user()or not private.is_org_admin(p_org)then raise exception 'access_denied';end if;
 return jsonb_build_object('pending',exists(select 1 from private.commercial_materializations where organization_id=p_org and state='pending'));
end;$$;

create function public.commercial_materialization_service(p_action text,p_org uuid default null,p_assets jsonb default '{}')returns jsonb language plpgsql security definer set search_path=''as $$
declare m private.commercial_materializations;q private.commercial_claims;v private.commercial_versions;b private.billing047_contracts;cfg jsonb;media jsonb;paths jsonb='{}';path_ text;ext text;begin
 if p_action='pending'then
  return coalesce((select jsonb_agg(jsonb_build_object('organization_id',x.organization_id))from private.commercial_materializations x join private.billing047_contracts b on b.organization_id=x.organization_id and b.current where x.state='pending'and b.provider_id is not null and b.state in('trialing','active')),'[]');
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

-- Original pre-055 imports remain recoverable without reimporting configurations.
alter function public.commercial_import_finalize(uuid)rename to commercial_import_finalize_pre055;
revoke all on function public.commercial_import_finalize_pre055(uuid)from public,anon,authenticated,service_role;
create function public.commercial_import_finalize(p_org uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare r jsonb;begin
 r=public.commercial_materialization_context(p_org);
 if(r->>'pending')::boolean then return r;end if;
 return public.commercial_import_finalize_pre055(p_org);
end;$$;

revoke all on function private.commercial_plan_validate(jsonb,uuid),public.commercial_materialization_service(text,uuid,jsonb),public.commercial_materialization_context(uuid),public.commercial_mail_begin(uuid),public.commercial_invite_for_contact(uuid,uuid,text,uuid,text,timestamptz),public.commercial_import_finalize(uuid)from public,anon,authenticated,service_role;
grant execute on function public.commercial_materialization_service(text,uuid,jsonb)to service_role;
grant execute on function public.commercial_materialization_context(uuid),public.commercial_mail_begin(uuid),public.commercial_invite_for_contact(uuid,uuid,text,uuid,text,timestamptz),public.commercial_import_finalize(uuid)to authenticated;

-- Validate the graph before it becomes an approved immutable snapshot.
alter function private.commercial_config_validate(jsonb)rename to commercial_config_validate_pre055;
revoke all on function private.commercial_config_validate_pre055(jsonb)from public,anon,authenticated,service_role;
create function private.commercial_config_validate(p_config jsonb)returns void language plpgsql immutable set search_path=''as $$
declare spec jsonb;table_ text;rows_ jsonb;row_ jsonb;fields_ text[];ids jsonb='{}';id_ text;ref_ text;target text;value_ jsonb;begin
 perform private.commercial_config_validate_pre055(p_config);spec=private.commercial_config_fields();
 for table_,rows_ in select key,value from jsonb_each(p_config->'tables')loop
  if jsonb_typeof(rows_)<>'array'or jsonb_array_length(rows_)>200 then raise exception 'commercial_configuration_invalid';end if;
  if table_ in('company_settings','business_rules','company_branding','schedule_resources')and jsonb_array_length(rows_)>1 then raise exception 'commercial_configuration_invalid';end if;
  fields_=array(select jsonb_array_elements_text(spec->table_));
  for row_ in select value from jsonb_array_elements(rows_)loop
   if jsonb_typeof(row_)<>'object'or(row_-fields_)<>'{}'then raise exception 'commercial_configuration_invalid';end if;
   if row_?'id'then
    id_=row_->>'id';if id_ is null or id_!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'or ids?id_ then raise exception 'commercial_configuration_invalid';end if;
    ids=ids||jsonb_build_object(id_,table_);
    if table_='services'then ids=ids||jsonb_build_object(private.consumer_code('s',id_::uuid),'services');end if;
   end if;
  end loop;
 end loop;
 for table_,rows_ in select key,value from jsonb_each(p_config->'tables')loop
  for row_ in select value from jsonb_array_elements(rows_)loop
   for ref_,value_ in select key,value from jsonb_each(row_)loop
    target=case when ref_ in('service_id','source_id','target_id')then 'services'when ref_='category_id'then'service_categories'when ref_ in('image_media_id','logo_id','cover_id')then'company_media'else null end;
    if target is not null and value_<>'null'::jsonb and ids->>(value_#>>'{}')is distinct from target then raise exception 'commercial_configuration_reference_invalid';end if;
    target=case ref_ when'media_ids'then'company_media'when'service_order'then'services'else null end;
    if target is not null and value_<>'null'::jsonb then
     if jsonb_typeof(value_)<>'array'then raise exception 'commercial_configuration_invalid';end if;
     for id_ in select jsonb_array_elements_text(value_)loop
      if ids->>id_ is distinct from target then raise exception 'commercial_configuration_reference_invalid';end if;
     end loop;
    end if;
   end loop;
  end loop;
 end loop;
end;$$;
revoke all on function private.commercial_config_validate(jsonb)from public,anon,authenticated,service_role;

commit;

-- SYZIA 056: minimal administrative preregistration. No billing or activation changes.
-- Apply only after review. Existing versions, rows, ACLs and FORCE RLS are preserved.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table private.acquisition_leads alter column company drop not null;
alter table private.acquisition_leads alter column email drop not null;
alter table private.acquisition_leads alter column interest drop not null;
alter table private.commercial_contacts alter column first_contact drop not null;
alter table private.commercial_contacts alter column first_contact drop default;
create or replace function public.commercial_contact_save(p_id uuid,p_revision integer,p_key uuid,p_data jsonb)returns jsonb language plpgsql security definer set search_path=''as $$
declare id_ uuid;c private.commercial_contacts;l private.acquisition_leads;stage_ text;owner_ uuid;prior_ private.commercial_commands;payload_ jsonb;begin
 perform private.commercial_require('commercial.manage');perform pg_advisory_xact_lock(734921554);
 if p_key is null or p_data is null or jsonb_typeof(p_data)<>'object' or (p_data-array['name','company','phone','email','segment','instagram','first_contact','stage','notes','owner_id'])<>'{}'::jsonb then raise exception 'commercial_invalid';end if;
 payload_=jsonb_build_object('id',p_id,'revision',p_revision,'data',p_data);
 select *into prior_ from private.commercial_commands where request_key=p_key;
 if prior_.request_key is not null then
 if prior_.actor_id is distinct from auth.uid()or prior_.payload_hash is distinct from encode(extensions.digest(payload_::text,'sha256'),'hex') then raise exception 'idempotency_conflict';end if;
 perform private.commercial_require('commercial.manage',prior_.lead_id);return jsonb_build_object('id',prior_.lead_id,'reused',true);end if;
 if p_id is not null then
  perform private.commercial_require('commercial.manage',p_id);
  select *into c from private.commercial_contacts where lead_id=p_id for update;
  if c.revision is distinct from p_revision then raise exception 'commercial_revision_conflict'using errcode='40001';end if;
  select *into l from private.acquisition_leads where id=p_id;
  p_data=jsonb_build_object('name',l.name,'company',l.company,'phone',l.phone,'email',l.email,'segment',c.segment,'instagram',c.instagram,'first_contact',c.first_contact,'notes',c.notes)||p_data;
 end if;
 p_data=p_data||jsonb_build_object('name',btrim(p_data->>'name'),'company',nullif(btrim(p_data->>'company'),''),'email',nullif(lower(btrim(p_data->>'email')),''));
 stage_=coalesce(p_data->>'stage',(select stage from private.commercial_contacts where lead_id=p_id),'prospect');
 if stage_ not in('prospect','contacted','interested','preparing','wants_trial','not_interested','archived')and(p_id is null or p_data->>'stage'is not null)then raise exception 'commercial_event_required';end if;
 if length(coalesce(p_data->>'name',''))not between 2 and 120 or (p_data->>'company' is not null and length(p_data->>'company')not between 2 and 160) or length(p_data->>'email')>254 or p_data->>'email'!~'^[^[:space:]@<>,;:()\[\]\\"]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then raise exception 'commercial_invalid';end if;
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
  insert into private.acquisition_leads(request_key,name,company,phone,email,interest)values(p_key,btrim(p_data->>'name'),btrim(p_data->>'company'),nullif(btrim(p_data->>'phone'),''),lower(btrim(p_data->>'email')),null)returning id into id_;
  insert into private.commercial_contacts(lead_id,owner_id)values(id_,owner_);
 else
  id_=p_id;perform private.commercial_require('commercial.manage',id_);
  select *into c from private.commercial_contacts where lead_id=id_ for update;
  if c.revision is distinct from p_revision then raise exception 'commercial_revision_conflict'using errcode='40001';end if;
  -- Changing a destination does not carry authorization from the old recipient.
  if exists(select 1 from private.acquisition_leads where id=id_ and email is distinct from lower(btrim(p_data->>'email')))then delete from private.commercial_authorizations where lead_id=id_;end if;
  update private.acquisition_leads set name=btrim(p_data->>'name'),company=btrim(p_data->>'company'),phone=nullif(btrim(p_data->>'phone'),''),email=lower(btrim(p_data->>'email')),revision=revision+1 where id=id_;
 end if;
 update private.commercial_contacts set owner_id=owner_,segment=coalesce(p_data->>'segment',''),instagram=coalesce(p_data->>'instagram',''),first_contact=nullif(p_data->>'first_contact','')::date,stage=stage_,notes=coalesce(p_data->>'notes',''),revision=case when p_id is null then 1 else revision+1 end,updated_at=clock_timestamp()where lead_id=id_;
 insert into private.commercial_commands values(p_key,auth.uid(),encode(extensions.digest(payload_::text,'sha256'),'hex'),id_);
 insert into private.commercial_contact_events(lead_id,actor_id,event)values(id_,auth.uid(),case when p_id is null then 'created'else 'updated'end);
 return jsonb_build_object('id',id_,'reused',false);
end;$$;

create or replace function public.acquisition_lead_submit(p_key uuid,p_name text,p_company text,p_phone text,p_email text,p_interest text)returns jsonb language plpgsql security definer set search_path=''as $$declare l private.acquisition_leads;begin
 if p_name is null or p_company is null or p_email is null or p_interest is null then raise exception 'acquisition_invalid';end if;
 perform pg_advisory_xact_lock(734921501);select * into l from private.acquisition_leads where request_key=p_key;
 if l.id is not null then
 if l.name is distinct from btrim(p_name)or l.company is distinct from btrim(p_company)or l.phone is distinct from btrim(p_phone)or l.email is distinct from lower(btrim(p_email))or l.interest is distinct from btrim(p_interest)then raise exception 'idempotency_conflict';end if;
 else
 insert into private.acquisition_leads(request_key,name,company,phone,email,interest)values(p_key,btrim(p_name),btrim(p_company),btrim(p_phone),lower(btrim(p_email)),btrim(p_interest))returning * into l;
 insert into private.acquisition_events(lead_id,event)values(l.id,'lead_received');end if;
 return jsonb_build_object('received',true);end;$$;

create or replace function public.commercial_contact_authorize(p_id uuid,p_purpose text,p_authorized boolean,p_notice text,p_evidence text,p_expires timestamptz)returns void language plpgsql security definer set search_path=''as $$begin
 perform private.commercial_require('commercial.manage',p_id);
 if not exists(select 1 from private.acquisition_leads where id=p_id and email is not null)then raise exception 'commercial_email_required';end if;
 if p_expires<=clock_timestamp()or p_authorized is null then raise exception 'commercial_invalid';end if;
 insert into private.commercial_authorization_history(lead_id,purpose,email_hash,authorized,notice_version,evidence,expires_at,actor_id)select p_id,p_purpose,encode(extensions.digest(lower(email),'sha256'),'hex'),p_authorized,p_notice,p_evidence,p_expires,auth.uid()from private.acquisition_leads where id=p_id;
 insert into private.commercial_authorizations values(p_id,p_purpose,p_authorized,p_notice,p_evidence,p_expires,auth.uid(),clock_timestamp())on conflict(lead_id,purpose)do update set authorized=excluded.authorized,notice_version=excluded.notice_version,evidence=excluded.evidence,expires_at=excluded.expires_at,actor_id=excluded.actor_id,updated_at=excluded.updated_at;
 insert into private.commercial_contact_events(lead_id,actor_id,event)values(p_id,auth.uid(),'authorization');
end;$$;

create or replace function public.commercial_contact_suppress(p_id uuid)returns void language plpgsql security definer set search_path=''as $$begin
 perform private.commercial_require('commercial.manage',p_id);
 if not exists(select 1 from private.acquisition_leads where id=p_id and email is not null)then raise exception 'commercial_email_required';end if;
 insert into private.commercial_suppressions(email_hash,actor_id)select encode(extensions.digest(lower(email),'sha256'),'hex'),auth.uid()from private.acquisition_leads where id=p_id on conflict do nothing;
 update private.commercial_authorizations set authorized=false,updated_at=clock_timestamp()where lead_id=p_id;
 insert into private.commercial_contact_events(lead_id,actor_id,event)values(p_id,auth.uid(),'suppressed');
end;$$;

create or replace function private.commercial_mail_eligible(p_lead uuid,p_purpose text)returns boolean language sql stable security definer set search_path=''as $$
 select exists(select 1 from private.commercial_contacts c join private.acquisition_leads l on l.id=c.lead_id join private.commercial_authorizations a on a.lead_id=c.lead_id and a.purpose=p_purpose where c.lead_id=p_lead and l.email is not null and c.stage not in('not_interested','archived')and a.authorized and a.expires_at>clock_timestamp()and not exists(select 1 from private.commercial_suppressions s where s.email_hash=encode(extensions.digest(lower(l.email),'sha256'),'hex')));
$$;
commit;

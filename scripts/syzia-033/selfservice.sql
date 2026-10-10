create table private.selfservice_drafts(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),request_key uuid not null,
 name text not null check(length(btrim(name))between 2 and 160),slug text not null check(slug~'^[a-z0-9]+(-[a-z0-9]+)*$'and length(slug)between 2 and 70),phone text not null default ''check(length(phone)<=40),
 document_kind text not null check(document_kind in('CPF','CNPJ')),document_masked text not null,registration_fingerprint bytea not null,identity_fingerprint bytea not null,responsible_fingerprint bytea,request_hash bytea not null,
 plan_version_id uuid not null references public.billing_plan_versions(id),revision int not null default 1,quote_until timestamptz not null,trial_end timestamptz not null,
 state text not null default 'payment_pending'check(state in('payment_pending','ready','review','completed','cancelled')),eligibility text not null,
 organization_id uuid references public.organizations(id),created_at timestamptz not null default clock_timestamp(),unique(user_id,request_key)
);
create unique index selfservice_one_open on private.selfservice_drafts(user_id)where state not in('completed','cancelled');
create table private.selfservice_payments(
 draft_id uuid primary key references private.selfservice_drafts(id),revision int not null,reference text not null unique check(length(reference)between 8 and 160),provider text not null,
 simulation boolean not null,valid_until timestamptz not null,created_at timestamptz not null default clock_timestamp()
);
create table private.selfservice_consents(
 draft_id uuid primary key references private.selfservice_drafts(id),user_id uuid not null,organization_id uuid not null references public.organizations(id),plan_version_id uuid not null references public.billing_plan_versions(id),
 price_cents int not null,interval_months int not null,trial_end timestamptz not null,statement text not null,conditions_version text not null default 'selfservice-033',payment_reference text not null,simulation boolean not null,accepted_at timestamptz not null default clock_timestamp()
);
create function private.selfservice_eligibility(p_user uuid,p_kind text,p_fingerprint bytea)returns text language plpgsql stable security definer set search_path=''as $$declare policy_ private.trial_policy;begin
 select * into policy_ from private.trial_policy;
 if not policy_.auto_enabled then return 'manual_policy';end if;
 if exists(select 1 from private.trial_consumed_keys where(kind='account'and fingerprint=private.trial_fingerprint('account',p_user::text))or(kind='business'and fingerprint=p_fingerprint))then return 'previous_identity';end if;
 if not (policy_.required_types && (case when p_kind='CPF'then array['business','responsible']else array['business']end)) then return 'verification_required';end if;
 if 'phone'=any(policy_.required_types)then return 'verification_required';end if;
 return 'eligible';end;$$;
create function private.selfservice_projection(p_id uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select jsonb_build_object('id',d.id,'name',d.name,'slug',d.slug,'phone',d.phone,'document_kind',d.document_kind,'document_masked',d.document_masked,'revision',d.revision,'state',d.state,'eligibility',d.eligibility,'organization_id',d.organization_id,'quote_until',d.quote_until,'trial_end',d.trial_end,
 'plan',jsonb_build_object('id',p.id,'name',p.name,'version_id',v.id,'price_cents',v.price_cents,'interval_months',v.interval_months,'trial_days',v.trial_days),
 'payment_valid',exists(select 1 from private.selfservice_payments m where m.draft_id=d.id and m.revision=d.revision and m.valid_until>clock_timestamp()),
 'simulation',coalesce((select simulation from private.selfservice_payments where draft_id=d.id),false))
 from private.selfservice_drafts d join public.billing_plan_versions v on v.id=d.plan_version_id join public.billing_plans p on p.id=v.plan_id where d.id=p_id;$$;
create function public.selfservice_context()returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 if not private.is_active_user()then raise exception 'access_denied'using errcode='42501';end if;
 return private.selfservice_projection((select id from private.selfservice_drafts where user_id=auth.uid()order by created_at desc limit 1));end;$$;
create function public.selfservice_save(p_id uuid,p_revision int,p_name text,p_slug text,p_phone text,p_kind text,p_document text,p_plan uuid,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare d private.selfservice_drafts;v public.billing_plan_versions;doc text;fp bytea;why text;until_ timestamptz;hash_ bytea;begin
 if not private.is_active_user()then raise exception 'access_denied'using errcode='42501';end if;
 perform pg_advisory_xact_lock(734921501);
 hash_=private.trial_fingerprint('selfservice_request',jsonb_build_array(p_name,p_slug,p_phone,p_kind,p_document,p_plan)::text);
 select * into d from private.selfservice_drafts where user_id=auth.uid()and request_key=p_key;
 if d.id is not null then if d.request_hash<>hash_ then raise exception 'idempotency_conflict';end if;return private.selfservice_projection(d.id);end if;
 select pv.*into v from public.billing_plan_versions pv join public.billing_plans p on p.id=pv.plan_id and p.revision=pv.version where p.id=p_plan and p.active and p.available and p.site_visible and p.self_service;
 if v.id is null then raise exception 'billing_trial_unavailable';end if;
 if p_id is null then select *into d from private.selfservice_drafts where user_id=auth.uid()and state not in('completed','cancelled');else select *into d from private.selfservice_drafts where id=p_id and user_id=auth.uid()for update;if d.id is null then raise exception 'access_denied'using errcode='42501';end if;end if;
 if d.id is not null and(d.revision<>p_revision or d.state in('completed','cancelled'))then raise exception 'selfservice_revision_conflict'using errcode='40001';end if;
 doc=private.document_normalize(p_kind,p_document);if doc is null then raise exception 'document_invalid';end if;
 fp=private.trial_fingerprint('business','BR:'||p_kind||':'||doc);why=case when v.trial_days>0 and (select self_service_trial from public.billing_plans where id=v.plan_id)then private.selfservice_eligibility(auth.uid(),p_kind,fp)else 'trial_not_offered'end;until_=clock_timestamp()+make_interval(days=>v.trial_days);
 if d.id is null then
 insert into private.selfservice_drafts(user_id,request_key,name,slug,phone,document_kind,document_masked,registration_fingerprint,identity_fingerprint,responsible_fingerprint,request_hash,plan_version_id,quote_until,trial_end,state,eligibility)
 values(auth.uid(),p_key,btrim(p_name),p_slug,btrim(p_phone),p_kind,case when p_kind='CPF'then '***.***.***-'else '**.***.***/****-'end||right(doc,2),private.trial_fingerprint('registration','BR:'||p_kind||':'||doc),fp,case when p_kind='CPF'then private.trial_fingerprint('responsible','BR:CPF:'||doc)end,hash_,v.id,clock_timestamp()+interval '20 minutes',until_,case when why='eligible'then 'payment_pending'else 'review'end,why)returning *into d;
 insert into private.acquisition_events(user_id,event)values(auth.uid(),'registration_started');
 else
 update private.selfservice_drafts set request_key=p_key,name=btrim(p_name),slug=p_slug,phone=btrim(p_phone),document_kind=p_kind,document_masked=case when p_kind='CPF'then '***.***.***-'else '**.***.***/****-'end||right(doc,2),registration_fingerprint=private.trial_fingerprint('registration','BR:'||p_kind||':'||doc),identity_fingerprint=fp,responsible_fingerprint=case when p_kind='CPF'then private.trial_fingerprint('responsible','BR:CPF:'||doc)end,request_hash=hash_,plan_version_id=v.id,quote_until=clock_timestamp()+interval '20 minutes',trial_end=until_,revision=revision+1,state=case when why='eligible'then 'payment_pending'else 'review'end,eligibility=why where id=d.id returning *into d;
 end if;
 return private.selfservice_projection(d.id);end;$$;
-- No direct client grant: only the authenticated server adapter may bind a validated provider method.
create function public.selfservice_payment_bind(p_user uuid,p_id uuid,p_revision int,p_reference text,p_provider text,p_simulation boolean)returns jsonb language plpgsql security definer set search_path=''as $$declare d private.selfservice_drafts;begin
 perform private.require_eligible_user(p_user);perform pg_advisory_xact_lock(734921501);
 select *into d from private.selfservice_drafts where id=p_id and user_id=p_user for update;
 if d.id is null or d.revision<>p_revision or d.state not in('payment_pending','ready')or d.quote_until<=clock_timestamp()then raise exception 'selfservice_quote_expired';end if;
 if p_simulation is distinct from true or p_provider<>'mock'or not(select mock_enabled from private.billing_runtime)then raise exception 'billing_provider_not_configured';end if;
 insert into private.selfservice_payments(draft_id,revision,reference,provider,simulation,valid_until)values(d.id,d.revision,p_reference,p_provider,true,d.quote_until)
 on conflict(draft_id)do update set revision=excluded.revision,reference=excluded.reference,provider=excluded.provider,simulation=excluded.simulation,valid_until=excluded.valid_until;
 update private.selfservice_drafts set state='ready'where id=d.id;
 return private.selfservice_projection(d.id);end;$$;
create function public.selfservice_complete(p_id uuid,p_revision int,p_consent boolean,p_conditions text)returns jsonb language plpgsql security definer set search_path=''as $$
declare d private.selfservice_drafts;m private.selfservice_payments;v public.billing_plan_versions;a private.enterprise_accounts;org uuid;why text;statement_ text;k text;begin
 if not private.is_active_user()then raise exception 'access_denied'using errcode='42501';end if;
 perform pg_advisory_xact_lock(734921501);select *into d from private.selfservice_drafts where id=p_id and user_id=auth.uid()for update;
 if d.id is null then raise exception 'access_denied'using errcode='42501';end if;
 if d.state='completed'then return private.selfservice_projection(d.id);end if;
 if p_consent is distinct from true or p_conditions<>'selfservice-033'then raise exception 'selfservice_consent_required';end if;
 if d.revision<>p_revision or d.quote_until<=clock_timestamp()then raise exception 'selfservice_quote_expired';end if;
 select *into m from private.selfservice_payments where draft_id=d.id and revision=d.revision and valid_until>clock_timestamp();
 if m.draft_id is null then raise exception 'selfservice_payment_required';end if;
 if not m.simulation or m.provider<>'mock'or not(select mock_enabled from private.billing_runtime)then raise exception 'billing_provider_not_configured';end if;
 select pv.*into v from public.billing_plan_versions pv join public.billing_plans p on p.id=pv.plan_id and p.revision=pv.version where pv.id=d.plan_version_id and p.active and p.available and p.site_visible and p.self_service and p.self_service_trial;
 if v.id is null then raise exception 'billing_plan_unavailable';end if;
 why=private.selfservice_eligibility(auth.uid(),d.document_kind,d.identity_fingerprint);if why<>'eligible'then raise exception 'trial_review_required';end if;
 select *into a from private.enterprise_accounts where user_id=auth.uid()and state='active'order by(organization_id is null)desc,created_at limit 1;
 if a.id is null then raise exception 'access_denied'using errcode='42501';end if;
 insert into public.organizations(name,slug)values(d.name,d.slug)returning id into org;
 update private.enterprise_codes set legal_required=true where organization_id=org;
 insert into public.billing_subscriptions(organization_id,plan_version_id,state,period_start,period_end,trial_used)values(org,v.id,'trial',clock_timestamp(),d.trial_end,true);
 insert into public.organization_members(organization_id,user_id,role)values(org,auth.uid(),'admin_empresa');
 insert into private.enterprise_accounts(organization_id,user_id,username,display_name,contact_email,phone,role,state,requested_by,request_key,activated_at,generation,operation_id)values(org,auth.uid(),a.username,a.display_name,a.contact_email,d.phone,'admin_empresa','active',auth.uid(),gen_random_uuid(),clock_timestamp(),a.generation,a.operation_id);
 update private.organization_verifications set required=true,state='verified',kind=d.document_kind,masked=d.document_masked,fingerprint=d.registration_fingerprint,verified_by=auth.uid(),verified_at=clock_timestamp(),revision=revision+1 where organization_id=org;
 -- Same structural document check as 030; no claim of government verification.
 insert into private.trial_identifiers(organization_id,kind,fingerprint,verified_by,evidence_ref)values(org,'business',d.identity_fingerprint,auth.uid(),'self_declared_structure_033');
 if d.document_kind='CPF'then
 -- responsible is separately namespaced, derived before discarding the raw document.
 insert into private.trial_identifiers(organization_id,kind,fingerprint,verified_by,evidence_ref)values(org,'responsible',d.responsible_fingerprint,auth.uid(),'self_declared_structure_033');end if;
 perform private.trial_record(org,v.id,clock_timestamp(),d.trial_end,'automatic','Self-service: explicit plan, validated simulated method and consent');
 statement_='Grátis até '||to_char(d.trial_end at time zone 'America/Recife','DD/MM/YYYY')||'. Depois, R$ '||replace(to_char(v.price_cents/100.0,'FM999999990.00'),'.',',')||case when v.interval_months=1 then '/mês'else ' a cada '||v.interval_months||' meses'end||' no Plano '||(select name from public.billing_plans where id=v.plan_id)||', salvo cancelamento conforme as condições apresentadas.';
 insert into private.selfservice_consents(draft_id,user_id,organization_id,plan_version_id,price_cents,interval_months,trial_end,statement,payment_reference,simulation)values(d.id,auth.uid(),org,v.id,v.price_cents,v.interval_months,d.trial_end,statement_,m.reference,m.simulation);
 update private.selfservice_drafts set state='completed',organization_id=org where id=d.id;
 insert into private.acquisition_events(user_id,organization_id,event,simulation)values(auth.uid(),org,'company_registered',m.simulation),(auth.uid(),org,'trial_started',m.simulation);
 perform private.billing_event(org,'trial_started',null,jsonb_build_object('self_service',true,'simulation',m.simulation,'consent',d.id));
 -- Existing business onboarding is initialized only after selecting this company's context.
 return private.selfservice_projection(d.id);end;$$;
create function public.acquisition_context()returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 if not private.people_can('acquisition.read')and not private.people_can('acquisition.manage')then raise exception 'access_denied'using errcode='42501';end if;
 return jsonb_build_object('can_manage',private.people_can('acquisition.manage'),'leads',coalesce((select jsonb_agg(to_jsonb(l)order by created_at desc)from(select *from private.acquisition_leads order by created_at desc limit 300)l),'[]'),
 'registrations',coalesce((select jsonb_agg(jsonb_build_object('name',d.name,'state',d.state,'created_at',d.created_at,'organization_id',d.organization_id,'person',p.display_name)order by d.created_at desc)from private.selfservice_drafts d join public.profiles p on p.id=d.user_id),'[]'),
 'trials',coalesce((select jsonb_agg(jsonb_build_object('name',o.name,'state',g.status,'starts_at',g.starts_at,'ends_at',g.ends_at,'mode',g.mode,'simulation',coalesce(c.simulation,false)))from private.trial_grants g join public.organizations o on o.id=g.organization_id left join private.selfservice_consents c on c.organization_id=o.id),'[]'),
 'conversions',coalesce((select jsonb_agg(jsonb_build_object('name',o.name,'event',e.event,'created_at',e.created_at,'simulation',e.simulation))from private.acquisition_events e join public.organizations o on o.id=e.organization_id where e.event='converted'),'[]'),
 'indicators',jsonb_build_object('leads',(select count(*)from private.acquisition_events where event='lead_received'),'new_registrations',(select count(*)from private.acquisition_events where event='company_registered'),'trials',(select count(*)from private.acquisition_events where event='trial_started'),'real_conversions',(select count(*)from private.acquisition_events where event='converted'and not simulation),'simulated_conversions',(select count(*)from private.acquisition_events where event='converted'and simulation)));end;$$;
-- Explicit due processing prepares an invoice, never assumes that approval means payment.
create function public.selfservice_billing_due(p_org uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare s public.billing_subscriptions;v public.billing_plan_versions;i uuid;begin
 perform pg_advisory_xact_lock(734921501);
 if not(select mock_enabled from private.billing_runtime)or not exists(select 1 from private.selfservice_consents where organization_id=p_org and simulation)then raise exception 'billing_provider_not_configured';end if;
 select *into s from public.billing_subscriptions where organization_id=p_org for update;
 if s.organization_id is null or s.period_end>clock_timestamp()then return jsonb_build_object('due',false);end if;
 if s.cancel_at_end then
 update public.billing_subscriptions set state='cancelled',revision=revision+1 where organization_id=p_org and state<>'cancelled';
 return jsonb_build_object('cancelled',true);end if;
 if s.state in('cancelled','suspended')then return jsonb_build_object('blocked',true);end if;
 select id into i from public.billing_invoices where organization_id=p_org and state='pending';
 if i is null then
 select *into v from public.billing_plan_versions where id=s.plan_version_id;
 update public.billing_subscriptions set state='pending',revision=revision+1 where organization_id=p_org returning *into s;
 insert into public.billing_invoices(organization_id,plan_version_id,subscription_revision,purpose,amount_cents,due_at)values(p_org,v.id,s.revision,'renew',v.price_cents,clock_timestamp())returning id into i;
 perform private.billing_event(p_org,'invoice_created',i,jsonb_build_object('simulation',true,'self_service',true));end if;
 return jsonb_build_object('invoice_id',i,'simulation',true);end;$$;
-- Count first conversion, not renewal invoices; simulation is inherited from the consent.
create unique index acquisition_first_conversion on private.acquisition_events(organization_id)where event='converted';
create function private.acquisition_conversion()returns trigger language plpgsql security definer set search_path=''as $$begin
 if new.state='active'and old.state<>'active'then
 insert into private.acquisition_events(user_id,organization_id,event,simulation)
 select user_id,new.organization_id,'converted',simulation from private.selfservice_consents where organization_id=new.organization_id
 on conflict(organization_id)where event='converted'do nothing;end if;return new;end;$$;
create trigger acquisition_conversion after update on public.billing_subscriptions for each row execute function private.acquisition_conversion();
-- Stop new public actions before the user fills a form; existing tracking remains available.
alter function public.consumer_public_page(text)rename to consumer_public_page_032;
alter function public.consumer_public_page_032(text)set schema private;
revoke all on function private.consumer_public_page_032(text)from public,anon,authenticated,service_role;
create function public.consumer_public_page(p_slug text)returns jsonb language plpgsql stable security definer set search_path=''as $$declare org uuid;begin
 select id into org from public.organizations where slug=p_slug;
 if org is null or not private.entitlement(org,'software')then return null;end if;
 return private.consumer_public_page_032(p_slug);end;$$;

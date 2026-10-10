begin;
-- Persistent anti-abuse registry. No raw business/person/phone identifiers retained.
-- Deliberately no org/profile FK: deleting a tenant/account cannot erase eligibility history.
create table private.trial_secret(singleton boolean primary key default true check(singleton), secret text not null);
insert into private.trial_secret values(true,gen_random_uuid()::text||gen_random_uuid()::text);
create table private.trial_policy(
 singleton boolean primary key default true check(singleton), revision integer not null default 1 check(revision>0),
 auto_enabled boolean not null default true,
 required_types text[] not null default array['business','responsible'] check(cardinality(required_types)>0 and required_types <@ array['business','responsible','phone']::text[]),
 match_types text[] not null default array['business','responsible','phone'] check(cardinality(match_types)>0 and match_types @> array['business','responsible']::text[] and match_types <@ array['business','responsible','phone']::text[]),
 max_admin_days integer not null default 90 check(max_admin_days between 1 and 365)
);
insert into private.trial_policy(singleton) values(true);
create table private.trial_identifiers(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 kind text not null check(kind in ('business','responsible','phone')), fingerprint bytea not null check(octet_length(fingerprint)=32),
 verified_by uuid not null, verified_at timestamptz not null default clock_timestamp(), evidence_ref text not null check(length(evidence_ref) between 5 and 120),
 unique(organization_id,kind,fingerprint)
);
create index trial_identity_match on private.trial_identifiers(kind,fingerprint);
create table private.trial_grants(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, plan_version_id uuid not null references public.billing_plan_versions(id),
 starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at),
 status text not null default 'active' check(status in ('active','suspended','cancelled','converted','ended')),
 mode text not null check(mode in ('automatic','administrative','legacy')), legacy_dates_uncertain boolean not null default false, actor_id uuid,
 reason text not null check(length(reason) between 5 and 300), created_at timestamptz not null default clock_timestamp()
);
create index trial_grants_org on private.trial_grants(organization_id,created_at desc);
create table private.trial_claims(
 grant_id uuid not null references private.trial_grants(id),kind text not null check(kind in ('business','responsible','phone','account')), fingerprint bytea not null check(octet_length(fingerprint)=32),
 primary key(grant_id,kind,fingerprint)
);
create index trial_claim_match on private.trial_claims(kind,fingerprint);
-- One consumed identity independently of transaction snapshot/isolation level.
create table private.trial_consumed_keys(
 kind text not null check(kind in ('business','responsible','phone','account')),fingerprint bytea not null check(octet_length(fingerprint)=32),
 first_grant_id uuid not null references private.trial_grants(id),primary key(kind,fingerprint)
);
create table private.trial_extensions(
 id uuid primary key default gen_random_uuid(),grant_id uuid not null references private.trial_grants(id),
 previous_end timestamptz not null,new_end timestamptz not null check(new_end>previous_end),actor_id uuid not null,
 reason text not null check(length(reason) between 10 and 300),created_at timestamptz not null default clock_timestamp()
);
create table private.trial_requests(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,plan_id uuid not null references public.billing_plans(id),actor_id uuid not null,
 state text not null default 'pending' check(state in ('pending','approved','denied')),revision integer not null default 1 check(revision>0),
 risk_reason text not null,decision_reason text,decided_by uuid,created_at timestamptz not null default clock_timestamp(),decided_at timestamptz
);
create unique index trial_one_pending_request on private.trial_requests(organization_id) where state='pending';
create table private.trial_admin_commands(actor_id uuid not null,key uuid not null,payload jsonb not null,result jsonb not null,primary key(actor_id,key));
create table private.trial_audit(
 id uuid primary key default gen_random_uuid(),organization_id uuid,actor_id uuid,action text not null,
 details jsonb not null default '{}',created_at timestamptz not null default clock_timestamp()
);
-- Registry is private even to tenant managers; only sanitized, authorized RPC projections.
do $$ declare t text;begin
 foreach t in array array['trial_secret','trial_policy','trial_identifiers','trial_grants','trial_claims','trial_consumed_keys','trial_extensions','trial_requests','trial_admin_commands','trial_audit'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 execute format('create trigger %I before delete on private.%I for each row execute function private.consumer_deny_immutable()',t||'_no_delete',t);
 execute format('create trigger %I before truncate on private.%I for each statement execute function private.consumer_deny_immutable()',t||'_no_truncate',t);
 if t in ('trial_secret','trial_identifiers','trial_claims','trial_consumed_keys','trial_extensions','trial_admin_commands','trial_audit') then
 execute format('create trigger %I before update on private.%I for each row execute function private.consumer_deny_immutable()',t||'_immutable',t);end if;
 end loop;
end;$$;
create function private.trial_fingerprint(p_kind text,p_value text) returns bytea language sql stable security definer set search_path='' as $$
 select sha256(convert_to(p_kind||':'||p_value||':'||secret,'UTF8')) from private.trial_secret;
$$;
create function private.trial_current_claims(p_org uuid) returns table(kind text,fingerprint bytea) language sql stable security definer set search_path='' as $$
 select i.kind,i.fingerprint from private.trial_identifiers i where organization_id=p_org
 union select 'account',private.trial_fingerprint('account',m.user_id::text) from public.organization_members m where m.organization_id=p_org and m.role='admin_empresa' and m.status='active'
 union select 'account',private.trial_fingerprint('account',auth.uid()::text) where auth.uid() is not null and not private.has_global_role('super_admin');
$$;
create function private.trial_eligibility(p_org uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare p private.trial_policy;begin
 select * into p from private.trial_policy;
 if exists(select 1 from private.trial_grants where organization_id=p_org) then return 'previous_grant';end if;
 if exists(select 1 from private.trial_current_claims(p_org) x join private.trial_claims c using(kind,fingerprint) where x.kind='account' or x.kind=any(p.match_types)) then return 'previous_identity';end if;
 if exists(select 1 from private.trial_requests where organization_id=p_org and state='denied') then return 'previous_review';end if;
 if not p.auto_enabled then return 'manual_policy';end if;
 if not exists(select 1 from private.trial_identifiers where organization_id=p_org and kind=any(p.required_types)) then return 'verification_required';end if;
 return 'eligible';
end;$$;
create function private.trial_record(p_org uuid,p_version uuid,p_start timestamptz,p_end timestamptz,p_mode text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare id_ uuid;begin
 insert into private.trial_grants(organization_id,plan_version_id,starts_at,ends_at,mode,actor_id,reason) values(p_org,p_version,p_start,p_end,p_mode,auth.uid(),p_reason) returning id into id_;
 insert into private.trial_claims select id_,kind,fingerprint from private.trial_current_claims(p_org);
 if p_mode='automatic' then
 -- Unique index is a final race barrier even if a transaction holds an old snapshot.
 insert into private.trial_consumed_keys select kind,fingerprint,id_ from private.trial_claims where grant_id=id_ and (kind='account' or kind=any((select match_types from private.trial_policy)::text[]));
 end if;
 insert into private.trial_consumed_keys select kind,fingerprint,id_ from private.trial_claims where grant_id=id_ on conflict do nothing;
 insert into private.trial_audit(organization_id,actor_id,action,details) values(p_org,auth.uid(),'grant',jsonb_build_object('grant',id_,'mode',p_mode,'end',p_end,'reason',p_reason));
 return id_;
end;$$;
-- Backfill legacy concessions, preserving unknown original dates instead of inventing proof.
insert into private.trial_grants(organization_id,plan_version_id,starts_at,ends_at,status,mode,legacy_dates_uncertain,reason)
 select s.organization_id,s.plan_version_id,
 case when s.state='trial' then s.period_start else coalesce((select min(created_at) from public.billing_events e where e.organization_id=s.organization_id and e.event='trial_started'),s.created_at) end,
 case when s.state='trial' then s.period_end else greatest(s.period_end,s.created_at+interval '1 second') end,
 case when s.state='trial' then 'active' when s.state='active' then 'converted' else 'ended' end,'legacy',s.state<>'trial','Migrated historical concession; original dates may be incomplete'
 from public.billing_subscriptions s where s.trial_used or s.state='trial';
insert into private.trial_claims select g.id,'account',private.trial_fingerprint('account',m.user_id::text) from private.trial_grants g join public.organization_members m on m.organization_id=g.organization_id where m.role='admin_empresa' on conflict do nothing;
insert into private.trial_consumed_keys select distinct on (kind,fingerprint) kind,fingerprint,grant_id from private.trial_claims order by kind,fingerprint,grant_id;
insert into private.trial_audit(organization_id,action,details) select organization_id,'legacy_import',jsonb_build_object('grant',id) from private.trial_grants;
-- Preserve old command body privately; public wrapper is the only client entrypoint.
alter function public.billing_subscription_action(uuid,text,uuid,integer,uuid) set schema private;
alter function private.billing_subscription_action(uuid,text,uuid,integer,uuid) rename to billing_subscription_action_base;
revoke all on function private.billing_subscription_action_base(uuid,text,uuid,integer,uuid) from public,anon,authenticated,service_role;
create function public.billing_subscription_action(p_org uuid,p_action text,p_plan uuid,p_revision integer,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare why text;s public.billing_subscriptions;v public.billing_plan_versions;prior public.billing_commands;payload jsonb;result_ jsonb;request_ uuid;begin
 perform private.company_lock(p_org);
 if p_action is distinct from 'trial' then return private.billing_subscription_action_base(p_org,p_action,p_plan,p_revision,p_key);end if;
 if p_key is null then raise exception 'billing_key_required' using errcode='22023';end if;
 payload=jsonb_build_object('action',p_action,'plan',p_plan,'revision',p_revision);
 select * into prior from public.billing_commands where organization_id=p_org and actor_id=auth.uid() and key=p_key;
 if found then if prior.payload<>payload then raise exception 'billing_key_conflict' using errcode='22023';end if;return prior.result;end if;
 select * into s from public.billing_subscriptions where organization_id=p_org;
 if s.organization_id is not null or p_revision is distinct from 0 then return private.billing_subscription_action_base(p_org,p_action,p_plan,p_revision,p_key);end if;
 select pv.* into v from public.billing_plans p join public.billing_plan_versions pv on pv.plan_id=p.id and pv.version=p.revision where p.id=p_plan and p.active and p.available;
 if v.id is null or v.trial_days=0 then raise exception 'billing_trial_unavailable' using errcode='22023';end if;
 why=private.trial_eligibility(p_org);
 if why='eligible' then
 begin
 result_=private.billing_subscription_action_base(p_org,p_action,p_plan,p_revision,p_key);
 select * into s from public.billing_subscriptions where organization_id=p_org;
 perform private.trial_record(p_org,s.plan_version_id,s.period_start,s.period_end,'automatic','Verified eligibility under current policy');
 update private.trial_requests set state='approved',revision=revision+1,decision_reason='Verified automatic eligibility',decided_at=clock_timestamp() where organization_id=p_org and state='pending';
 return result_;
 exception when unique_violation then why='previous_identity'; end;
 end if;
 select id into request_ from private.trial_requests where organization_id=p_org and state='pending';
 if request_ is null then
 insert into private.trial_requests(organization_id,plan_id,actor_id,risk_reason) values(p_org,p_plan,auth.uid(),why) returning id into request_;
 insert into private.trial_audit(organization_id,actor_id,action,details) values(p_org,auth.uid(),'review_requested',jsonb_build_object('request',request_,'risk',why));end if;
 result_=jsonb_build_object('review_required',true,'request_id',request_);
 insert into public.billing_commands values(p_org,auth.uid(),p_key,payload,result_,now());
 return result_;
end;$$;
-- State follows subscription events, while elapsed time is evaluated at read/use time.
create function private.trial_sync() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update private.trial_grants set status=case when new.state='active' then 'converted' when new.state='suspended' then 'suspended' when new.state='cancelled' then 'cancelled' when new.state='trial' then 'active' else 'ended' end
 where organization_id=new.organization_id and status in ('active','suspended') and status is distinct from case when new.state='active' then 'converted' when new.state='suspended' then 'suspended' when new.state='cancelled' then 'cancelled' when new.state='trial' then 'active' else 'ended' end;
 return new;
end;$$;
create trigger trial_subscription_sync after update on public.billing_subscriptions for each row execute function private.trial_sync();
-- A subsequently verified identifier is also bound to prior concessions (cannot erase history by waiting).
create function public.billing_trial_verify(p_org uuid,p_kind text,p_value text,p_evidence text,p_reason text,p_verified boolean) returns void language plpgsql security definer set search_path='' as $$
declare canonical text;fp bytea;begin
 perform private.lock_authorize('global');
 if p_verified is distinct from true or p_kind is null or p_kind not in ('business','responsible','phone') or p_reason is null or length(btrim(p_reason)) not between 10 and 300 or p_evidence is null or length(btrim(p_evidence)) not between 5 and 120 then raise exception 'trial_verification_required' using errcode='22023';end if;
 if not exists(select 1 from public.organizations where id=p_org) then raise exception 'access_denied' using errcode='42501';end if;
 -- Namespace/country prefixes are required for legal IDs; no validation or verification is inferred from syntax.
 if p_kind='phone' then canonical=regexp_replace(p_value,'[ ()-]','','g');
 if canonical is null or canonical !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'trial_identifier_invalid' using errcode='22023';end if;
 else canonical=upper(regexp_replace(btrim(p_value),'[ .\/-]','','g'));
 if canonical is null or canonical !~ '^[A-Z]{2}:[A-Z0-9]{2,12}:[A-Z0-9]{5,40}$' then raise exception 'trial_identifier_invalid' using errcode='22023';end if;end if;
 fp=private.trial_fingerprint(p_kind,canonical);
 insert into private.trial_identifiers(organization_id,kind,fingerprint,verified_by,evidence_ref) values(p_org,p_kind,fp,auth.uid(),btrim(p_evidence)) on conflict do nothing;
 insert into private.trial_claims select id,p_kind,fp from private.trial_grants where organization_id=p_org on conflict do nothing;
 insert into private.trial_consumed_keys select distinct on (kind,fingerprint) kind,fingerprint,grant_id from private.trial_claims c join private.trial_grants g on g.id=c.grant_id where g.organization_id=p_org order by kind,fingerprint,grant_id on conflict do nothing;
 insert into private.trial_audit(organization_id,actor_id,action,details) values(p_org,auth.uid(),'identifier_verified',jsonb_build_object('kind',p_kind,'evidence_ref',btrim(p_evidence),'reason',btrim(p_reason)));
end;$$;
create function public.billing_trial_policy_save(p_revision integer,p_auto boolean,p_required text[],p_match text[],p_max_days integer,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_authorize('global');
 if p_reason is null or length(btrim(p_reason)) not between 10 and 300 then raise exception 'billing_reason_required' using errcode='22023';end if;
 update private.trial_policy set revision=revision+1,auto_enabled=p_auto,required_types=p_required,match_types=p_match,max_admin_days=p_max_days where revision=p_revision;
 if not found then raise exception 'billing_revision_conflict' using errcode='40001';end if;
 insert into private.trial_audit(actor_id,action,details) values(auth.uid(),'policy_changed',jsonb_build_object('revision',p_revision+1,'auto',p_auto,'required',p_required,'match',p_match,'max_days',p_max_days,'reason',p_reason));
end;$$;
create function public.billing_trial_admin(p_org uuid,p_action text,p_request uuid,p_revision integer,p_days integer,p_reason text,p_override boolean,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.billing_subscriptions;r private.trial_requests;g private.trial_grants;v public.billing_plan_versions;prior private.trial_admin_commands;payload jsonb;res jsonb;until_ timestamptz;id_ uuid;why text;begin
 perform private.lock_authorize('global');
 if p_key is null or p_reason is null or length(btrim(p_reason)) not between 10 and 300 then raise exception 'billing_reason_required' using errcode='22023';end if;
 payload=jsonb_build_object('org',p_org,'action',p_action,'request',p_request,'revision',p_revision,'days',p_days,'reason',p_reason,'override',p_override);
 select * into prior from private.trial_admin_commands where actor_id=auth.uid() and key=p_key;
 if found then if prior.payload<>payload then raise exception 'billing_key_conflict' using errcode='22023';end if;return prior.result;end if;
 if not exists(select 1 from public.organizations where id=p_org and status='active') then raise exception 'access_denied' using errcode='42501';end if;
 select * into s from public.billing_subscriptions where organization_id=p_org for update;
 if coalesce(s.revision,0) is distinct from p_revision then raise exception 'billing_revision_conflict' using errcode='40001';end if;
 if p_action in ('approve','deny') then
 select * into r from private.trial_requests where id=p_request and organization_id=p_org and state='pending' for update;
 if r.id is null then raise exception 'trial_request_invalid' using errcode='22023';end if;
 if p_action='approve' then
 if s.organization_id is not null then raise exception 'billing_transition_invalid' using errcode='22023';end if;
 why=private.trial_eligibility(p_org);
 if why<>'eligible' and p_override is distinct from true then raise exception 'trial_override_required' using errcode='22023';end if;
 select pv.* into v from public.billing_plan_versions pv join public.billing_plans p on p.id=pv.plan_id and p.revision=pv.version where p.id=r.plan_id and p.active and p.available;
 if v.id is null or v.trial_days=0 then raise exception 'billing_trial_unavailable' using errcode='22023';end if;
 if p_days is null or p_days<1 or p_days>(select max_admin_days from private.trial_policy) then raise exception 'trial_days_invalid' using errcode='22023';end if;
 until_=now()+make_interval(days=>p_days);
 insert into public.billing_subscriptions(organization_id,plan_version_id,state,period_start,period_end,trial_used) values(p_org,v.id,'trial',now(),until_,true);
 id_=private.trial_record(p_org,v.id,now(),until_,'administrative',btrim(p_reason));
 perform private.billing_event(p_org,'trial_started',null,jsonb_build_object('administrative',true,'ends_at',until_));
 end if;
 update private.trial_requests set state=case when p_action='approve' then 'approved' else 'denied' end,revision=revision+1,decision_reason=btrim(p_reason),decided_by=auth.uid(),decided_at=clock_timestamp() where id=r.id;
 elsif p_action='extend' then
 if s.state not in ('trial','cancelled') or s.organization_id is null or exists(select 1 from public.billing_invoices where organization_id=p_org and state='pending') then raise exception 'billing_transition_invalid' using errcode='22023';end if;
 if p_days is null or p_days<1 or p_days>(select max_admin_days from private.trial_policy) or p_override is distinct from true then raise exception 'trial_days_invalid' using errcode='22023';end if;
 select * into g from private.trial_grants where organization_id=p_org and status<>'converted' order by created_at desc limit 1 for update;
 if g.id is null or g.plan_version_id<>s.plan_version_id then raise exception 'trial_request_invalid' using errcode='22023';end if;
 until_=greatest(now(),s.period_end)+make_interval(days=>p_days);
 insert into private.trial_extensions(grant_id,previous_end,new_end,actor_id,reason) values(g.id,g.ends_at,until_,auth.uid(),btrim(p_reason));
 update private.trial_grants set ends_at=until_,status='active' where id=g.id;
 update public.billing_subscriptions set period_end=until_,state='trial',cancel_at_end=false,pending_version_id=null,revision=revision+1 where organization_id=p_org;
 perform private.billing_event(p_org,'trial_extended',null,jsonb_build_object('ends_at',until_));id_=g.id;
 else raise exception 'billing_action_invalid' using errcode='22023';end if;
 insert into private.trial_audit(organization_id,actor_id,action,details) values(p_org,auth.uid(),p_action,jsonb_build_object('request',p_request,'grant',id_,'days',p_days,'end',until_,'reason',btrim(p_reason),'override',p_override));
 res=jsonb_build_object('ok',true,'grant_id',id_,'ends_at',until_);
 insert into private.trial_admin_commands values(auth.uid(),p_key,payload,res);return res;
end;$$;
create function private.trial_context(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare admin_ boolean;begin
 admin_=private.has_global_role('super_admin');
 return jsonb_build_object('eligibility',case when private.trial_eligibility(p_org)='eligible' then 'eligible' else 'review_required' end,
 'grants',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'plan_version_id',g.plan_version_id,'plan_name',p.name,'starts_at',g.starts_at,'ends_at',g.ends_at,'status',case when g.status='active' and g.ends_at<=now() then 'expired' else g.status end,'remaining_days',greatest(0,ceil(extract(epoch from(g.ends_at-now()))/86400)),'mode',g.mode,'legacy_dates_uncertain',g.legacy_dates_uncertain,'extensions',(select count(*) from private.trial_extensions where grant_id=g.id)) order by g.created_at desc) from private.trial_grants g join public.billing_plan_versions v on v.id=g.plan_version_id join public.billing_plans p on p.id=v.plan_id where g.organization_id=p_org),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',id,'state',state,'created_at',created_at,'plan_id',plan_id)||case when admin_ then jsonb_build_object('risk_reason',risk_reason,'decision_reason',decision_reason) else '{}'::jsonb end order by created_at desc) from private.trial_requests where organization_id=p_org),'[]'::jsonb),
 'policy',case when admin_ then(select to_jsonb(x)-'singleton' from private.trial_policy x) else null end,
 'verified',case when admin_ then coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'verified_at',verified_at,'evidence_ref',evidence_ref)) from private.trial_identifiers where organization_id=p_org),'[]'::jsonb) else null end,
 'audit',case when admin_ then coalesce((select jsonb_agg(to_jsonb(x)) from(select action,actor_id,details,created_at from private.trial_audit where organization_id=p_org or organization_id is null order by created_at desc limit 100)x),'[]'::jsonb) else null end);
end;$$;
alter function public.billing_context(uuid) set schema private;
alter function private.billing_context(uuid) rename to billing_context_base;
revoke all on function private.billing_context_base(uuid) from public,anon,authenticated,service_role;
create function public.billing_context(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result_ jsonb;begin
 result_=private.billing_context_base(p_org);return result_||jsonb_build_object('trial',private.trial_context(p_org));
end;$$;
create or replace function private.billing_feature(p_org uuid,p_feature text) returns boolean language sql stable security definer set search_path='' as $$
 select (not exists(select 1 from public.billing_subscriptions where organization_id=p_org) and not exists(select 1 from private.trial_requests where organization_id=p_org)) or exists(
 select 1 from public.billing_subscriptions s join public.billing_plan_versions v on v.id=s.plan_version_id where s.organization_id=p_org and private.billing_effective(s) in ('active','trial') and
 case p_feature when 'human_support' then v.human_support when 'commercial_followups' then v.commercial_followups when 'software' then true else false end);
$$;
create or replace function private.billing_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare org uuid;metric_ text;id_ uuid;used_ bigint;ceiling_ integer;v public.billing_plan_versions;s public.billing_subscriptions;monthly boolean=false;begin
 org=new.organization_id;
 if tg_table_name='organization_members' then
 if new.status<>'active' or (tg_op='UPDATE' and old.status='active') then return new;end if;metric_='members';
 elsif tg_table_name='services' then
 if not new.active or (tg_op='UPDATE' and old.active) then return new;end if;metric_='services';
 elsif tg_table_name='quote_requests' then
 if new.state<>'submitted' or old.state<>'draft' then return new;end if;metric_='requests';id_=new.id;monthly=true;
 elsif tg_table_name='tickets' then metric_='tickets';id_=new.id;monthly=true;
 elsif tg_table_name='commercial_attempts' then metric_='followups';id_=new.id;monthly=true;
 elsif tg_table_name='opportunities' then metric_='software';
 else raise exception 'billing_guard_scope_invalid';end if;
 -- Same lock and ordering as Foundation/consumer/commercial writes; no check-then-insert race.
 perform pg_advisory_xact_lock(734921501);
 select * into s from public.billing_subscriptions where organization_id=org;
 if s.organization_id is null and exists(select 1 from private.trial_requests where organization_id=org) then raise exception 'billing_subscription_required' using errcode='42501';end if;
 if s.organization_id is not null then
 if private.billing_effective(s) not in ('active','trial') then raise exception 'billing_subscription_required' using errcode='42501';end if;
 select * into v from public.billing_plan_versions where id=s.plan_version_id;
 if metric_='followups' and not v.commercial_followups then raise exception 'billing_feature_unavailable' using errcode='42501';end if;
 ceiling_=case metric_ when 'members' then v.member_limit when 'services' then v.service_limit when 'requests' then v.request_limit when 'tickets' then v.ticket_limit when 'followups' then v.followup_limit end;
 if ceiling_ is not null then
 used_=(private.billing_usage_snapshot(org)->>metric_)::bigint;
 if used_>=ceiling_ then raise exception 'billing_limit_reached' using errcode='P0001',detail=metric_;end if;
 end if;
 end if;
 if monthly then insert into public.billing_usage(organization_id,metric,entity_id,month) values(org,metric_,id_,date_trunc('month',now() at time zone 'America/Recife')::date) on conflict do nothing;end if;
 return new;
end;$$;

-- Explicit function ACLs: helper names do not accidentally become PostgREST capabilities.
do $$ declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='private' and p.proname like 'trial_%') or (n.nspname='public' and p.proname like 'billing_trial_%') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
 if f.sig::text like 'billing_trial_%' or f.sig::text like 'public.billing_trial_%' then execute format('grant execute on function %s to authenticated',f.sig);end if;
 end loop;
end;$$;
revoke all on function public.billing_context(uuid),public.billing_subscription_action(uuid,text,uuid,integer,uuid) from public,anon,service_role;
grant execute on function public.billing_context(uuid),public.billing_subscription_action(uuid,text,uuid,integer,uuid) to authenticated;
commit;

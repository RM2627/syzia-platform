-- SYZIA 033: incremental upgrade. Preserve migrations 001–032.
begin;
create temporary table migration033_existing_functions on commit drop as select oid from pg_proc;
-- Expense schedules are forecasts. The existing financial_expenses ledger remains paid facts only.
insert into private.permission_catalog(action,module,label,roles,scopes,capability,delegates_management) values
('finance.recurring.create','finance','Criar despesas recorrentes',array['super_admin','admin_empresa','colaborador_empresa','own_attendant'],array['organization'],'software',false),
('finance.recurring.manage','finance','Editar/cancelar recorrências',array['super_admin','admin_empresa','colaborador_empresa','own_attendant'],array['organization'],'software',false),
('finance.forecast.read','finance','Ver despesas previstas',array['super_admin','admin_empresa','colaborador_empresa','own_attendant'],array['organization'],'software',false),
('finance.expenses.pay','finance','Confirmar pagamento de despesa prevista',array['super_admin','admin_empresa','colaborador_empresa','own_attendant'],array['organization'],'software',false);
create table public.financial_recurrences(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 description text not null check(length(btrim(description)) between 2 and 300),category text not null default '' check(length(category)<=120),
 amount_cents bigint not null check(amount_cents between 1 and 100000000000),frequency text not null check(frequency in('weekly','monthly','yearly')),
 starts_on date not null check(isfinite(starts_on)),ends_on date check(isfinite(ends_on)),note text not null default '' check(length(note)<=1000),
 active boolean not null default true,revision int not null default 1,actor_id uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 check(ends_on is null or ends_on>=starts_on),unique(organization_id,id)
);
create table public.financial_occurrences(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),recurrence_id uuid not null,
 due_date date not null,description text not null,category text not null,amount_cents bigint not null,note text not null,
 state text not null default 'pending' check(state in('pending','paid','cancelled')),source_revision int not null,expense_id uuid,
 created_at timestamptz not null default now(),unique(recurrence_id,due_date),unique(organization_id,id),
 foreign key(organization_id,recurrence_id) references public.financial_recurrences(organization_id,id),
 foreign key(organization_id,expense_id) references public.financial_expenses(organization_id,id),
 check((state='paid')=(expense_id is not null))
);
do $$declare n text;begin foreach n in array array['financial_recurrences','financial_occurrences'] loop
 execute format('alter table public.%I enable row level security',n);execute format('alter table public.%I force row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 execute format('create trigger %I after insert or update on public.%I for each row execute function private.company_audit()',n||'_audit',n);
 execute format('create trigger %I before delete on public.%I for each row execute function private.consumer_deny_immutable()',n||'_no_delete',n);
 end loop;end;$$;
create function private.expense_due(p_start date,p_frequency text,p_n int) returns date language sql immutable set search_path='' as $$
 select case p_frequency when 'weekly' then p_start+7*p_n when 'monthly' then (p_start+make_interval(months=>p_n))::date when 'yearly' then (p_start+make_interval(years=>p_n))::date end;$$;
create function private.expense_materialize(p_org uuid,p_until date) returns void language plpgsql security definer set search_path='' as $$
declare r public.financial_recurrences;d date;n int;today_ date;begin
 select(now()at time zone timezone)::date into today_ from public.organizations where id=p_org;
 if p_until is null or not isfinite(p_until) or p_until>today_+366 then raise exception 'financial_date_invalid';end if;
 for r in select * from public.financial_recurrences where organization_id=p_org and active for update loop
 n=0;loop d=private.expense_due(r.starts_on,r.frequency,n);exit when d>p_until or(r.ends_on is not null and d>r.ends_on);
 insert into public.financial_occurrences(organization_id,recurrence_id,due_date,description,category,amount_cents,note,source_revision)
 values(p_org,r.id,d,r.description,r.category,r.amount_cents,r.note,r.revision)on conflict(recurrence_id,due_date)do nothing;
 n=n+1;if n>20000 then raise exception 'financial_period_invalid';end if;
 end loop;end loop;end;$$;
create function public.financial_recurrence_save(p_org uuid,p_id uuid,p_revision int,p_data jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.financial_recurrences;payload jsonb;result_ jsonb;today_ date;begin
 perform pg_advisory_xact_lock(734921501);
 perform private.permission_require(p_org,case when p_id is null then 'finance.recurring.create' else 'finance.recurring.manage'end);
 perform private.company_keys(p_data,array['description','category','amount_cents','frequency','starts_on','ends_on','note','active']);
 payload=jsonb_build_array('recurrence_save',p_id,p_revision,p_data);result_=private.financial_idem(p_org,p_key,payload);if result_ is not null then return result_;end if;
 select(now()at time zone timezone)::date into today_ from public.organizations where id=p_org;
 if p_id is null then
 if p_revision<>0 or (p_data->>'starts_on')::date<today_-366 or (p_data->>'starts_on')::date>today_+366 then raise exception 'financial_date_invalid';end if;
 insert into public.financial_recurrences(organization_id,description,category,amount_cents,frequency,starts_on,ends_on,note,actor_id)
 values(p_org,p_data->>'description',coalesce(p_data->>'category',''),(p_data->>'amount_cents')::bigint,p_data->>'frequency',(p_data->>'starts_on')::date,nullif(p_data->>'ends_on','')::date,coalesce(p_data->>'note',''),auth.uid())returning * into r;
 else
 select * into r from public.financial_recurrences where id=p_id and organization_id=p_org for update;
 if r.id is null then raise exception 'permission_denied'using errcode='42501';end if;
 if not r.active then raise exception 'financial_transition_invalid';end if;
 if r.revision<>p_revision then raise exception 'financial_revision_conflict'using errcode='40001';end if;
 -- An established schedule keeps its anchor; a different frequency/date uses a new recurrence.
 if p_data->>'frequency' is distinct from r.frequency or(p_data->>'starts_on')::date is distinct from r.starts_on then raise exception 'recurrence_schedule_fixed';end if;
 update public.financial_recurrences set description=p_data->>'description',category=coalesce(p_data->>'category',''),amount_cents=(p_data->>'amount_cents')::bigint,ends_on=nullif(p_data->>'ends_on','')::date,note=coalesce(p_data->>'note',''),active=coalesce((p_data->>'active')::boolean,active),revision=revision+1 where id=r.id returning * into r;
 update public.financial_occurrences set state='pending'where recurrence_id=r.id and state='cancelled'and due_date>=today_ and r.active and(r.ends_on is null or due_date<=r.ends_on);
 update public.financial_occurrences set state='cancelled' where recurrence_id=r.id and state='pending' and due_date>=today_ and(not r.active or(r.ends_on is not null and due_date>r.ends_on));
 update public.financial_occurrences set description=r.description,category=r.category,amount_cents=r.amount_cents,note=r.note,source_revision=r.revision where recurrence_id=r.id and state='pending' and due_date>=today_;
 end if;
 perform private.expense_materialize(p_org,today_+90);
 perform private.financial_event(p_org,null,null,null,'recurrence_saved','',jsonb_build_object('recurrence',r.id,'revision',r.revision,'active',r.active));
 result_=jsonb_build_object('id',r.id,'revision',r.revision);perform private.financial_remember(p_org,p_key,payload,result_);return result_;
end;$$;
create function public.financial_forecast(p_org uuid,p_from date,p_to date) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.permission_require(p_org,'finance.forecast.read');perform private.analytics_period((select timezone from public.organizations where id=p_org),p_from,p_to);
 perform pg_advisory_xact_lock(734921501);perform private.expense_materialize(p_org,p_to);
 return jsonb_build_object('recurrences',coalesce((select jsonb_agg(to_jsonb(r)order by r.created_at desc)from public.financial_recurrences r where organization_id=p_org),'[]'),
 'occurrences',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('payment_cancelled',exists(select 1 from public.financial_expenses e where e.id=o.expense_id and e.organization_id=o.organization_id and e.cancelled_at is not null))order by due_date,id)from public.financial_occurrences o where organization_id=p_org and due_date between p_from and p_to),'[]'));
end;$$;
create function public.financial_occurrence_pay(p_org uuid,p_id uuid,p_date date,p_method text,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare o public.financial_occurrences;payload jsonb;r jsonb;cat uuid;id_ uuid;today_ date;begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'finance.expenses.pay');
 payload=jsonb_build_array('occurrence_pay',p_id,p_date,p_method);r=private.financial_idem(p_org,p_key,payload);if r is not null then return r;end if;
 select * into o from public.financial_occurrences where organization_id=p_org and id=p_id for update;
 if o.id is null then raise exception 'permission_denied'using errcode='42501';end if;
 if o.state='cancelled'then raise exception 'financial_transition_invalid';end if;
 select(now()at time zone timezone)::date into today_ from public.organizations where id=p_org;
 if p_date is null or not isfinite(p_date)or p_date>today_ then raise exception 'financial_date_invalid';end if;
 if o.state='paid'then r=jsonb_build_object('id',o.expense_id);else
 if length(btrim(o.category))>0 then
 insert into public.expense_categories(organization_id,name)values(p_org,btrim(o.category))on conflict do nothing;
 select id into cat from public.expense_categories where organization_id=p_org and lower(btrim(name))=lower(btrim(o.category))and active;
 if cat is null then raise exception 'financial_category_inactive';end if;end if;
 insert into public.financial_expenses(organization_id,category_id,description,amount_cents,effective_date,method,note,actor_id)values(p_org,cat,o.description,o.amount_cents,p_date,p_method,o.note,auth.uid())returning id into id_;
 update public.financial_occurrences set state='paid',expense_id=id_ where id=o.id;
 perform private.financial_event(p_org,null,null,id_,'recurring_expense_paid','',jsonb_build_object('occurrence',o.id));r=jsonb_build_object('id',id_);end if;
 perform private.financial_remember(p_org,p_key,payload,r);return r;end;$$;
alter function public.financial_summary(uuid,date,date) rename to financial_summary_032;
alter function public.financial_summary_032(uuid,date,date)set schema private;
revoke all on function private.financial_summary_032(uuid,date,date)from public,anon,authenticated,service_role;
create function public.financial_summary(p_org uuid,p_from date,p_to date) returns jsonb language plpgsql security definer set search_path=''as $$declare r jsonb;begin
 r=private.financial_summary_032(p_org,p_from,p_to);
 if private.permission_allowed(p_org,'finance.forecast.read') then
 perform pg_advisory_xact_lock(734921501);perform private.expense_materialize(p_org,p_to);
 r=r||jsonb_build_object('forecast_expenses_cents',(select coalesce(sum(amount_cents),0)from public.financial_occurrences where organization_id=p_org and state='pending'and due_date between p_from and p_to));end if;return r;end;$$;

alter table public.billing_plans add column site_visible boolean not null default false,add column self_service boolean not null default false,add column self_service_trial boolean not null default false;
alter function public.billing_plan_save(uuid,integer,jsonb)rename to billing_plan_save_032;
alter function public.billing_plan_save_032(uuid,integer,jsonb)set schema private;
revoke all on function private.billing_plan_save_032(uuid,integer,jsonb)from public,anon,authenticated,service_role;
create function public.billing_plan_save(p_id uuid,p_revision integer,p_data jsonb)returns uuid language plpgsql security definer set search_path=''as $$declare id_ uuid;begin
 id_=private.billing_plan_save_032(p_id,p_revision,p_data-'site_visible'-'self_service'-'self_service_trial');
 update public.billing_plans set site_visible=coalesce((p_data->>'site_visible')::boolean,site_visible),self_service=coalesce((p_data->>'self_service')::boolean,self_service),self_service_trial=coalesce((p_data->>'self_service_trial')::boolean,self_service_trial)where id=id_;return id_;end;$$;
create function public.acquisition_plans()returns jsonb language sql stable security definer set search_path=''as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'self_service',p.self_service,'trial_eligible',p.self_service_trial,'version',to_jsonb(v))order by p.position,p.name),'[]')from public.billing_plans p join public.billing_plan_versions v on v.plan_id=p.id and v.version=p.revision where p.active and p.available and p.site_visible;$$;
alter table private.people_grants drop constraint people_grants_permissions_check;
alter table private.people_grants add constraint people_grants_permissions_check check(permissions <@ array['people.read','companies.read','shared.attend','acquisition.read','acquisition.manage']::text[]);
create table private.acquisition_leads(
 id uuid primary key default gen_random_uuid(),request_key uuid not null unique,name text not null check(length(btrim(name))between 2 and 120),company text not null check(length(btrim(company))between 2 and 160),
 phone text not null check(length(phone)between 8 and 40),email text not null check(length(email)<=254 and email~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),interest text not null check(length(interest)between 2 and 1000),
 state text not null default 'new'check(state in('new','contacted','qualified','closed')),revision int not null default 1,created_at timestamptz not null default clock_timestamp()
);
create table private.acquisition_events(id uuid primary key default gen_random_uuid(),lead_id uuid references private.acquisition_leads(id),user_id uuid,organization_id uuid,actor_id uuid,event text not null,simulation boolean not null default false,created_at timestamptz not null default clock_timestamp());
create function public.acquisition_lead_submit(p_key uuid,p_name text,p_company text,p_phone text,p_email text,p_interest text)returns jsonb language plpgsql security definer set search_path=''as $$declare l private.acquisition_leads;begin
 perform pg_advisory_xact_lock(734921501);select * into l from private.acquisition_leads where request_key=p_key;
 if l.id is not null then
 if l.name<>btrim(p_name)or l.company<>btrim(p_company)or l.phone<>btrim(p_phone)or l.email<>lower(btrim(p_email))or l.interest<>btrim(p_interest)then raise exception 'idempotency_conflict';end if;
 else
 insert into private.acquisition_leads(request_key,name,company,phone,email,interest)values(p_key,btrim(p_name),btrim(p_company),btrim(p_phone),lower(btrim(p_email)),btrim(p_interest))returning * into l;
 insert into private.acquisition_events(lead_id,event)values(l.id,'lead_received');end if;
 return jsonb_build_object('received',true);end;$$;
create function public.acquisition_lead_update(p_id uuid,p_revision int,p_state text)returns void language plpgsql security definer set search_path=''as $$begin
 if not private.people_can('acquisition.manage')then raise exception 'access_denied'using errcode='42501';end if;
 update private.acquisition_leads set state=p_state,revision=revision+1 where id=p_id and revision=p_revision;
 if not found then raise exception 'acquisition_revision_conflict'using errcode='40001';end if;
 insert into private.acquisition_events(lead_id,actor_id,event)values(p_id,auth.uid(),'lead_'||p_state);end;$$;

-- Identity resolution is service-only and never makes tenant usernames globally unique.
create function public.access_identity_lookup(p_identifier text)returns jsonb language plpgsql stable security definer set search_path=''as $$declare ids uuid[];u auth.users;begin
 select array_agg(distinct id)into ids from(
 select x.id from auth.users x where lower(x.email)=lower(btrim(p_identifier))and not coalesce(x.is_anonymous,false)
 union select a.user_id from private.enterprise_accounts a where a.state='active'and(lower(a.contact_email)=lower(btrim(p_identifier))or a.username=lower(btrim(p_identifier))))x;
 if cardinality(ids)<>1 or ids is null then return null;end if;
 select * into u from auth.users where id=ids[1];
 if u.id is null or u.email_confirmed_at is null or coalesce(u.is_anonymous,false)or u.banned_until>now()or not exists(select 1 from public.profiles where id=u.id and status='active')then return null;end if;
 return jsonb_build_object('user_id',u.id,'email',u.email,'operation',(select operation_id from private.enterprise_accounts where user_id=u.id and state='active'order by generation desc,created_at desc limit 1));end;$$;
create function public.access_identity_exists(p_email text)returns boolean language sql stable security definer set search_path=''as $$
 select exists(select 1 from auth.users where lower(email)=lower(btrim(p_email)))or exists(select 1 from private.enterprise_accounts where lower(contact_email)=lower(btrim(p_email)));$$;
create function public.access_identity_contexts(p_user uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 perform private.require_eligible_user(p_user);
 return jsonb_build_object('global',exists(select 1 from public.platform_roles where user_id=p_user and active)or exists(select 1 from private.enterprise_accounts where user_id=p_user and organization_id is null and role='syzia_staff'and state='active'),
 'super_admin',private.people_root(p_user),
 'personal',(select jsonb_build_object('id',id,'generation',generation)from private.enterprise_accounts where user_id=p_user and organization_id is null and state='active'),
 'companies',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'generation',a.generation,'organization_id',o.id,'name',o.name,'role',m.role)order by o.name)from private.enterprise_accounts a join public.organization_members m on m.organization_id=a.organization_id and m.user_id=a.user_id and m.status='active'join public.organizations o on o.id=m.organization_id and o.status='active'where a.user_id=p_user and a.state='active'),'[]'));
end;$$;
-- Confirmed self-service identities use the same account/session infrastructure.
create function public.access_selfservice_identity(p_user uuid,p_name text,p_username text)returns jsonb language plpgsql security definer set search_path=''as $$declare a private.enterprise_accounts;u auth.users;begin
 perform pg_advisory_xact_lock(734921501);perform private.require_eligible_user(p_user);
 select * into u from auth.users where id=p_user;
 select * into a from private.enterprise_accounts where user_id=p_user and organization_id is null;
 if a.id is null then
 if exists(select 1 from private.enterprise_accounts where user_id=p_user)then raise exception 'existing_identity_requires_login';end if;
 insert into private.enterprise_accounts(user_id,username,display_name,contact_email,role,state,requested_by,request_key,activated_at)
 values(p_user,lower(btrim(p_username)),btrim(p_name),u.email,'person','active',p_user,gen_random_uuid(),clock_timestamp())returning * into a;
 update public.profiles set display_name=btrim(p_name)where id=p_user;
 insert into private.acquisition_events(user_id,event)values(p_user,'identity_registered');
 perform private.access_audit(null,p_user,'selfservice_identity',a.id);
 elsif a.state<>'active'then raise exception 'access_denied'using errcode='42501';end if;
 return jsonb_build_object('id',a.id,'generation',a.generation);end;$$;
create or replace function public.access_register_session(p_user uuid,p_session uuid,p_account uuid,p_generation integer)returns boolean language plpgsql security definer set search_path=''as $$declare a private.enterprise_accounts;begin
 perform pg_advisory_xact_lock(734921501);if p_session is null then return false;end if;perform private.require_eligible_user(p_user);
 if p_account is null then
 if not exists(select 1 from public.platform_roles where user_id=p_user and active)and not exists(select 1 from private.enterprise_accounts where user_id=p_user and state='active')then return false;end if;
 else
 select * into a from private.enterprise_accounts where id=p_account and user_id=p_user and state='active'and generation=p_generation;
 if a.id is null or(a.organization_id is not null and not exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.user_id=p_user and m.organization_id=a.organization_id and m.status='active'and o.status='active'))then return false;end if;end if;
 insert into private.access_enforced_users values(p_user)on conflict do nothing;
 insert into private.enterprise_sessions(session_id,user_id,organization_id,account_id,generation)values(p_session,p_user,a.organization_id,a.id,a.generation)on conflict do nothing;
 return exists(select 1 from private.enterprise_sessions where session_id=p_session and user_id=p_user and not revoked and account_id is not distinct from a.id and generation is not distinct from a.generation);
end;$$;
create function public.access_select_context(p_user uuid,p_session uuid,p_account uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare a private.enterprise_accounts;s private.enterprise_sessions;begin
 perform pg_advisory_xact_lock(734921501);perform private.require_eligible_user(p_user);
 select * into s from private.enterprise_sessions where user_id=p_user and session_id=p_session and not revoked for update;
 if s.session_id is null or s.last_activity<=clock_timestamp()-make_interval(secs=>(select idle_seconds from private.access_policy))or(s.account_id is not null and not exists(select 1 from private.enterprise_accounts where id=s.account_id and state='active'and generation=s.generation))then raise exception 'session_expired'using errcode='42501';end if;
 if p_account is null then
 if not exists(select 1 from public.platform_roles where user_id=p_user and active)and not exists(select 1 from private.enterprise_accounts where user_id=p_user and organization_id is null and role='syzia_staff'and state='active')then raise exception 'access_denied'using errcode='42501';end if;
 else
 select * into a from private.enterprise_accounts where id=p_account and user_id=p_user and state='active';
 if a.id is null or(a.organization_id is not null and not exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.organization_id=a.organization_id and m.user_id=p_user and m.status='active'and o.status='active'))then raise exception 'access_denied'using errcode='42501';end if;end if;
 update private.enterprise_sessions set organization_id=a.organization_id,account_id=a.id,generation=a.generation,last_activity=clock_timestamp()where session_id=p_session;
 perform private.access_audit(a.organization_id,p_user,'context_selected',coalesce(a.id,p_user));
 return jsonb_build_object('organization_id',a.organization_id);end;$$;
-- Contact conflicts require explicit reuse; never silently attach or duplicate another identity.
alter function public.people_reserve(text,text,text,text,text,uuid)rename to people_reserve_032;
alter function public.people_reserve_032(text,text,text,text,text,uuid)set schema private;
revoke all on function private.people_reserve_032(text,text,text,text,text,uuid)from public,anon,authenticated,service_role;
create function public.people_reserve(p_display text,p_username text,p_email text,p_phone text,p_role text,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$begin
 perform private.lock_authorize('global');
 if not exists(select 1 from private.enterprise_accounts where requested_by=auth.uid()and request_key=p_key)and public.access_identity_exists(p_email)then raise exception 'identity_exists_select_person';end if;
 return private.people_reserve_032(p_display,p_username,p_email,p_phone,p_role,p_key);end;$$;
alter function public.access_reserve(uuid,text,text,text,text,text,text,text,uuid,uuid)rename to access_reserve_032;
alter function public.access_reserve_032(uuid,text,text,text,text,text,text,text,uuid,uuid)set schema private;
revoke all on function private.access_reserve_032(uuid,text,text,text,text,text,text,text,uuid,uuid)from public,anon,authenticated,service_role;
create function public.access_reserve(p_org uuid,p_name text,p_slug text,p_display text,p_username text,p_email text,p_phone text,p_role text,p_key uuid,p_existing uuid)returns jsonb language plpgsql security definer set search_path=''as $$begin
 if p_org is null then perform private.lock_authorize('global');elsif not private.company_can_manage(p_org)then raise exception 'access_denied'using errcode='42501';end if;
 if p_existing is null and not exists(select 1 from private.enterprise_accounts where requested_by=auth.uid()and request_key=p_key)and public.access_identity_exists(p_email)then raise exception 'identity_exists_select_person';end if;
 return private.access_reserve_032(p_org,p_name,p_slug,p_display,p_username,p_email,p_phone,p_role,p_key,p_existing);end;$$;

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

do $$declare n text;begin foreach n in array array['acquisition_leads','acquisition_events','selfservice_drafts','selfservice_payments','selfservice_consents']loop
 execute format('alter table private.%I enable row level security',n);execute format('alter table private.%I force row level security',n);execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);
 if n in('acquisition_events','selfservice_consents')then execute format('create trigger %I before update or delete on private.%I for each row execute function private.consumer_deny_immutable()',n||'_immutable',n);end if;
 end loop;end;$$;
do $$declare f record;begin for f in select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private')and not exists(select 1 from migration033_existing_functions x where x.oid=p.oid)loop execute 'revoke all on function '||f.signature||' from public,anon,authenticated,service_role';end loop;end;$$;
grant execute on function public.acquisition_plans(),public.consumer_public_page(text) to anon,authenticated;
grant execute on function public.acquisition_lead_submit(uuid,text,text,text,text,text),public.access_identity_lookup(text),public.access_identity_exists(text),public.access_identity_contexts(uuid),public.access_selfservice_identity(uuid,text,text),public.access_select_context(uuid,uuid,uuid),public.selfservice_payment_bind(uuid,uuid,integer,text,text,boolean),public.selfservice_billing_due(uuid) to service_role;
grant execute on function public.people_reserve(text,text,text,text,text,uuid),public.access_reserve(uuid,text,text,text,text,text,text,text,uuid,uuid),public.billing_plan_save(uuid,integer,jsonb),public.acquisition_context(),public.acquisition_lead_update(uuid,integer,text),public.selfservice_context(),public.selfservice_save(uuid,integer,text,text,text,text,text,uuid,uuid),public.selfservice_complete(uuid,integer,boolean,text),public.financial_recurrence_save(uuid,uuid,integer,jsonb,uuid),public.financial_forecast(uuid,date,date),public.financial_occurrence_pay(uuid,uuid,date,text,uuid),public.financial_summary(uuid,date,date) to authenticated;
commit;

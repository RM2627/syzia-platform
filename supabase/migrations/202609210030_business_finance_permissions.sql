
-- Source: 01-schema.sql
begin;
create temporary table migration030_existing_functions on commit drop as select oid from pg_proc;
-- 030 is additive; 001–029 are immutable. All amounts are integer BRL cents.
create table private.permission_catalog(
 action text primary key, module text not null, label text not null,
 roles text[] not null, scopes text[] not null default array['organization'],
 capability text not null default 'software', delegates_management boolean not null default false
);
create table private.organization_permissions(
 organization_id uuid not null references public.organizations(id), user_id uuid not null references public.profiles(id),
 action text not null references private.permission_catalog(action), scope text not null check(scope in('organization','assigned')),
 granted boolean not null, revision integer not null default 1, updated_by uuid references public.profiles(id), updated_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,user_id,action)
);
create table private.permission_revisions(organization_id uuid not null references public.organizations(id),user_id uuid not null references public.profiles(id),revision int not null default 0,primary key(organization_id,user_id));
create table private.permission_commands(organization_id uuid not null,actor_id uuid not null,key uuid not null,payload jsonb not null,result jsonb not null,primary key(organization_id,actor_id,key));
-- Only SECURITY DEFINER entry points can enter a checked action. Never trust a client GUC for authorization.
create table private.permission_frames(backend int not null,transaction_id bigint not null,depth int not null,organization_id uuid not null,actor_id uuid not null,action text not null,primary key(backend,transaction_id,depth));
create table private.organization_exemptions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 kind text not null check(kind in('internal','exempt')),state text not null check(state in('active','revoked')),
 capabilities jsonb not null check(jsonb_typeof(capabilities)='object'),reason text not null check(length(btrim(reason)) between 10 and 500),
 granted_by uuid not null references public.profiles(id),granted_at timestamptz not null default clock_timestamp(),
 revoked_by uuid references public.profiles(id),revoked_at timestamptz,revocation_reason text,
 request_key uuid not null, unique(granted_by,request_key)
);
create unique index organization_exemption_active on private.organization_exemptions(organization_id) where state='active';
create table private.organization_verifications(
 organization_id uuid primary key references public.organizations(id),required boolean not null default true,
 state text not null default 'pending' check(state in('legacy','pending','review','verified')),
 kind text check(kind in('CPF','CNPJ')),masked text,fingerprint bytea,verified_by uuid references public.profiles(id),verified_at timestamptz,
 revision int not null default 0,review_reason text,
 check(fingerprint is null or octet_length(fingerprint)=32)
);
insert into private.organization_verifications(organization_id,required,state) select id,false,'legacy' from public.organizations;
create table private.verification_commands(organization_id uuid not null,actor_id uuid not null,key uuid not null,fingerprint bytea not null,result jsonb not null,primary key(organization_id,actor_id,key));
alter table public.billing_plan_versions add column capabilities jsonb not null default '{}' check(jsonb_typeof(capabilities)='object');
alter table public.billing_plan_versions disable trigger billing_plan_versions_immutable;
update public.billing_plan_versions set capabilities=jsonb_build_object('software',true,'human_support',human_support,'commercial_followups',commercial_followups);
alter table public.billing_plan_versions enable trigger billing_plan_versions_immutable;
create table public.service_categories(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 name text not null check(length(btrim(name)) between 1 and 120),position int not null default 0 check(position between 0 and 10000),
 active boolean not null default true,revision int not null default 1,created_at timestamptz not null default now(),unique(organization_id,id)
);
create unique index service_category_name on public.service_categories(organization_id,lower(btrim(name)));
alter table public.services add column category_id uuid;
alter table public.services add constraint service_category_tenant foreign key(organization_id,category_id) references public.service_categories(organization_id,id);
insert into public.service_categories(organization_id,name) select distinct on(organization_id,lower(btrim(category))) organization_id,btrim(category) from public.services where length(btrim(category))>0 order by organization_id,lower(btrim(category)),created_at;
update public.services s set category_id=c.id from public.service_categories c where s.organization_id=c.organization_id and lower(btrim(s.category))=lower(btrim(c.name));
create table private.category_commands(organization_id uuid not null,actor_id uuid not null,key uuid not null,payload jsonb not null,result jsonb not null,primary key(organization_id,actor_id,key));
create table public.financial_accounts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),customer_id uuid,
 request_id uuid,quote_version_id uuid,appointment_id uuid,service_id uuid,
 description text not null check(length(btrim(description)) between 2 and 300),origin text not null check(origin in('manual','approved_quote')),
 total_cents bigint not null check(total_cents between 1 and 100000000000),due_date date,notes text not null default '' check(length(notes)<=2000),
 cancelled_at timestamptz,cancelled_by uuid references public.profiles(id),cancel_reason text,
 assigned_to uuid references public.profiles(id),created_by uuid references public.profiles(id),created_at timestamptz not null default clock_timestamp(),revision int not null default 1,
 unique(organization_id,id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id),
 foreign key(organization_id,request_id) references public.quote_requests(organization_id,id),
 foreign key(organization_id,quote_version_id) references public.quote_versions(organization_id,id),
 foreign key(organization_id,appointment_id) references public.appointments(organization_id,id),
 foreign key(organization_id,service_id) references public.services(organization_id,id)
);
create unique index financial_request_once on public.financial_accounts(organization_id,request_id) where request_id is not null and cancelled_at is null;
create table public.financial_receipts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,account_id uuid not null,
 kind text not null check(kind in('receipt','reversal')),amount_cents bigint not null check(amount_cents between 1 and 100000000000),
 effective_date date not null,method text not null check(method in('pix','cash','debit','credit','transfer','other')),
 note text not null default '' check(length(note)<=1000),original_id uuid,
 actor_id uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),foreign key(organization_id,account_id) references public.financial_accounts(organization_id,id),
 foreign key(organization_id,original_id) references public.financial_receipts(organization_id,id),
 check((kind='reversal')=(original_id is not null)),check(kind<>'reversal' or length(btrim(note))>=10)
);
create unique index financial_receipt_reversed_once on public.financial_receipts(original_id) where kind='reversal';
create index financial_receipts_account on public.financial_receipts(organization_id,account_id,effective_date);
create table public.expense_categories(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),name text not null check(length(btrim(name)) between 1 and 120),active boolean not null default true,unique(organization_id,id)
);
create unique index expense_category_name on public.expense_categories(organization_id,lower(btrim(name)));
create table public.financial_expenses(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),category_id uuid,
 description text not null check(length(btrim(description)) between 2 and 300),amount_cents bigint not null check(amount_cents between 1 and 100000000000),
 effective_date date not null,method text not null check(method in('pix','cash','debit','credit','transfer','other')),note text not null default '' check(length(note)<=1000),
 actor_id uuid not null references public.profiles(id),created_at timestamptz not null default clock_timestamp(),
 cancelled_by uuid references public.profiles(id),cancelled_at timestamptz,cancel_reason text,
 unique(organization_id,id),foreign key(organization_id,category_id) references public.expense_categories(organization_id,id)
);
create table public.financial_events(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),account_id uuid,receipt_id uuid,expense_id uuid,
 event text not null,actor_id uuid references public.profiles(id),reason text not null default '',details jsonb not null default '{}',created_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,account_id) references public.financial_accounts(organization_id,id),
 foreign key(organization_id,receipt_id) references public.financial_receipts(organization_id,id),
 foreign key(organization_id,expense_id) references public.financial_expenses(organization_id,id)
);
create table private.financial_commands(organization_id uuid not null,actor_id uuid not null,key uuid not null,payload jsonb not null,result jsonb not null,primary key(organization_id,actor_id,key));
-- Private data can only be projected by explicit RPCs. No raw document is stored.
do $$declare n text;begin
 foreach n in array array['permission_catalog','organization_permissions','permission_revisions','permission_commands','permission_frames','organization_exemptions','organization_verifications','verification_commands','category_commands','financial_commands'] loop
 execute format('alter table private.%I enable row level security',n);execute format('alter table private.%I force row level security',n);execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);
 end loop;
 foreach n in array array['service_categories','financial_accounts','financial_receipts','expense_categories','financial_expenses','financial_events'] loop
 execute format('alter table public.%I enable row level security',n);execute format('alter table public.%I force row level security',n);execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);execute format('grant select on public.%I to authenticated',n);
 execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.company_audit()',n||'_audit',n);
 end loop;
 foreach n in array array['financial_receipts','financial_events'] loop
 execute format('create trigger %I before update or delete on public.%I for each row execute function private.consumer_deny_immutable()',n||'_immutable',n);
 execute format('create trigger %I before truncate on public.%I for each statement execute function private.consumer_deny_immutable()',n||'_no_truncate',n);
 end loop;
end;$$;

-- Source: 01a-catalog.sql
insert into private.permission_catalog(action,module,label,roles,scopes,capability,delegates_management) values
('home.read','home','Ver Home',array['super_admin','admin_empresa','colaborador_empresa','own_attendant'],array['organization'],'setup',true),
('clients.read','clients','Ver Clientes',array['super_admin','admin_empresa','colaborador_empresa','own_attendant','shared_attendant'],array['organization'],'software',true),
('clients.manage','clients','Gerenciar Clientes',array['super_admin','admin_empresa','colaborador_empresa','own_attendant','shared_attendant'],array['organization'],'software',true),
('central.read','central','Ver Atendimento',array['super_admin','admin_empresa','colaborador_empresa','own_attendant','shared_attendant'],array['organization'],'software',true),
('central.manage','central','Gerenciar Atendimento',array['super_admin','admin_empresa','colaborador_empresa','own_attendant','shared_attendant'],array['organization'],'software',true),
('quotes.read','quotes','Ver Orçamentos',array['super_admin','admin_empresa','colaborador_empresa','own_attendant','shared_attendant'],array['organization'],'software',true),
('quotes.manage','quotes','Gerenciar Orçamentos',array['super_admin','admin_empresa','colaborador_empresa','own_attendant','shared_attendant'],array['organization'],'software',true),
('agenda.read','agenda','Ver Agenda',array['super_admin','admin_empresa','colaborador_empresa','own_attendant','shared_attendant'],array['organization'],'setup',true),
('agenda.manage','agenda','Gerenciar Agenda',array['super_admin','admin_empresa','colaborador_empresa','own_attendant','shared_attendant'],array['organization'],'setup',true),
('pending.read','pending','Ver Pendências',array['super_admin','admin_empresa','colaborador_empresa','own_attendant','shared_attendant'],array['organization'],'software',true),
('pending.manage','pending','Gerenciar Pendências',array['super_admin','admin_empresa','colaborador_empresa','own_attendant','shared_attendant'],array['organization'],'software',true),
('followup.read','followup','Ver Retornos',array['super_admin','admin_empresa','colaborador_empresa','own_attendant','shared_attendant'],array['organization'],'commercial_followups',true),
('followup.manage','followup','Gerenciar Retornos',array['super_admin','admin_empresa','colaborador_empresa','own_attendant','shared_attendant'],array['organization'],'commercial_followups',true),
('services.read','services','Ver Serviços',array['super_admin','admin_empresa','colaborador_empresa'],array['organization'],'setup',true),
('services.manage','services','Gerenciar Serviços',array['super_admin','admin_empresa','colaborador_empresa'],array['organization'],'setup',true),
('portfolio.read','portfolio','Ver Portfólio',array['super_admin','admin_empresa','colaborador_empresa'],array['organization'],'setup',true),
('portfolio.manage','portfolio','Gerenciar Portfólio',array['super_admin','admin_empresa','colaborador_empresa'],array['organization'],'setup',true),
('page.read','page','Ver Página pública',array['super_admin','admin_empresa','colaborador_empresa'],array['organization'],'setup',true),
('page.manage','page','Gerenciar Página pública',array['super_admin','admin_empresa','colaborador_empresa'],array['organization'],'setup',true),
('settings.read','settings','Ver Configurações',array['super_admin','admin_empresa','colaborador_empresa'],array['organization'],'setup',true),
('settings.manage','settings','Gerenciar Configurações',array['super_admin','admin_empresa','colaborador_empresa'],array['organization'],'setup',true),
('people.read','people','Ver Pessoas e acessos',array['super_admin','admin_empresa'],array['organization'],'setup',true),
('people.manage','people','Gerenciar Pessoas e acessos',array['super_admin','admin_empresa'],array['organization'],'setup',true),
('central.reply','central','Responder ao cliente',array['super_admin','admin_empresa','colaborador_empresa','own_attendant','shared_attendant'],array['organization'],'software',true),
('quotes.values','quotes','Ver valores dos orçamentos',array['super_admin','admin_empresa','colaborador_empresa','own_attendant','shared_attendant'],array['organization'],'software',true),
('analytics.operational','analytics','Ver métricas operacionais',array['super_admin','admin_empresa','colaborador_empresa','own_attendant'],array['organization'],'software',true),
('analytics.financial','analytics','Ver métricas financeiras consolidadas',array['super_admin','admin_empresa','colaborador_empresa','own_attendant'],array['organization'],'software',true),
('billing.manage','billing','Administrar plano e assinatura',array['super_admin','admin_empresa'],array['organization'],'setup',true),
('finance.accounts.read','finance','Ver contas a receber',array['super_admin','admin_empresa','colaborador_empresa','own_attendant','shared_attendant'],array['organization','assigned'],'software',true),
('finance.history.read','finance','Ver histórico financeiro autorizado',array['super_admin','admin_empresa','colaborador_empresa','own_attendant','shared_attendant'],array['organization','assigned'],'software',true),
('finance.receipts.record','finance','Registrar recebimento',array['super_admin','admin_empresa','colaborador_empresa','own_attendant','shared_attendant'],array['organization','assigned'],'software',true),
('finance.accounts.manage','finance','Criar e gerenciar contas',array['super_admin','admin_empresa','colaborador_empresa','own_attendant'],array['organization'],'software',true),
('finance.expenses.read','finance','Ver despesas',array['super_admin','admin_empresa','colaborador_empresa','own_attendant'],array['organization'],'software',true),
('finance.expenses.record','finance','Registrar despesas',array['super_admin','admin_empresa','colaborador_empresa','own_attendant'],array['organization'],'software',true),
('finance.expenses.manage','finance','Gerenciar despesas',array['super_admin','admin_empresa','colaborador_empresa','own_attendant'],array['organization'],'software',true),
('finance.cash.read','finance','Ver caixa consolidado',array['super_admin','admin_empresa','colaborador_empresa','own_attendant'],array['organization'],'software',true),
('finance.receipts.summary','finance','Ver recebimentos consolidados',array['super_admin','admin_empresa','colaborador_empresa','own_attendant'],array['organization'],'software',true),
('finance.result.read','finance','Ver resultado do período',array['super_admin','admin_empresa','colaborador_empresa','own_attendant'],array['organization'],'software',true),
('finance.calculators','finance','Usar calculadoras',array['super_admin','admin_empresa','colaborador_empresa','own_attendant'],array['organization'],'software',true),
('finance.receipts.reverse','finance','Estornar recebimento confirmado',array['super_admin','admin_empresa'],array['organization'],'software',true);

-- Source: 02-permissions.sql
create function private.internal_exemption(p_org uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(e)-'request_key' from private.organization_exemptions e where organization_id=p_org and state='active';$$;
create function private.entitlement(p_org uuid,p_feature text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare e jsonb;s public.billing_subscriptions;begin
 if not exists(select 1 from public.organizations where id=p_org and status='active') then return false;end if;
 if p_feature='setup' then return true;end if;
 e=private.internal_exemption(p_org);if e is not null then return coalesce((e->'capabilities'->>p_feature)::boolean,false);end if;
 select * into s from public.billing_subscriptions where organization_id=p_org;
 if s.organization_id is not null then return private.billing_effective(s) in('active','trial') and coalesce((select (capabilities->>p_feature)::boolean from public.billing_plan_versions where id=s.plan_version_id),false);end if;
 -- Preserve the legacy software setup regime; shared service ALWAYS needs an explicit entitlement.
 return p_feature in('software','commercial_followups') and exists(select 1 from private.organization_verifications where organization_id=p_org and not required and state='legacy') and not exists(select 1 from private.trial_requests where organization_id=p_org);
end;$$;
create or replace function private.billing_feature(p_org uuid,p_feature text) returns boolean language sql stable security definer set search_path='' as $$select private.entitlement(p_org,p_feature);$$;
create function private.verification_ready(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.organization_verifications where organization_id=p_org and required and state<>'verified');$$;
create function private.permission_role(p_org uuid,p_user uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare r text;begin
 if not exists(select 1 from public.organizations o join public.profiles p on p.id=p_user join auth.users u on u.id=p.id where o.id=p_org and o.status='active' and p.status='active' and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now())) then return null;end if;
 if exists(select 1 from public.platform_roles where user_id=p_user and role='super_admin' and active) then return case when private.support_actor_allowed(p_org,p_user) then 'super_admin' end;end if;
 if not private.verification_ready(p_org) then return null;end if;
 select case when role='admin_empresa' then 'admin_empresa' when is_attendant then 'own_attendant' else 'colaborador_empresa' end into r from public.organization_members where organization_id=p_org and user_id=p_user and status='active';
 if r is not null then return r;end if;
 if private.entitlement(p_org,'human_support') and exists(select 1 from public.attendant_organizations a join public.platform_roles p on p.user_id=a.user_id and p.role='atendente' and p.active where a.organization_id=p_org and a.user_id=p_user and a.status='active') then return 'shared_attendant';end if;
 return null;
end;$$;
create function private.permission_allowed(p_org uuid,p_action text,p_record uuid default null) returns boolean language plpgsql stable security definer set search_path='' as $$
declare r text;c private.permission_catalog;g private.organization_permissions;begin
 if not private.is_active_user() or not private.access_scope(p_org) then return false;end if;
 select * into c from private.permission_catalog where action=p_action;if c.action is null or not private.entitlement(p_org,c.capability) then return false;end if;
 r=private.permission_role(p_org,auth.uid());if r is null or not r=any(c.roles) then return false;end if;
 if r in('super_admin','admin_empresa') then return true;end if;
 select * into g from private.organization_permissions where organization_id=p_org and user_id=auth.uid() and action=p_action and granted;
 if g.action is null or not g.scope=any(c.scopes) then return false;end if;
 if r='shared_attendant' and p_action like 'finance.%'and g.scope<>'assigned' then return false;end if;
 if g.scope='organization' then return true;end if;
 return p_record is not null and exists(select 1 from public.financial_accounts a where a.organization_id=p_org and a.id=p_record and
 (a.assigned_to=auth.uid() or exists(select 1 from public.tickets t where t.organization_id=p_org and t.request_id=a.request_id and t.assignee_id=auth.uid() and t.state not in('resolved','closed'))));
end;$$;
create function private.permission_require(p_org uuid,p_action text,p_record uuid default null) returns void language plpgsql security definer set search_path='' as $$begin
 if not private.permission_allowed(p_org,p_action,p_record) then raise exception 'permission_denied' using errcode='42501';end if;end;$$;
create function private.permission_enter(p_org uuid,p_action text) returns int language plpgsql security definer set search_path='' as $$declare d int;begin
 perform private.permission_require(p_org,p_action);
 select coalesce(max(depth),0)+1 into d from private.permission_frames where backend=pg_backend_pid() and transaction_id=txid_current();
 insert into private.permission_frames values(pg_backend_pid(),txid_current(),d,p_org,auth.uid(),p_action);return d;
end;$$;
create function private.permission_leave(p_depth int) returns void language sql security definer set search_path='' as $$delete from private.permission_frames where backend=pg_backend_pid() and transaction_id=txid_current() and depth=p_depth;$$;
create function private.permission_manager(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_user() and private.access_scope(p_org) and case when private.has_global_role('super_admin') then private.support_actor_allowed(p_org,auth.uid()) else private.verification_ready(p_org) and private.is_org_admin(p_org) end;$$;
create or replace function private.company_can_manage(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.permission_manager(p_org) or (exists(select 1 from private.permission_frames f join private.permission_catalog c on c.action=f.action and c.delegates_management where (private.permission_role(p_org,auth.uid())='colaborador_empresa' or (private.permission_role(p_org,auth.uid())in('own_attendant','shared_attendant')and f.action in('agenda.read','clients.read','quotes.read','analytics.operational')))and f.backend=pg_backend_pid() and f.transaction_id=txid_current() and f.organization_id=p_org and f.actor_id=auth.uid() and private.permission_allowed(p_org,f.action)));$$;
create or replace function private.company_can_read(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.permission_manager(p_org) or exists(select 1 from private.permission_catalog c where module in('home','services','settings','page','portfolio') and private.permission_allowed(p_org,c.action));$$;
create function private.permissions_seed() returns trigger language plpgsql security definer set search_path='' as $$
declare a text;begin
 -- Explicit grants preserve existing read access and the existing attendant workflow; sensitive totals are never seeded.
 foreach a in array case when tg_table_name='attendant_organizations' or (to_jsonb(new)->>'is_attendant')::boolean then
 array['central.read','central.reply','central.manage','quotes.read','quotes.values','quotes.manage','agenda.read','agenda.manage','followup.read','followup.manage','clients.read','finance.calculators']
 else array['services.read','settings.read'] end loop
 insert into private.organization_permissions(organization_id,user_id,action,scope,granted,updated_by) values(new.organization_id,new.user_id,a,'organization',true,auth.uid()) on conflict do nothing;
 end loop;return new;
end;$$;
create function public.permissions_context(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_active_user() or not private.access_scope(p_org) or private.permission_role(p_org,auth.uid()) is null then raise exception 'permission_denied' using errcode='42501';end if;
 return jsonb_build_object('timezone',(select timezone from public.organizations where id=p_org),'role',private.permission_role(p_org,auth.uid()),'actions',coalesce((select jsonb_object_agg(c.action,jsonb_build_object('allowed',private.permission_allowed(p_org,c.action) or exists(select 1 from private.organization_permissions g where g.organization_id=p_org and g.user_id=auth.uid() and g.action=c.action and g.granted and g.scope='assigned' and private.entitlement(p_org,c.capability) and private.permission_role(p_org,auth.uid())=any(c.roles)),'scope',case when private.permission_manager(p_org) then 'organization' else (select scope from private.organization_permissions where organization_id=p_org and user_id=auth.uid() and action=c.action and granted)end)) from private.permission_catalog c),'{}'::jsonb));
end;$$;
create function public.permissions_team(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 perform private.permission_require(p_org,'people.manage');
 return jsonb_build_object('catalog',(select jsonb_agg(to_jsonb(c) order by module,action) from private.permission_catalog c),
 'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.id,'name',p.display_name,'role',x.role,'revision',coalesce((select revision from private.permission_revisions where organization_id=p_org and user_id=p.id),0),'grants',coalesce((select jsonb_agg(jsonb_build_object('action',action,'scope',scope,'granted',granted) order by action) from private.organization_permissions where organization_id=p_org and user_id=p.id),'[]'::jsonb))) from (
 select user_id,case when role='admin_empresa' then 'admin_empresa' when is_attendant then 'own_attendant' else 'colaborador_empresa' end role from public.organization_members where organization_id=p_org and status='active'
 union all select user_id,'shared_attendant' from public.attendant_organizations where organization_id=p_org and status='active')x join public.profiles p on p.id=x.user_id),'[]'::jsonb));end;$$;
create function public.permissions_save(p_org uuid,p_user uuid,p_revision int,p_grants jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r text;g jsonb;prior private.permission_commands;payload jsonb;rev int;result_ jsonb;begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'people.manage');
 if p_user=auth.uid() or p_user is null or p_key is null or jsonb_typeof(p_grants)<>'array' then raise exception 'permission_invalid';end if;
 r=private.permission_role(p_org,p_user);if r is null or r in('admin_empresa','super_admin') then raise exception 'permission_role_ceiling' using errcode='42501';end if;
 payload=jsonb_build_array(p_user,p_revision,p_grants);select * into prior from private.permission_commands where organization_id=p_org and actor_id=auth.uid() and key=p_key;
 if found then if prior.payload<>payload then raise exception 'idempotency_conflict';end if;return prior.result;end if;
 insert into private.permission_revisions values(p_org,p_user,0) on conflict do nothing;
 select revision into rev from private.permission_revisions where organization_id=p_org and user_id=p_user for update;if rev is distinct from p_revision then raise exception 'permission_revision_conflict' using errcode='40001';end if;
 if (select count(*) from jsonb_array_elements(p_grants))<>(select count(distinct value->>'action')from jsonb_array_elements(p_grants))then raise exception 'permission_invalid';end if;
 for g in select * from jsonb_array_elements(p_grants) loop
 if r='shared_attendant'and (g->>'granted')::boolean and g->>'action'like 'finance.%'and g->>'scope'<>'assigned'then raise exception 'permission_role_ceiling'using errcode='42501';end if;
 if not exists(select 1 from private.permission_catalog c where c.action=g->>'action' and r=any(c.roles) and (g->>'scope')=any(c.scopes)) or jsonb_typeof(g->'granted')<>'boolean' then raise exception 'permission_role_ceiling' using errcode='42501';end if;
 end loop;
 -- Complete explicit set, revision checked. Existing sessions observe these rows on every RPC/RLS check.
 update private.organization_permissions set granted=false,revision=rev+1,updated_by=auth.uid(),updated_at=clock_timestamp() where organization_id=p_org and user_id=p_user;
 for g in select * from jsonb_array_elements(p_grants) loop
 insert into private.organization_permissions(organization_id,user_id,action,scope,granted,revision,updated_by) values(p_org,p_user,g->>'action',g->>'scope',(g->>'granted')::boolean,rev+1,auth.uid())
 on conflict(organization_id,user_id,action)do update set scope=excluded.scope,granted=excluded.granted,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=clock_timestamp();end loop;
 update private.permission_revisions set revision=rev+1 where organization_id=p_org and user_id=p_user;
 perform private.access_audit(p_org,auth.uid(),'permissions_changed',p_user);result_=jsonb_build_object('revision',rev+1);
 insert into private.permission_commands values(p_org,auth.uid(),p_key,payload,result_);return result_;
end;$$;

-- Source: 03-capabilities.sql
create function private.plan_capabilities() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.capabilities='{}'::jsonb then new.capabilities=jsonb_build_object('software',true,'human_support',new.human_support,'commercial_followups',new.commercial_followups);end if;
 if exists(select 1 from jsonb_each(new.capabilities) e where e.key not in('software','human_support','commercial_followups') or jsonb_typeof(e.value)<>'boolean') then raise exception 'invalid_plan_capability';end if;
 if coalesce((new.capabilities->>'software')::boolean,false) is not true then raise exception 'software_capability_required';end if;
 new.human_support=coalesce((new.capabilities->>'human_support')::boolean,false);new.commercial_followups=coalesce((new.capabilities->>'commercial_followups')::boolean,false);return new;
end;$$;
create trigger plan_capabilities before insert on public.billing_plan_versions for each row execute function private.plan_capabilities();
create function private.shared_capability_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='active' and not private.entitlement(new.organization_id,'human_support') then raise exception 'shared_support_plan_required' using errcode='42501';end if;return new;end;$$;
create trigger shared_capability_guard before insert or update on public.attendant_organizations for each row execute function private.shared_capability_guard();
create function private.suspend_shared(p_org uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if not private.entitlement(p_org,'human_support') then
 update public.attendant_organizations set status='suspended' where organization_id=p_org and status='active';
 end if;
end;$$;
create function private.subscription_capability_changed() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform private.suspend_shared(new.organization_id);return new;end;$$;
create trigger subscription_capability_changed after insert or update on public.billing_subscriptions for each row execute function private.subscription_capability_changed();
create trigger exemption_capability_changed after insert or update on private.organization_exemptions for each row execute function private.subscription_capability_changed();
create function public.billing_exemption_set(p_org uuid,p_kind text,p_capabilities jsonb,p_reason text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e private.organization_exemptions;payload jsonb;begin
 perform private.lock_authorize('global');
 if not exists(select 1 from public.organizations where id=p_org and status='active') or p_key is null or p_kind not in('internal','exempt') or length(btrim(p_reason))not between 10 and 500 or jsonb_typeof(p_capabilities)<>'object' or (p_capabilities->>'software')is distinct from 'true' or exists(select 1 from jsonb_each(p_capabilities)x where key not in('software','human_support','commercial_followups')or jsonb_typeof(value)<>'boolean') then raise exception 'exemption_invalid';end if;
 select * into e from private.organization_exemptions where granted_by=auth.uid() and request_key=p_key;
 if found then if e.organization_id<>p_org or e.kind<>p_kind or e.capabilities<>p_capabilities or e.reason<>btrim(p_reason)then raise exception 'idempotency_conflict';end if;return to_jsonb(e)-'request_key';end if;
 if exists(select 1 from private.organization_exemptions where organization_id=p_org and state='active')then raise exception 'exemption_already_active';end if;
 insert into private.organization_exemptions(organization_id,kind,state,capabilities,reason,granted_by,request_key)values(p_org,p_kind,'active',p_capabilities,btrim(p_reason),auth.uid(),p_key)returning * into e;
 perform private.access_audit(p_org,auth.uid(),'exemption_granted',e.id);return to_jsonb(e)-'request_key';
end;$$;
create function public.billing_exemption_revoke(p_org uuid,p_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.lock_authorize('global');if p_reason is null or length(btrim(p_reason))not between 10 and 500 then raise exception 'exemption_reason_required';end if;
 if not exists(select 1 from private.organization_exemptions where id=p_id and organization_id=p_org)then raise exception 'access_denied' using errcode='42501';end if;
 update private.organization_exemptions set state='revoked',revoked_by=auth.uid(),revoked_at=clock_timestamp(),revocation_reason=btrim(p_reason)where id=p_id and organization_id=p_org and state='active';
 if found then perform private.access_audit(p_org,auth.uid(),'exemption_revoked',p_id);end if;
end;$$;
create function public.billing_capabilities(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.is_active_user() or not private.access_scope(p_org) or not (private.can_access_org(p_org)or private.has_global_role('super_admin')) then raise exception 'access_denied' using errcode='42501';end if;
 return jsonb_build_object('software',private.entitlement(p_org,'software'),'human_support',private.entitlement(p_org,'human_support'),'commercial_followups',private.entitlement(p_org,'commercial_followups'),'exemption',case when private.billing_can_read(p_org)then private.internal_exemption(p_org)end,'commercial_state',case when private.internal_exemption(p_org)is not null then 'internal_exempt' when exists(select 1 from public.billing_subscriptions where organization_id=p_org)then(select private.billing_effective(s)from public.billing_subscriptions s where organization_id=p_org)else 'setup' end);
end;$$;
-- Exemption bypasses billing expiry/limits, never actor, tenant, verification or support checks.
do $$declare d text;begin
 d=pg_get_functiondef('private.billing_guard()'::regprocedure);d=replace(d,'org=new.organization_id;','org=new.organization_id; if private.internal_exemption(org) is not null then return new;end if;');d=replace(d,'select * into s from public.billing_subscriptions where organization_id=org;', 'if metric_ in(''requests'',''tickets'',''followups'',''software'')and not private.entitlement(org,''software'')then raise exception ''billing_subscription_required''using errcode=''42501'';end if; select * into s from public.billing_subscriptions where organization_id=org;');execute d;
 d=pg_get_functiondef('private.trial_eligibility(uuid)'::regprocedure);d=replace(d,'select * into p from private.trial_policy;',E'if private.internal_exemption(p_org) is not null then return ''not_applicable'';end if;\n select * into p from private.trial_policy;');execute d;
 d=pg_get_functiondef('public.billing_subscription_action(uuid,text,uuid,integer,uuid)'::regprocedure);d=replace(d,'perform private.company_lock(p_org);',E'perform private.company_lock(p_org); if private.internal_exemption(p_org) is not null then raise exception ''exemption_no_subscription'';end if;');execute d;
 d=pg_get_functiondef('public.billing_plan_save(uuid,integer,jsonb)'::regprocedure);d=replace(d,'''followup_limit'']);','''followup_limit'',''capabilities'']);');d=replace(d,'request_limit,ticket_limit,followup_limit)','request_limit,ticket_limit,followup_limit,capabilities)');d=replace(d,$q$(p_data->>'followup_limit')::integer);$q$,$q$(p_data->>'followup_limit')::integer,coalesce(p_data->'capabilities','{}'::jsonb));$q$);execute d;
end;$$;

-- Source: 04-verification.sql
create function private.document_normalize(p_kind text,p_document text) returns text language plpgsql immutable set search_path='' as $$
declare d text;i int;j int;n int;s int;v int;weight int;begin
 if p_document is null or length(p_document)>32 or p_document!~'^[A-Za-z0-9 ./-]+$' then return null;end if;
 d=upper(regexp_replace(p_document,'[ ./-]','','g'));
 if p_kind='CPF' then
 if d!~'^[0-9]{11}$' or d=repeat(left(d,1),11)then return null;end if;
 for n in 9..10 loop s=0;for i in 1..n loop s=s+substring(d,i,1)::int*(n+2-i);end loop;v=11-(s%11);if v>=10 then v=0;end if;if substring(d,n+1,1)::int<>v then return null;end if;end loop;
 elsif p_kind='CNPJ' then
 if d!~'^[A-Z0-9]{12}[0-9]{2}$'or d=repeat(left(d,1),14)then return null;end if;
 -- RFB algorithm: ASCII value minus 48, weights 2..9 from right to left; old numeric CNPJs remain valid.
 for n in 12..13 loop s=0;weight=2;for i in reverse n..1 loop s=s+(ascii(substring(d,i,1))-48)*weight;weight=case when weight=9 then 2 else weight+1 end;end loop;v=11-(s%11);if v>=10 then v=0;end if;if substring(d,n+1,1)::int<>v then return null;end if;end loop;
 else return null;end if;return d;
end;$$;
create function private.verification_new_org() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into private.organization_verifications(organization_id)values(new.id)on conflict do nothing;return new;end;$$;
create trigger verification_new_org after insert on public.organizations for each row execute function private.verification_new_org();
create function private.verification_first_admin() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.role='admin_empresa' and not exists(select 1 from private.enterprise_accounts where organization_id=new.organization_id and role='admin_empresa' and activated_at is not null)and not private.support_responsible(new.organization_id)then
 update private.organization_verifications set required=true,state=case when state='legacy'then 'pending'else state end where organization_id=new.organization_id;end if;return new;end;$$;
create trigger verification_first_admin before insert on private.enterprise_accounts for each row execute function private.verification_first_admin();
create function private.verification_administrator(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.access_base_active() and private.access_session_valid(false) and private.access_scope(p_org) and private.legal_ready(p_org) and exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.organization_id=p_org and m.user_id=auth.uid() and m.role='admin_empresa' and m.status='active' and o.status='active');$$;
create function public.access_verification_context(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare v private.organization_verifications;why text;begin
 if not private.verification_administrator(p_org) and not (private.has_global_role('super_admin')and private.access_scope(p_org))then raise exception 'access_denied' using errcode='42501';end if;
 select * into v from private.organization_verifications where organization_id=p_org;why=private.trial_eligibility(p_org);
 return jsonb_build_object('state',v.state,'required',v.required,'kind',v.kind,'masked',v.masked,'revision',v.revision,'eligibility',case when private.internal_exemption(p_org)is not null then 'not_applicable' when why='eligible'then 'eligible' when why in('previous_grant','previous_identity')then 'unavailable'else 'review_required'end,'verified_at',v.verified_at,'basis','structure_and_internal_history');
end;$$;
create function public.access_verify_document(p_org uuid,p_kind text,p_document text,p_revision int,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d text;fp bytea;v private.organization_verifications;prior private.verification_commands;k text;why text;r jsonb;begin
 perform pg_advisory_xact_lock(734921501);
 if not private.verification_administrator(p_org)then raise exception 'access_denied' using errcode='42501';end if;
 d=private.document_normalize(p_kind,p_document);if d is null or p_key is null then raise exception 'document_invalid' using errcode='22023';end if;
 fp=private.trial_fingerprint('registration','BR:'||p_kind||':'||d);
 select * into prior from private.verification_commands where organization_id=p_org and actor_id=auth.uid() and key=p_key;
 if found then if prior.fingerprint<>fp then raise exception 'idempotency_conflict';end if;return prior.result;end if;
 select * into v from private.organization_verifications where organization_id=p_org for update;
 if v.revision is distinct from p_revision then raise exception 'verification_revision_conflict' using errcode='40001';end if;
 if v.state='verified' and v.fingerprint is distinct from fp then raise exception 'verification_review_required';end if;
 if not exists(select 1 from private.organization_exemptions where organization_id=p_org and state='active') then
 foreach k in array case when p_kind='CPF'then array['business','responsible']else array['business']end loop
 insert into private.trial_identifiers(organization_id,kind,fingerprint,verified_by,evidence_ref) values(p_org,k,private.trial_fingerprint(k,'BR:'||p_kind||':'||d),auth.uid(),'self_declared_structure_030')on conflict do nothing;
 insert into private.trial_claims select id,k,private.trial_fingerprint(k,'BR:'||p_kind||':'||d)from private.trial_grants where organization_id=p_org on conflict do nothing;
 end loop;
 insert into private.trial_consumed_keys select distinct on(c.kind,c.fingerprint)c.kind,c.fingerprint,c.grant_id from private.trial_claims c join private.trial_grants g on g.id=c.grant_id where g.organization_id=p_org order by c.kind,c.fingerprint,c.grant_id on conflict do nothing;
 end if;
 why=private.trial_eligibility(p_org);
 update private.organization_verifications set state=case when why in('manual_policy','previous_review')then 'review'else 'verified'end,kind=p_kind,masked=case when p_kind='CPF'then '***.***.***-'else '**.***.***/****-'end||right(d,2),fingerprint=fp,verified_by=auth.uid(),verified_at=clock_timestamp(),revision=revision+1 where organization_id=p_org;
 perform private.access_audit(p_org,auth.uid(),'registration_structure_checked',p_org);
 r=public.access_verification_context(p_org);insert into private.verification_commands values(p_org,auth.uid(),p_key,fp,r);return r;
end;$$;
create function public.access_verification_review(p_org uuid,p_revision int,p_approve boolean,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.lock_authorize('global');
 if p_approve is null or p_reason is null or length(btrim(p_reason))not between 15 and 500 then raise exception 'verification_reason_required';end if;
 update private.organization_verifications set state=case when p_approve then 'verified'else 'review'end,review_reason=btrim(p_reason),verified_by=auth.uid(),verified_at=clock_timestamp(),revision=revision+1 where organization_id=p_org and revision=p_revision and fingerprint is not null;
 if not found then raise exception 'verification_revision_conflict' using errcode='40001';end if;
 perform private.access_audit(p_org,auth.uid(),case when p_approve then 'registration_review_approved'else 'registration_review_retained'end,p_org);
 return public.access_verification_context(p_org);
end;$$;
-- Normal sessions remain valid while legal/document onboarding is pending, but operation is gated separately.
create or replace function public.access_session(p_activity boolean default false,p_logout boolean default false)returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.enterprise_sessions;begin
 if p_logout then update private.enterprise_sessions set revoked=true where user_id=auth.uid()and session_id::text=auth.jwt()->>'session_id';return '{}'::jsonb;end if;
 if auth.uid()is null then raise exception 'session_expired'using errcode='42501';end if;
 if not private.access_base_active()then raise exception 'account_inactive'using errcode='42501';end if;
 select * into s from private.enterprise_sessions where user_id=auth.uid()and session_id::text=auth.jwt()->>'session_id';
 if s.organization_id is not null and exists(select 1 from public.organizations where id=s.organization_id and status<>'active')then raise exception 'organization_suspended'using errcode='42501';end if;
 if not private.access_session_valid(false)then raise exception 'session_expired'using errcode='42501';end if;
 if p_activity then update private.enterprise_sessions set last_activity=clock_timestamp()where session_id=s.session_id returning * into s;end if;
 return jsonb_build_object('idle_seconds',(select idle_seconds from private.access_policy),'warning_seconds',(select warning_seconds from private.access_policy),'last_activity',s.last_activity,'organization_id',s.organization_id,'organization_name',(select name from public.organizations where id=s.organization_id),
 'legal_required',s.organization_id is not null and not private.legal_ready(s.organization_id),'verification_required',s.organization_id is not null and not private.verification_ready(s.organization_id),
 'can_accept',exists(select 1 from public.organization_members where organization_id=s.organization_id and user_id=auth.uid()and role='admin_empresa'and status='active'));
end;$$;
-- An unverified new responsible ADM does not prematurely terminate VIRELOQ management.
do $$declare d text;begin
 d=pg_get_functiondef('private.support_responsible(uuid,uuid)'::regprocedure);d=replace(d,'select exists(select 1','select private.verification_ready(p_org) and exists(select 1');execute d;
 d=pg_get_functiondef('private.is_org_admin(uuid)'::regprocedure);d=replace(d,'select private.access_base_admin(p_org)','select private.verification_ready(p_org) and private.access_base_admin(p_org)');execute d;
end;$$;

-- Source: 05-finance.sql
create function private.financial_received(p_org uuid,p_account uuid)returns bigint language sql stable security definer set search_path=''as $$
 select coalesce(sum(case kind when 'receipt'then amount_cents else -amount_cents end),0)::bigint from public.financial_receipts where organization_id=p_org and account_id=p_account;$$;
create function private.financial_account_json(p_org uuid,p_id uuid)returns jsonb language sql stable security definer set search_path=''as $$
 select to_jsonb(a)||jsonb_build_object('customer_name',c.name,'assigned_name',(select display_name from public.profiles where id=a.assigned_to),'received_cents',r.amount,'balance_cents',a.total_cents-r.amount,'status',case when a.cancelled_at is not null then 'cancelled'when r.amount=a.total_cents then 'paid'when a.due_date<(now()at time zone o.timezone)::date then 'overdue'when r.amount>0 then 'partial'else 'pending'end)
 from public.financial_accounts a join public.organizations o on o.id=a.organization_id left join public.customers c on c.id=a.customer_id and c.organization_id=p_org cross join lateral(select private.financial_received(p_org,a.id)amount)r where a.organization_id=p_org and a.id=p_id;$$;
create function private.financial_event(p_org uuid,p_account uuid,p_receipt uuid,p_expense uuid,p_event text,p_reason text,p_details jsonb default '{}')returns void language sql security definer set search_path=''as $$
 insert into public.financial_events(organization_id,account_id,receipt_id,expense_id,event,actor_id,reason,details)values(p_org,p_account,p_receipt,p_expense,p_event,auth.uid(),coalesce(p_reason,''),p_details);$$;
create function private.financial_idem(p_org uuid,p_key uuid,p_payload jsonb)returns jsonb language plpgsql security definer set search_path=''as $$declare c private.financial_commands;begin
 if p_key is null then raise exception 'financial_key_required';end if;
 select * into c from private.financial_commands where organization_id=p_org and actor_id=auth.uid()and key=p_key;
 if found and c.payload<>p_payload then raise exception 'idempotency_conflict';end if;return c.result;end;$$;
create function private.financial_remember(p_org uuid,p_key uuid,p_payload jsonb,p_result jsonb)returns void language sql security definer set search_path=''as $$insert into private.financial_commands values(p_org,auth.uid(),p_key,p_payload,p_result);$$;
create function public.financial_accounts(p_org uuid,p_status text default null,p_search text default '',p_offset int default 0)returns jsonb language plpgsql stable security definer set search_path=''as $$declare r jsonb;begin
 if not private.is_active_user()or not private.access_scope(p_org)or private.permission_role(p_org,auth.uid())is null then raise exception 'permission_denied'using errcode='42501';end if;
 if p_offset is null or p_offset<0 or p_offset>100000 or length(coalesce(p_search,''))>150 then raise exception 'financial_filter_invalid';end if;
 select coalesce(jsonb_agg(x),'[]')into r from(select private.financial_account_json(p_org,a.id)x from public.financial_accounts a where a.organization_id=p_org and private.permission_allowed(p_org,'finance.accounts.read',a.id)and (coalesce(p_search,'')=''or a.description ilike '%'||p_search||'%'or exists(select 1 from public.customers c where c.id=a.customer_id and c.organization_id=p_org and c.name ilike '%'||p_search||'%'))and(p_status is null or private.financial_account_json(p_org,a.id)->>'status'=p_status)order by a.created_at desc,a.id limit 50 offset p_offset)t;
 return jsonb_build_object('accounts',r,'next_offset',case when jsonb_array_length(r)=50 then p_offset+50 end);
end;$$;
create function public.financial_account(p_org uuid,p_id uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 perform private.permission_require(p_org,'finance.accounts.read',p_id);
 if not exists(select 1 from public.financial_accounts where organization_id=p_org and id=p_id)then raise exception 'permission_denied'using errcode='42501';end if;
 return jsonb_build_object('account',private.financial_account_json(p_org,p_id),'can_record',private.permission_allowed(p_org,'finance.receipts.record',p_id),'can_reverse',private.permission_allowed(p_org,'finance.receipts.reverse',p_id),
 'receipts',case when private.permission_allowed(p_org,'finance.history.read',p_id)then coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('actor_name',p.display_name)order by r.created_at,r.id)from public.financial_receipts r left join public.profiles p on p.id=r.actor_id where r.organization_id=p_org and r.account_id=p_id),'[]'::jsonb)else null end,
 'history',case when private.permission_allowed(p_org,'finance.history.read',p_id)then coalesce((select jsonb_agg(to_jsonb(e)order by e.created_at,e.id)from public.financial_events e where organization_id=p_org and account_id=p_id),'[]'::jsonb)else null end);
end;$$;
create function public.financial_account_save(p_org uuid,p_id uuid,p_revision int,p_data jsonb,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare a public.financial_accounts;q public.quote_requests;v public.quote_versions;payload jsonb;prior jsonb;r jsonb;total_ bigint;customer_ uuid;begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'finance.accounts.manage');
 perform private.company_keys(p_data,array['description','customer_id','request_id','appointment_id','service_id','total_cents','due_date','notes','assigned_to','cancel','reason']);
 payload=jsonb_build_array('account',p_id,p_revision,p_data);prior=private.financial_idem(p_org,p_key,payload);if prior is not null then return prior;end if;
 if p_id is not null then
 select * into a from public.financial_accounts where id=p_id and organization_id=p_org for update;
 if a.id is null then raise exception 'permission_denied'using errcode='42501';end if;
 if a.revision is distinct from p_revision then raise exception 'financial_revision_conflict'using errcode='40001';end if;
 if a.cancelled_at is not null then raise exception 'financial_account_cancelled';end if;
 if coalesce((p_data->>'cancel')::boolean,false)then
 if private.financial_received(p_org,p_id)<>0 then raise exception 'financial_reverse_before_cancel';end if;
 if length(btrim(coalesce(p_data->>'reason','')))<10 then raise exception 'financial_reason_required';end if;
 update public.financial_accounts set cancelled_at=clock_timestamp(),cancelled_by=auth.uid(),cancel_reason=p_data->>'reason',revision=revision+1 where id=p_id;
 perform private.financial_event(p_org,p_id,null,null,'account_cancelled',p_data->>'reason');
 else
 total_=coalesce((p_data->>'total_cents')::bigint,a.total_cents);
 if total_<private.financial_received(p_org,p_id)or(a.origin='approved_quote'and total_<>a.total_cents)then raise exception 'financial_total_invalid';end if;
 if p_data?'assigned_to'and nullif(p_data->>'assigned_to','')is not null and private.permission_role(p_org,(p_data->>'assigned_to')::uuid)is null then raise exception 'financial_assignee_invalid';end if;
 update public.financial_accounts set description=coalesce(p_data->>'description',description),total_cents=total_,due_date=case when p_data?'due_date'then nullif(p_data->>'due_date','')::date else due_date end,notes=coalesce(p_data->>'notes',notes),assigned_to=case when p_data?'assigned_to'then nullif(p_data->>'assigned_to','')::uuid else assigned_to end,revision=revision+1 where id=p_id;
 perform private.financial_event(p_org,p_id,null,null,'account_updated',coalesce(p_data->>'reason','Atualização autorizada'),jsonb_build_object('previous_total_cents',a.total_cents,'total_cents',total_));
 end if;
 else
 if p_revision is distinct from 0 then raise exception 'financial_revision_conflict'using errcode='40001';end if;
 if nullif(p_data->>'request_id','')is not null then
 select * into q from public.quote_requests where organization_id=p_org and id=(p_data->>'request_id')::uuid;
 select * into v from public.quote_versions where organization_id=p_org and id=q.accepted_version_id and request_id=q.id;
 if v.id is null or v.total_cents is null or v.total_cents<=0 then raise exception 'financial_approved_quote_required';end if;
 select * into a from public.financial_accounts where organization_id=p_org and request_id=q.id and cancelled_at is null;
 if a.id is not null then r=jsonb_build_object('id',a.id,'revision',a.revision);perform private.financial_remember(p_org,p_key,payload,r);return r;end if;
 total_=v.total_cents;customer_=q.customer_id;
 else total_=(p_data->>'total_cents')::bigint;customer_=nullif(p_data->>'customer_id','')::uuid;end if;
 if nullif(p_data->>'assigned_to','')is not null and private.permission_role(p_org,(p_data->>'assigned_to')::uuid)is null then raise exception 'financial_assignee_invalid';end if;
 if nullif(p_data->>'appointment_id','')is not null and not exists(select 1 from public.appointments ap where ap.organization_id=p_org and ap.id=(p_data->>'appointment_id')::uuid and (q.id is null or ap.request_id=q.id)and(customer_ is null or ap.customer_id=customer_)and(nullif(p_data->>'service_id','')is null or exists(select 1 from public.quote_requests ar where ar.id=ap.request_id and ar.service_id=(p_data->>'service_id')::uuid)))then raise exception 'financial_link_invalid';end if;
 insert into public.financial_accounts(organization_id,customer_id,request_id,quote_version_id,appointment_id,service_id,description,origin,total_cents,due_date,notes,assigned_to,created_by)
 values(p_org,customer_,q.id,v.id,nullif(p_data->>'appointment_id','')::uuid,coalesce(q.service_id,nullif(p_data->>'service_id','')::uuid),coalesce(p_data->>'description','Serviço contratado'),case when q.id is null then 'manual'else 'approved_quote'end,total_,nullif(p_data->>'due_date','')::date,coalesce(p_data->>'notes',''),nullif(p_data->>'assigned_to','')::uuid,auth.uid())returning * into a;
 p_id=a.id;perform private.financial_event(p_org,p_id,null,null,'account_created','Criação autorizada',jsonb_build_object('origin',a.origin,'total_cents',total_));
 end if;
 select jsonb_build_object('id',id,'revision',revision)into r from public.financial_accounts where id=p_id;
 perform private.financial_remember(p_org,p_key,payload,r);return r;
end;$$;
create function public.financial_receipt_record(p_org uuid,p_account uuid,p_amount bigint,p_date date,p_method text,p_note text,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare a public.financial_accounts;payload jsonb;prior jsonb;r jsonb;id_ uuid;today date;begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'finance.receipts.record',p_account);perform private.permission_require(p_org,'finance.accounts.read',p_account);
 payload=jsonb_build_array('receipt',p_account,p_amount,p_date,p_method,coalesce(p_note,''));prior=private.financial_idem(p_org,p_key,payload);if prior is not null then return prior;end if;
 select * into a from public.financial_accounts where organization_id=p_org and id=p_account for update;if a.id is null then raise exception 'permission_denied'using errcode='42501';end if;
 select (now()at time zone timezone)::date into today from public.organizations where id=p_org;
 if a.cancelled_at is not null or p_amount is null or p_amount<=0 or p_date is null or not isfinite(p_date)or p_date>today or p_amount>a.total_cents-private.financial_received(p_org,p_account)then raise exception 'financial_receipt_invalid';end if;
 insert into public.financial_receipts(organization_id,account_id,kind,amount_cents,effective_date,method,note,actor_id)values(p_org,p_account,'receipt',p_amount,p_date,p_method,coalesce(p_note,''),auth.uid())returning id into id_;
 update public.financial_accounts set revision=revision+1 where id=p_account;
 perform private.financial_event(p_org,p_account,id_,null,'receipt_recorded',p_note,jsonb_build_object('amount_cents',p_amount,'effective_date',p_date));
 r=jsonb_build_object('id',id_,'account',private.financial_account_json(p_org,p_account));perform private.financial_remember(p_org,p_key,payload,r);return r;
end;$$;
create function public.financial_receipt_reverse(p_org uuid,p_receipt uuid,p_reason text,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare original public.financial_receipts;id_ uuid;payload jsonb;prior jsonb;r jsonb;today date;begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'finance.receipts.reverse');
 payload=jsonb_build_array('reversal',p_receipt,p_reason);prior=private.financial_idem(p_org,p_key,payload);if prior is not null then return prior;end if;
 select * into original from public.financial_receipts where id=p_receipt and organization_id=p_org and kind='receipt';if original.id is null then raise exception 'permission_denied'using errcode='42501';end if;
 if p_reason is null or length(btrim(p_reason))not between 10 and 1000 then raise exception 'financial_reason_required';end if;
 select id into id_ from public.financial_receipts where original_id=p_receipt;
 if id_ is null then
 select(now()at time zone timezone)::date into today from public.organizations where id=p_org;
 insert into public.financial_receipts(organization_id,account_id,kind,amount_cents,effective_date,method,note,original_id,actor_id)values(p_org,original.account_id,'reversal',original.amount_cents,today,original.method,btrim(p_reason),original.id,auth.uid())returning id into id_;
 update public.financial_accounts set revision=revision+1 where id=original.account_id;
 perform private.financial_event(p_org,original.account_id,id_,null,'receipt_reversed',p_reason,jsonb_build_object('original_receipt',original.id,'effect_cents',-original.amount_cents));end if;
 r=jsonb_build_object('id',id_,'account',private.financial_account_json(p_org,original.account_id));perform private.financial_remember(p_org,p_key,payload,r);return r;
end;$$;
create function private.financial_approved()returns trigger language plpgsql security definer set search_path=''as $$
declare v public.quote_versions;a public.financial_accounts;begin
 if new.accepted_version_id is null or new.accepted_version_id is not distinct from old.accepted_version_id then return new;end if;
 select * into v from public.quote_versions where organization_id=new.organization_id and request_id=new.id and id=new.accepted_version_id;
 if v.total_cents is null or v.total_cents<=0 then return new;end if;
 -- New approvals create a receivable, never a receipt. Existing approvals are not retroactively assumed unpaid.
 if not exists(select 1 from public.financial_accounts where organization_id=new.organization_id and request_id=new.id and cancelled_at is null)then
 insert into public.financial_accounts(organization_id,customer_id,request_id,quote_version_id,service_id,description,origin,total_cents,created_by)values(new.organization_id,new.customer_id,new.id,v.id,new.service_id,coalesce((select name from public.services where id=new.service_id),'Serviço contratado'),'approved_quote',v.total_cents,case when exists(select 1 from public.profiles where id=auth.uid())then auth.uid()end)returning * into a;
 perform private.financial_event(new.organization_id,a.id,null,null,'account_from_approval','Proposta aprovada; nenhum recebimento registrado',jsonb_build_object('quote_version_id',v.id,'total_cents',v.total_cents));end if;return new;
end;$$;
create trigger financial_approved after update of accepted_version_id on public.quote_requests for each row execute function private.financial_approved();
create function public.financial_expense_save(p_org uuid,p_data jsonb,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare payload jsonb;prior jsonb;r jsonb;id_ uuid;cat uuid;today date;begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'finance.expenses.record');
 perform private.company_keys(p_data,array['description','category','amount_cents','date','method','note']);payload=jsonb_build_array('expense',p_data);prior=private.financial_idem(p_org,p_key,payload);if prior is not null then return prior;end if;
 select(now()at time zone timezone)::date into today from public.organizations where id=p_org;
 if nullif(p_data->>'date','')is null or not isfinite((p_data->>'date')::date)or(p_data->>'date')::date>today then raise exception 'financial_date_invalid';end if;
 if length(btrim(coalesce(p_data->>'category','')))>0 then
 insert into public.expense_categories(organization_id,name)values(p_org,btrim(p_data->>'category'))on conflict do nothing;
 select id into cat from public.expense_categories where organization_id=p_org and lower(btrim(name))=lower(btrim(p_data->>'category'))and active;
 if cat is null then raise exception 'financial_category_inactive';end if;end if;
 insert into public.financial_expenses(organization_id,category_id,description,amount_cents,effective_date,method,note,actor_id)values(p_org,cat,p_data->>'description',(p_data->>'amount_cents')::bigint,(p_data->>'date')::date,p_data->>'method',coalesce(p_data->>'note',''),auth.uid())returning id into id_;
 perform private.financial_event(p_org,null,null,id_,'expense_recorded',p_data->>'note');r=jsonb_build_object('id',id_);perform private.financial_remember(p_org,p_key,payload,r);return r;
end;$$;
create function public.financial_expense_cancel(p_org uuid,p_id uuid,p_reason text,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare payload jsonb;prior jsonb;r jsonb;begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'finance.expenses.manage');payload=jsonb_build_array('expense_cancel',p_id,p_reason);prior=private.financial_idem(p_org,p_key,payload);if prior is not null then return prior;end if;
 if p_reason is null or length(btrim(p_reason))not between 10 and 1000 then raise exception 'financial_reason_required';end if;
 if not exists(select 1 from public.financial_expenses where organization_id=p_org and id=p_id)then raise exception 'permission_denied'using errcode='42501';end if;
 update public.financial_expenses set cancelled_at=clock_timestamp(),cancelled_by=auth.uid(),cancel_reason=p_reason where organization_id=p_org and id=p_id and cancelled_at is null;
 if found then perform private.financial_event(p_org,null,null,p_id,'expense_cancelled',p_reason);end if;
 r=jsonb_build_object('id',p_id);perform private.financial_remember(p_org,p_key,payload,r);return r;
end;$$;
create function public.financial_expenses(p_org uuid,p_from date,p_to date)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 perform private.permission_require(p_org,'finance.expenses.read');perform private.analytics_period((select timezone from public.organizations where id=p_org),p_from,p_to);
 return jsonb_build_object('expenses',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('category',c.name)order by effective_date desc,e.id)from public.financial_expenses e left join public.expense_categories c on c.id=e.category_id and c.organization_id=p_org where e.organization_id=p_org and e.effective_date between p_from and p_to),'[]'::jsonb),'categories',coalesce((select jsonb_agg(to_jsonb(c)order by name)from public.expense_categories c where organization_id=p_org),'[]'::jsonb));end;$$;
create function public.financial_receipts(p_org uuid,p_from date,p_to date)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 perform private.permission_require(p_org,'finance.receipts.summary');perform private.analytics_period((select timezone from public.organizations where id=p_org),p_from,p_to);
 return coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('description',a.description,'customer_name',c.name)order by r.effective_date desc,r.id)from public.financial_receipts r join public.financial_accounts a on a.id=r.account_id and a.organization_id=p_org left join public.customers c on c.id=a.customer_id where r.organization_id=p_org and r.effective_date between p_from and p_to),'[]'::jsonb);end;$$;
create function private.financial_totals(p_org uuid,p_from date,p_to date)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare b jsonb;lo timestamptz;hi timestamptz;received bigint;expenses bigint;quoted bigint;approved bigint;performed bigint;balance bigint;overdue bigint;today date;num bigint;begin
 b=private.analytics_period((select timezone from public.organizations where id=p_org),p_from,p_to);lo=(b->>'from')::timestamptz;hi=(b->>'until')::timestamptz;select(now()at time zone timezone)::date into today from public.organizations where id=p_org;
 select coalesce(sum(case kind when 'receipt'then amount_cents else -amount_cents end),0)into received from public.financial_receipts where organization_id=p_org and effective_date between p_from and p_to;
 select coalesce(sum(amount_cents),0)into expenses from public.financial_expenses where organization_id=p_org and effective_date between p_from and p_to and cancelled_at is null;
 select coalesce(sum(total_cents),0)into quoted from(select distinct on(request_id)total_cents from public.quote_versions where organization_id=p_org and kind='final'and state='sent'and created_at>=lo and created_at<hi order by request_id,version desc)x;
 select coalesce(sum(v.total_cents),0)into approved from public.quote_requests q join public.quote_versions v on v.id=q.accepted_version_id and v.organization_id=p_org where q.organization_id=p_org and exists(select 1 from public.request_events e where e.organization_id=p_org and e.request_id=q.id and e.event='approved'and e.created_at>=lo and e.created_at<hi);
 select coalesce(sum(v.total_cents),0)into performed from public.appointments a join public.quote_requests q on q.id=a.request_id and q.organization_id=p_org join public.quote_versions v on v.id=q.accepted_version_id and v.organization_id=p_org where a.organization_id=p_org and a.execution_state='completed'and a.completed_at>=lo and a.completed_at<hi;
 select coalesce(sum(a.total_cents-private.financial_received(p_org,a.id)),0),coalesce(sum(a.total_cents-private.financial_received(p_org,a.id))filter(where a.due_date<today),0),count(*)filter(where a.total_cents>private.financial_received(p_org,a.id))into balance,overdue,num from public.financial_accounts a where a.organization_id=p_org and a.cancelled_at is null;
 return jsonb_build_object('period',b,'quoted_cents',quoted,'approved_cents',approved,'performed_cents',performed,'received_cents',received,'expenses_cents',expenses,'result_cents',received-expenses,'receivable_cents',balance,'overdue_cents',overdue,'pending_count',num,'average_receipt_cents',(select round(avg(amount_cents))from public.financial_receipts where organization_id=p_org and kind='receipt'and effective_date between p_from and p_to and not exists(select 1 from public.financial_receipts rev where rev.original_id=financial_receipts.id)),'basis','manual_ledger_effective_dates;receivables_current_snapshot;quotes_issued_in_period;result_not_accounting_profit');
end;$$;
create function public.financial_summary(p_org uuid,p_from date,p_to date)returns jsonb language plpgsql stable security definer set search_path=''as $$declare r jsonb;out_ jsonb='{}';full_ boolean;begin
 if not private.is_active_user()or private.permission_role(p_org,auth.uid())is null or not private.access_scope(p_org)then raise exception 'permission_denied'using errcode='42501';end if;
 full_=private.permission_allowed(p_org,'analytics.financial');
 if not(full_ or private.permission_allowed(p_org,'finance.cash.read')or private.permission_allowed(p_org,'finance.result.read')or private.permission_allowed(p_org,'finance.receipts.summary'))then raise exception 'permission_denied'using errcode='42501';end if;
 r=private.financial_totals(p_org,p_from,p_to);if full_ then return r;end if;
 out_=jsonb_build_object('period',r->'period','basis',r->'basis');
 if private.permission_allowed(p_org,'finance.cash.read')then out_=out_||jsonb_build_object('received_cents',r->'received_cents','expenses_cents',r->'expenses_cents','result_cents',r->'result_cents','receivable_cents',r->'receivable_cents');end if;
 if private.permission_allowed(p_org,'finance.receipts.summary')then out_=out_||jsonb_build_object('received_cents',r->'received_cents','average_receipt_cents',r->'average_receipt_cents');end if;
 if private.permission_allowed(p_org,'finance.result.read')then out_=out_||jsonb_build_object('result_cents',r->'result_cents');end if;return out_;
end;$$;
create policy financial_accounts_read on public.financial_accounts for select to authenticated using(private.permission_allowed(organization_id,'finance.accounts.read',id));
create policy financial_receipts_read on public.financial_receipts for select to authenticated using(private.permission_allowed(organization_id,'finance.receipts.summary')or private.permission_allowed(organization_id,'finance.history.read',account_id));
create policy financial_expenses_read on public.financial_expenses for select to authenticated using(private.permission_allowed(organization_id,'finance.expenses.read'));
create policy financial_events_read on public.financial_events for select to authenticated using((account_id is not null and private.permission_allowed(organization_id,'finance.history.read',account_id))or(expense_id is not null and private.permission_allowed(organization_id,'finance.expenses.read')));
create policy expense_categories_read on public.expense_categories for select to authenticated using(private.permission_allowed(organization_id,'finance.expenses.read')or private.permission_allowed(organization_id,'finance.expenses.record'));

create function public.financial_expense_category_save(p_org uuid,p_id uuid,p_name text,p_active boolean,p_delete boolean,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare payload jsonb;r jsonb;begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'finance.expenses.manage');payload=jsonb_build_array('expense_category',p_id,p_name,p_active,p_delete);r=private.financial_idem(p_org,p_key,payload);if r is not null then return r;end if;
 if p_id is not null and not exists(select 1 from public.expense_categories where organization_id=p_org and id=p_id)then raise exception 'permission_denied'using errcode='42501';end if;
 if p_delete then if exists(select 1 from public.financial_expenses where organization_id=p_org and category_id=p_id)then raise exception 'category_in_use';end if;delete from public.expense_categories where organization_id=p_org and id=p_id;
 elsif p_id is null then insert into public.expense_categories(organization_id,name,active)values(p_org,btrim(p_name),coalesce(p_active,true))returning id into p_id;
 else update public.expense_categories set name=btrim(p_name),active=coalesce(p_active,active)where organization_id=p_org and id=p_id;end if;
 r=jsonb_build_object('id',p_id);perform private.financial_remember(p_org,p_key,payload,r);return r;
end;$$;
create function public.financial_reference_options(p_org uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 perform private.permission_require(p_org,'finance.accounts.manage');
 return jsonb_build_object(
 'assignees',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name))from public.profiles p where private.permission_allowed(p_org,'people.read')and private.permission_role(p_org,p.id)is not null),'[]'::jsonb),
 'customers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name))from(select id,name from public.customers where organization_id=p_org and private.permission_allowed(p_org,'clients.read')order by name limit 200)x),'[]'::jsonb),
 'services',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name))from(select id,name from public.services where organization_id=p_org and active and private.permission_allowed(p_org,'services.read')order by name limit 200)x),'[]'::jsonb),
 'appointments',coalesce((select jsonb_agg(to_jsonb(x))from(select a.id,a.customer_id,a.request_id,q.service_id,a.starts_at,c.name customer from public.appointments a join public.customers c on c.id=a.customer_id join public.quote_requests q on q.id=a.request_id where a.organization_id=p_org and a.kind='booking'and private.permission_allowed(p_org,'agenda.read')order by starts_at desc limit 100)x),'[]'::jsonb));
end;$$;

-- Source: 06-categories.sql
create function private.service_category_sync()returns trigger language plpgsql security definer set search_path=''as $$declare c public.service_categories;begin
 if tg_op='UPDATE'and new.category is not distinct from old.category and new.category_id is not distinct from old.category_id then return new;end if;
 if new.category_id is not null and(tg_op='INSERT'or new.category_id is distinct from old.category_id)then
 select * into c from public.service_categories where organization_id=new.organization_id and id=new.category_id;
 if c.id is null or not c.active then raise exception 'service_category_unavailable';end if;new.category=c.name;return new;end if;
 if length(btrim(coalesce(new.category,'')))=0 then new.category='';new.category_id=null;return new;end if;
 insert into public.service_categories(organization_id,name)values(new.organization_id,btrim(new.category))on conflict do nothing;
 select * into c from public.service_categories where organization_id=new.organization_id and lower(btrim(name))=lower(btrim(new.category));
 if not c.active and(tg_op='INSERT'or old.category_id is distinct from c.id)then raise exception 'service_category_unavailable';end if;
 new.category_id=c.id;new.category=c.name;return new;
end;$$;
create trigger service_category_sync before insert or update of category,category_id on public.services for each row execute function private.service_category_sync();
create function public.company_categories(p_org uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 perform private.permission_require(p_org,'services.read');return coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('in_use',(select count(*)from public.services s where s.organization_id=p_org and s.category_id=c.id))order by position,name,id)from public.service_categories c where organization_id=p_org),'[]'::jsonb);end;$$;
create function public.company_category_save(p_org uuid,p_id uuid,p_revision int,p_data jsonb,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare c public.service_categories;payload jsonb;prior private.category_commands;r jsonb;begin
 perform pg_advisory_xact_lock(734921501);perform private.permission_require(p_org,'services.manage');perform private.company_keys(p_data,array['name','active','position','delete']);
 if p_key is null then raise exception 'category_key_required';end if;
 payload=jsonb_build_array(p_id,p_revision,p_data);select * into prior from private.category_commands where organization_id=p_org and actor_id=auth.uid()and key=p_key;
 if found then if prior.payload<>payload then raise exception 'idempotency_conflict';end if;return prior.result;end if;
 if p_id is null then
 if p_revision is distinct from 0 then raise exception 'category_revision_conflict'using errcode='40001';end if;
 insert into public.service_categories(organization_id,name,position)values(p_org,btrim(p_data->>'name'),coalesce((p_data->>'position')::int,0))on conflict do nothing;
 select * into c from public.service_categories where organization_id=p_org and lower(btrim(name))=lower(btrim(p_data->>'name'));p_id=c.id;
 else
 select * into c from public.service_categories where organization_id=p_org and id=p_id for update;
 if c.id is null then raise exception 'permission_denied'using errcode='42501';end if;
 if c.revision is distinct from p_revision then raise exception 'category_revision_conflict'using errcode='40001';end if;
 if coalesce((p_data->>'delete')::boolean,false)then
 if exists(select 1 from public.services where organization_id=p_org and category_id=p_id)then raise exception 'category_in_use';end if;
 delete from public.service_categories where organization_id=p_org and id=p_id;
 else
 update public.service_categories set name=coalesce(nullif(btrim(p_data->>'name'),''),name),position=coalesce((p_data->>'position')::int,position),active=coalesce((p_data->>'active')::boolean,active),revision=revision+1 where organization_id=p_org and id=p_id returning * into c;
 update public.services set category=c.name where organization_id=p_org and category_id=p_id and category is distinct from c.name;
 end if;end if;
 perform private.company_touch(p_org,true);r=jsonb_build_object('id',p_id,'revision',c.revision);insert into private.category_commands values(p_org,auth.uid(),p_key,payload,r);return r;
end;$$;
create policy service_categories_read on public.service_categories for select to authenticated using(private.permission_allowed(organization_id,'services.read'));
do $$declare d text;begin
 d=pg_get_functiondef('public.company_save(uuid,text,uuid,integer,jsonb)'::regprocedure);
 d=replace(d,'''name'',''category'',''description''','''name'',''category'',''category_id'',''description''');
 d=replace(d,'name,category,description','name,category,category_id,description');
 d=replace(d,'r.name,r.category,r.description','r.name,r.category,r.category_id,r.description');
 d=replace(d,'category=r.category,description','category=r.category,category_id=r.category_id,description');execute d;
end;$$;

-- Source: 07-enforcement.sql
create function private.permission_actor(p_org uuid,p_user uuid,p_action text)returns boolean language plpgsql stable security definer set search_path=''as $$declare r text;c private.permission_catalog;begin
 r=private.permission_role(p_org,p_user);select * into c from private.permission_catalog where action=p_action;
 return r is not null and r=any(c.roles)and private.entitlement(p_org,c.capability)and(r in('admin_empresa','super_admin')or exists(select 1 from private.organization_permissions where organization_id=p_org and user_id=p_user and action=p_action and granted and scope='organization'));
end;$$;
-- Preserve previous readiness/autonomy/assignment requirements and add per-person revocable grants.
do $$declare d text;begin
 d=pg_get_functiondef('private.central_eligible(uuid,uuid)'::regprocedure);execute replace(d,'FUNCTION private.central_eligible(','FUNCTION private.permission_central_base(');
 d=pg_get_functiondef('private.commercial_can_operate(uuid,uuid)'::regprocedure);execute replace(d,'FUNCTION private.commercial_can_operate(','FUNCTION private.permission_commercial_base(');
end;$$;
create or replace function private.central_eligible(p_org uuid,p_user uuid)returns boolean language sql stable security definer set search_path=''as $$select private.permission_central_base(p_org,p_user)and private.permission_actor(p_org,p_user,'central.read');$$;
create or replace function private.commercial_can_operate(p_org uuid,p_user uuid default auth.uid())returns boolean language sql stable security definer set search_path=''as $$select private.permission_commercial_base(p_org,p_user)and private.permission_actor(p_org,p_user,'followup.manage');$$;
create function private.permission_redact(p_value jsonb)returns jsonb language plpgsql immutable set search_path=''as $$declare r jsonb;k text;v jsonb;begin
 if jsonb_typeof(p_value)='object'then r='{}';for k,v in select * from jsonb_each(p_value)loop r=r||jsonb_build_object(k,case when k like '%cents%'or k in('discount_percent','max_discount_percent','value')then 'null'::jsonb else private.permission_redact(v)end);end loop;return r;
 elsif jsonb_typeof(p_value)='array'then return coalesce((select jsonb_agg(private.permission_redact(value))from jsonb_array_elements(p_value)),'[]'::jsonb);else return p_value;end if;
end;$$;
create function private.permission_projection(p_org uuid,p_function text,p_result jsonb)returns jsonb language plpgsql stable security definer set search_path=''as $$declare r jsonb=p_result;id_ uuid;begin
 if p_function in('operations_detail','operations_quote_context','operations_requests','operations_agenda','consumer_work_context','central_context','commercial_context','commercial_list','central_queue')and not private.permission_allowed(p_org,'quotes.values')then r=private.permission_redact(r);end if;
 if p_function='consumer_admin_context'then
 if not private.permission_allowed(p_org,'quotes.read')then r=jsonb_set(r,'{requests}','[]');end if;
 if not private.permission_allowed(p_org,'agenda.read')then r=jsonb_set(jsonb_set(r,'{blocks}','[]'),'{schedule}','null');end if;
 end if;
 if p_function='consumer_presence_context'and not private.permission_allowed(p_org,'portfolio.read')then r=jsonb_set(jsonb_set(r,'{portfolio_all}','[]'),'{portfolio}','[]');end if;
 if p_function='central_context'then
 r=r||jsonb_build_object('admin',private.permission_manager(p_org),'action_permissions',(select jsonb_object_agg(c.action,private.permission_allowed(p_org,c.action))from private.permission_catalog c));
 select id into id_ from public.financial_accounts where organization_id=p_org and request_id=(p_result->'ticket'->>'request_id')::uuid and cancelled_at is null;
 r=r||jsonb_build_object('financial',case when id_ is not null and private.permission_allowed(p_org,'finance.accounts.read',id_)then jsonb_build_object('operational',true,'account',private.financial_account_json(p_org,id_),'can_record',private.permission_allowed(p_org,'finance.receipts.record',id_))else null end);
 end if;
 if p_function in('operations_detail','operations_quote_context')then
 select id into id_ from public.financial_accounts where organization_id=p_org and request_id=coalesce((p_result->'appointment'->>'request_id')::uuid,(p_result->'request'->>'id')::uuid)and cancelled_at is null;
 if id_ is not null and private.permission_allowed(p_org,'finance.accounts.read',id_)then r=r||jsonb_build_object('financial_account',jsonb_build_object('id',id_,'balance_cents',(private.financial_account_json(p_org,id_)->'balance_cents')));end if;
 end if;
 if p_function='commercial_context'then r=r||jsonb_build_object('can_operate',coalesce((r->>'can_operate')::boolean,false)and private.permission_allowed(p_org,'followup.manage'));end if;
 if p_function='analytics_company'then
 if private.permission_allowed(p_org,'analytics.financial')then r=r||jsonb_build_object('financial',private.financial_totals(p_org,(r->'period'->>'first_day')::date,(r->'period'->>'last_day')::date));else r=r-'financial'-'values';end if;
 end if;return r;
end;$$;
-- Wrappers are generated from original signatures. Aliases stay private with ALL client grants revoked.
create function private.permission_wrap(p_name text,p_org_expr text,p_action_expr text,p_project boolean default false)returns void language plpgsql security definer set search_path=''as $$
declare f record;d text;args text;call_ text;signature_ text;body_ text;result_ text;begin
 select p.*,pg_get_function_arguments(p.oid)as declarations,pg_get_function_identity_arguments(p.oid)as identities,pg_get_function_result(p.oid)as result_type into f from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=p_name;
 if f.oid is null then raise exception 'Unknown wrapper target %',p_name;end if;
 d=pg_get_functiondef(f.oid);execute replace(d,'FUNCTION public.'||p_name||'(','FUNCTION private.v029_'||p_name||'(');
 signature_=format('private.v029_%I(%s)',p_name,f.identities);execute 'revoke all on function '||signature_||' from public,anon,authenticated,service_role';
 select string_agg(quote_ident(n),',')into call_ from unnest(f.proargnames)n;
 call_=format('private.v029_%I(%s)',p_name,coalesce(call_,''));
 body_=format('declare org_ uuid;depth_ int;%s begin org_=%s;depth_=private.permission_enter(org_,%s);',case when f.result_type='void'then ''else 'result_ '||f.result_type||';'end,p_org_expr,p_action_expr);
 body_=body_||case when f.result_type='void'then 'perform 'else 'result_='end||call_||';';
 if p_project and f.result_type='jsonb'then body_=body_||format('result_=private.permission_projection(org_,%L,result_);',p_name);end if;
 body_=body_||'perform private.permission_leave(depth_);'||case when f.result_type='void'then 'return;'else 'return result_;'end||'end;';
 execute format('create or replace function public.%I(%s)returns %s language plpgsql security definer set search_path='''' as %L',p_name,f.declarations,f.result_type,body_);
end;$$;

-- Source: 07a-wrappers.sql
select private.permission_wrap('company_initialize','p_org','''settings.manage''',true);
select private.permission_wrap('company_save','p_org','case p_entity when ''service''then ''services.manage''when ''addon''then ''services.manage''when ''field''then ''services.manage''else ''settings.manage''end',true);
select private.permission_wrap('company_create_manual','p_org','''settings.manage''',true);
select private.permission_wrap('company_discard_manual','p_org','''settings.manage''',true);
select private.permission_wrap('company_publish_manual','p_org','''settings.manage''',true);
select private.permission_wrap('company_set_activation','p_org','''settings.manage''',true);
select private.permission_wrap('consumer_branding_save','p_org','''page.manage''',true);
select private.permission_wrap('consumer_portfolio_save','p_org','''portfolio.manage''',true);
select private.permission_wrap('consumer_presence_context','p_org','case when private.permission_allowed(p_org,''portfolio.read'')then ''portfolio.read''else ''page.read''end',true);
select private.permission_wrap('consumer_admin_context','p_org','case when private.permission_allowed(p_org,''page.read'')then ''page.read''else ''portfolio.read''end',true);
select private.permission_wrap('consumer_publish_page','p_org','''page.manage''',true);
select private.permission_wrap('consumer_set_page_enabled','p_org','''page.manage''',true);
select private.permission_wrap('consumer_reserve_company_media','p_org','case when private.permission_allowed(p_org,''portfolio.manage'')then ''portfolio.manage''else ''page.manage''end',true);
select private.permission_wrap('consumer_payment_rule_save','p_org','''settings.manage''',true);
select private.permission_wrap('consumer_payment_rules_context','p_org','''settings.read''',true);
select private.permission_wrap('consumer_schedule_config','p_org','''agenda.manage''',true);
select private.permission_wrap('consumer_schedule_block','p_org','''agenda.manage''',true);
select private.permission_wrap('consumer_remove_block','p_org','''agenda.manage''',true);
select private.permission_wrap('operations_agenda','p_org','''agenda.read''',true);
select private.permission_wrap('operations_detail','p_org','''agenda.read''',true);
select private.permission_wrap('operations_appointment_act','p_org','''agenda.manage''',true);
select private.permission_wrap('operations_customer','p_org','''clients.manage''',true);
select private.permission_wrap('operations_directory','p_org','''clients.read''',true);
select private.permission_wrap('operations_request','p_org','''quotes.manage''',true);
select private.permission_wrap('operations_requests','p_org','''quotes.read''',true);
select private.permission_wrap('operations_quote_context','p_org','''quotes.read''',true);
select private.permission_wrap('operations_send_quote','p_org','''quotes.manage''',true);
select private.permission_wrap('operations_schedule','p_org','''agenda.manage''',true);
select private.permission_wrap('operations_member','p_org','''people.manage''',true);
select private.permission_wrap('operations_set_attendant','p_org','''people.manage''',true);
select private.permission_wrap('operations_support_mode','p_org','''settings.manage''',true);
select private.permission_wrap('operations_read_notification','p_org','''home.read''',true);
select private.permission_wrap('access_team','p_org','''people.read''',true);
select private.permission_wrap('foundation_set_member','p_org','''people.manage''',true);
select private.permission_wrap('central_settings_save','p_org','''settings.manage''',true);
select private.permission_wrap('commercial_config','p_org','''followup.read''',true);
select private.permission_wrap('commercial_config_save','p_org','''followup.manage''',true);
select private.permission_wrap('commercial_rule_save','p_org','''followup.manage''',true);
select private.permission_wrap('analytics_central','p_org','''analytics.operational''',true);
select private.permission_wrap('analytics_company','p_org','''analytics.operational''',true);
select private.permission_wrap('onboarding_context','p_org','''settings.manage''',true);
select private.permission_wrap('onboarding_act','p_org','''settings.manage''',true);
select private.permission_wrap('consumer_work_context','(select organization_id from public.quote_requests where public_code=p_code)','''quotes.read''',true);
select private.permission_wrap('consumer_send_quote','(select organization_id from public.quote_requests where public_code=p_code)','''quotes.manage''',true);
select private.permission_wrap('consumer_mark_review','(select organization_id from public.quote_requests where public_code=p_code)','''quotes.manage''',true);
select private.permission_wrap('consumer_customer_context_save','(select organization_id from public.quote_requests where public_code=p_code)','''clients.manage''',true);
select private.permission_wrap('central_context','(select organization_id from public.tickets where public_code=p_code)','''central.read''',true);
select private.permission_wrap('central_quote','(select organization_id from public.tickets where public_code=p_code)','''quotes.manage''',true);
select private.permission_wrap('central_booking','(select organization_id from public.tickets where public_code=p_code)','''agenda.manage''',true);
select private.permission_wrap('central_slots','(select organization_id from public.tickets where public_code=p_code)','''agenda.read''',true);
select private.permission_wrap('central_attachment_ticket','(select organization_id from public.tickets where public_code=p_code)','''central.read''',true);
select private.permission_wrap('central_act','(select organization_id from public.tickets where public_code=p_code)','case when p_action=''message''then ''central.reply''when p_action=''decision''then ''pending.manage''else ''central.manage''end',true);
select private.permission_wrap('central_open_request','(select organization_id from public.quote_requests where public_code=p_request)','''central.read''',true);
select private.permission_wrap('commercial_context','(select organization_id from private.commercial_op where commercial_code=p_code)','''followup.read''',true);
select private.permission_wrap('commercial_op_act','(select organization_id from private.commercial_op where commercial_code=p_code)','''followup.manage''',true);
select private.permission_wrap('commercial_task_act','(select organization_id from public.commercial_tasks where public_code=p_code)','''followup.manage''',true);

-- Source: 08-integration.sql
-- Separate genuine consumer ownership from any staff authority for direct row reads.
create function private.consumer_owner(p_request uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.consumer_identity() and exists(select 1 from public.quote_requests q join public.organizations o on o.id=q.organization_id join public.customers c on c.id=q.customer_id where q.id=p_request and o.status='active' and (c.user_id=auth.uid() or exists(select 1 from public.customer_access a join public.request_access_tokens t on t.id=a.token_id where a.request_id=q.id and a.user_id=auth.uid() and t.request_id=q.id and t.revoked_at is null and t.expires_at>now())));$$;
create function private.customer_owner(p_customer uuid) returns boolean language sql stable security definer set search_path='' as $$select private.consumer_identity() and exists(select 1 from public.customers c join public.organizations o on o.id=c.organization_id where c.id=p_customer and o.status='active' and c.user_id=auth.uid());$$;
create or replace function private.central_staff(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$select private.permission_allowed(p_org,'central.read') and (private.permission_manager(p_org) or private.central_eligible(p_org,auth.uid()) or private.permission_role(p_org,auth.uid())='colaborador_empresa');$$;
-- Explicit defaults are stored once. Re-activation does not restore revoked grants.
create trigger permissions_seed after insert or update of is_attendant on public.organization_members for each row execute function private.permissions_seed();
create trigger permissions_seed after insert on public.attendant_organizations for each row execute function private.permissions_seed();
insert into private.organization_permissions(organization_id,user_id,action,scope,granted)
 select m.organization_id,m.user_id,c.action,'organization',true from public.organization_members m cross join private.permission_catalog c where
 (m.is_attendant and c.action=any(array['central.read','central.reply','central.manage','quotes.read','quotes.values','quotes.manage','agenda.read','agenda.manage','followup.read','followup.manage','clients.read'])) or
 (not m.is_attendant and c.action=any(array['services.read','settings.read'])) on conflict do nothing;
insert into private.organization_permissions(organization_id,user_id,action,scope,granted)
 select m.organization_id,m.user_id,c.action,'organization',true from public.attendant_organizations m cross join private.permission_catalog c where c.action=any(array['central.read','central.reply','central.manage','quotes.read','quotes.values','quotes.manage','agenda.read','agenda.manage','followup.read','followup.manage','clients.read']) on conflict do nothing;
-- Existing unsupported shared assignments remain in history, but cease to authorize access.
do $$declare o uuid;begin for o in select id from public.organizations loop perform private.suspend_shared(o);end loop;end;$$;
-- Queue filtering happens before paging/aggregation, so inaccessible tenants never affect counts.
do $$declare d text;begin
 d=pg_get_functiondef('public.central_queue(uuid,text,text,boolean,integer,text,date)'::regprocedure);d=replace(d,'private.central_staff(', 'private.central_staff(');execute d;
 d=pg_get_functiondef('public.commercial_list(jsonb,integer)'::regprocedure);d=replace(d,'private.central_staff(o.organization_id)','private.permission_allowed(o.organization_id,''followup.read'')');d=replace(d,'private.central_staff(id)','private.permission_allowed(id,''followup.read'')');d=replace(d,'''value'',(select total_cents from public.quote_versions where request_id=q.id order by version desc limit 1)', '''value'',case when private.permission_allowed(o.organization_id,''quotes.values'') then (select total_cents from public.quote_versions where request_id=q.id order by version desc limit 1) end');execute d;
 d=pg_get_functiondef('public.commercial_refresh(uuid,uuid)'::regprocedure);d=replace(d,'private.central_staff(p_org)','private.permission_allowed(p_org,''followup.manage'')');d=replace(d,'private.central_staff(organization_id)','private.permission_allowed(organization_id,''followup.manage'')');execute d;
 d=pg_get_functiondef('public.consumer_gateway_company_media(text,uuid,boolean)'::regprocedure);
 d=replace(d,'not private.company_can_manage(m.organization_id)', 'not(case when p_write then private.permission_allowed(m.organization_id,''portfolio.manage'')or private.permission_allowed(m.organization_id,''page.manage'')else private.permission_allowed(m.organization_id,''portfolio.read'')or private.permission_allowed(m.organization_id,''page.read'')end)');execute d;
 -- Home is a permission-aware composition of existing modules.
 d=pg_get_functiondef('public.operations_home(uuid)'::regprocedure);d=replace(d,'not private.company_can_manage(p_org)','not private.permission_allowed(p_org,''home.read'')');d=replace(d,'agenda=public.operations_agenda(p_org,today,today+1);','agenda=case when private.permission_allowed(p_org,''agenda.read'')then public.operations_agenda(p_org,today,today+1)else jsonb_build_object(''appointments'',''[]''::jsonb,''resources'',''[]''::jsonb,''timezone'',tz)end;');
 d=replace(d,'where a.organization_id=p_org and a.kind=', 'where private.permission_allowed(p_org,''agenda.read'') and a.organization_id=p_org and a.kind=');d=replace(d,'where e.organization_id=p_org and e.responded_at','where private.permission_allowed(p_org,''pending.read'') and e.organization_id=p_org and e.responded_at');d=replace(d,'where q.organization_id=p_org and q.state','where private.permission_allowed(p_org,''quotes.read'') and q.organization_id=p_org and q.state');d=replace(d,'where n.organization_id=p_org order by','where n.organization_id=p_org and private.permission_manager(p_org) order by');execute d;
 -- Preserve the consumer projection and tracking rules; staff must have the module grant.
 d=pg_get_functiondef('public.consumer_request_context(text)'::regprocedure);d=replace(d,'begin perform private.consumer_request(p_code);return private.central_request_context_core(p_code);', 'begin select * into q from public.quote_requests where public_code=p_code; if not private.consumer_owner(q.id) then perform private.permission_require(q.organization_id,''quotes.read'');end if; perform private.consumer_request(p_code); if not private.consumer_owner(q.id) and not private.permission_allowed(q.organization_id,''quotes.values'') then return private.permission_redact(private.central_request_context_core(p_code));end if;return private.central_request_context_core(p_code);');execute d;
end;$$;
-- Return only the granted modules; revision metadata is safe for a service-only editor.
create or replace function public.company_context(p_org uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 if not private.company_can_read(p_org)then raise exception 'permission_denied'using errcode='42501';end if;
 return jsonb_build_object('editable',private.permission_manager(p_org),
 'settings',(select case when private.permission_allowed(p_org,'settings.read')then to_jsonb(c)else jsonb_build_object('organization_id',p_org,'revision',c.revision,'published_manual_id',case when private.permission_allowed(p_org,'page.read')then c.published_manual_id end)end from public.company_settings c where organization_id=p_org),
 'rules',(select to_jsonb(c)from public.business_rules c where organization_id=p_org and private.permission_allowed(p_org,'settings.read')),
 'permissions',(select to_jsonb(c)from public.attendant_permissions c where organization_id=p_org and private.permission_allowed(p_org,'settings.read')),
 'checklist',case when private.permission_allowed(p_org,'settings.read')then public.company_readiness(p_org)else '{}'::jsonb end,
 'categories',case when private.permission_allowed(p_org,'services.read')then public.company_categories(p_org)else '[]'::jsonb end,
 'services',coalesce((select jsonb_agg(to_jsonb(c)order by name,id)from public.services c where organization_id=p_org and private.permission_allowed(p_org,'services.read')),'[]'::jsonb),
 'addons',coalesce((select jsonb_agg(to_jsonb(c)order by name,id)from public.service_addons c where organization_id=p_org and private.permission_allowed(p_org,'services.read')),'[]'::jsonb),
 'fields',coalesce((select jsonb_agg(to_jsonb(c)order by position,id)from public.service_intake_fields c where organization_id=p_org and private.permission_allowed(p_org,'services.read')),'[]'::jsonb),
 'manuals',coalesce((select jsonb_agg(to_jsonb(c)order by version desc)from public.manual_versions c where organization_id=p_org and private.permission_allowed(p_org,'settings.read')and(status='published'or private.permission_allowed(p_org,'settings.manage'))),'[]'::jsonb),
 'sections',coalesce((select jsonb_agg(to_jsonb(c)order by section_key)from public.manual_sections c where organization_id=p_org and private.permission_allowed(p_org,'settings.read')and(private.permission_allowed(p_org,'settings.manage')or exists(select 1 from public.manual_versions m where m.id=c.manual_id and m.status='published'))),'[]'::jsonb),
 'faqs',coalesce((select jsonb_agg(to_jsonb(c)order by position,id)from public.faqs c where organization_id=p_org and private.permission_allowed(p_org,'settings.read')),'[]'::jsonb),
 'replies',coalesce((select jsonb_agg(to_jsonb(c)order by title,id)from public.quick_replies c where organization_id=p_org and private.permission_allowed(p_org,'settings.read')),'[]'::jsonb));end;$$;

-- Empty verification scaffolding must not make an otherwise empty organization undeletable.
-- Any document, review, command, grant or business history remains protected by the existing guard.
do $$declare d text;begin
 d=pg_get_functiondef('private.organization_delete_blocked(uuid)'::regprocedure);
 d=replace(d,'begin', 'begin if exists(select 1 from private.organization_verifications where organization_id=p_org and(fingerprint is not null or revision<>0 or state not in(''pending'',''legacy'')))then return true;end if;');
 d=replace(d,'and not (n.nspname=''public'' and c.relname=''audit_logs'')','and not (n.nspname=''public'' and c.relname=''audit_logs'') and not(n.nspname=''private'' and c.relname=''organization_verifications'')');execute d;
 d=pg_get_functiondef('public.access_delete_organization(uuid,text)'::regprocedure);d=replace(d,'delete from private.enterprise_codes where organization_id=p_org;', 'delete from private.organization_verifications where organization_id=p_org and fingerprint is null and revision=0 and state in(''pending'',''legacy''); delete from private.enterprise_codes where organization_id=p_org;');execute d;
 d=pg_get_functiondef('public.support_context(uuid)'::regprocedure);d=replace(d,'begin','begin if global_ and exists(select 1 from public.organizations where id=p_org and status=''suspended'')then raise exception ''organization_suspended''using errcode=''42501'';end if;');execute d;
end;$$;

-- Source: 08a-policies.sql
drop policy company_settings_read on public.company_settings;create policy company_settings_read on public.company_settings for select to authenticated using(private.permission_allowed(organization_id,'settings.read'));
drop policy business_rules_read on public.business_rules;create policy business_rules_read on public.business_rules for select to authenticated using(private.permission_allowed(organization_id,'settings.read'));
drop policy attendant_permissions_read on public.attendant_permissions;create policy attendant_permissions_read on public.attendant_permissions for select to authenticated using(private.permission_allowed(organization_id,'settings.read'));
drop policy manual_versions_read on public.manual_versions;create policy manual_versions_read on public.manual_versions for select to authenticated using(private.permission_allowed(organization_id,'settings.read')and(status='published'or private.permission_allowed(organization_id,'settings.manage')));
drop policy manual_sections_read on public.manual_sections;create policy manual_sections_read on public.manual_sections for select to authenticated using(private.permission_allowed(organization_id,'settings.read')and(private.permission_allowed(organization_id,'settings.manage')or exists(select 1 from public.manual_versions v where v.id=manual_id and v.status='published')));
drop policy faqs_read on public.faqs;create policy faqs_read on public.faqs for select to authenticated using(private.permission_allowed(organization_id,'settings.read'));
drop policy quick_replies_read on public.quick_replies;create policy quick_replies_read on public.quick_replies for select to authenticated using(private.permission_allowed(organization_id,'settings.read'));
drop policy services_read on public.services;create policy services_read on public.services for select to authenticated using(private.permission_allowed(organization_id,'services.read'));
drop policy service_addons_read on public.service_addons;create policy service_addons_read on public.service_addons for select to authenticated using(private.permission_allowed(organization_id,'services.read'));
drop policy service_intake_fields_read on public.service_intake_fields;create policy service_intake_fields_read on public.service_intake_fields for select to authenticated using(private.permission_allowed(organization_id,'services.read'));
drop policy company_branding_read on public.company_branding;create policy company_branding_read on public.company_branding for select to authenticated using(private.permission_allowed(organization_id,'page.read'));
drop policy company_media_read on public.company_media;create policy company_media_read on public.company_media for select to authenticated using(private.permission_allowed(organization_id,'portfolio.read'));
drop policy consumer_pages_read on public.consumer_pages;create policy consumer_pages_read on public.consumer_pages for select to authenticated using(private.permission_allowed(organization_id,'page.read'));
drop policy consumer_publications_read on public.consumer_publications;create policy consumer_publications_read on public.consumer_publications for select to authenticated using(private.permission_allowed(organization_id,'page.read'));
drop policy portfolio_items_read on public.portfolio_items;create policy portfolio_items_read on public.portfolio_items for select to authenticated using(private.permission_allowed(organization_id,'portfolio.read'));
drop policy schedule_resources_read on public.schedule_resources;create policy schedule_resources_read on public.schedule_resources for select to authenticated using(private.permission_allowed(organization_id,'agenda.read'));
drop policy appointment_events_read on public.appointment_events;create policy appointment_events_read on public.appointment_events for select to authenticated using(private.permission_allowed(organization_id,'agenda.read'));
drop policy customer_context_read on public.customer_context;create policy customer_context_read on public.customer_context for select to authenticated using(private.permission_allowed(organization_id,'clients.read'));
drop policy opportunity_context_read on public.opportunity_context;create policy opportunity_context_read on public.opportunity_context for select to authenticated using(private.permission_allowed(organization_id,'clients.read'));
drop policy commercial_settings_read on public.commercial_settings;create policy commercial_settings_read on public.commercial_settings for select to authenticated using(private.permission_allowed(organization_id,'followup.read'));
drop policy commercial_rules_read on public.commercial_rules;create policy commercial_rules_read on public.commercial_rules for select to authenticated using(private.permission_allowed(organization_id,'followup.read'));
drop policy commercial_tasks_read on public.commercial_tasks;create policy commercial_tasks_read on public.commercial_tasks for select to authenticated using(private.permission_allowed(organization_id,'followup.read'));
drop policy commercial_attempts_read on public.commercial_attempts;create policy commercial_attempts_read on public.commercial_attempts for select to authenticated using(private.permission_allowed(organization_id,'followup.read'));
drop policy commercial_events_read on public.commercial_events;create policy commercial_events_read on public.commercial_events for select to authenticated using(private.permission_allowed(organization_id,'followup.read'));
drop policy commercial_opportunity_state_read on public.commercial_opportunity_state;create policy commercial_opportunity_state_read on public.commercial_opportunity_state for select to authenticated using(private.permission_allowed(organization_id,'followup.read'));
drop policy central_quote_actions_read on public.central_quote_actions;create policy central_quote_actions_read on public.central_quote_actions for select to authenticated using(private.permission_allowed(organization_id,'quotes.values'));
drop policy central_settings_read on public.central_settings;create policy central_settings_read on public.central_settings for select to authenticated using(private.permission_allowed(organization_id,'central.read'));
drop policy tickets_read on public.tickets;create policy tickets_read on public.tickets for select to authenticated using(private.permission_allowed(organization_id,'central.read'));
drop policy ticket_notes_read on public.ticket_notes;create policy ticket_notes_read on public.ticket_notes for select to authenticated using(private.permission_allowed(organization_id,'central.read'));
drop policy ticket_messages_read on public.ticket_messages;create policy ticket_messages_read on public.ticket_messages for select to authenticated using(private.permission_allowed(organization_id,'central.read'));
drop policy ticket_events_read on public.ticket_events;create policy ticket_events_read on public.ticket_events for select to authenticated using(private.permission_allowed(organization_id,'central.read'));
drop policy ticket_escalations_read on public.ticket_escalations;create policy ticket_escalations_read on public.ticket_escalations for select to authenticated using(private.permission_allowed(organization_id,'pending.read'));
drop policy payment_rules_read on public.payment_rules;create policy payment_rules_read on public.payment_rules for select to authenticated using(private.permission_allowed(organization_id,'settings.read'));
drop policy payment_plans_read on public.payment_plans;create policy payment_plans_read on public.payment_plans for select to authenticated using(private.permission_allowed(organization_id,'settings.read'));
drop policy notifications_read on public.notifications;create policy notifications_read on public.notifications for select to authenticated using(private.permission_allowed(organization_id,'settings.read'));
drop policy organization_user_guides_read on public.organization_user_guides;create policy organization_user_guides_read on public.organization_user_guides for select to authenticated using(user_id=auth.uid()and private.permission_allowed(organization_id,'settings.manage'));
drop policy customers_read on public.customers;create policy customers_read on public.customers for select to authenticated using(private.permission_allowed(organization_id,'clients.read')or private.customer_owner(id));
drop policy customer_consents_read on public.customer_consents;create policy customer_consents_read on public.customer_consents for select to authenticated using(private.permission_allowed(organization_id,'clients.read')or private.customer_owner(customer_id));
drop policy opportunities_read on public.opportunities;create policy opportunities_read on public.opportunities for select to authenticated using(private.permission_allowed(organization_id,'followup.read')or private.customer_owner(customer_id));
drop policy quote_requests_read on public.quote_requests;create policy quote_requests_read on public.quote_requests for select to authenticated using(private.permission_allowed(organization_id,'quotes.read')or private.consumer_owner(id));
drop policy quote_versions_read on public.quote_versions;create policy quote_versions_read on public.quote_versions for select to authenticated using((private.permission_allowed(organization_id,'quotes.read')and private.permission_allowed(organization_id,'quotes.values'))or private.consumer_owner(request_id));
drop policy quote_items_read on public.quote_items;create policy quote_items_read on public.quote_items for select to authenticated using((private.permission_allowed(organization_id,'quotes.read')and private.permission_allowed(organization_id,'quotes.values'))or exists(select 1 from public.quote_versions v where v.id=version_id and private.consumer_owner(v.request_id)));
drop policy appointments_read on public.appointments;create policy appointments_read on public.appointments for select to authenticated using(private.permission_allowed(organization_id,'agenda.read')or (kind='booking'and private.consumer_owner(request_id)));
drop policy attachments_read on public.attachments;create policy attachments_read on public.attachments for select to authenticated using(private.permission_allowed(organization_id,'quotes.read')or private.consumer_owner(request_id));
drop policy request_events_read on public.request_events;create policy request_events_read on public.request_events for select to authenticated using(private.permission_allowed(organization_id,'quotes.read')or private.consumer_owner(request_id));
drop policy payments_read on public.payments;create policy payments_read on public.payments for select to authenticated using(private.permission_manager(organization_id)or private.consumer_owner(request_id));

-- Source: 09-acl.sql
alter table private.billing_runtime enable row level security;
alter table private.billing_runtime force row level security;
-- Restrict every function introduced by this migration, including private legacy aliases.
do $$declare f record;begin
 for f in select p.oid,p.pronamespace::regnamespace::text as schema from pg_proc p where p.pronamespace in('public'::regnamespace,'private'::regnamespace)and not exists(select 1 from migration030_existing_functions x where x.oid=p.oid) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.oid::regprocedure);
 if f.schema='public'then execute format('grant execute on function %s to authenticated',f.oid::regprocedure);end if;
 end loop;
end;$$;
grant execute on function private.permission_allowed(uuid,text,uuid),private.consumer_owner(uuid),private.customer_owner(uuid),private.permission_manager(uuid) to authenticated;
drop function private.permission_wrap(text,text,text,boolean);
drop table migration030_existing_functions;
commit;

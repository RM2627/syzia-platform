begin;
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

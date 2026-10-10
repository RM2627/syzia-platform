begin;
-- SaaS subscriptions only. Consumer payment preparation remains independent.
create table public.billing_plans (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 2 and 100),
 description text not null default '' check(length(description)<=2000), active boolean not null default true,
 available boolean not null default false, position integer not null default 0 check(position between 0 and 1000),
 revision integer not null default 1 check(revision>0), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.billing_plan_versions (
 id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.billing_plans(id), version integer not null check(version>0),
 price_cents integer not null check(price_cents between 0 and 100000000), interval_months integer not null check(interval_months in (1,3,6,12)),
 trial_days integer not null default 0 check(trial_days between 0 and 90),
 human_support boolean not null default false, commercial_followups boolean not null default true,
 member_limit integer check(member_limit between 1 and 100000), service_limit integer check(service_limit between 1 and 100000),
 request_limit integer check(request_limit between 0 and 10000000), ticket_limit integer check(ticket_limit between 0 and 10000000), followup_limit integer check(followup_limit between 0 and 10000000),
 created_at timestamptz not null default now(), unique(plan_id,version)
);
create table public.billing_subscriptions (
 organization_id uuid primary key references public.organizations(id), plan_version_id uuid not null references public.billing_plan_versions(id),
 pending_version_id uuid references public.billing_plan_versions(id),
 state text not null check(state in ('trial','active','pending','past_due','cancelled','suspended')),
 period_start timestamptz not null, period_end timestamptz not null, cancel_at_end boolean not null default false,
 trial_used boolean not null default false, revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(period_end>period_start)
);
create table public.billing_invoices (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.billing_subscriptions(organization_id),
 plan_version_id uuid not null references public.billing_plan_versions(id), subscription_revision integer not null,
 purpose text not null check(purpose in ('subscribe','change','renew')),
 amount_cents integer not null check(amount_cents between 0 and 100000000), currency text not null default 'BRL' check(currency='BRL'),
 provider text not null default 'mock' check(provider='mock'), is_simulation boolean not null default true check(is_simulation),
 state text not null default 'pending' check(state in ('pending','paid','failed','overdue','cancelled','refunded')),
 due_at timestamptz not null, paid_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 check((state in ('paid','refunded'))=(paid_at is not null))
);
create unique index billing_one_pending_invoice on public.billing_invoices(organization_id) where state='pending';
create table public.billing_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 actor_id uuid references public.profiles(id), event text not null check(length(event) between 2 and 80),
 subscription_revision integer not null, invoice_id uuid, details jsonb not null default '{}' check(jsonb_typeof(details)='object'),
 created_at timestamptz not null default clock_timestamp(), foreign key(organization_id,invoice_id) references public.billing_invoices(organization_id,id)
);
create index billing_events_org_time on public.billing_events(organization_id,created_at desc);
create table public.billing_usage (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 metric text not null check(metric in ('requests','tickets','followups')), entity_id uuid not null, month date not null,
 created_at timestamptz not null default clock_timestamp(), unique(organization_id,metric,entity_id)
);
create index billing_usage_org_month on public.billing_usage(organization_id,month,metric);
create table public.billing_commands (
 organization_id uuid not null references public.organizations(id), actor_id uuid not null references public.profiles(id),
 key uuid not null, payload jsonb not null, result jsonb not null, created_at timestamptz not null default now(), primary key(organization_id,actor_id,key)
);
create table public.billing_webhooks (
 event_id text primary key check(length(event_id) between 8 and 160), organization_id uuid not null references public.organizations(id),
 invoice_id uuid not null, payload jsonb not null, result jsonb not null, created_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,invoice_id) references public.billing_invoices(organization_id,id)
);
-- Disabled by default. Only an explicit LOCAL fixture enables simulation. No client grant.
create table private.billing_runtime (singleton boolean primary key default true check(singleton), mock_enabled boolean not null default false);
insert into private.billing_runtime values(true,false);
revoke all on private.billing_runtime from public,anon,authenticated,service_role;
create function private.billing_can_read(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.company_can_manage(p_org);
$$;
-- Eight public tables, FORCE RLS; no write policies/grants. No SaaS PII exposed to consumers/attendants.
do $$ declare n text;predicate text; begin
 foreach n in array array['billing_plans','billing_plan_versions','billing_subscriptions','billing_invoices','billing_events','billing_usage','billing_commands','billing_webhooks'] loop
 execute format('alter table public.%I enable row level security',n);execute format('alter table public.%I force row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated',n);execute format('grant select on public.%I to authenticated',n);
 predicate=case when n in ('billing_plans','billing_plan_versions','billing_commands','billing_webhooks') then 'private.has_global_role(''super_admin'')' else 'private.billing_can_read(organization_id)' end;
 execute format('create policy %I on public.%I for select to authenticated using (%s)',n||'_read',n,predicate);
 execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.company_audit()',n||'_audit',n);
 if n in ('billing_plan_versions','billing_events','billing_usage','billing_commands','billing_webhooks') then
 execute format('create trigger %I before update or delete on public.%I for each row execute function private.consumer_deny_immutable()',n||'_immutable',n);
 execute format('create trigger %I before truncate on public.%I for each statement execute function private.consumer_deny_immutable()',n||'_no_truncate',n);
 else execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()',n||'_updated',n);end if;
 end loop;
end;$$;
revoke all on function private.billing_can_read(uuid) from public,anon;
grant execute on function private.billing_can_read(uuid) to authenticated;
commit;

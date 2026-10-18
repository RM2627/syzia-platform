-- DEMONSTRATION DATABASE ONLY. Applied by the explicit local/owner bootstrap script.
-- Never part of the operational Supabase migration chain.
begin;
do $$begin if not exists(select 1 from pg_namespace where nspname='demo_bootstrap')or exists(select 1 from public.organizations)then raise exception 'demo_requires_authorized_empty_bootstrap';end if;end;$$;
drop schema demo_bootstrap;

create schema demo_private;
revoke all on schema demo_private from public,anon,authenticated,service_role;
create table demo_private.identity(singleton boolean primary key default true check(singleton),purpose text not null check(purpose='syzia-commercial-demo-054'));
insert into demo_private.identity values(true,'syzia-commercial-demo-054');
create table demo_private.instances(
 id uuid primary key,source_id uuid not null,generation integer not null,kind text not null check(kind in('editor','visitor')),
 organization_id uuid not null unique references public.organizations(id),manager_id uuid not null references auth.users(id),consumer_id uuid not null references auth.users(id),
 expires_at timestamptz not null,created_at timestamptz not null default clock_timestamp()
);
create unique index demo_editor_per_generation on demo_private.instances(source_id,generation)where kind='editor';
create table demo_private.sessions(
 token_hash text primary key,instance_id uuid not null references demo_private.instances(id),kind text not null check(kind in('editor','visitor')),
 actor_id uuid,expires_at timestamptz not null,revoked_at timestamptz,created_at timestamptz not null default clock_timestamp()
);
create table demo_private.objects(bucket text not null check(bucket in('company-media','consumer-private')),path text not null,bytes bytea not null,mime text not null,primary key(bucket,path));
-- No API keys, logins or financial runtime are provisioned in the demo realm.
update private.billing_runtime set mock_enabled=false;
alter table demo_private.identity enable row level security;alter table demo_private.identity force row level security;
alter table demo_private.instances enable row level security;alter table demo_private.instances force row level security;
alter table demo_private.sessions enable row level security;alter table demo_private.sessions force row level security;
alter table demo_private.objects enable row level security;alter table demo_private.objects force row level security;
revoke all on all tables in schema demo_private from public,anon,authenticated,service_role;
commit;

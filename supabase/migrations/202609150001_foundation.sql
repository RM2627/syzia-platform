begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
-- Application accounts never own tables or bypass RLS.
revoke create on schema public from public, anon, authenticated;

create type public.member_role as enum ('admin_empresa','colaborador_empresa');
create type public.platform_role as enum ('super_admin','atendente');
create type public.record_status as enum ('active','suspended');
create type public.attendant_kind as enum ('primary','backup');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete restrict,
 display_name text not null default '' check (length(display_name) <= 120),
 status public.record_status not null default 'active',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.platform_roles (
 user_id uuid not null references public.profiles(id) on delete restrict,
 role public.platform_role not null,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(user_id,role)
);
create table public.organizations (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(btrim(name)) between 2 and 120),
 slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 70
   and slug not in ('admin','central','painel','entrar','empresa','api','auth','recuperar-acesso','aceitar-convite')),
 status public.record_status not null default 'active',
 timezone text not null default 'America/Recife' check (timezone='America/Recife'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.organization_members (
 organization_id uuid not null references public.organizations(id) on delete restrict,
 user_id uuid not null references public.profiles(id) on delete restrict,
 role public.member_role not null,
 status public.record_status not null default 'active',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(organization_id,user_id)
);
create index organization_members_user_idx on public.organization_members(user_id,organization_id);
create table public.attendant_organizations (
 organization_id uuid not null references public.organizations(id) on delete restrict,
 user_id uuid not null references public.profiles(id) on delete restrict,
 kind public.attendant_kind not null default 'backup',
 status public.record_status not null default 'active',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(organization_id,user_id)
);
create unique index attendant_one_primary_idx on public.attendant_organizations(organization_id)
 where kind='primary' and status='active';
create index attendant_organizations_user_idx on public.attendant_organizations(user_id,organization_id);
create table public.audit_logs (
 id bigint generated always as identity primary key,
 organization_id uuid references public.organizations(id) on delete restrict,
 actor_id uuid references public.profiles(id) on delete restrict,
 action text not null,
 entity_table text not null,
 entity_key jsonb not null,
 changed_fields text[] not null default '{}',
 created_at timestamptz not null default clock_timestamp()
);
create index audit_logs_org_time_idx on public.audit_logs(organization_id,created_at desc);

create function private.on_auth_user_created() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id) values(new.id) on conflict(id) do nothing;
 return new;
end; $$;
create trigger foundation_auth_profile after insert on auth.users for each row execute function private.on_auth_user_created();
insert into public.profiles(id) select id from auth.users on conflict(id) do nothing;

create function private.set_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=clock_timestamp(); return new; end; $$;

-- Audit only identifiers and changed field names; no emails, tokens or message bodies.
create function private.record_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb; row_data jsonb; fields text[]; org uuid; actor uuid;
begin
 before_row=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 after_row=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 row_data=case when tg_op='DELETE' then before_row else after_row end;
 select coalesce(array_agg(k order by k),'{}'::text[]) into fields
 from (select jsonb_object_keys(before_row || after_row) k) keys
 where before_row->k is distinct from after_row->k and k not in ('updated_at','created_at');
 if cardinality(fields)=0 then return coalesce(new,old); end if;
 org=case when tg_table_name='organizations' then (row_data->>'id')::uuid
          when tg_table_name in ('organization_members','attendant_organizations') then (row_data->>'organization_id')::uuid
          else null end;
 actor=auth.uid();
 if actor is not null and not exists(select 1 from public.profiles where id=actor) then actor=null; end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_table,entity_key,changed_fields)
 values(org,actor,lower(tg_op),tg_table_name,
  jsonb_strip_nulls(jsonb_build_object('id',row_data->'id','user_id',row_data->'user_id','role',
    case when tg_table_name='platform_roles' then row_data->'role' else null end)), fields);
 return coalesce(new,old);
end; $$;

create function private.deny_audit_change() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'audit_is_append_only' using errcode='42501'; end; $$;
create trigger audit_no_update_delete before update or delete on public.audit_logs for each row execute function private.deny_audit_change();
create trigger audit_no_truncate before truncate on public.audit_logs for each statement execute function private.deny_audit_change();

-- Realtime is intentionally not enabled for the Foundation. No old channel can leak membership data.
-- All app writes use the authenticated commands in migration 003.
revoke all on public.profiles,public.platform_roles,public.organizations,public.organization_members,public.attendant_organizations,public.audit_logs from public,anon,authenticated;
revoke all on sequence public.audit_logs_id_seq from public,anon,authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
create trigger profiles_updated before update on public.profiles for each row execute function private.set_updated_at();
create trigger profiles_audit after insert or update or delete on public.profiles for each row execute function private.record_audit();
create trigger platform_roles_updated before update on public.platform_roles for each row execute function private.set_updated_at();
create trigger platform_roles_audit after insert or update or delete on public.platform_roles for each row execute function private.record_audit();
create trigger organizations_updated before update on public.organizations for each row execute function private.set_updated_at();
create trigger organizations_audit after insert or update or delete on public.organizations for each row execute function private.record_audit();
create trigger organization_members_updated before update on public.organization_members for each row execute function private.set_updated_at();
create trigger organization_members_audit after insert or update or delete on public.organization_members for each row execute function private.record_audit();
create trigger attendant_organizations_updated before update on public.attendant_organizations for each row execute function private.set_updated_at();
create trigger attendant_organizations_audit after insert or update or delete on public.attendant_organizations for each row execute function private.record_audit();
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
grant select on public.profiles to authenticated;
alter table public.platform_roles enable row level security;
alter table public.platform_roles force row level security;
grant select on public.platform_roles to authenticated;
alter table public.organizations enable row level security;
alter table public.organizations force row level security;
grant select on public.organizations to authenticated;
alter table public.organization_members enable row level security;
alter table public.organization_members force row level security;
grant select on public.organization_members to authenticated;
alter table public.attendant_organizations enable row level security;
alter table public.attendant_organizations force row level security;
grant select on public.attendant_organizations to authenticated;
alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;
grant select on public.audit_logs to authenticated;
commit;

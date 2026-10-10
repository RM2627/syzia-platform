begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;
create table public.consumer_pages (
 organization_id uuid primary key references public.organizations(id), enabled boolean not null default false,
 publication_id uuid, revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.consumer_publications (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 public_code text not null unique default ('p_'||encode(extensions.gen_random_bytes(12),'hex')),
 manual_id uuid not null,payload jsonb not null check(jsonb_typeof(payload)='object'),show_prices boolean not null,
 published_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),foreign key(organization_id,manual_id) references public.manual_versions(organization_id,id)
);
alter table public.consumer_pages add foreign key(organization_id,publication_id) references public.consumer_publications(organization_id,id);
create table public.schedule_resources (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null unique references public.organizations(id),
 active boolean not null default true,lead_minutes integer not null default 120 check(lead_minutes between 0 and 43200),
 horizon_days integer not null default 30 check(horizon_days between 1 and 90),step_minutes integer not null default 30 check(step_minutes in (15,30,60)),
 buffer_minutes integer not null default 0 check(buffer_minutes between 0 and 120),cancel_minutes integer not null default 720 check(cancel_minutes between 0 and 43200),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id)
);
create table public.customers (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 user_id uuid not null references auth.users(id),name text not null check(length(btrim(name)) between 2 and 120),
 whatsapp text not null check(whatsapp ~ '^[0-9]{10,15}$'),email text check(email is null or (length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),unique(organization_id,user_id)
);
create table public.customer_consents (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),customer_id uuid not null,
 purpose text not null check(purpose in ('request_processing','request_contact')),notice_version text not null check(notice_version='consumer-v1'),
 granted_at timestamptz not null default now(),revoked_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id),unique(organization_id,id)
);
create table public.opportunities (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),customer_id uuid not null,
 service_id uuid not null,stage text not null default 'interested' check(stage in ('interested','quoted','contracted','cancelled')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id),foreign key(organization_id,service_id) references public.services(organization_id,id)
);
create table public.quote_requests (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 public_code text not null unique default ('r_'||encode(extensions.gen_random_bytes(12),'hex')),
 customer_id uuid not null,opportunity_id uuid not null,publication_id uuid not null,service_id uuid not null,
 service_code text not null,addon_codes text[] not null default '{}',answers jsonb not null default '{}',notes text not null default '' check(length(notes)<=4000),
 state text not null default 'draft' check(state in ('draft','submitted','quoted','approved','cancelled')),
 revision integer not null default 1 check(revision>0),current_version_id uuid,accepted_version_id uuid,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id),foreign key(organization_id,opportunity_id) references public.opportunities(organization_id,id),
 foreign key(organization_id,publication_id) references public.consumer_publications(organization_id,id),foreign key(organization_id,service_id) references public.services(organization_id,id)
);
create table public.quote_versions (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),request_id uuid not null,
 public_code text not null unique default ('v_'||encode(extensions.gen_random_bytes(12),'hex')),
 version integer not null check(version>0),kind text not null check(kind in ('estimate','final')),state text not null default 'draft' check(state in ('draft','sent')),
 price_mode text not null check(price_mode in ('fixed','from','quote')),total_cents bigint check(total_cents between 0 and 1000000000),duration_minutes integer check(duration_minutes between 1 and 10080),
 expires_at timestamptz,created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),unique(organization_id,request_id,id),unique(request_id,version),
 foreign key(organization_id,request_id) references public.quote_requests(organization_id,id),
 check((price_mode='quote' and total_cents is null) or (price_mode<>'quote' and total_cents is not null)),
 check(kind<>'final' or (price_mode='fixed' and expires_at is not null and duration_minutes is not null))
);
alter table public.quote_requests add foreign key(organization_id,id,current_version_id) references public.quote_versions(organization_id,request_id,id);
alter table public.quote_requests add foreign key(organization_id,id,accepted_version_id) references public.quote_versions(organization_id,request_id,id);
create table public.quote_items (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),version_id uuid not null,
 position integer not null check(position between 0 and 30),name text not null check(length(btrim(name)) between 2 and 160),
 quantity integer not null check(quantity between 1 and 100),unit_cents integer check(unit_cents between 0 and 100000000),
 price_mode text not null check(price_mode in ('fixed','from','quote')),duration_minutes integer check(duration_minutes between 0 and 10080),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(version_id,position),
 foreign key(organization_id,version_id) references public.quote_versions(organization_id,id),
 check((price_mode='quote' and unit_cents is null) or (price_mode<>'quote' and unit_cents is not null))
);
create table public.request_access_tokens (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),request_id uuid not null,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),scope text not null check(scope in ('view','manage')),
 expires_at timestamptz not null,revoked_at timestamptz,used_at timestamptz,created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),
 foreign key(organization_id,request_id) references public.quote_requests(organization_id,id)
);
create table public.customer_access (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),request_id uuid not null,user_id uuid not null references auth.users(id),token_id uuid not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(token_id,user_id),
 foreign key(organization_id,request_id) references public.quote_requests(organization_id,id),foreign key(organization_id,token_id) references public.request_access_tokens(organization_id,id)
);
create table public.appointments (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),resource_id uuid not null,
 public_code text not null unique default ('a_'||encode(extensions.gen_random_bytes(12),'hex')),
 kind text not null check(kind in ('booking','block')),request_id uuid,customer_id uuid,
 starts_at timestamptz not null,ends_at timestamptz not null,slot tstzrange generated always as(tstzrange(starts_at,ends_at,'[)')) stored,
 state text not null default 'confirmed' check(state in ('confirmed','cancelled')),note text not null default '' check(length(note)<=1000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),
 foreign key(organization_id,resource_id) references public.schedule_resources(organization_id,id),foreign key(organization_id,request_id) references public.quote_requests(organization_id,id),foreign key(organization_id,customer_id) references public.customers(organization_id,id),
 check(ends_at>starts_at),check((kind='block' and request_id is null and customer_id is null) or(kind='booking' and request_id is not null and customer_id is not null)),
 exclude using gist(resource_id extensions.gist_uuid_ops with =,slot with &&) where(state='confirmed')
);
create unique index one_active_booking_per_request on public.appointments(request_id) where kind='booking' and state='confirmed';
create table public.request_events (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),request_id uuid not null,
 event text not null check(event in ('created','submitted','quote_sent','approved','booked','cancelled','rescheduled','contact_revoked','link_revoked')),
 actor_id uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organization_id,request_id) references public.quote_requests(organization_id,id)
);
create table public.attachments (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),request_id uuid not null,
 public_code text not null unique default ('f_'||encode(extensions.gen_random_bytes(12),'hex')),uploaded_by uuid not null references auth.users(id),
 object_path text not null unique,mime text not null check(mime in ('image/jpeg','image/png','image/webp')),size_bytes integer not null check(size_bytes between 1 and 5242880),
 state text not null default 'pending' check(state in ('pending','ready','rejected')),sha256 text check(sha256 ~ '^[0-9a-f]{64}$'),width integer check(width between 1 and 8000),height integer check(height between 1 and 8000),
 expires_at timestamptz not null default (now()+interval '15 minutes'),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),
 foreign key(organization_id,request_id) references public.quote_requests(organization_id,id),check(state<>'ready' or(sha256 is not null and width is not null and height is not null and width::bigint*height<=20000000))
);
create table public.attachment_tickets (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),attachment_id uuid not null,user_id uuid not null references auth.users(id),
 token_hash text not null unique,expires_at timestamptz not null,used_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organization_id,attachment_id) references public.attachments(organization_id,id)
);
create table public.consumer_idempotency (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),user_id uuid not null references auth.users(id),
 operation text not null,key uuid not null,payload_hash text not null,result jsonb not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,user_id,operation,key)
);
create function private.consumer_identity() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=auth.uid() and p.status='active' and (u.banned_until is null or u.banned_until<=now()) and (u.is_anonymous or u.email_confirmed_at is not null));
$$;
create function private.consumer_access(p_request uuid,p_manage boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select private.consumer_identity() and exists(select 1 from public.quote_requests q join public.organizations o on o.id=q.organization_id join public.customers c on c.id=q.customer_id and c.organization_id=q.organization_id
 where q.id=p_request and o.status='active' and (private.company_can_manage(q.organization_id) or c.user_id=auth.uid() or exists(
 select 1 from public.customer_access a join public.request_access_tokens t on t.id=a.token_id and t.organization_id=a.organization_id
 where a.request_id=q.id and a.organization_id=q.organization_id and a.user_id=auth.uid() and t.request_id=q.id and t.revoked_at is null and t.expires_at>now() and (not p_manage or t.scope='manage'))));
$$;
create function private.consumer_customer_access(p_customer uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.consumer_identity() and exists(select 1 from public.customers c join public.organizations o on o.id=c.organization_id where c.id=p_customer and o.status='active' and(c.user_id=auth.uid() or private.company_can_manage(c.organization_id)));
$$;
create function private.consumer_deny_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'immutable_record' using errcode='23514';end; $$;
create function private.consumer_version_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='quote_versions' then
  if old.state='sent' then raise exception 'sent_quote_immutable' using errcode='23514'; end if;
 else
  if exists(select 1 from public.quote_versions where id=coalesce(old.version_id,new.version_id) and state='sent') or exists(select 1 from public.quote_versions where id=new.version_id and state='sent') then raise exception 'sent_quote_immutable' using errcode='23514';end if;
 end if;return coalesce(new,old);
end; $$;
create trigger consumer_publication_immutable before update or delete on public.consumer_publications for each row execute function private.consumer_deny_immutable();
create trigger quote_version_immutable before update or delete on public.quote_versions for each row execute function private.consumer_version_guard();
create trigger quote_item_immutable before insert or update or delete on public.quote_items for each row execute function private.consumer_version_guard();
create trigger request_events_immutable before update or delete on public.request_events for each row execute function private.consumer_deny_immutable();
alter table public.consumer_pages enable row level security;
alter table public.consumer_pages force row level security;
revoke all on public.consumer_pages from public,anon,authenticated;
grant select on public.consumer_pages to authenticated;
create policy consumer_pages_read on public.consumer_pages for select to authenticated using(private.company_can_manage(organization_id));
create index consumer_pages_org_idx on public.consumer_pages(organization_id);
create trigger consumer_pages_audit after insert or update or delete on public.consumer_pages for each row execute function private.company_audit();
create trigger consumer_pages_updated before update on public.consumer_pages for each row execute function private.set_updated_at();
alter table public.consumer_publications enable row level security;
alter table public.consumer_publications force row level security;
revoke all on public.consumer_publications from public,anon,authenticated;
grant select on public.consumer_publications to authenticated;
create policy consumer_publications_read on public.consumer_publications for select to authenticated using(private.company_can_manage(organization_id));
create index consumer_publications_org_idx on public.consumer_publications(organization_id);
create trigger consumer_publications_audit after insert or update or delete on public.consumer_publications for each row execute function private.company_audit();
alter table public.schedule_resources enable row level security;
alter table public.schedule_resources force row level security;
revoke all on public.schedule_resources from public,anon,authenticated;
grant select on public.schedule_resources to authenticated;
create policy schedule_resources_read on public.schedule_resources for select to authenticated using(private.company_can_manage(organization_id));
create index schedule_resources_org_idx on public.schedule_resources(organization_id);
create trigger schedule_resources_audit after insert or update or delete on public.schedule_resources for each row execute function private.company_audit();
create trigger schedule_resources_updated before update on public.schedule_resources for each row execute function private.set_updated_at();
alter table public.customers enable row level security;
alter table public.customers force row level security;
revoke all on public.customers from public,anon,authenticated;
grant select on public.customers to authenticated;
create policy customers_read on public.customers for select to authenticated using(private.consumer_customer_access(id));
create index customers_org_idx on public.customers(organization_id);
create trigger customers_audit after insert or update or delete on public.customers for each row execute function private.company_audit();
create trigger customers_updated before update on public.customers for each row execute function private.set_updated_at();
alter table public.customer_consents enable row level security;
alter table public.customer_consents force row level security;
revoke all on public.customer_consents from public,anon,authenticated;
grant select on public.customer_consents to authenticated;
create policy customer_consents_read on public.customer_consents for select to authenticated using(private.consumer_customer_access(customer_id));
create index customer_consents_org_idx on public.customer_consents(organization_id);
create trigger customer_consents_audit after insert or update or delete on public.customer_consents for each row execute function private.company_audit();
create trigger customer_consents_updated before update on public.customer_consents for each row execute function private.set_updated_at();
alter table public.opportunities enable row level security;
alter table public.opportunities force row level security;
revoke all on public.opportunities from public,anon,authenticated;
grant select on public.opportunities to authenticated;
create policy opportunities_read on public.opportunities for select to authenticated using(private.consumer_customer_access(customer_id));
create index opportunities_org_idx on public.opportunities(organization_id);
create trigger opportunities_audit after insert or update or delete on public.opportunities for each row execute function private.company_audit();
create trigger opportunities_updated before update on public.opportunities for each row execute function private.set_updated_at();
alter table public.quote_requests enable row level security;
alter table public.quote_requests force row level security;
revoke all on public.quote_requests from public,anon,authenticated;
grant select on public.quote_requests to authenticated;
create policy quote_requests_read on public.quote_requests for select to authenticated using(private.consumer_access(id));
create index quote_requests_org_idx on public.quote_requests(organization_id);
create trigger quote_requests_audit after insert or update or delete on public.quote_requests for each row execute function private.company_audit();
create trigger quote_requests_updated before update on public.quote_requests for each row execute function private.set_updated_at();
alter table public.quote_versions enable row level security;
alter table public.quote_versions force row level security;
revoke all on public.quote_versions from public,anon,authenticated;
grant select on public.quote_versions to authenticated;
create policy quote_versions_read on public.quote_versions for select to authenticated using(private.consumer_access(request_id));
create index quote_versions_org_idx on public.quote_versions(organization_id);
create trigger quote_versions_audit after insert or update or delete on public.quote_versions for each row execute function private.company_audit();
create trigger quote_versions_updated before update on public.quote_versions for each row execute function private.set_updated_at();
alter table public.quote_items enable row level security;
alter table public.quote_items force row level security;
revoke all on public.quote_items from public,anon,authenticated;
grant select on public.quote_items to authenticated;
create policy quote_items_read on public.quote_items for select to authenticated using(exists(select 1 from public.quote_versions v where v.id=version_id and v.organization_id=quote_items.organization_id and private.consumer_access(v.request_id)));
create index quote_items_org_idx on public.quote_items(organization_id);
create trigger quote_items_audit after insert or update or delete on public.quote_items for each row execute function private.company_audit();
create trigger quote_items_updated before update on public.quote_items for each row execute function private.set_updated_at();
alter table public.request_access_tokens enable row level security;
alter table public.request_access_tokens force row level security;
revoke all on public.request_access_tokens from public,anon,authenticated;
grant select on public.request_access_tokens to authenticated;
create policy request_access_tokens_read on public.request_access_tokens for select to authenticated using(false);
create index request_access_tokens_org_idx on public.request_access_tokens(organization_id);
create trigger request_access_tokens_audit after insert or update or delete on public.request_access_tokens for each row execute function private.company_audit();
create trigger request_access_tokens_updated before update on public.request_access_tokens for each row execute function private.set_updated_at();
alter table public.customer_access enable row level security;
alter table public.customer_access force row level security;
revoke all on public.customer_access from public,anon,authenticated;
grant select on public.customer_access to authenticated;
create policy customer_access_read on public.customer_access for select to authenticated using(false);
create index customer_access_org_idx on public.customer_access(organization_id);
create trigger customer_access_audit after insert or update or delete on public.customer_access for each row execute function private.company_audit();
create trigger customer_access_updated before update on public.customer_access for each row execute function private.set_updated_at();
alter table public.appointments enable row level security;
alter table public.appointments force row level security;
revoke all on public.appointments from public,anon,authenticated;
grant select on public.appointments to authenticated;
create policy appointments_read on public.appointments for select to authenticated using(private.company_can_manage(organization_id) or (kind='booking' and private.consumer_access(request_id)));
create index appointments_org_idx on public.appointments(organization_id);
create trigger appointments_audit after insert or update or delete on public.appointments for each row execute function private.company_audit();
create trigger appointments_updated before update on public.appointments for each row execute function private.set_updated_at();
alter table public.request_events enable row level security;
alter table public.request_events force row level security;
revoke all on public.request_events from public,anon,authenticated;
grant select on public.request_events to authenticated;
create policy request_events_read on public.request_events for select to authenticated using(private.consumer_access(request_id));
create index request_events_org_idx on public.request_events(organization_id);
create trigger request_events_audit after insert or update or delete on public.request_events for each row execute function private.company_audit();
alter table public.attachments enable row level security;
alter table public.attachments force row level security;
revoke all on public.attachments from public,anon,authenticated;
grant select on public.attachments to authenticated;
create policy attachments_read on public.attachments for select to authenticated using(private.consumer_access(request_id));
create index attachments_org_idx on public.attachments(organization_id);
create trigger attachments_audit after insert or update or delete on public.attachments for each row execute function private.company_audit();
create trigger attachments_updated before update on public.attachments for each row execute function private.set_updated_at();
alter table public.attachment_tickets enable row level security;
alter table public.attachment_tickets force row level security;
revoke all on public.attachment_tickets from public,anon,authenticated;
grant select on public.attachment_tickets to authenticated;
create policy attachment_tickets_read on public.attachment_tickets for select to authenticated using(false);
create index attachment_tickets_org_idx on public.attachment_tickets(organization_id);
create trigger attachment_tickets_audit after insert or update or delete on public.attachment_tickets for each row execute function private.company_audit();
create trigger attachment_tickets_updated before update on public.attachment_tickets for each row execute function private.set_updated_at();
alter table public.consumer_idempotency enable row level security;
alter table public.consumer_idempotency force row level security;
revoke all on public.consumer_idempotency from public,anon,authenticated;
grant select on public.consumer_idempotency to authenticated;
create policy consumer_idempotency_read on public.consumer_idempotency for select to authenticated using(false);
create index consumer_idempotency_org_idx on public.consumer_idempotency(organization_id);
create trigger consumer_idempotency_audit after insert or update or delete on public.consumer_idempotency for each row execute function private.company_audit();
create trigger consumer_idempotency_updated before update on public.consumer_idempotency for each row execute function private.set_updated_at();
revoke all on function private.consumer_identity(),private.consumer_access(uuid,boolean),private.consumer_customer_access(uuid),private.consumer_deny_immutable(),private.consumer_version_guard() from public,anon,authenticated;
grant execute on function private.consumer_identity(),private.consumer_access(uuid,boolean),private.consumer_customer_access(uuid) to authenticated;
commit;

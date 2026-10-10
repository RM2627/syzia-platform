begin;
-- Phase 3 only. Foundation migrations and authorization functions remain unchanged.
create function private.valid_company_hours(p_value jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare item jsonb; seen int[]='{}'; d int;
begin
 if p_value is null or jsonb_typeof(p_value)<>'array' or jsonb_array_length(p_value)>7 then return false; end if;
 for item in select value from jsonb_array_elements(p_value) loop
  if jsonb_typeof(item)<>'object' or not (item ?& array['day','open','close']) or
     (item - array['day','open','close'])<>'{}'::jsonb or coalesce(item->>'day','') !~ '^[0-6]$' or
     coalesce(item->>'open','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or
     coalesce(item->>'close','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
  d=(item->>'day')::int;
  if d=any(seen) or item->>'close' <= item->>'open' then return false; end if;
  seen=array_append(seen,d);
 end loop;
 return true;
end; $$;
create function private.valid_intake_options(p_kind text,p_options jsonb) returns boolean language plpgsql immutable set search_path='' as $$
begin
 if p_options is null or jsonb_typeof(p_options)<>'array' then return false; end if;
 if p_kind<>'choice' then return p_options='[]'::jsonb; end if;
 return jsonb_array_length(p_options) between 2 and 20 and not exists(
 select 1 from jsonb_array_elements(p_options) v where jsonb_typeof(v)<>'string' or length(btrim(v#>>'{}')) not between 1 and 160)
 and (select count(distinct btrim(v#>>'{}')) from jsonb_array_elements(p_options) v)=jsonb_array_length(p_options);
end; $$;
create table public.company_settings (
 organization_id uuid primary key references public.organizations(id) on delete restrict,
 legal_name text not null default '' check(length(legal_name)<=180),
 description text not null default '' check(length(description)<=4000),
 public_phone text not null default '' check(length(public_phone)<=40),
 public_email text not null default '' check(length(public_email)<=254),
 public_address text not null default '' check(length(public_address)<=500),
 service_regions text not null default '' check(length(service_regions)<=2000),
 payment_methods text not null default '' check(length(payment_methods)<=2000),
 business_hours jsonb not null default '[]' check(private.valid_company_hours(business_hours)),
 human_hours jsonb not null default '[]' check(private.valid_company_hours(human_hours)),
 exception_contact_name text not null default '' check(length(exception_contact_name)<=120),
 exception_contact text not null default '' check(length(exception_contact)<=500),
 revision integer not null default 1 check(revision>0),
 operational_revision integer not null default 1 check(operational_revision>0),
 published_manual_id uuid,
 faq_public_enabled boolean not null default false,
 human_enabled boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.services (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
 name text not null check(length(btrim(name)) between 2 and 120),
 category text not null default '' check(length(category)<=120), description text not null default '' check(length(description)<=4000),
 image_url text not null default '' check(image_url='' or (image_url ~ '^https://[^[:space:]]+$' and length(image_url)<=2000)),
 price_mode text not null check(price_mode in ('fixed','from','quote')),
 price_cents integer check(price_cents between 0 and 100000000),
 duration_minutes integer check(duration_minutes between 1 and 10080),
 availability text not null default '' check(length(availability)<=2000), notes text not null default '' check(length(notes)<=4000),
 active boolean not null default true, quotes_allowed boolean not null default true, direct_booking boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 check((price_mode='quote' and price_cents is null) or (price_mode in ('fixed','from') and price_cents is not null)),
 check(not direct_booking or (price_mode='fixed' and duration_minutes is not null)),
 check(quotes_allowed or direct_booking)
);
create table public.service_addons (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
 service_id uuid not null, name text not null check(length(btrim(name)) between 2 and 120),
 price_mode text not null check(price_mode in ('fixed','from','quote')), price_cents integer check(price_cents between 0 and 100000000),
 duration_minutes integer not null default 0 check(duration_minutes between 0 and 10080), active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,service_id) references public.services(organization_id,id) on delete restrict,
 check((price_mode='quote' and price_cents is null) or (price_mode in ('fixed','from') and price_cents is not null))
);
create table public.service_intake_fields (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
 service_id uuid not null, label text not null check(length(btrim(label)) between 2 and 300),
 kind text not null check(kind in ('text','number','choice','boolean')), required boolean not null default true,
 options jsonb not null default '[]', position integer not null default 0 check(position between 0 and 1000), active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,service_id) references public.services(organization_id,id) on delete restrict,
 check(private.valid_intake_options(kind,options))
);
create table public.manual_versions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
 version integer not null check(version>0), title text not null check(length(btrim(title)) between 2 and 160),
 status text not null default 'draft' check(status in ('draft','published')),
 source_revision integer, snapshot jsonb, published_at timestamptz, published_by uuid references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,version),
 check((status='draft' and source_revision is null and snapshot is null and published_at is null and published_by is null) or
 (status='published' and source_revision>0 and snapshot is not null and jsonb_typeof(snapshot)='object' and published_at is not null and published_by is not null))
);
create unique index company_one_manual_draft on public.manual_versions(organization_id) where status='draft';
alter table public.company_settings add constraint company_published_manual_fk foreign key(organization_id,published_manual_id) references public.manual_versions(organization_id,id) on delete restrict;
create table public.manual_sections (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
 manual_id uuid not null, section_key text not null check(section_key in ('business','operation','deadlines','payments','regions','policies','cancellation','rescheduling','important','objections','exceptions')),
 content text not null default '' check(length(content)<=12000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,manual_id,section_key),
 foreign key(organization_id,manual_id) references public.manual_versions(organization_id,id) on delete restrict
);
create table public.faqs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
 question text not null check(length(btrim(question)) between 2 and 300), answer text not null check(length(btrim(answer)) between 2 and 4000),
 active boolean not null default true, position integer not null default 0 check(position between 0 and 1000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id)
);
create table public.quick_replies (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
 title text not null check(length(btrim(title)) between 2 and 120), body text not null check(length(btrim(body)) between 2 and 4000),
 active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id)
);
create table public.business_rules (
 organization_id uuid primary key references public.organizations(id) on delete restrict,
 pricing_policy text not null default '' check(length(pricing_policy)<=4000), payment_policy text not null default '' check(length(payment_policy)<=4000),
 cancellation_policy text not null default '' check(length(cancellation_policy)<=4000), rescheduling_policy text not null default '' check(length(rescheduling_policy)<=4000),
 service_policy text not null default '' check(length(service_policy)<=4000), deadlines_policy text not null default '' check(length(deadlines_policy)<=4000),
 exception_policy text not null default '' check(length(exception_policy)<=4000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.attendant_permissions (
 organization_id uuid primary key references public.organizations(id) on delete restrict,
 allowed_actions text[] not null default '{}', never_change_price boolean not null default true,
 max_discount_percent integer not null default 0 check(max_discount_percent between 0 and 100),
 reviewed boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(array_position(allowed_actions,null) is null and allowed_actions <@ array['price_list','price_range','discount','negotiate','schedule','reschedule','cancel','fit_in','quote_create','quote_send','quote_items','follow_up','whatsapp','aftercare']::text[]),
 check(not never_change_price or (max_discount_percent=0 and not (allowed_actions && array['discount','negotiate']))),
 check(('discount'=any(allowed_actions) and max_discount_percent>0) or (not ('discount'=any(allowed_actions)) and max_discount_percent=0))
);
-- Append only audit: record field names and IDs, never copy contact or manual content.
create function private.company_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb; a jsonb; r jsonb; fields text[]; actor uuid;
begin
 b=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 a=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end; r=case when tg_op='DELETE' then b else a end;
 select coalesce(array_agg(k order by k),'{}'::text[]) into fields from (select jsonb_object_keys(b||a) k) t where b->k is distinct from a->k and k not in ('created_at','updated_at');
 if cardinality(fields)=0 then return coalesce(new,old); end if;
 actor=auth.uid(); if actor is not null and not exists(select 1 from public.profiles where id=actor) then actor=null; end if;
 insert into public.audit_logs(organization_id,actor_id,action,entity_table,entity_key,changed_fields)
 values((r->>'organization_id')::uuid,actor,lower(tg_op),tg_table_name,jsonb_strip_nulls(jsonb_build_object('id',r->'id','organization_id',r->'organization_id')),fields);
 return coalesce(new,old);
end; $$;
create function private.company_immutable_manual() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='manual_versions' then
  if old.status='published' then raise exception 'published_manual_immutable' using errcode='23514'; end if;
 else
  if exists(select 1 from public.manual_versions where id=coalesce(old.manual_id,new.manual_id) and status='published') or
     exists(select 1 from public.manual_versions where id=new.manual_id and status='published') then raise exception 'published_manual_immutable' using errcode='23514'; end if;
 end if;
 return coalesce(new,old);
end; $$;
create trigger manual_version_immutable before update or delete on public.manual_versions for each row execute function private.company_immutable_manual();
create trigger manual_section_immutable before insert or update or delete on public.manual_sections for each row execute function private.company_immutable_manual();
create function private.company_can_read(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_access_org(p_org) and exists(select 1 from public.organizations where id=p_org and status='active');
$$;
create function private.company_can_manage(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.company_can_read(p_org) and (private.is_org_admin(p_org) or private.has_global_role('super_admin'));
$$;
alter table public.company_settings enable row level security;
alter table public.company_settings force row level security;
revoke all on public.company_settings from public,anon,authenticated;
grant select on public.company_settings to authenticated;
create trigger company_settings_updated before update on public.company_settings for each row execute function private.set_updated_at();
create trigger company_settings_audit after insert or update or delete on public.company_settings for each row execute function private.company_audit();
create policy company_settings_read on public.company_settings for select to authenticated using(private.company_can_read(organization_id));
alter table public.services enable row level security;
alter table public.services force row level security;
revoke all on public.services from public,anon,authenticated;
grant select on public.services to authenticated;
create trigger services_updated before update on public.services for each row execute function private.set_updated_at();
create trigger services_audit after insert or update or delete on public.services for each row execute function private.company_audit();
create policy services_read on public.services for select to authenticated using(private.company_can_read(organization_id));
alter table public.service_addons enable row level security;
alter table public.service_addons force row level security;
revoke all on public.service_addons from public,anon,authenticated;
grant select on public.service_addons to authenticated;
create trigger service_addons_updated before update on public.service_addons for each row execute function private.set_updated_at();
create trigger service_addons_audit after insert or update or delete on public.service_addons for each row execute function private.company_audit();
create policy service_addons_read on public.service_addons for select to authenticated using(private.company_can_read(organization_id));
alter table public.service_intake_fields enable row level security;
alter table public.service_intake_fields force row level security;
revoke all on public.service_intake_fields from public,anon,authenticated;
grant select on public.service_intake_fields to authenticated;
create trigger service_intake_fields_updated before update on public.service_intake_fields for each row execute function private.set_updated_at();
create trigger service_intake_fields_audit after insert or update or delete on public.service_intake_fields for each row execute function private.company_audit();
create policy service_intake_fields_read on public.service_intake_fields for select to authenticated using(private.company_can_read(organization_id));
alter table public.manual_versions enable row level security;
alter table public.manual_versions force row level security;
revoke all on public.manual_versions from public,anon,authenticated;
grant select on public.manual_versions to authenticated;
create trigger manual_versions_updated before update on public.manual_versions for each row execute function private.set_updated_at();
create trigger manual_versions_audit after insert or update or delete on public.manual_versions for each row execute function private.company_audit();
create policy manual_versions_read on public.manual_versions for select to authenticated using(private.company_can_read(organization_id) and (status='published' or private.company_can_manage(organization_id)));
alter table public.manual_sections enable row level security;
alter table public.manual_sections force row level security;
revoke all on public.manual_sections from public,anon,authenticated;
grant select on public.manual_sections to authenticated;
create trigger manual_sections_updated before update on public.manual_sections for each row execute function private.set_updated_at();
create trigger manual_sections_audit after insert or update or delete on public.manual_sections for each row execute function private.company_audit();
create policy manual_sections_read on public.manual_sections for select to authenticated using(private.company_can_read(organization_id) and (private.company_can_manage(organization_id) or exists(select 1 from public.manual_versions v where v.id=manual_id and v.organization_id=manual_sections.organization_id and v.status='published')));
alter table public.faqs enable row level security;
alter table public.faqs force row level security;
revoke all on public.faqs from public,anon,authenticated;
grant select on public.faqs to authenticated;
create trigger faqs_updated before update on public.faqs for each row execute function private.set_updated_at();
create trigger faqs_audit after insert or update or delete on public.faqs for each row execute function private.company_audit();
create policy faqs_read on public.faqs for select to authenticated using(private.company_can_manage(organization_id));
alter table public.quick_replies enable row level security;
alter table public.quick_replies force row level security;
revoke all on public.quick_replies from public,anon,authenticated;
grant select on public.quick_replies to authenticated;
create trigger quick_replies_updated before update on public.quick_replies for each row execute function private.set_updated_at();
create trigger quick_replies_audit after insert or update or delete on public.quick_replies for each row execute function private.company_audit();
create policy quick_replies_read on public.quick_replies for select to authenticated using(private.company_can_manage(organization_id));
alter table public.business_rules enable row level security;
alter table public.business_rules force row level security;
revoke all on public.business_rules from public,anon,authenticated;
grant select on public.business_rules to authenticated;
create trigger business_rules_updated before update on public.business_rules for each row execute function private.set_updated_at();
create trigger business_rules_audit after insert or update or delete on public.business_rules for each row execute function private.company_audit();
create policy business_rules_read on public.business_rules for select to authenticated using(private.company_can_read(organization_id));
alter table public.attendant_permissions enable row level security;
alter table public.attendant_permissions force row level security;
revoke all on public.attendant_permissions from public,anon,authenticated;
grant select on public.attendant_permissions to authenticated;
create trigger attendant_permissions_updated before update on public.attendant_permissions for each row execute function private.set_updated_at();
create trigger attendant_permissions_audit after insert or update or delete on public.attendant_permissions for each row execute function private.company_audit();
create policy attendant_permissions_read on public.attendant_permissions for select to authenticated using(private.company_can_read(organization_id));
revoke all on function private.valid_company_hours(jsonb),private.valid_intake_options(text,jsonb),private.company_audit(),private.company_immutable_manual(),private.company_can_read(uuid),private.company_can_manage(uuid) from public,anon,authenticated;
grant execute on function private.company_can_read(uuid),private.company_can_manage(uuid) to authenticated;
commit;

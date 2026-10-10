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

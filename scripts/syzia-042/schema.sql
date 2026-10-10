-- Additive configuration; defaults preserve every existing service and appointment.
alter table public.services add column execution_mode text not null default 'continuous' check(execution_mode in('continuous','split')),
 add column execution_max_periods integer check(execution_max_periods between 2 and 30),
 add column price_max_cents integer check(price_max_cents is null or(price_mode='from'and price_max_cents>=price_cents));
alter table public.quote_versions add column execution_mode text check(execution_mode in('continuous','split')),
 add column execution_max_periods integer check(execution_max_periods between 2 and 30);
alter table public.appointments add column execution_group uuid,add column part_number integer not null default 1 check(part_number between 1 and 30),
 add column service_minutes integer check(service_minutes between 1 and 10080),
 add constraint appointment_period_metadata check((execution_group is null and part_number=1)or(kind='booking'and service_minutes is not null));
-- Existing single-period rows remain unique at part 1. Only guarded commands create groups.
drop index public.one_active_booking_per_request;
create unique index one_active_booking_per_request_part on public.appointments(request_id,part_number)where kind='booking'and state='confirmed';
create index appointment_execution_group on public.appointments(organization_id,execution_group)where execution_group is not null;

alter table public.quote_requests add column desired_periods jsonb check(desired_periods is null or jsonb_typeof(desired_periods)='array');
-- "negotiate" now means explaining published conditions, with no price mutation.
-- The price lock still forbids every discount and nonzero discount cap.
do $$declare c record;begin for c in select conname from pg_constraint where conrelid='public.attendant_permissions'::regclass and pg_get_constraintdef(oid)like '%never_change_price%'loop execute format('alter table public.attendant_permissions drop constraint %I',c.conname);end loop;end;$$;
alter table public.attendant_permissions add constraint attendant_fixed_price_autonomy check(not never_change_price or(max_discount_percent=0 and not('discount'=any(allowed_actions))));

-- Additive metadata on existing entities. No historical row is rewritten.
alter table public.services add column contract_mode text check(contract_mode in('immediate','evaluation')),
 add column photo_policy text not null default 'none' check(photo_policy in('none','optional','recommended','required')),
 add column photo_instructions text not null default '' check(length(photo_instructions)<=1000);
alter table public.service_intake_fields add column instruction text not null default '' check(length(instruction)<=500),
 add column multiline boolean not null default false,
 add column condition_field uuid references public.service_intake_fields(id),add column condition_value jsonb;
alter table public.service_intake_fields drop constraint service_intake_fields_kind_check;
alter table public.service_intake_fields add constraint service_intake_fields_kind_check check(kind in('text','number','choice','boolean','photo'));
alter table public.quote_requests add column journey text check(journey in('direct','review')),add column desired_start timestamptz,
 add column help_only boolean not null default false,add column help_context jsonb not null default '{}',
 add column photo_requested_at timestamptz,add column photo_request text not null default '' check(length(photo_request)<=1000);
alter table public.attachments add column service_code text;
alter table public.tickets add column routing_scope text not null default 'support' check(routing_scope in('support','company')),
 add column routing_reason text not null default '';
alter table public.quote_versions add column subtotal_cents bigint check(subtotal_cents>=0),
 add column discount_cents bigint not null default 0 check(discount_cents>=0),add column desired_start timestamptz;
alter table public.quote_items add column discount_cents bigint not null default 0 check(discount_cents>=0 and discount_cents<=quantity*unit_cents),
 add column source_kind text check(source_kind in('original','service','addon','manual')),add column source_code text,
 add column public_note text not null default '' check(length(public_note)<=500);

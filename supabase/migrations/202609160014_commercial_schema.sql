begin;
-- Private 1:1 metadata preserves consumer SELECT contracts on existing opportunities.
alter table public.opportunities add constraint commercial_op_customer unique(organization_id,id,customer_id);
alter table public.request_events add constraint commercial_source_org unique(organization_id,id);
create table public.commercial_opportunity_state (
 id uuid primary key,organization_id uuid not null,
 commercial_code text not null unique default ('o_'||encode(extensions.gen_random_bytes(12),'hex')),
 commercial_state text not null default 'interested' check(commercial_state in ('interested','requested','awaiting_customer','negotiating','responded','approved','scheduled','converted','lost','refused','expired','cancelled','no_response','ineligible')),
 commercial_revision integer not null default 1 check(commercial_revision>0),commercial_cycle integer not null default 1 check(commercial_cycle>0),
 commercial_changed_at timestamptz not null default now(),commercial_last_contact_at timestamptz,
 commercial_conversion_criterion text check(commercial_conversion_criterion in ('approval','booking')),commercial_conversion_event uuid,commercial_converted_at timestamptz,
 commercial_loss_reason text check(length(commercial_loss_reason) between 1 and 80),commercial_closed_at timestamptz,
 check((commercial_state='converted')=(commercial_conversion_event is not null and commercial_converted_at is not null)),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organization_id,id) references public.opportunities(organization_id,id),foreign key(organization_id,commercial_conversion_event) references public.request_events(organization_id,id)
);
create view private.commercial_op as select o.*,s.commercial_code,s.commercial_state,s.commercial_revision,s.commercial_cycle,s.commercial_changed_at,s.commercial_last_contact_at,s.commercial_conversion_criterion,s.commercial_conversion_event,s.commercial_converted_at,s.commercial_loss_reason,s.commercial_closed_at from public.opportunities o join public.commercial_opportunity_state s on s.id=o.id;
revoke all on private.commercial_op from public,anon,authenticated;
insert into public.commercial_opportunity_state(id,organization_id) select id,organization_id from public.opportunities;
create function private.commercial_initialize_op() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.commercial_opportunity_state(id,organization_id) values(new.id,new.organization_id);return new;end;$$;
revoke all on function private.commercial_initialize_op() from public,anon,authenticated;
create trigger commercial_initialize after insert on public.opportunities for each row execute function private.commercial_initialize_op();
create table public.commercial_settings (
 organization_id uuid primary key references public.organizations(id),enabled boolean not null default false,
 interval_minutes integer check(interval_minutes between 1 and 525600),max_attempts integer check(max_attempts between 1 and 10),
 eligible_types text[] not null default array['first_contact','quote_followup','abandoned','approval_followup','requested_return'] check(array_position(eligible_types,null) is null and eligible_types <@ array['first_contact','quote_followup','abandoned','approval_followup','requested_return']::text[]),
 contact_hours jsonb check(contact_hours is null or private.valid_company_hours(contact_hours)),after_limit text not null default 'stop' check(after_limit in ('stop','lose')),
 conversion_criterion text not null default 'booking' check(conversion_criterion in ('approval','booking')),
 loss_reasons text[] not null default array['price','deadline','availability','location','withdrawal','competitor','no_response','not_offered','invalid_contact','other'],
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(cardinality(loss_reasons) between 1 and 30 and array_position(loss_reasons,null) is null)
);
create table public.commercial_rules (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),service_id uuid,
 kind text check(kind in ('first_contact','quote_followup','abandoned','approval_followup','requested_return')),enabled boolean not null default true,
 interval_minutes integer check(interval_minutes between 1 and 525600),max_attempts integer check(max_attempts between 1 and 10),revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(service_id is not null or kind is not null),
 foreign key(organization_id,service_id) references public.services(organization_id,id),unique nulls not distinct(organization_id,service_id,kind)
);
alter table public.quote_requests add constraint commercial_request_op unique(organization_id,id,opportunity_id);
create table public.commercial_tasks (
 id uuid primary key default gen_random_uuid(),public_code text not null unique default ('ct_'||encode(extensions.gen_random_bytes(12),'hex')),
 organization_id uuid not null,opportunity_id uuid not null,customer_id uuid not null,request_id uuid not null,ticket_id uuid,
 kind text not null check(kind in ('first_contact','quote_followup','abandoned','approval_followup','requested_return')),cycle integer not null check(cycle>0),
 attempt integer not null check(attempt between 1 and 10),max_attempts integer not null check(max_attempts between 1 and 10),rule_snapshot jsonb not null check(jsonb_typeof(rule_snapshot)='object'),
 state text not null default 'pending' check(state in ('pending','assigned','in_progress','waiting_customer','rescheduled','completed','cancelled')),
 assignee_id uuid references public.profiles(id),priority integer not null default 1 check(priority between 0 and 2),due_at timestamptz not null,revision integer not null default 1 check(revision>0),
 result text,cancel_reason text,completed_at timestamptz,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default now(),unique(organization_id,id),
 foreign key(organization_id,opportunity_id,customer_id) references public.opportunities(organization_id,id,customer_id),
 foreign key(organization_id,request_id,opportunity_id) references public.quote_requests(organization_id,id,opportunity_id),
 foreign key(organization_id,request_id,customer_id) references public.quote_requests(organization_id,id,customer_id),foreign key(organization_id,ticket_id) references public.tickets(organization_id,id),
 check(attempt<=max_attempts),check(state not in ('assigned','in_progress') or assignee_id is not null),check((state in ('completed','cancelled'))=(completed_at is not null))
);
create unique index commercial_one_pending on public.commercial_tasks(opportunity_id) where state not in ('completed','cancelled');
create unique index commercial_unique_attempt on public.commercial_tasks(opportunity_id,cycle,kind,attempt) where state<>'cancelled';
create index commercial_due_queue on public.commercial_tasks(organization_id,state,due_at,assignee_id);
create table public.commercial_attempts (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,task_id uuid not null unique,actor_id uuid not null references public.profiles(id),
 outcome text not null check(outcome in ('responded','awaiting_decision','return_later','interested','approved','booked','no_response','refused','lost_interest','price','competitor','not_needed','invalid_contact','other')),
 note text not null default '' check(length(note)<=300),next_due_at timestamptz,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default now(),
 foreign key(organization_id,task_id) references public.commercial_tasks(organization_id,id),check(outcome<>'other' or length(btrim(note))>=2)
);
create table public.commercial_events (
 event_sequence bigint generated always as identity unique,id uuid primary key default gen_random_uuid(),organization_id uuid not null,opportunity_id uuid not null,task_id uuid,actor_id uuid references public.profiles(id),
 event text not null check(event in ('interest','requested','quote_sent','approved','booked','responded','converted','lost','refused','expired','cancelled','ineligible','scheduled','assigned','transferred','started','attempt','rescheduled','completed','task_cancelled','limit_reached','reconciled')),
 state text,reason text,source_event_id uuid,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default now(),
 foreign key(organization_id,opportunity_id) references public.opportunities(organization_id,id),foreign key(organization_id,task_id) references public.commercial_tasks(organization_id,id),foreign key(organization_id,source_event_id) references public.request_events(organization_id,id)
);
create index commercial_event_history on public.commercial_events(opportunity_id,event_sequence);
do $$ declare n text;begin foreach n in array array['commercial_opportunity_state','commercial_settings','commercial_rules','commercial_tasks','commercial_attempts','commercial_events'] loop
 execute format('alter table public.%I enable row level security',n);execute format('alter table public.%I force row level security',n);execute format('revoke all on public.%I from public,anon,authenticated',n);execute format('grant select on public.%I to authenticated',n);
 execute format('create policy %I on public.%I for select to authenticated using(%s(organization_id))',n||'_read',n,case when n in ('commercial_settings','commercial_rules') then 'private.company_can_manage' else 'private.central_staff' end);
 execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()',n||'_updated',n);execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.company_audit()',n||'_audit',n);
 if n in ('commercial_events','commercial_attempts') then execute format('create trigger %I before update or delete on public.%I for each row execute function private.consumer_deny_immutable()',n||'_immutable',n);end if;end loop;end;$$;
commit;

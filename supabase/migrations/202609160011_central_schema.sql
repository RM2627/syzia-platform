begin;
-- Phase 5: no change to Foundation roles; presence never grants authority.
create function private.central_eligible(p_org uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.attendant_organizations a join public.organizations o on o.id=a.organization_id join public.profiles p on p.id=a.user_id join auth.users u on u.id=p.id join public.platform_roles r on r.user_id=p.id and r.role='atendente' and r.active join public.company_settings s on s.organization_id=o.id
 where a.organization_id=p_org and a.user_id=p_user and a.status='active' and o.status='active' and p.status='active' and not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()) and s.human_enabled
 and not exists(select 1 from jsonb_each(private.company_checklist(p_org)) where value<>'true'::jsonb));
$$;
create function private.central_staff(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_user() and (private.company_can_manage(p_org) or private.central_eligible(p_org,auth.uid()));
$$;
create table public.central_settings (
 organization_id uuid primary key references public.organizations(id),
 response_minutes integer check(response_minutes between 5 and 10080),
 attention_minutes integer check(attention_minutes between 1 and 10079),
 quick_reply_edit boolean not null default false,share_customer_context boolean not null default false,
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(attention_minutes is null or(response_minutes is not null and attention_minutes<response_minutes))
);
alter table public.quote_requests add constraint central_request_customer_unique unique(organization_id,id,customer_id);
create table public.tickets (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 public_code text not null unique default('t_'||encode(extensions.gen_random_bytes(12),'hex')),
 request_id uuid not null,customer_id uuid not null,
 state text not null default 'queued' check(state in ('queued','active','waiting_customer','waiting_company','waiting_internal','resolved','closed')),
 assignee_id uuid references public.profiles(id),priority integer not null default 1 check(priority between 0 and 2),
 revision integer not null default 1 check(revision>0),
 next_action text not null default 'review' check(next_action in ('review','reply','quote','schedule','company','customer','follow_up','none')),
 next_due_at timestamptz,waiting_since timestamptz not null default now(),last_customer_at timestamptz,last_staff_at timestamptz,
 resolved_at timestamptz,closed_at timestamptz,previous_ticket_id uuid,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),foreign key(organization_id,request_id,customer_id) references public.quote_requests(organization_id,id,customer_id),
 foreign key(organization_id,previous_ticket_id) references public.tickets(organization_id,id),
 check(state<>'active' or assignee_id is not null),check((state='resolved')=(resolved_at is not null)),check((state='closed')=(closed_at is not null))
);
create unique index central_one_open_ticket on public.tickets(request_id) where state<>'closed';
create index central_queue_idx on public.tickets(organization_id,state,priority,waiting_since);
create table public.ticket_messages (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,ticket_id uuid not null,
 author_id uuid not null references public.profiles(id),author_name text not null check(length(author_name)<=120),
 kind text not null check(kind in ('customer','attendant','company')),body text not null check(length(btrim(body)) between 1 and 4000),
 manual_id uuid,reply_title text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organization_id,ticket_id) references public.tickets(organization_id,id),foreign key(organization_id,manual_id) references public.manual_versions(organization_id,id)
);
create table public.ticket_notes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,ticket_id uuid not null,
 author_id uuid not null references public.profiles(id),body text not null check(length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organization_id,ticket_id) references public.tickets(organization_id,id)
);
create table public.ticket_events (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,ticket_id uuid not null,
 actor_id uuid references public.profiles(id),event text not null check(event in ('created','assigned','transferred','returned','message','note','state','escalated','company_replied','quote','booking','resolved','reopened','closed','priority','next_action')),
 from_assignee uuid references public.profiles(id),to_assignee uuid references public.profiles(id),state text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organization_id,ticket_id) references public.tickets(organization_id,id)
);
create table public.ticket_escalations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,ticket_id uuid not null,
 author_id uuid not null references public.profiles(id),reason text not null check(length(btrim(reason)) between 2 and 120),
 summary text not null check(length(btrim(summary)) between 2 and 2000),question text not null check(length(btrim(question)) between 2 and 1000),
 response text check(length(btrim(response)) between 2 and 2000),responded_by uuid references public.profiles(id),responded_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organization_id,ticket_id) references public.tickets(organization_id,id),
 check((response is null and responded_by is null and responded_at is null) or(response is not null and responded_by is not null and responded_at is not null))
);
create unique index central_one_pending_escalation on public.ticket_escalations(ticket_id) where responded_at is null;
create table public.work_sessions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),
 presence text not null check(presence in ('available','busy','pause','offline')),
 started_at timestamptz not null default now(),ended_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(ended_at is null or(ended_at>=started_at and presence='offline'))
);
create unique index central_one_work_session on public.work_sessions(user_id) where ended_at is null;
create table public.central_quote_actions (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,ticket_id uuid not null,version_id uuid not null,actor_id uuid not null references public.profiles(id),
 original_cents bigint not null check(original_cents between 0 and 1000000000),final_cents bigint not null check(final_cents between 0 and original_cents),
 discount_percent integer not null check(discount_percent between 0 and 100),reason text not null check(length(reason) between 2 and 1000),manual_id uuid not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organization_id,ticket_id) references public.tickets(organization_id,id),foreign key(organization_id,version_id) references public.quote_versions(organization_id,id),foreign key(organization_id,manual_id) references public.manual_versions(organization_id,id)
);
-- All writes through RPC; raw ticket rows and internal notes are staff-only.
do $$ declare n text;begin foreach n in array array['central_settings','tickets','ticket_messages','ticket_notes','ticket_events','ticket_escalations','work_sessions','central_quote_actions'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('alter table public.%I force row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated',n);
 execute format('grant select on public.%I to authenticated',n);
 execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()',n||'_updated',n);
 execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.company_audit()',n||'_audit',n);
 if n='work_sessions' then execute 'create policy work_sessions_read on public.work_sessions for select to authenticated using(private.is_active_user() and (user_id=auth.uid() or private.has_global_role(''super_admin'')))';
 else execute format('create policy %I on public.%I for select to authenticated using(private.central_staff(organization_id))',n||'_read',n);end if;
 end loop;
 foreach n in array array['ticket_messages','ticket_notes','ticket_events','central_quote_actions'] loop
 execute format('create trigger %I before update or delete on public.%I for each row execute function private.consumer_deny_immutable()',n||'_immutable',n);end loop;
end;$$;
revoke all on function private.central_eligible(uuid,uuid),private.central_staff(uuid) from public,anon,authenticated;
grant execute on function private.central_staff(uuid) to authenticated;
commit;

begin;
-- Preparation only. No charge creation, gateway, webhooks, payment confirmation or booking gate.
create table public.payment_rules (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),service_id uuid,
 online_opt_in boolean not null default false,external_methods text[] not null default array['pix_external','cash','card_present'],advance_rule text not null default 'none' check(advance_rule in ('none','at_service','optional_deposit','required_deposit','full_advance')),
 deposit_kind text check(deposit_kind in ('fixed','percent')),deposit_cents bigint check(deposit_cents between 1 and 1000000000),deposit_basis_points integer check(deposit_basis_points between 1 and 10000),
 cancellation_refund_policy text not null default '' check(length(cancellation_refund_policy)<=4000),activation_state text not null default 'preparation_only' check(activation_state='preparation_only'),revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),unique nulls not distinct(organization_id,service_id),foreign key(organization_id,service_id) references public.services(organization_id,id),
 check(cardinality(external_methods)<=6 and external_methods<@array['pix_external','card_present','cash','transfer','other']),
 check((advance_rule in ('optional_deposit','required_deposit') and deposit_kind is not null and ((deposit_kind='fixed' and deposit_cents is not null and deposit_basis_points is null) or(deposit_kind='percent' and deposit_basis_points is not null and deposit_cents is null))) or(advance_rule not in ('optional_deposit','required_deposit') and deposit_kind is null and deposit_cents is null and deposit_basis_points is null))
);
alter table public.quote_versions add constraint quote_version_amount_reference unique(organization_id,request_id,id,total_cents);
create table public.payment_plans (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),public_code text not null unique default('pp_'||encode(extensions.gen_random_bytes(12),'hex')),
 request_id uuid not null,version_id uuid not null,customer_id uuid not null,appointment_id uuid,
 authorized_total_cents bigint not null,payable_cents bigint not null check(payable_cents between 0 and 1000000000),currency text not null default 'BRL' check(currency='BRL'),kind text not null check(kind in ('total','deposit')),origin text not null check(origin in ('external','integrated')),
 advance_rule text not null,rule_snapshot jsonb not null,activation_state text not null default 'preparation_only' check(activation_state='preparation_only'),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,id,request_id,version_id,customer_id,payable_cents,currency,kind,origin),check(payable_cents<=authorized_total_cents),
 foreign key(organization_id,request_id,version_id,authorized_total_cents) references public.quote_versions(organization_id,request_id,id,total_cents),foreign key(organization_id,customer_id) references public.customers(organization_id,id),foreign key(organization_id,appointment_id) references public.appointments(organization_id,id)
);
create table public.payments (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),plan_id uuid not null,request_id uuid not null,version_id uuid not null,customer_id uuid not null,
 amount_cents bigint not null,currency text not null default 'BRL' check(currency='BRL'),kind text not null check(kind in ('total','deposit')),origin text not null check(origin in ('external','integrated')),
 method text not null check(method in ('pix_external','card_present','cash','transfer','other','pix_integrated','card_integrated')),
 status text not null default 'pending' check(status in ('not_required','pending','awaiting_confirmation','partial','paid','failed','expired','cancelled','refund_pending','refunded')),
 provider text,external_id text,confirmation_method text check(confirmation_method in ('provider_verified','manual_external')),confirmed_by uuid references public.profiles(id),confirmed_at timestamptz,confirmed_cents bigint not null default 0 check(confirmed_cents>=0),refunded_cents bigint not null default 0 check(refunded_cents>=0),expires_at timestamptz,refunded_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),unique(organization_id,provider,external_id),
 foreign key(organization_id,plan_id,request_id,version_id,customer_id,amount_cents,currency,kind,origin) references public.payment_plans(organization_id,id,request_id,version_id,customer_id,payable_cents,currency,kind,origin),
 check(confirmed_cents<=amount_cents and refunded_cents<=confirmed_cents),
 check((origin='external' and method in ('pix_external','card_present','cash','transfer','other') and provider is null and external_id is null and confirmation_method is distinct from 'provider_verified') or(origin='integrated' and method in ('pix_integrated','card_integrated') and confirmed_by is null and confirmation_method is distinct from 'manual_external')),
 check((confirmed_cents=0 and confirmation_method is null and confirmed_by is null and confirmed_at is null) or(confirmed_cents>0 and confirmed_at is not null and confirmation_method is not null and((origin='external' and confirmation_method='manual_external' and confirmed_by is not null) or(origin='integrated' and confirmation_method='provider_verified' and provider is not null and external_id is not null)))),
 check(status<>'paid' or(confirmed_cents=amount_cents and amount_cents>0)),check(status<>'partial' or(confirmed_cents>0 and confirmed_cents<amount_cents)),check(status<>'refunded' or(refunded_cents=confirmed_cents and refunded_cents>0 and refunded_at is not null))
);
create table public.payment_events (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),payment_id uuid not null,event text not null check(event in ('created','state_changed','manual_confirmation','provider_confirmation','refund_requested','refunded')),actor_id uuid references public.profiles(id),confirmation_origin text not null check(confirmation_origin in ('system','manual_external','provider_verified')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(organization_id,payment_id) references public.payments(organization_id,id),check(event<>'manual_confirmation' or(actor_id is not null and confirmation_origin='manual_external')),check(event<>'provider_confirmation' or confirmation_origin='provider_verified')
);
create trigger payment_plan_immutable before update or delete on public.payment_plans for each row execute function private.consumer_deny_immutable();
create trigger payment_event_immutable before update or delete on public.payment_events for each row execute function private.consumer_deny_immutable();
create function private.consumer_payment_plan_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin if not exists(select 1 from public.quote_requests q join public.quote_versions v on v.id=new.version_id and v.request_id=q.id where q.id=new.request_id and q.organization_id=new.organization_id and q.customer_id=new.customer_id and q.current_version_id=new.version_id and q.accepted_version_id=new.version_id and q.state='approved' and v.kind='final') then raise exception 'payment_requires_current_approved_version' using errcode='23514';end if;
 if new.appointment_id is not null and not exists(select 1 from public.appointments where id=new.appointment_id and request_id=new.request_id and customer_id=new.customer_id and organization_id=new.organization_id and kind='booking') then raise exception 'payment_appointment_mismatch' using errcode='23514';end if;return new;end;$$;
create trigger payment_plan_guard before insert on public.payment_plans for each row execute function private.consumer_payment_plan_guard();
create function public.consumer_payment_rule_save(p_org uuid,p_service text,p_revision integer,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;r public.payment_rules;candidate jsonb;
begin perform private.company_lock(p_org);perform private.company_keys(p_data,array['online_opt_in','external_methods','advance_rule','deposit_kind','deposit_cents','deposit_basis_points','cancellation_refund_policy']);if p_service is not null then select id into sid from public.services where organization_id=p_org and private.consumer_code('s',id)=p_service;if sid is null then raise exception 'service_unavailable' using errcode='22023';end if;end if;
 select * into r from public.payment_rules where organization_id=p_org and service_id is not distinct from sid;if coalesce(r.revision,0) is distinct from p_revision then raise exception 'payment_rule_revision_conflict' using errcode='40001';end if;
 candidate=coalesce(case when r.id is null then null else to_jsonb(r) end,'{"online_opt_in":false,"external_methods":["pix_external","cash","card_present"],"advance_rule":"none","deposit_kind":null,"deposit_cents":null,"deposit_basis_points":null,"cancellation_refund_policy":""}'::jsonb)||p_data;
 select * into r from jsonb_populate_record(null::public.payment_rules,candidate);
 insert into public.payment_rules(organization_id,service_id,online_opt_in,external_methods,advance_rule,deposit_kind,deposit_cents,deposit_basis_points,cancellation_refund_policy) values(p_org,sid,r.online_opt_in,r.external_methods,r.advance_rule,r.deposit_kind,r.deposit_cents,r.deposit_basis_points,r.cancellation_refund_policy)
 on conflict(organization_id,service_id) do update set online_opt_in=excluded.online_opt_in,external_methods=excluded.external_methods,advance_rule=excluded.advance_rule,deposit_kind=excluded.deposit_kind,deposit_cents=excluded.deposit_cents,deposit_basis_points=excluded.deposit_basis_points,cancellation_refund_policy=excluded.cancellation_refund_policy,revision=public.payment_rules.revision+1;
end;$$;
create function public.consumer_payment_rules_context(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if not private.company_can_manage(p_org) then raise exception 'company_admin_required' using errcode='42501';end if;return coalesce((select jsonb_agg((to_jsonb(r)-array['id','organization_id','service_id'])||jsonb_build_object('service',case when r.service_id is null then null else private.consumer_code('s',r.service_id) end)) from public.payment_rules r where organization_id=p_org),'[]'::jsonb);end;$$;
create function private.consumer_payment_calculate(p_request uuid,p_version text,p_kind text,p_origin text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q public.quote_requests;v public.quote_versions;r public.payment_rules;amount bigint;rule text;
begin select * into q from public.quote_requests where id=p_request;select * into v from public.quote_versions where id=q.current_version_id and id=q.accepted_version_id and public_code=p_version and kind='final';
 if v.id is null or q.state<>'approved' then raise exception 'payment_requires_current_approved_version' using errcode='22023';end if;
 if p_kind is null or p_kind not in ('total','deposit') or p_origin is null or p_origin not in ('external','integrated') then raise exception 'invalid_payment_plan' using errcode='22023';end if;
 select * into r from public.payment_rules where organization_id=q.organization_id and(service_id=q.service_id or service_id is null) order by service_id nulls last limit 1;rule=coalesce(r.advance_rule,'none');
 if p_origin='integrated' and not coalesce(r.online_opt_in,false) then raise exception 'integrated_payment_not_selected' using errcode='22023';end if;
 if p_kind='deposit' then if rule not in ('optional_deposit','required_deposit') then raise exception 'deposit_not_configured' using errcode='22023';end if;amount=case when r.deposit_kind='fixed' then r.deposit_cents else (v.total_cents*r.deposit_basis_points+9999)/10000 end;
 else amount=case when rule='none' then 0 else v.total_cents end;end if;
 if amount>v.total_cents then raise exception 'deposit_exceeds_quote' using errcode='22023';end if;
 return jsonb_build_object('version_id',v.id,'authorized_total_cents',v.total_cents,'payable_cents',amount,'currency','BRL','kind',p_kind,'origin',p_origin,'advance_rule',rule,'activation_state','preparation_only','rule_snapshot',jsonb_build_object('advance_rule',rule,'deposit_kind',r.deposit_kind,'deposit_cents',r.deposit_cents,'deposit_basis_points',r.deposit_basis_points,'online_opt_in',coalesce(r.online_opt_in,false),'external_methods',coalesce(r.external_methods,array['pix_external','cash','card_present'])));
end;$$;
create function public.consumer_preview_payment_plan(p_code text,p_version text,p_kind text,p_origin text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q public.quote_requests;
begin q=private.consumer_request(p_code,true);if not private.company_can_manage(q.organization_id) then raise exception 'company_admin_required' using errcode='42501';end if;return private.consumer_payment_calculate(q.id,p_version,p_kind,p_origin)-array['version_id','rule_snapshot'];end;$$;
create function public.consumer_prepare_payment_plan(p_code text,p_version text,p_kind text,p_origin text,p_expected_cents bigint,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quote_requests;calc jsonb;prior jsonb;payload jsonb;p public.payment_plans;r jsonb;
begin perform private.consumer_lock();q=private.consumer_request(p_code,true);perform private.company_lock(q.organization_id);payload=jsonb_build_array(p_code,p_version,p_kind,p_origin,p_expected_cents);prior=private.consumer_idem(q.organization_id,'prepare_payment_plan',p_key,payload);if prior is not null then return prior;end if;calc=private.consumer_payment_calculate(q.id,p_version,p_kind,p_origin);
 if (calc->>'payable_cents')::bigint is distinct from p_expected_cents then raise exception 'payment_amount_mismatch' using errcode='22023';end if;
 insert into public.payment_plans(organization_id,request_id,version_id,customer_id,authorized_total_cents,payable_cents,kind,origin,advance_rule,rule_snapshot,created_by) values(q.organization_id,q.id,(calc->>'version_id')::uuid,q.customer_id,(calc->>'authorized_total_cents')::bigint,(calc->>'payable_cents')::bigint,p_kind,p_origin,calc->>'advance_rule',calc->'rule_snapshot',auth.uid()) returning * into p;
 r=jsonb_build_object('code',p.public_code,'payable_cents',p.payable_cents,'activation_state','preparation_only','charge_created',false);perform private.consumer_remember(q.organization_id,'prepare_payment_plan',p_key,payload,r);return r;
end;$$;

alter table public.payment_rules enable row level security;
alter table public.payment_rules force row level security;
revoke all on public.payment_rules from public,anon,authenticated;
grant select on public.payment_rules to authenticated;
create policy payment_rules_read on public.payment_rules for select to authenticated using(private.company_can_manage(organization_id));
create trigger payment_rules_audit after insert or update or delete on public.payment_rules for each row execute function private.company_audit();
create trigger payment_rules_updated before update on public.payment_rules for each row execute function private.set_updated_at();

alter table public.payment_plans enable row level security;
alter table public.payment_plans force row level security;
revoke all on public.payment_plans from public,anon,authenticated;
grant select on public.payment_plans to authenticated;
create policy payment_plans_read on public.payment_plans for select to authenticated using(private.company_can_manage(organization_id));
create trigger payment_plans_audit after insert or update or delete on public.payment_plans for each row execute function private.company_audit();

alter table public.payments enable row level security;
alter table public.payments force row level security;
revoke all on public.payments from public,anon,authenticated;
grant select on public.payments to authenticated;
create policy payments_read on public.payments for select to authenticated using(private.consumer_access(request_id));
create trigger payments_audit after insert or update or delete on public.payments for each row execute function private.company_audit();
create trigger payments_updated before update on public.payments for each row execute function private.set_updated_at();

alter table public.payment_events enable row level security;
alter table public.payment_events force row level security;
revoke all on public.payment_events from public,anon,authenticated;
grant select on public.payment_events to authenticated;
create policy payment_events_read on public.payment_events for select to authenticated using(exists(select 1 from public.payments p where p.id=payment_id and p.organization_id=payment_events.organization_id and private.consumer_access(p.request_id)));
create trigger payment_events_audit after insert or update or delete on public.payment_events for each row execute function private.company_audit();

revoke all on function private.consumer_payment_plan_guard() from public,anon,authenticated;
revoke all on function public.consumer_payment_rule_save(uuid,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.consumer_payment_rule_save(uuid,text,integer,jsonb) to authenticated;
revoke all on function public.consumer_payment_rules_context(uuid) from public,anon,authenticated;
grant execute on function public.consumer_payment_rules_context(uuid) to authenticated;
revoke all on function private.consumer_payment_calculate(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.consumer_preview_payment_plan(text,text,text,text) from public,anon,authenticated;
grant execute on function public.consumer_preview_payment_plan(text,text,text,text) to authenticated;
revoke all on function public.consumer_prepare_payment_plan(text,text,text,text,bigint,uuid) from public,anon,authenticated;
grant execute on function public.consumer_prepare_payment_plan(text,text,text,text,bigint,uuid) to authenticated;
commit;

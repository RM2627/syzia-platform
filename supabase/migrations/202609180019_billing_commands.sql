begin;
create function private.billing_effective(p_sub public.billing_subscriptions) returns text language sql stable set search_path='' as $$
 select case when p_sub.state in ('trial','active') and p_sub.period_end<=now() then case when p_sub.cancel_at_end then 'cancelled' else 'expired' end else p_sub.state end;
$$;
create function private.billing_event(p_org uuid,p_event text,p_invoice uuid default null,p_details jsonb default '{}') returns void language sql security definer set search_path='' as $$
 insert into public.billing_events(organization_id,actor_id,event,subscription_revision,invoice_id,details)
 select p_org,auth.uid(),p_event,revision,p_invoice,p_details from public.billing_subscriptions where organization_id=p_org;
$$;
create function private.billing_catalog(p_admin boolean default false) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x) order by x.position,x.name),'[]'::jsonb) from (
 select p.*,to_jsonb(v) version from public.billing_plans p join lateral(select * from public.billing_plan_versions where plan_id=p.id order by version desc limit 1)v on true
 where p_admin or (p.active and p.available))x;
$$;
create function private.billing_usage_snapshot(p_org uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('month',date_trunc('month',now() at time zone 'America/Recife')::date,'timezone','America/Recife',
 'members',(select count(*) from public.organization_members where organization_id=p_org and status='active'),
 'services',(select count(*) from public.services where organization_id=p_org and active),
 'requests',(select count(*) from public.billing_usage where organization_id=p_org and metric='requests' and month=date_trunc('month',now() at time zone 'America/Recife')::date),
 'tickets',(select count(*) from public.billing_usage where organization_id=p_org and metric='tickets' and month=date_trunc('month',now() at time zone 'America/Recife')::date),
 'followups',(select count(*) from public.billing_usage where organization_id=p_org and metric='followups' and month=date_trunc('month',now() at time zone 'America/Recife')::date));
$$;
create function public.billing_context(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.billing_subscriptions;begin
 if not private.billing_can_read(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 select * into s from public.billing_subscriptions where organization_id=p_org;
 return jsonb_build_object('catalog',private.billing_catalog(),'subscription',case when s.organization_id is null then null else to_jsonb(s)||jsonb_build_object('effective_state',private.billing_effective(s),'plan',(select to_jsonb(v)||jsonb_build_object('name',p.name) from public.billing_plan_versions v join public.billing_plans p on p.id=v.plan_id where v.id=s.plan_version_id),'pending_plan',(select to_jsonb(v)||jsonb_build_object('name',p.name) from public.billing_plan_versions v join public.billing_plans p on p.id=v.plan_id where v.id=s.pending_version_id)) end,
 'usage',private.billing_usage_snapshot(p_org),'invoices',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc) from(select * from public.billing_invoices where organization_id=p_org order by created_at desc limit 50)x),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc) from(select event,details,created_at from public.billing_events where organization_id=p_org order by created_at desc limit 100)x),'[]'::jsonb),
 'provider','mock','real_payments_enabled',false,'mock_enabled',(select mock_enabled from private.billing_runtime),'revenue_cents',null);
end;$$;
create function public.billing_admin_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_global_role('super_admin') then raise exception 'access_denied' using errcode='42501';end if;
 return jsonb_build_object('plans',private.billing_catalog(true),'organizations',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from(select o.id,o.name,o.status,s.state,private.billing_effective(s) effective_state,s.period_end,s.revision,p.name plan_name,private.billing_usage_snapshot(o.id) usage from public.organizations o left join public.billing_subscriptions s on s.organization_id=o.id left join public.billing_plan_versions v on v.id=s.plan_version_id left join public.billing_plans p on p.id=v.plan_id order by o.name limit 500)x),'[]'::jsonb),'mock_enabled',(select mock_enabled from private.billing_runtime),'revenue_cents',null,'financial_metrics_status','not_available_without_real_payment_events');
end;$$;
create function public.billing_plan_save(p_id uuid,p_revision integer,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare id_ uuid;rev integer;begin
 perform private.lock_authorize('global');
 perform private.company_keys(p_data,array['name','description','active','available','position','price_cents','interval_months','trial_days','human_support','commercial_followups','member_limit','service_limit','request_limit','ticket_limit','followup_limit']);
 if p_id is null then
 if p_revision is distinct from 0 then raise exception 'billing_revision_conflict' using errcode='40001';end if;
 insert into public.billing_plans(name,description,active,available,position) values(p_data->>'name',coalesce(p_data->>'description',''),coalesce((p_data->>'active')::boolean,true),coalesce((p_data->>'available')::boolean,false),coalesce((p_data->>'position')::integer,0)) returning id,revision into id_,rev;
 else
 update public.billing_plans set name=p_data->>'name',description=coalesce(p_data->>'description',''),active=coalesce((p_data->>'active')::boolean,true),available=coalesce((p_data->>'available')::boolean,false),position=coalesce((p_data->>'position')::integer,0),revision=revision+1 where id=p_id and revision=p_revision returning id,revision into id_,rev;
 if not found then raise exception 'billing_revision_conflict' using errcode='40001';end if;
 end if;
 insert into public.billing_plan_versions(plan_id,version,price_cents,interval_months,trial_days,human_support,commercial_followups,member_limit,service_limit,request_limit,ticket_limit,followup_limit)
 values(id_,rev,(p_data->>'price_cents')::integer,(p_data->>'interval_months')::integer,coalesce((p_data->>'trial_days')::integer,0),coalesce((p_data->>'human_support')::boolean,false),coalesce((p_data->>'commercial_followups')::boolean,true),(p_data->>'member_limit')::integer,(p_data->>'service_limit')::integer,(p_data->>'request_limit')::integer,(p_data->>'ticket_limit')::integer,(p_data->>'followup_limit')::integer);
 return id_;
end;$$;
create function public.billing_subscription_action(p_org uuid,p_action text,p_plan uuid,p_revision integer,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.billing_subscriptions;v public.billing_plan_versions;oldv public.billing_plan_versions;prior public.billing_commands;payload jsonb;result_ jsonb;invoice uuid;begin
 perform private.company_lock(p_org);if p_key is null then raise exception 'billing_key_required' using errcode='22023';end if;
 payload=jsonb_build_object('action',p_action,'plan',p_plan,'revision',p_revision);
 select * into prior from public.billing_commands where organization_id=p_org and actor_id=auth.uid() and key=p_key;
 if found then if prior.payload<>payload then raise exception 'billing_key_conflict' using errcode='22023';end if;return prior.result;end if;
 select * into s from public.billing_subscriptions where organization_id=p_org for update;
 if coalesce(s.revision,0) is distinct from p_revision then raise exception 'billing_revision_conflict' using errcode='40001';end if;
 if p_action in ('subscribe','trial','change','renew') then
 if exists(select 1 from public.billing_invoices where organization_id=p_org and state='pending') then raise exception 'billing_invoice_pending' using errcode='22023';end if;
 if p_action='renew' then
 if s.organization_id is null or s.state='suspended' or s.cancel_at_end or s.period_end>now() then raise exception 'billing_transition_invalid' using errcode='22023';end if;
 select * into v from public.billing_plan_versions where id=coalesce(s.pending_version_id,s.plan_version_id);
 else select pv.* into v from public.billing_plans p join public.billing_plan_versions pv on pv.plan_id=p.id and pv.version=p.revision where p.id=p_plan and p.active and p.available;end if;
 if v.id is null then raise exception 'billing_plan_unavailable' using errcode='22023';end if;
 if p_action in ('subscribe','trial') and s.organization_id is not null then raise exception 'billing_transition_invalid' using errcode='22023';end if;
 if p_action='trial' and v.trial_days=0 then raise exception 'billing_trial_unavailable' using errcode='22023';end if;
 if p_action='change' then
 if s.state='suspended' or s.organization_id is null then raise exception 'billing_transition_invalid' using errcode='22023';end if;
 select * into oldv from public.billing_plan_versions where id=s.plan_version_id;
 -- Downgrades/interval changes are scheduled. No proration or retroactive restriction.
 if private.billing_effective(s) in ('active','trial') and (v.price_cents::numeric/v.interval_months<=oldv.price_cents::numeric/oldv.interval_months or v.interval_months<>oldv.interval_months) then
 update public.billing_subscriptions set pending_version_id=v.id,revision=revision+1 where organization_id=p_org;
 perform private.billing_event(p_org,'plan_change_scheduled',null,jsonb_build_object('version',v.id));
 result_=jsonb_build_object('scheduled',true,'effective_at',s.period_end);
 else
 update public.billing_subscriptions set revision=revision+1 where organization_id=p_org;
 end if;
 elsif p_action='renew' then update public.billing_subscriptions set revision=revision+1 where organization_id=p_org;
 else
 insert into public.billing_subscriptions(organization_id,plan_version_id,state,period_start,period_end,trial_used)
 values(p_org,v.id,case when p_action='trial' then 'trial' else 'pending' end,now(),now()+case when p_action='trial' then make_interval(days=>v.trial_days) else interval '7 days' end,p_action='trial');
 end if;
 if result_ is null and p_action<>'trial' then
 insert into public.billing_invoices(organization_id,plan_version_id,subscription_revision,purpose,amount_cents,due_at)
 select p_org,v.id,revision,case when p_action='subscribe' then 'subscribe' when p_action='renew' then 'renew' else 'change' end,v.price_cents,now()+interval '7 days' from public.billing_subscriptions where organization_id=p_org returning id into invoice;
 perform private.billing_event(p_org,'invoice_created',invoice,jsonb_build_object('simulation',true));result_=jsonb_build_object('invoice_id',invoice,'simulation',true);
 elsif p_action='trial' then perform private.billing_event(p_org,'trial_started');result_=jsonb_build_object('trial',true);end if;
 elsif p_action in ('cancel','reactivate','cancel_invoice') then
 if s.organization_id is null or s.state='suspended' then raise exception 'billing_transition_invalid' using errcode='22023';end if;
 if p_action='cancel_invoice' then
 update public.billing_invoices set state='cancelled' where organization_id=p_org and state='pending';if not found then raise exception 'billing_transition_invalid' using errcode='22023';end if;
 update public.billing_subscriptions set revision=revision+1 where organization_id=p_org;
 elsif p_action='cancel' then
 update public.billing_invoices set state='cancelled' where organization_id=p_org and state='pending';
 update public.billing_subscriptions set cancel_at_end=true,pending_version_id=null,state=case when period_end<=now() or state='pending' then 'cancelled' else state end,revision=revision+1 where organization_id=p_org;
 else
 if not s.cancel_at_end or private.billing_effective(s) not in ('active','trial') then raise exception 'billing_renewal_required' using errcode='22023';end if;
 update public.billing_subscriptions set cancel_at_end=false,revision=revision+1 where organization_id=p_org;
 end if;
 perform private.billing_event(p_org,p_action);result_=jsonb_build_object('ok',true);
 else raise exception 'billing_action_invalid' using errcode='22023';end if;
 insert into public.billing_commands(organization_id,actor_id,key,payload,result) values(p_org,auth.uid(),p_key,payload,result_);return result_;
end;$$;
-- Administrative suspension is separate from organization status and cannot grant global authority.
create function public.billing_admin_state(p_org uuid,p_revision integer,p_suspend boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_authorize('global');if p_reason is null or length(btrim(p_reason)) not between 5 and 300 or p_suspend is null then raise exception 'billing_reason_required' using errcode='22023';end if;
 update public.billing_subscriptions set state=case when p_suspend then 'suspended' else 'past_due' end,revision=revision+1 where organization_id=p_org and revision=p_revision and (p_suspend or state='suspended');
 if not found then raise exception 'billing_revision_conflict' using errcode='40001';end if;
 update public.billing_invoices set state='cancelled' where organization_id=p_org and state='pending';
 perform private.billing_event(p_org,case when p_suspend then 'suspended' else 'suspension_released' end,null,jsonb_build_object('reason',btrim(p_reason)));
end;$$;
-- Idempotent provider boundary. Only mock is implemented; real adapters must be separately homologated.
create function private.billing_apply_event(p_event text,p_invoice uuid,p_state text,p_amount integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.billing_invoices;s public.billing_subscriptions;v public.billing_plan_versions;prior public.billing_webhooks;payload jsonb;res jsonb;begin
 perform pg_advisory_xact_lock(734921501);
 if not (select mock_enabled from private.billing_runtime) then raise exception 'billing_mock_disabled' using errcode='42501';end if;
 if p_event is null or length(p_event) not between 8 and 160 or p_state not in ('paid','failed','overdue','cancelled','refunded') or p_state is null then raise exception 'billing_event_invalid' using errcode='22023';end if;
 payload=jsonb_build_object('invoice',p_invoice,'state',p_state,'amount',p_amount,'provider','mock');select * into prior from public.billing_webhooks where event_id=p_event;
 if found then if prior.payload<>payload then raise exception 'billing_key_conflict' using errcode='22023';end if;return prior.result;end if;
 select * into i from public.billing_invoices where id=p_invoice for update;
 if not found or p_amount is distinct from i.amount_cents then raise exception 'billing_invoice_invalid' using errcode='22023';end if;
 select * into s from public.billing_subscriptions where organization_id=i.organization_id for update;
 if i.state=p_state then res=jsonb_build_object('duplicate',true,'simulation',true);
 else
 if not (i.state='pending' and p_state in ('paid','failed','overdue','cancelled') or i.state='paid' and p_state='refunded') then raise exception 'billing_transition_invalid' using errcode='22023';end if;
 if p_state='paid' and (s.state='suspended' or s.revision<>i.subscription_revision) then raise exception 'billing_revision_conflict' using errcode='40001';end if;
 update public.billing_invoices set state=p_state,paid_at=case when p_state='paid' then now() else paid_at end where id=i.id;
 if p_state='paid' then
 select * into v from public.billing_plan_versions where id=i.plan_version_id;
 update public.billing_subscriptions set plan_version_id=v.id,pending_version_id=null,state='active',period_start=now(),period_end=now()+make_interval(months=>v.interval_months),cancel_at_end=false,revision=revision+1 where organization_id=i.organization_id;
 elsif p_state in ('failed','overdue') and (s.state='pending' or s.period_end<=now()) then update public.billing_subscriptions set state='past_due',revision=revision+1 where organization_id=i.organization_id;
 end if;
 -- Refund records the simulated financial fact; does not silently cancel an unrelated/current entitlement.
 perform private.billing_event(i.organization_id,'mock_'||p_state,i.id,jsonb_build_object('simulation',true));res=jsonb_build_object('state',p_state,'simulation',true);
 end if;
 insert into public.billing_webhooks(event_id,organization_id,invoice_id,payload,result) values(p_event,i.organization_id,i.id,payload,res);return res;
end;$$;
create function public.billing_mock_event(p_event text,p_invoice uuid,p_state text,p_amount integer) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.lock_authorize('global');return private.billing_apply_event(p_event,p_invoice,p_state,p_amount);end;$$;
create function public.billing_provider_event(p_event text,p_invoice uuid,p_state text,p_amount integer) returns jsonb language sql security definer set search_path='' as $$
 select private.billing_apply_event(p_event,p_invoice,p_state,p_amount);
$$;
-- All new private helpers closed; only the read predicate is callable under RLS.
revoke all on function private.billing_effective(public.billing_subscriptions),private.billing_event(uuid,text,uuid,jsonb),private.billing_catalog(boolean),private.billing_usage_snapshot(uuid),private.billing_apply_event(text,uuid,text,integer) from public,anon,authenticated;
revoke all on function public.billing_context(uuid),public.billing_admin_overview(),public.billing_plan_save(uuid,integer,jsonb),public.billing_subscription_action(uuid,text,uuid,integer,uuid),public.billing_admin_state(uuid,integer,boolean,text),public.billing_mock_event(text,uuid,text,integer),public.billing_provider_event(text,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.billing_context(uuid),public.billing_admin_overview(),public.billing_plan_save(uuid,integer,jsonb),public.billing_subscription_action(uuid,text,uuid,integer,uuid),public.billing_admin_state(uuid,integer,boolean,text),public.billing_mock_event(text,uuid,text,integer) to authenticated;
grant execute on function public.billing_provider_event(text,uuid,text,integer) to service_role;
commit;

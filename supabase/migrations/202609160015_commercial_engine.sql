begin;
create function private.commercial_terminal(p_state text) returns boolean language sql immutable set search_path='' as $$ select p_state=any(array['converted','lost','refused','expired','cancelled','no_response','ineligible']);$$;
create function private.commercial_can_operate(p_org uuid,p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id join public.organizations o on o.id=p_org where p.id=p_user and p.status='active' and o.status='active' and not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()) and (exists(select 1 from public.organization_members m where m.user_id=p_user and m.organization_id=p_org and m.role='admin_empresa' and m.status='active') or exists(select 1 from public.platform_roles r where r.user_id=p_user and r.role='super_admin' and r.active))) or (private.central_eligible(p_org,p_user) and exists(select 1 from public.attendant_permissions where organization_id=p_org and reviewed and 'follow_up'=any(allowed_actions)));
$$;
create function private.commercial_effective(p_org uuid,p_service uuid,p_kind text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cfg public.commercial_settings;specific public.commercial_rules;service_rule public.commercial_rules;mins integer;attempts integer;hours jsonb;
begin select * into cfg from public.commercial_settings where organization_id=p_org;
 select * into specific from public.commercial_rules where organization_id=p_org and kind=p_kind and enabled and(service_id=p_service or service_id is null) order by (service_id is not null) desc limit 1;
 select * into service_rule from public.commercial_rules where organization_id=p_org and service_id=p_service and kind is null and enabled;
 mins=coalesce(specific.interval_minutes,service_rule.interval_minutes,cfg.interval_minutes,1440);attempts=coalesce(specific.max_attempts,service_rule.max_attempts,cfg.max_attempts,2);
 select coalesce(cfg.contact_hours,v.snapshot->'settings'->'human_hours','[]'::jsonb) into hours from public.company_settings c left join public.manual_versions v on v.id=c.published_manual_id where c.organization_id=p_org;
 return jsonb_build_object('enabled',coalesce(cfg.enabled,false),'interval_minutes',mins,'max_attempts',attempts,'interval_source',case when specific.interval_minutes is not null then 'rule' when service_rule.interval_minutes is not null then 'service' when cfg.interval_minutes is not null then 'company' else 'system' end,'attempt_source',case when specific.max_attempts is not null then 'rule' when service_rule.max_attempts is not null then 'service' when cfg.max_attempts is not null then 'company' else 'system' end,'rule_id',specific.id,'service_rule_id',service_rule.id,'config_revision',cfg.revision,'contact_hours',coalesce(hours,'[]'::jsonb),'eligible_types',coalesce(to_jsonb(cfg.eligible_types),'[]'::jsonb),'after_limit',coalesce(cfg.after_limit,'stop'),'conversion_criterion',coalesce(cfg.conversion_criterion,'booking'));
end;$$;
create function private.commercial_window(p_org uuid,p_at timestamptz) returns timestamptz language plpgsql stable security definer set search_path='' as $$
declare zone text;hours jsonb;d date;v jsonb;st timestamptz;en timestamptz;i integer;
begin select timezone into zone from public.organizations where id=p_org;hours=private.commercial_effective(p_org,null,null)->'contact_hours';if p_at is null or zone is null then return null;end if;
 for i in 0..7 loop d=(p_at at time zone zone)::date+i;
 for v in select value from jsonb_array_elements(hours) where (value->>'day')::integer=extract(dow from d)::integer loop
 st=(d+(v->>'open')::time) at time zone zone;en=(d+(v->>'close')::time) at time zone zone;
 if p_at<en then return greatest(p_at,st);end if;end loop;end loop;return null;end;$$;
create function private.commercial_event(p_op uuid,p_event text,p_task uuid default null,p_reason text default null,p_source uuid default null) returns void language sql security definer set search_path='' as $$
 insert into public.commercial_events(organization_id,opportunity_id,task_id,actor_id,event,state,reason,source_event_id) select organization_id,id,p_task,auth.uid(),p_event,commercial_state,p_reason,p_source from private.commercial_op where id=p_op;$$;
create function private.commercial_cancel_tasks(p_op uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare t record;begin for t in update public.commercial_tasks set state='cancelled',cancel_reason=p_reason,completed_at=clock_timestamp(),revision=revision+1 where opportunity_id=p_op and state not in ('completed','cancelled') returning id loop perform private.commercial_event(p_op,'task_cancelled',t.id,p_reason);end loop;end;$$;
create function private.commercial_contact_ok(p_op uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.commercial_op o join public.organizations org on org.id=o.organization_id join public.customers c on c.id=o.customer_id join public.profiles p on p.id=c.user_id join auth.users u on u.id=c.user_id join public.services s on s.id=o.service_id
 where o.id=p_op and org.status='active' and p.status='active' and (u.banned_until is null or u.banned_until<=now()) and s.active and c.whatsapp ~ '^[0-9]{10,15}$'
 and exists(select 1 from public.customer_consents where customer_id=c.id and purpose='request_contact' and revoked_at is null)
 and exists(select 1 from public.customer_consents where customer_id=c.id and purpose='request_processing' and revoked_at is null));$$;
create function private.commercial_stop(p_op uuid,p_state text,p_reason text default null,p_source uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin if exists(select 1 from private.commercial_op where id=p_op and not private.commercial_terminal(commercial_state)) then
 update public.commercial_opportunity_state set commercial_state=p_state,commercial_loss_reason=p_reason,commercial_closed_at=clock_timestamp(),commercial_changed_at=clock_timestamp(),commercial_revision=commercial_revision+1 where id=p_op;
 perform private.commercial_cancel_tasks(p_op,p_state);perform private.commercial_event(p_op,case when p_state='no_response' then 'limit_reached' else p_state end,null,p_reason,p_source);end if;end;$$;
create function private.commercial_sync(p_op uuid,p_requested timestamptz default null,p_kind text default null) returns text language plpgsql security definer set search_path='' as $$
declare o private.commercial_op;q public.quote_requests;t public.commercial_tasks;cfg jsonb;k text;n integer;due timestamptz;tk uuid;code text;
begin select * into o from private.commercial_op where id=p_op;select * into q from public.quote_requests where opportunity_id=p_op order by created_at desc limit 1;if o.id is null or q.id is null then return null;end if;
 if private.commercial_terminal(o.commercial_state) then perform private.commercial_cancel_tasks(o.id,o.commercial_state);return null;end if;
 if q.state in ('declined','cancelled') then perform private.commercial_stop(o.id,case when q.state='declined' then 'refused' else 'cancelled' end);return null;end if;
 if q.state='quoted' and exists(select 1 from public.quote_versions where id=q.current_version_id and expires_at<=now()) then perform private.commercial_stop(o.id,'expired');return null;end if;
 k=coalesce(p_kind,case when o.commercial_state='responded' then null when q.state='draft' then 'abandoned' when q.state in ('submitted','under_review') then 'first_contact' when q.state='quoted' then 'quote_followup' when q.state='approved' then 'approval_followup' end);
 if k is null then return null;end if;cfg=private.commercial_effective(o.organization_id,o.service_id,k);
 if not (cfg->>'enabled')::boolean or not(cfg->'eligible_types' ? k) or not private.commercial_contact_ok(o.id) then perform private.commercial_cancel_tasks(o.id,'not_eligible');return null;end if;
 select * into t from public.commercial_tasks where opportunity_id=o.id and state not in ('completed','cancelled');
 if t.id is not null then
 if t.cycle<>o.commercial_cycle or (p_kind is null and t.kind<>k and t.kind<>'requested_return') then perform private.commercial_cancel_tasks(o.id,'context_changed');t.id=null;
 elsif t.attempt>(cfg->>'max_attempts')::int then perform private.commercial_cancel_tasks(o.id,'limit_reduced');return null;
 else if t.due_at<=now() then due=private.commercial_window(o.organization_id,now());if due is null then perform private.commercial_cancel_tasks(o.id,'no_contact_window');return null;elsif due>now() then update public.commercial_tasks set due_at=due,state='rescheduled',revision=revision+1 where id=t.id;perform private.commercial_event(o.id,'rescheduled',t.id,'contact_window');end if;end if;return t.public_code;end if;end if;
 select count(*)+1 into n from public.commercial_attempts a join public.commercial_tasks x on x.id=a.task_id where x.opportunity_id=o.id and x.cycle=o.commercial_cycle;
 cfg=jsonb_set(cfg,'{max_attempts}',to_jsonb(least((cfg->>'max_attempts')::int,coalesce((select max_attempts from public.commercial_tasks where opportunity_id=o.id and cycle=o.commercial_cycle and state<>'cancelled' order by created_at limit 1),(cfg->>'max_attempts')::int))));
 if n>(cfg->>'max_attempts')::int then perform private.commercial_stop(o.id,case when cfg->>'after_limit'='lose' then 'lost' else 'no_response' end,'no_response');return null;end if;
 due=private.commercial_window(o.organization_id,coalesce(p_requested,o.commercial_changed_at+make_interval(mins=>(cfg->>'interval_minutes')::int)));if due is null then return null;end if;
 select id into tk from public.tickets where request_id=q.id and state<>'closed';
 insert into public.commercial_tasks(organization_id,opportunity_id,customer_id,request_id,ticket_id,kind,cycle,attempt,max_attempts,rule_snapshot,due_at) values(o.organization_id,o.id,o.customer_id,q.id,tk,k,o.commercial_cycle,n,(cfg->>'max_attempts')::int,cfg,due) on conflict do nothing returning public_code,id into code,tk;
 if code is not null then perform private.commercial_event(o.id,'scheduled',tk,k);end if;return code;end;$$;
create function private.commercial_on_request_event() returns trigger language plpgsql security definer set search_path='' as $$
declare o private.commercial_op;q public.quote_requests;ns text;criterion text;
begin perform pg_advisory_xact_lock(734921501);select * into q from public.quote_requests where id=new.request_id;select * into o from private.commercial_op where id=q.opportunity_id;if private.commercial_terminal(o.commercial_state) then return new;end if;
 criterion=coalesce(o.commercial_conversion_criterion,private.commercial_effective(o.organization_id,o.service_id,null)->>'conversion_criterion');update public.commercial_opportunity_state set commercial_conversion_criterion=criterion where id=o.id;
 if new.event in ('approved','booked') and ((criterion='approval' and new.event='approved') or(criterion='booking' and new.event='booked')) then
 update public.commercial_opportunity_state set commercial_state='converted',commercial_conversion_event=new.id,commercial_converted_at=new.created_at,commercial_closed_at=new.created_at,commercial_changed_at=new.created_at,commercial_revision=commercial_revision+1 where id=o.id;
 perform private.commercial_cancel_tasks(o.id,'converted');perform private.commercial_event(o.id,'converted',null,new.event,new.id);return new;end if;
 if new.event='quote_declined' then perform private.commercial_stop(o.id,'refused',null,new.id);return new;end if;
 if new.event='cancelled' then perform private.commercial_stop(o.id,'cancelled','booking_cancelled',new.id);return new;end if;
 if new.event='contact_revoked' then perform private.commercial_cancel_tasks(o.id,'consent_revoked');return new;end if;
 ns=case new.event when 'created' then 'interested' when 'submitted' then 'requested' when 'quote_sent' then 'awaiting_customer' when 'approved' then 'approved' when 'booked' then 'scheduled' else null end;if ns is null then return new;end if;
 perform private.commercial_cancel_tasks(o.id,'source_changed');update public.commercial_opportunity_state set commercial_state=ns,commercial_cycle=commercial_cycle+case when new.event in ('quote_sent','approved','booked') then 1 else 0 end,commercial_changed_at=new.created_at,commercial_revision=commercial_revision+1 where id=o.id;
 perform private.commercial_event(o.id,case new.event when 'created' then 'interest' when 'submitted' then 'requested' else new.event end,null,null,new.id);perform private.commercial_sync(o.id);return new;end;$$;
create trigger commercial_request_activity after insert on public.request_events for each row execute function private.commercial_on_request_event();
create function private.commercial_on_message() returns trigger language plpgsql security definer set search_path='' as $$
declare op uuid;begin if new.kind<>'customer' then return new;end if;perform pg_advisory_xact_lock(734921501);select q.opportunity_id into op from public.tickets t join public.quote_requests q on q.id=t.request_id where t.id=new.ticket_id;perform private.commercial_cancel_tasks(op,'customer_replied');
 if exists(select 1 from private.commercial_op where id=op and not private.commercial_terminal(commercial_state)) then update public.commercial_opportunity_state set commercial_state='responded',commercial_changed_at=new.created_at,commercial_revision=commercial_revision+1 where id=op;perform private.commercial_event(op,'responded');end if;return new;end;$$;
create trigger commercial_customer_message after insert on public.ticket_messages for each row execute function private.commercial_on_message();
create function private.commercial_on_consent() returns trigger language plpgsql security definer set search_path='' as $$
declare op uuid;begin if new.revoked_at is not null and old.revoked_at is null then perform pg_advisory_xact_lock(734921501);for op in select id from private.commercial_op where customer_id=new.customer_id loop perform private.commercial_cancel_tasks(op,'consent_revoked');end loop;end if;return new;end;$$;
create trigger commercial_consent_revoked after update on public.customer_consents for each row execute function private.commercial_on_consent();
-- Reconcile known state without manufacturing historical events.
update public.commercial_opportunity_state o set commercial_state=case q.state when 'draft' then 'interested' when 'submitted' then 'requested' when 'under_review' then 'requested' when 'quoted' then 'awaiting_customer' when 'approved' then 'approved' when 'declined' then 'refused' when 'cancelled' then 'cancelled' else 'interested' end,commercial_changed_at=q.updated_at from public.quote_requests q where q.opportunity_id=o.id;
update public.commercial_opportunity_state o set commercial_state='converted',commercial_conversion_criterion='booking',commercial_conversion_event=e.id,commercial_converted_at=e.created_at,commercial_closed_at=e.created_at from public.quote_requests q join lateral(select re.id,re.created_at from public.request_events re where re.request_id=q.id and re.event='booked' order by re.created_at desc limit 1)e on true where q.opportunity_id=o.id and q.state not in ('declined','cancelled') and exists(select 1 from public.appointments a where a.request_id=q.id and a.state='confirmed');
do $$ declare r record;begin for r in select p.oid::regprocedure s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'commercial_%' loop execute format('revoke all on function %s from public,anon,authenticated',r.s);end loop;end;$$;
commit;

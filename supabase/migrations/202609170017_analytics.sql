begin;
-- No copies of business data and no new public read policies. All aggregations are scoped RPCs.
create index analytics_op_created on public.opportunities(organization_id,created_at,service_id);
create index analytics_request_events on public.request_events(organization_id,request_id,created_at,event);
create index analytics_commercial_events on public.commercial_events(organization_id,opportunity_id,created_at,event);
create index analytics_messages on public.ticket_messages(organization_id,ticket_id,created_at);
create index analytics_ticket_created on public.tickets(organization_id,created_at);
create function private.analytics_period(p_timezone text,p_from date,p_to date) returns jsonb language plpgsql stable set search_path='' as $$
begin
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>365 or not isfinite(p_from) or not isfinite(p_to) then raise exception 'invalid_analytics_period' using errcode='22023';end if;
 return jsonb_build_object('from',p_from::timestamp at time zone p_timezone,'until',(p_to+1)::timestamp at time zone p_timezone,'timezone',p_timezone,'first_day',p_from,'last_day',p_to);
end;$$;
revoke all on function private.analytics_period(text,date,date) from public,anon,authenticated;
create function public.analytics_company(p_org uuid,p_from date,p_to date,p_service uuid default null,p_source text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare bounds jsonb;lo timestamptz;hi timestamptz;r jsonb;
begin
 if not private.company_can_manage(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 if p_service is not null and not exists(select 1 from public.services where organization_id=p_org and id=p_service) then raise exception 'access_denied' using errcode='42501';end if;
 if p_source is not null and p_source not in ('instagram','google','referral','whatsapp','direct','other','unknown') then raise exception 'invalid_analytics_source' using errcode='22023';end if;
 bounds=private.analytics_period((select timezone from public.organizations where id=p_org),p_from,p_to);lo=(bounds->>'from')::timestamptz;hi=(bounds->>'until')::timestamptz;
 -- Cohort of opportunities created in the selected local dates. Progress observed only before exclusive end.
 with cohort as (
 select o.id,o.service_id,o.created_at,coalesce(x.source,'unknown') source,s.name service_name
 from public.opportunities o join public.services s on s.organization_id=o.organization_id and s.id=o.service_id
 left join public.opportunity_context x on x.organization_id=o.organization_id and x.opportunity_id=o.id
 where o.organization_id=p_org and o.created_at>=lo and o.created_at<hi and (p_service is null or o.service_id=p_service) and (p_source is null or coalesce(x.source,'unknown')=p_source)
 ), progress as (
 select c.*,
 exists(select 1 from public.quote_requests q join public.request_events e on e.organization_id=q.organization_id and e.request_id=q.id where q.organization_id=p_org and q.opportunity_id=c.id and e.event='submitted' and e.created_at<hi) requested,
 exists(select 1 from public.quote_requests q join public.quote_versions v on v.organization_id=q.organization_id and v.request_id=q.id where q.organization_id=p_org and q.opportunity_id=c.id and v.kind='final' and v.state='sent' and v.created_at<hi) quoted,
 exists(select 1 from public.quote_requests q join public.request_events e on e.organization_id=q.organization_id and e.request_id=q.id where q.organization_id=p_org and q.opportunity_id=c.id and e.event='approved' and e.created_at<hi) approved,
 exists(select 1 from public.quote_requests q join public.request_events e on e.organization_id=q.organization_id and e.request_id=q.id where q.organization_id=p_org and q.opportunity_id=c.id and e.event in ('booked','rescheduled') and e.created_at<hi) booked,
 exists(select 1 from public.commercial_events e where e.organization_id=p_org and e.opportunity_id=c.id and e.event='converted' and e.created_at<hi) converted,
 exists(select 1 from public.commercial_events e where e.organization_id=p_org and e.opportunity_id=c.id and e.event in ('lost','refused','expired','cancelled','ineligible','limit_reached') and e.created_at<hi) lost,
 exists(select 1 from public.commercial_events e join public.commercial_tasks t on t.organization_id=e.organization_id and t.opportunity_id=e.opportunity_id join public.commercial_attempts a on a.organization_id=t.organization_id and a.task_id=t.id where e.organization_id=p_org and e.opportunity_id=c.id and e.event='converted' and e.created_at<hi and a.created_at<e.created_at) recovered
 from cohort c
 ), totals as(select count(*) opportunities,count(*) filter(where requested) requests,count(*) filter(where quoted) quotes,count(*) filter(where approved) approvals,count(*) filter(where booked) bookings,count(*) filter(where converted) conversions,count(*) filter(where lost) losses,count(*) filter(where recovered) recoveries from progress),
 quoted_values as(select distinct on(q.id) v.total_cents from public.quote_requests q join cohort c on c.id=q.opportunity_id join public.quote_versions v on v.organization_id=q.organization_id and v.request_id=q.id where q.organization_id=p_org and v.kind='final' and v.state='sent' and v.created_at<hi order by q.id,v.version desc),
 approved_values as(select v.total_cents from public.quote_requests q join cohort c on c.id=q.opportunity_id join public.quote_versions v on v.organization_id=q.organization_id and v.id=q.accepted_version_id where q.organization_id=p_org and exists(select 1 from public.request_events e where e.organization_id=p_org and e.request_id=q.id and e.event='approved' and e.created_at<hi)),
 service_groups as(select service_id,service_name name,count(*) requests,count(*) filter(where converted) conversions from progress group by service_id,service_name),
 source_groups as(select source name,count(*) requests,count(*) filter(where converted) conversions from progress group by source),
 days as(select d::date as day from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day')d),
 trend as(select d.day,count(p.id) opportunities,count(p.id) filter(where p.converted) conversions from days d left join progress p on (p.created_at at time zone(bounds->>'timezone'))::date=d.day group by d.day)
 select jsonb_build_object('period',bounds,'basis','opportunity_cohort','generated_at',statement_timestamp(),'totals',to_jsonb(t)||jsonb_build_object('conversion_percent',case when t.opportunities=0 then 0 else round(100.0*t.conversions/t.opportunities,2) end),
 'values',jsonb_build_object('quoted_cents',coalesce((select sum(total_cents) from quoted_values),0),'approved_cents',coalesce((select sum(total_cents) from approved_values),0),'unpriced_quotes',(select count(*) from quoted_values where total_cents is null),'revenue_cents',null,'revenue_status','not_supported'),
 'followups',jsonb_build_object('tasks',(select count(*) from public.commercial_tasks t join cohort c on c.id=t.opportunity_id where t.organization_id=p_org and t.created_at<hi),'attempts',(select count(*) from public.commercial_attempts a join public.commercial_tasks t on t.organization_id=a.organization_id and t.id=a.task_id join cohort c on c.id=t.opportunity_id where a.organization_id=p_org and a.created_at<hi)),
 'services',coalesce((select jsonb_agg(to_jsonb(s) order by s.requests desc,s.name) from (select * from service_groups order by requests desc,name limit 50)s),'[]'::jsonb),'sources',coalesce((select jsonb_agg(to_jsonb(s) order by s.requests desc,s.name) from source_groups s),'[]'::jsonb),
 'trend',coalesce((select jsonb_agg(to_jsonb(x) order by x.day) from trend x),'[]'::jsonb),
 'filters',jsonb_build_object('services',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]'::jsonb) from (select id,name from public.services where organization_id=p_org order by name limit 200)s))) into r from totals t;
 return r;
end;$$;
create function public.analytics_central(p_org uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare bounds jsonb;lo timestamptz;hi timestamptz;minutes integer;r jsonb;
begin
 if not private.central_staff(p_org) then raise exception 'access_denied' using errcode='42501';end if;
 bounds=private.analytics_period((select timezone from public.organizations where id=p_org),p_from,p_to);lo=(bounds->>'from')::timestamptz;hi=(bounds->>'until')::timestamptz;
 select response_minutes into minutes from public.central_settings where organization_id=p_org;
 with cohort as(select t.id,t.created_at from public.tickets t where t.organization_id=p_org and t.created_at>=lo and t.created_at<hi),
 timings as(select t.*,first_customer.at customer_at,first_response.at response_at,extract(epoch from(first_response.at-first_customer.at)) response_seconds,
 exists(select 1 from public.ticket_events e where e.organization_id=p_org and e.ticket_id=t.id and e.event='resolved' and e.created_at<hi) resolved
 from cohort t left join lateral(select min(m.created_at) as at from public.ticket_messages m where m.organization_id=p_org and m.ticket_id=t.id and m.kind='customer' and m.created_at<hi)first_customer on true
 left join lateral(select min(m.created_at) as at from public.ticket_messages m where m.organization_id=p_org and m.ticket_id=t.id and m.kind in ('attendant','company') and m.created_at>=first_customer.at and m.created_at<hi)first_response on true)
 select jsonb_build_object('period',bounds,'generated_at',statement_timestamp(),'tickets',count(*),'resolved',count(*) filter(where resolved),'answered',count(response_at),'unanswered',count(*) filter(where customer_at is not null and response_at is null),
 'first_response_seconds',round(avg(response_seconds),1),'median_response_seconds',percentile_cont(.5) within group(order by response_seconds),
 'sla',jsonb_build_object('reference_minutes',minutes,'basis','current_configuration_elapsed_time','within',case when minutes is null then null else count(*) filter(where response_seconds<=minutes*60) end,'breached',case when minutes is null then null else count(*) filter(where response_seconds>minutes*60 or(response_at is null and customer_at<least(hi,statement_timestamp())-make_interval(mins=>minutes))) end),
 'live',jsonb_build_object('queued',(select count(*) from public.tickets where organization_id=p_org and state='queued'),'open',(select count(*) from public.tickets where organization_id=p_org and state not in ('resolved','closed')),'assigned',(select count(*) from public.tickets where organization_id=p_org and state not in ('resolved','closed') and assignee_id is not null),'waiting_company',(select count(*) from public.tickets where organization_id=p_org and state='waiting_company'))) into r from timings;
 return r;
end;$$;
create function public.analytics_platform(p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare bounds jsonb;r jsonb;lo timestamptz;hi timestamptz;
begin
 if not private.has_global_role('super_admin') then raise exception 'access_denied' using errcode='42501';end if;
 bounds=private.analytics_period('UTC',p_from,p_to);lo=(bounds->>'from')::timestamptz;hi=(bounds->>'until')::timestamptz;
 select jsonb_build_object('period',bounds,'generated_at',statement_timestamp(),'organizations',(select count(*) from public.organizations),'active_organizations',(select count(*) from public.organizations where status='active'),'active_profiles',(select count(*) from public.profiles where status='active'),'requests',(select count(*) from public.quote_requests where created_at>=lo and created_at<hi),'tickets',(select count(*) from public.tickets where created_at>=lo and created_at<hi),'appointments',(select count(*) from public.appointments where kind='booking' and created_at>=lo and created_at<hi),'billing','not_implemented','revenue_cents',null) into r;
 return r;
end;$$;
revoke all on function public.analytics_company(uuid,date,date,uuid,text),public.analytics_central(uuid,date,date),public.analytics_platform(date,date) from public,anon,authenticated;
grant execute on function public.analytics_company(uuid,date,date,uuid,text),public.analytics_central(uuid,date,date),public.analytics_platform(date,date) to authenticated;
commit;

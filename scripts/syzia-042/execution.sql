-- A plan is derived from published service rules, never from caller-supplied durations.
create function private.execution_policy(p_pub uuid,p_items jsonb)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare v public.consumer_publications;s jsonb;i jsonb;mode_ text='split';max_ integer=30;begin
 select *into v from public.consumer_publications where id=p_pub;
 if coalesce(jsonb_array_length(p_items),0)=0 then return jsonb_build_object('mode','continuous','max_periods',1);end if;
 for i in select value from jsonb_array_elements(p_items)loop
 select x into s from jsonb_array_elements(v.payload->'services')x where x->>'code'=i->>'service';
 if coalesce(s->>'execution_mode','continuous')<>'split'then mode_='continuous';end if;
 max_=least(max_,coalesce((s->>'execution_max_periods')::integer,30));end loop;
 return jsonb_build_object('mode',mode_,'max_periods',case when mode_='continuous'then 1 else max_ end);end;$$;
create function private.execution_request_policy(q public.quote_requests)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare v public.quote_versions;policy jsonb;begin
 policy=private.execution_policy(q.publication_id,coalesce(q.requested_items,jsonb_build_array(jsonb_build_object('service',q.service_code))));
 if q.accepted_version_id is not null then select *into v from public.quote_versions where id=q.accepted_version_id;if v.execution_mode is not null then policy=jsonb_build_object('mode',v.execution_mode,'max_periods',coalesce(v.execution_max_periods,case when v.execution_mode='split'then 30 else 1 end));end if;end if;return policy;end;$$;
create function private.execution_minutes(q public.quote_requests)returns integer language plpgsql stable security definer set search_path=''as $$
declare c jsonb;n integer;begin
 c=private.consumer_request_selection(q);
 if q.state not in('submitted','under_review','quoted','approved')then raise exception 'request_not_submitted'using errcode='22023';end if;
 if q.accepted_version_id is not null then select duration_minutes into n from public.quote_versions where id=q.accepted_version_id;
 elsif q.state in('submitted','under_review')and(c->>'direct_booking')::boolean and c->>'price_mode'='fixed'and q.publication_id=(private.consumer_publication((select slug from public.organizations where id=q.organization_id))).id then n=(c->>'duration_minutes')::integer;
 else raise exception 'booking_requires_approved_quote'using errcode='22023';end if;return n;end;$$;
create function private.execution_plan(p_pub uuid,p_start timestamptz,p_minutes integer,p_mode text,p_max integer,p_ignore uuid[] default '{}')returns jsonb language plpgsql stable security definer set search_path=''as $$
declare v public.consumer_publications;s public.schedule_resources;cursor_ timestamptz;limit_ timestamptz;remaining integer=p_minutes;lo integer;hi integer;mid integer;parts jsonb='[]';finish timestamptz;candidate timestamptz;found_ boolean;begin
 select *into v from public.consumer_publications where id=p_pub;select *into s from public.schedule_resources where organization_id=v.organization_id;
 if s.id is null or p_minutes is null or p_minutes not between 1 and 10080 or p_start is null then return parts;end if;
 if p_mode<>'split'then if private.execution_slot_allowed(p_pub,p_start,p_minutes,p_ignore)then return jsonb_build_array(jsonb_build_object('start',p_start,'minutes',p_minutes,'end',p_start+make_interval(mins=>p_minutes),'reserved_until',p_start+make_interval(mins=>p_minutes+s.buffer_minutes)));else return parts;end if;end if;
 cursor_=p_start;limit_=now()+make_interval(days=>s.horizon_days);
 while remaining>0 loop
 if jsonb_array_length(parts)>=least(coalesce(p_max,30),30)then return '[]';end if;
 if not private.execution_slot_allowed(p_pub,cursor_,1,p_ignore)then
 if jsonb_array_length(parts)=0 then return '[]';end if;
 found_=false;
 for candidate in select x from generate_series((cursor_ at time zone(v.payload->>'timezone'))::date,(limit_ at time zone(v.payload->>'timezone'))::date,interval '1 day')d cross join lateral jsonb_array_elements(v.payload->'hours')h cross join lateral generate_series((d::date+(h->>'open')::time)at time zone(v.payload->>'timezone'),((d::date+(h->>'close')::time)at time zone(v.payload->>'timezone'))-make_interval(mins=>s.buffer_minutes+1),interval '1 minute')x where(h->>'day')::integer=extract(dow from d)and x>=cursor_ and x<=limit_ and extract(minute from x at time zone(v.payload->>'timezone'))::integer%s.step_minutes=0 order by x loop
 if private.execution_slot_allowed(p_pub,candidate,1,p_ignore)then cursor_=candidate;found_=true;exit;end if;end loop;
 if not found_ then return '[]';end if;end if;
 lo=1;hi=remaining;
 while lo<hi loop mid=(lo+hi+1)/2;if private.execution_slot_allowed(p_pub,cursor_,mid,p_ignore)then lo=mid;else hi=mid-1;end if;end loop;
 finish=cursor_+make_interval(mins=>lo+s.buffer_minutes);
 parts=parts||jsonb_build_array(jsonb_build_object('start',cursor_,'minutes',lo,'end',cursor_+make_interval(mins=>lo),'reserved_until',finish));remaining=remaining-lo;
 -- The existing grid aligns minutes inside each hour (also for non-divisor steps).
 cursor_=date_trunc('hour',finish at time zone(v.payload->>'timezone'))at time zone(v.payload->>'timezone');
 while cursor_<finish loop cursor_=cursor_+interval '1 minute';end loop;
 while extract(minute from cursor_ at time zone(v.payload->>'timezone'))::integer%s.step_minutes<>0 loop cursor_=cursor_+interval '1 minute';end loop;
 end loop;return parts;end;$$;
create function private.execution_options(p_pub uuid,p_minutes integer,p_policy jsonb,p_day date,p_next boolean,p_ignore uuid[] default '{}')returns jsonb language plpgsql stable security definer set search_path=''as $$
declare v public.consumer_publications;s public.schedule_resources;day_ date=p_day;end_day date;at_ timestamptz;plan jsonb;plans jsonb='[]';hours_ integer;reason_ text;begin
 select *into v from public.consumer_publications where id=p_pub;select *into s from public.schedule_resources where organization_id=v.organization_id;
 if p_day is null or s.id is null then raise exception 'invalid_day'using errcode='22023';end if;
 end_day=least(p_day+case when coalesce(p_next,false)then s.horizon_days else 0 end,(now()at time zone(v.payload->>'timezone'))::date+s.horizon_days);
 while day_<=end_day loop
 for at_ in select x from generate_series(day_::timestamp at time zone(v.payload->>'timezone'),(day_+1)::timestamp at time zone(v.payload->>'timezone')-interval '1 minute',interval '1 minute')x where extract(minute from x at time zone(v.payload->>'timezone'))::integer%s.step_minutes=0 loop
 plan=private.execution_plan(p_pub,at_,p_minutes,p_policy->>'mode',(p_policy->>'max_periods')::integer,p_ignore);
 if jsonb_array_length(plan)>0 then plans=plans||jsonb_build_array(jsonb_build_object('start',at_,'periods',plan));end if;
 end loop;
 if jsonb_array_length(plans)>0 then exit;end if;day_=day_+1;end loop;
 select coalesce(max(extract(epoch from((h->>'close')::time-(h->>'open')::time))/60),0)::integer into hours_ from jsonb_array_elements(v.payload->'hours')h where(h->>'day')::integer=extract(dow from p_day);
 reason_=case when jsonb_array_length(plans)>0 then null when p_policy->>'mode'='continuous'and p_minutes+s.buffer_minutes>hours_ and hours_>0 then 'does_not_fit'when hours_=0 then 'closed'else 'occupied'end;
 return jsonb_build_object('plans',plans,'slots',coalesce((select jsonb_agg(x->'start')from jsonb_array_elements(plans)x),'[]'),'day',case when jsonb_array_length(plans)>0 then day_ else p_day end,'reason',reason_,'duration_minutes',p_minutes,'execution_mode',p_policy->>'mode','max_periods',p_policy->'max_periods');end;$$;
create function private.execution_request_options(p_code text,p_day date,p_next boolean)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare q public.quote_requests;v public.consumer_publications;ids uuid[];n integer;begin
 select *into q from public.quote_requests where public_code=p_code;n=private.execution_minutes(q);v=private.consumer_publication((select slug from public.organizations where id=q.organization_id));
 select coalesce(array_agg(id),'{}')into ids from public.appointments where request_id=q.id and state='confirmed'and kind='booking';
 return private.execution_options(v.id,n,private.execution_request_policy(q),p_day,p_next,ids);end;$$;
create or replace function private.central_request_slots_core(p_code text,p_day date)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 return private.execution_request_options(p_code,p_day,false)->'slots';exception when sqlstate '22023'then return '[]';end;$$;
create function private.execution_validate_plan(q public.quote_requests,p_start timestamptz,p_periods jsonb,p_minutes integer default null)returns void language plpgsql stable security definer set search_path=''as $$
declare v public.consumer_publications;policy jsonb;actual jsonb;ids uuid[];begin
 v=private.consumer_publication((select slug from public.organizations where id=q.organization_id));policy=private.execution_request_policy(q);
 select coalesce(array_agg(id),'{}')into ids from public.appointments where request_id=q.id and state='confirmed'and kind='booking';
 actual=private.execution_plan(v.id,p_start,coalesce(p_minutes,private.execution_minutes(q)),policy->>'mode',(policy->>'max_periods')::integer,ids);
 if p_periods is null or jsonb_array_length(actual)=0 or actual is distinct from p_periods then raise exception 'execution_plan_changed'using errcode='23P01';end if;end;$$;
create or replace function private.central_book_core(p_code text,p_start timestamptz,p_previous text,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare q public.quote_requests;v public.consumer_publications;s public.schedule_resources;a public.appointments;part jsonb;plan jsonb;policy jsonb;n integer;ids uuid[]='{}';group_ uuid;ordinal_ integer=0;prior jsonb;payload jsonb;r jsonb;begin
 perform pg_advisory_xact_lock(734921501);select *into q from public.quote_requests where public_code=p_code for update;payload=jsonb_build_array(p_code,p_start,p_previous);prior=private.consumer_idem(q.organization_id,'book',p_key,payload);if prior is not null then return prior;end if;
 n=private.execution_minutes(q);policy=private.execution_request_policy(q);v=private.consumer_publication((select slug from public.organizations where id=q.organization_id));select *into s from public.schedule_resources where organization_id=q.organization_id;
 if p_previous is not null then
 select *into a from public.appointments where request_id=q.id and public_code=p_previous and state='confirmed'and kind='booking';
 if a.id is null or exists(select 1 from public.appointments where request_id=q.id and state='confirmed'and kind='booking'and(execution_state<>'scheduled'or starts_at<now()+make_interval(mins=>s.cancel_minutes)))then raise exception 'reschedule_not_allowed'using errcode='22023';end if;
 select array_agg(id)into ids from public.appointments where request_id=q.id and state='confirmed'and kind='booking';
 elsif exists(select 1 from public.appointments where request_id=q.id and state='confirmed'and kind='booking')then raise exception 'booking_already_exists'using errcode='22023';end if;
 plan=private.execution_plan(v.id,p_start,n,policy->>'mode',(policy->>'max_periods')::integer,ids);
 if jsonb_array_length(plan)=0 then raise exception 'slot_unavailable'using errcode='23P01';end if;
 -- Preserve the existing appointment identity for ordinary single-window remarcations.
 if p_previous is not null and a.execution_group is null and jsonb_array_length(plan)=1 then
 part=plan->0;update public.appointments set starts_at=(part->>'start')::timestamptz,ends_at=(part->>'reserved_until')::timestamptz,service_minutes=(part->>'minutes')::integer where id=a.id returning *into a;
 perform private.consumer_event(q.organization_id,q.id,'rescheduled');r=jsonb_build_object('code',a.public_code,'starts_at',a.starts_at,'ends_at',a.ends_at,'periods',plan,'execution_group',null);perform private.consumer_remember(q.organization_id,'book',p_key,payload,r);return r;end if;
 group_=case when jsonb_array_length(plan)>1 then coalesce(a.execution_group,gen_random_uuid())else null end;
 if p_previous is not null then update public.appointments set state='cancelled'where id=any(ids);end if;
 for part in select value from jsonb_array_elements(plan)loop
 ordinal_=ordinal_+1;
 if not private.execution_slot_allowed(v.id,(part->>'start')::timestamptz,(part->>'minutes')::integer,'{}')then raise exception 'slot_unavailable'using errcode='23P01';end if;
 insert into public.appointments(organization_id,resource_id,kind,request_id,customer_id,starts_at,ends_at,execution_group,part_number,service_minutes)values(q.organization_id,s.id,'booking',q.id,q.customer_id,(part->>'start')::timestamptz,(part->>'reserved_until')::timestamptz,group_,ordinal_,(part->>'minutes')::integer)returning *into a;
 if ordinal_=1 then r=jsonb_build_object('code',a.public_code,'starts_at',a.starts_at,'ends_at',a.ends_at);end if;
 end loop;
 perform private.consumer_event(q.organization_id,q.id,case when p_previous is null then 'booked'else 'rescheduled'end);update public.opportunities set stage='contracted'where id=q.opportunity_id;
 r=r||jsonb_build_object('periods',plan,'execution_group',group_);perform private.consumer_remember(q.organization_id,'book',p_key,payload,r);return r;end;$$;
create function public.consumer_execution_options(p_code text,p_day date,p_next boolean default false)returns jsonb language plpgsql stable security definer set search_path=''as $$begin perform private.consumer_request(p_code,true);return private.execution_request_options(p_code,p_day,p_next);end;$$;
create function public.consumer_book_execution(p_code text,p_start timestamptz,p_previous text,p_periods jsonb,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare q public.quote_requests;r jsonb;payload jsonb;begin perform private.consumer_lock();q=private.consumer_request(p_code,true);payload=jsonb_build_array(p_code,p_start,p_previous,p_periods);r=private.consumer_idem(q.organization_id,'book_execution',p_key,payload);if r is not null then return r;end if;
 perform private.execution_validate_plan(q,p_start,p_periods);r=private.central_book_core(p_code,p_start,p_previous,p_key);perform private.consumer_remember(q.organization_id,'book_execution',p_key,payload,r);return r;end;$$;
create function public.consumer_complete_execution(p_code text,p_start timestamptz,p_attachment_count integer,p_periods jsonb,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare q public.quote_requests;c jsonb;r jsonb;payload jsonb;begin perform private.consumer_lock();q=private.consumer_request(p_code,true);payload=jsonb_build_array(p_code,p_start,p_attachment_count,p_periods);r=private.consumer_idem(q.organization_id,'complete_execution',p_key,payload);if r is not null then return r;end if;
 c=private.consumer_request_selection(q);perform private.execution_validate_plan(q,p_start,p_periods,coalesce((c->>'duration_minutes')::integer,(select step_minutes from public.schedule_resources where organization_id=q.organization_id)));
 update public.quote_requests set desired_periods=p_periods where id=q.id;r=public.consumer_complete_journey(p_code,p_start,p_attachment_count,p_key);perform private.consumer_remember(q.organization_id,'complete_execution',p_key,payload,r);return r;end;$$;
create function public.consumer_journey_options(p_slug text,p_revision text,p_items jsonb,p_day date,p_next boolean default false)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare v public.consumer_publications;c jsonb;n integer;begin
 if not private.consumer_identity()then raise exception 'consumer_session_required'using errcode='42501';end if;
 v=private.consumer_publication(p_slug);if v.public_code is distinct from p_revision then raise exception 'published_price_changed'using errcode='40001';end if;
 c=private.consumer_multi_selection(v.id,p_items);select coalesce((c->>'duration_minutes')::integer,step_minutes)into n from public.schedule_resources where organization_id=v.organization_id;
 return private.execution_options(v.id,n,private.execution_policy(v.id,p_items),p_day,p_next)||jsonb_build_object('journey',case when(c->>'direct_booking')::boolean then 'direct'else 'review'end,'total_cents',c->'total_cents');end;$$;
create function public.central_execution_options(p_code text,p_day date,p_next boolean default false)returns jsonb language plpgsql security definer set search_path=''as $$
declare t public.tickets;d integer;r jsonb;begin t=private.central_ticket(p_code);d=private.permission_enter(t.organization_id,'agenda.read');r=private.execution_request_options((select public_code from public.quote_requests where id=t.request_id),p_day,p_next);perform private.permission_leave(d);return r;end;$$;
create function public.central_book_execution(p_code text,p_revision integer,p_action text,p_start timestamptz,p_appointment text,p_periods jsonb,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare t public.tickets;q public.quote_requests;r jsonb;payload jsonb;begin perform private.central_lock();t=private.central_ticket(p_code);perform private.permission_require(t.organization_id,'agenda.manage');if not public.company_attendant_permission(t.organization_id,p_action)then raise exception 'central_permission_denied'using errcode='42501';end if;
 payload=jsonb_build_array(p_code,p_revision,p_action,p_start,p_appointment,p_periods);r=private.consumer_idem(t.organization_id,'central_book_execution',p_key,payload);if r is not null then return r;end if;
 select *into q from public.quote_requests where id=t.request_id;if p_action<>'cancel'then perform private.execution_validate_plan(q,p_start,p_periods);end if;
 r=public.central_booking(p_code,p_revision,p_action,p_start,p_appointment,p_key);perform private.consumer_remember(t.organization_id,'central_book_execution',p_key,payload,r);return r;end;$$;
revoke all on function public.consumer_execution_options(text,date,boolean),public.consumer_book_execution(text,timestamptz,text,jsonb,uuid),public.consumer_complete_execution(text,timestamptz,integer,jsonb,uuid),public.consumer_journey_options(text,text,jsonb,date,boolean),public.central_execution_options(text,date,boolean),public.central_book_execution(text,integer,text,timestamptz,text,jsonb,uuid)from public,anon;
grant execute on function public.consumer_execution_options(text,date,boolean),public.consumer_book_execution(text,timestamptz,text,jsonb,uuid),public.consumer_complete_execution(text,timestamptz,integer,jsonb,uuid),public.consumer_journey_options(text,text,jsonb,date,boolean),public.central_execution_options(text,date,boolean),public.central_book_execution(text,integer,text,timestamptz,text,jsonb,uuid)to authenticated;
create function public.operations_execution_options(p_org uuid,p_code text,p_day date,p_next boolean default false)returns jsonb language plpgsql volatile security definer set search_path=''as $$
declare d integer;r jsonb;begin d=private.permission_enter(p_org,'agenda.read');
 if not exists(select 1 from public.quote_requests where organization_id=p_org and public_code=p_code)then raise exception 'request_access_denied'using errcode='42501';end if;
 r=private.execution_request_options(p_code,p_day,p_next);perform private.permission_leave(d);return r;end;$$;
create function public.operations_book_execution(p_org uuid,p_code text,p_start timestamptz,p_previous text,p_revision integer,p_periods jsonb,p_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare d integer;q public.quote_requests;a public.appointments;r jsonb;payload jsonb;begin
 d=private.permission_enter(p_org,'agenda.manage');perform private.company_lock(p_org);select *into q from public.quote_requests where organization_id=p_org and public_code=p_code;
 if q.id is null then raise exception 'request_access_denied'using errcode='42501';end if;
 payload=jsonb_build_array(p_code,p_start,p_previous,p_revision,p_periods);r=private.consumer_idem(p_org,'operations_book_execution',p_key,payload);if r is not null then perform private.permission_leave(d);return r;end if;
 if p_previous is not null then select *into a from public.appointments where organization_id=p_org and request_id=q.id and public_code=p_previous;if a.id is null or a.revision is distinct from p_revision then raise exception 'appointment_revision_conflict'using errcode='40001';end if;end if;
 perform private.execution_validate_plan(q,p_start,p_periods);r=private.central_book_core(p_code,p_start,p_previous,p_key);r=r||jsonb_build_object('id',(select id from public.appointments where public_code=r->>'code'and organization_id=p_org));
 perform private.consumer_remember(p_org,'operations_book_execution',p_key,payload,r);perform private.permission_leave(d);return r;end;$$;
revoke all on function public.operations_execution_options(uuid,text,date,boolean),public.operations_book_execution(uuid,text,timestamptz,text,integer,jsonb,uuid)from public,anon;
grant execute on function public.operations_execution_options(uuid,text,date,boolean),public.operations_book_execution(uuid,text,timestamptz,text,integer,jsonb,uuid)to authenticated;

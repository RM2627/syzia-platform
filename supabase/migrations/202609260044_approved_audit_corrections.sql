-- SYZIA 044: approved AUD-001/002/003 only. No historical migration changes.
BEGIN;
-- A derived snapshot: existing columns/revisions/history are untouched on upgrade.
ALTER TABLE public.appointments ADD COLUMN buffer_minutes integer GENERATED ALWAYS AS
 (CASE WHEN kind='booking' AND service_minutes IS NOT NULL
 THEN (extract(epoch FROM (ends_at-starts_at))/60)::integer-service_minutes END) STORED;
COMMENT ON COLUMN public.appointments.buffer_minutes IS 'Historical occupied interval minus recorded service duration; NULL when legacy duration is unproven.';

-- Only a server-recorded creation command proves a genuinely new manual request.
-- Editable opportunity source, caller flags and role alone are not evidence.
CREATE FUNCTION private.booking_manual_origin(q public.quote_requests) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.consumer_idempotency i
 WHERE i.organization_id=q.organization_id AND i.operation='operations_request'
 AND i.result->>'id'=q.id::text AND i.result->>'code'=q.public_code);
$$;
CREATE FUNCTION private.booking_approval_guard(q public.quote_requests) RETURNS void
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c jsonb;
BEGIN
 IF q.state='approved' AND EXISTS(SELECT 1 FROM public.quote_versions v
  WHERE v.id=q.accepted_version_id AND v.request_id=q.id AND v.organization_id=q.organization_id
  AND v.kind='final' AND v.state='sent') THEN RETURN; END IF;
 IF private.booking_manual_origin(q) AND q.state IN('submitted','under_review','quoted') THEN RETURN; END IF;
 c=private.consumer_request_selection(q);
 IF q.journey IS DISTINCT FROM 'review' AND q.state IN('submitted','under_review')
 AND coalesce((c->>'direct_booking')::boolean,false) AND c->>'price_mode'='fixed'
 AND q.publication_id=(private.consumer_publication((SELECT slug FROM public.organizations WHERE id=q.organization_id))).id THEN RETURN; END IF;
 RAISE EXCEPTION 'booking_requires_approved_quote' USING errcode='22023';
END;$$;

CREATE FUNCTION private.booking_part_order_guard(a public.appointments, p_start timestamptz, p_end timestamptz) RETURNS void
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF a.execution_group IS NOT NULL AND EXISTS(
 SELECT 1 FROM public.appointments x WHERE x.organization_id=a.organization_id
 AND x.execution_group=a.execution_group AND x.id<>a.id AND x.state='confirmed'
 AND ((x.part_number<a.part_number AND x.ends_at>p_start)
 OR (x.part_number>a.part_number AND x.starts_at<p_end))) THEN
 RAISE EXCEPTION 'execution_part_order_conflict' USING errcode='22023'; END IF;
END;$$;

-- At the write boundary too: wrappers cannot silently replace public review by manual.
CREATE FUNCTION private.booking_write_guard_044() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.quote_requests;
BEGIN
 IF NEW.kind='booking' AND NEW.state='confirmed' AND
 (TG_OP='INSERT' OR NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at OR NEW.state IS DISTINCT FROM OLD.state) THEN
  PERFORM pg_advisory_xact_lock(734921501);
  SELECT * INTO q FROM public.quote_requests WHERE id=NEW.request_id AND organization_id=NEW.organization_id;
  IF q.id IS NULL THEN RAISE EXCEPTION 'access_denied' USING errcode='42501'; END IF;
  PERFORM private.booking_approval_guard(q);
  IF NEW.service_minutes IS NULL OR NEW.service_minutes<=0 OR NEW.ends_at<NEW.starts_at+make_interval(mins=>NEW.service_minutes) THEN
   RAISE EXCEPTION 'appointment_duration_unavailable' USING errcode='22023'; END IF;
  IF TG_OP='UPDATE' THEN PERFORM private.booking_part_order_guard(NEW,NEW.starts_at,NEW.ends_at); END IF;
 END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER booking_write_guard_044 BEFORE INSERT OR UPDATE ON public.appointments
 FOR EACH ROW EXECUTE FUNCTION private.booking_write_guard_044();

-- Recover old manual duration only by exact match to the immutable command hash.
-- Do not infer it from today's buffer, or silently shorten a historical booking.
CREATE FUNCTION private.booking_service_minutes(a public.appointments) RETURNS integer
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE i public.consumer_idempotency; n integer; old_start timestamptz; old_note text;
BEGIN
 IF a.service_minutes IS NOT NULL THEN RETURN a.service_minutes; END IF;
 SELECT * INTO i FROM public.consumer_idempotency WHERE organization_id=a.organization_id
 AND operation='operations_schedule' AND result->>'id'=a.id::text ORDER BY created_at LIMIT 1;
 IF i.key IS NOT NULL THEN
  old_start=(i.result->>'starts_at')::timestamptz; old_note=i.result->>'note';
  SELECT candidate INTO n FROM generate_series(1,10080) candidate
  WHERE i.payload_hash=encode(extensions.digest(jsonb_build_array(a.request_id,old_start,candidate,old_note)::text,'sha256'),'hex')
  OR (coalesce(old_note,'')='' AND i.payload_hash=encode(extensions.digest(jsonb_build_array(a.request_id,old_start,candidate,NULL)::text,'sha256'),'hex')) LIMIT 1;
  IF n IS NOT NULL THEN RETURN n; END IF;
 END IF;
 RAISE EXCEPTION 'appointment_duration_unavailable' USING errcode='22023';
END;$$;
CREATE OR REPLACE FUNCTION private.execution_minutes(q quote_requests)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c jsonb;n integer;begin
 perform private.booking_approval_guard(q);
 c=private.consumer_request_selection(q);
 if q.state not in('submitted','under_review','quoted','approved')then raise exception 'request_not_submitted'using errcode='22023';end if;
 if q.accepted_version_id is not null then select duration_minutes into n from public.quote_versions where id=q.accepted_version_id;
 elsif private.booking_manual_origin(q) then n=(c->>'duration_minutes')::integer;
 elsif q.state in('submitted','under_review')and(c->>'direct_booking')::boolean and c->>'price_mode'='fixed'and q.publication_id=(private.consumer_publication((select slug from public.organizations where id=q.organization_id))).id then n=(c->>'duration_minutes')::integer;
 else raise exception 'booking_requires_approved_quote'using errcode='22023';end if;return n;end;$function$;
CREATE OR REPLACE FUNCTION private.v029_operations_schedule(p_org uuid, p_request uuid, p_start timestamp with time zone, p_duration integer, p_note text, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.quote_requests;v public.consumer_publications;s public.schedule_resources;payload jsonb;prior jsonb;a public.appointments;calc jsonb;
begin perform private.company_lock(p_org);perform pg_advisory_xact_lock(734921501);payload=jsonb_build_array(p_request,p_start,p_duration,p_note);
 if not exists(select 1 from public.quote_requests where id=p_request and organization_id=p_org) then raise exception 'access_denied' using errcode='42501';end if;
 prior=private.consumer_idem(p_org,'operations_schedule',p_key,payload);if prior is not null then return prior;end if;
 select * into q from public.quote_requests where id=p_request and organization_id=p_org for update;
 perform private.booking_approval_guard(q);
 if exists(select 1 from public.appointments where request_id=q.id and kind='booking' and state='confirmed') then raise exception 'booking_already_exists' using errcode='22023';end if;
 if q.state not in ('submitted','under_review','quoted','approved') or p_duration is null or p_duration not between 1 and 10080 then raise exception 'invalid_booking' using errcode='22023';end if;
 v=private.consumer_publication((select slug from public.organizations where id=p_org));calc=private.consumer_request_selection(q);
 if p_duration<coalesce((select duration_minutes from public.quote_versions where id=q.accepted_version_id and organization_id=p_org),(calc->>'duration_minutes')::integer) then raise exception 'booking_duration_too_short' using errcode='22023';end if;
 if not private.consumer_slot_allowed(v.id,p_start,p_duration) then raise exception 'slot_unavailable' using errcode='23P01';end if;
 select * into s from public.schedule_resources where organization_id=p_org;
 insert into public.appointments(organization_id,resource_id,kind,request_id,customer_id,starts_at,ends_at,service_minutes,note) values(p_org,s.id,'booking',q.id,q.customer_id,p_start,p_start+make_interval(mins=>p_duration+s.buffer_minutes),p_duration,coalesce(p_note,'')) returning * into a;
 update public.opportunities set stage='contracted' where id=q.opportunity_id;perform private.consumer_event(p_org,q.id,'booked');
 perform private.consumer_remember(p_org,'operations_schedule',p_key,payload,to_jsonb(a));return to_jsonb(a);
end;$function$;
CREATE OR REPLACE FUNCTION private.v029_operations_appointment_act(p_org uuid, p_id uuid, p_revision integer, p_action text, p_data jsonb, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.appointments;v public.consumer_publications;s public.schedule_resources;prior jsonb;payload jsonb;ts timestamptz;minutes integer;q public.quote_requests;
begin perform private.company_lock(p_org);perform pg_advisory_xact_lock(734921501);
 select * into a from public.appointments where id=p_id and organization_id=p_org for update;if a.id is null then raise exception 'access_denied' using errcode='42501';end if;
 payload=jsonb_build_array(p_id,p_revision,p_action,p_data);prior=private.consumer_idem(p_org,'operations_appointment_act',p_key,payload);if prior is not null then return prior;end if;
 if a.revision is distinct from p_revision then raise exception 'appointment_revision_conflict' using errcode='40001';end if;
 if a.state<>'confirmed' then raise exception 'invalid_service_transition' using errcode='22023';end if;
 if p_action='reschedule' then
  perform private.company_keys(p_data,array['start']);if a.execution_state<>'scheduled' then raise exception 'service_already_started' using errcode='22023';end if;
  ts=(p_data->>'start')::timestamptz;select * into s from public.schedule_resources where organization_id=p_org;minutes=case when a.kind='booking' then private.booking_service_minutes(a) else (extract(epoch from(a.ends_at-a.starts_at))/60)::integer-s.buffer_minutes end;
  v=private.consumer_publication((select slug from public.organizations where id=p_org));
  perform private.booking_part_order_guard(a,ts,ts+make_interval(mins=>minutes+s.buffer_minutes));
  if not private.consumer_slot_allowed(v.id,ts,minutes,a.id) then raise exception 'slot_unavailable' using errcode='23P01';end if;
  if a.request_id is not null then select * into q from public.quote_requests where id=a.request_id;perform private.consumer_request_selection(q);end if;
  update public.appointments set starts_at=ts,ends_at=ts+make_interval(mins=>minutes+s.buffer_minutes),service_minutes=case when a.kind='booking' then minutes else a.service_minutes end where id=a.id returning * into a;
  if a.request_id is not null then perform private.consumer_event(p_org,a.request_id,'rescheduled');end if;
 else
  perform private.company_keys(p_data,array[]::text[]);
  case p_action
  when 'start' then
   if a.kind<>'booking' or a.execution_state<>'scheduled' or a.starts_at>now()+interval '15 minutes' then raise exception 'invalid_service_transition' using errcode='22023';end if;
   update public.appointments set execution_state='in_progress',started_at=clock_timestamp() where id=a.id returning * into a;
  when 'complete' then
   if a.kind<>'booking' or a.execution_state<>'in_progress' then raise exception 'invalid_service_transition' using errcode='22023';end if;
   update public.appointments set execution_state='completed',completed_at=clock_timestamp() where id=a.id returning * into a;
  when 'cancel' then
   if a.execution_state<>'scheduled'or exists(select 1 from public.appointments x where x.request_id=a.request_id and x.state='confirmed'and x.execution_state<>'scheduled')then raise exception 'service_already_started'using errcode='22023';end if;
   update public.appointments set state='cancelled'where id=a.id or(request_id=a.request_id and kind='booking'and state='confirmed');select *into a from public.appointments where id=p_id;
   if a.request_id is not null then perform private.consumer_event(p_org,a.request_id,'cancelled');end if;
  else raise exception 'invalid_service_transition' using errcode='22023';end case;
 end if;
 perform private.consumer_remember(p_org,'operations_appointment_act',p_key,payload,to_jsonb(a));return to_jsonb(a);
end;$function$;
CREATE OR REPLACE FUNCTION private.consumer_booking_status(q quote_requests)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$declare s jsonb;pub public.consumer_publications;ready boolean=false;begin
 if q.state not in('submitted','under_review','quoted','approved')then return jsonb_build_object('ready',false,'reason','request_not_ready');end if;
 if q.state='approved' and exists(select 1 from public.quote_versions v where v.id=q.accepted_version_id and v.request_id=q.id and v.organization_id=q.organization_id and v.kind='final' and v.state='sent') then return jsonb_build_object('ready',true,'reason',null);end if;
 if q.state not in('submitted','under_review')then return jsonb_build_object('ready',false,'reason','proposal_required');end if;
 pub=private.consumer_publication((select slug from public.organizations where id=q.organization_id));
 begin s=private.consumer_request_selection(q);exception when sqlstate '22023'then return jsonb_build_object('ready',false,'reason','service_unavailable');end;
 ready=q.journey is distinct from 'review' and coalesce((s->>'direct_booking')::boolean,false)and s->>'price_mode'='fixed'and pub.id=q.publication_id;
 return jsonb_build_object('ready',coalesce(ready,false),'reason',case when ready then null else 'proposal_required'end);end;$function$;
REVOKE ALL ON FUNCTION private.booking_manual_origin(public.quote_requests) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.booking_approval_guard(public.quote_requests) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.booking_write_guard_044() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.booking_service_minutes(public.appointments) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.booking_part_order_guard(public.appointments,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;

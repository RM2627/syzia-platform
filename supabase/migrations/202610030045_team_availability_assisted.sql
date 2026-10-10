-- Controlled exception to feature freeze; no commercial defaults or provider integration.
BEGIN;
CREATE FUNCTION private.availability_hours_valid(p_hours jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE h jsonb; n integer; BEGIN
 IF p_hours IS NULL OR jsonb_typeof(p_hours)<>'array' OR jsonb_array_length(p_hours)>56 THEN RETURN false; END IF;
 FOR h IN SELECT value FROM jsonb_array_elements(p_hours) LOOP
 IF jsonb_typeof(h)<>'object' OR NOT(h ?& array['day','open','close']) OR jsonb_typeof(h->'open') IS DISTINCT FROM 'string' OR jsonb_typeof(h->'close') IS DISTINCT FROM 'string' OR jsonb_typeof(h->'day') IS DISTINCT FROM 'number' OR (h->>'day')!~'^[0-6]$' OR (h->>'open')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' OR (h->>'close')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' OR (h->>'open')>=(h->>'close') THEN RETURN false; END IF;
 END LOOP;
 SELECT count(*) INTO n FROM jsonb_array_elements(p_hours) WITH ORDINALITY a(h,i),jsonb_array_elements(p_hours) WITH ORDINALITY b(h,i) WHERE a.i<b.i AND a.h->>'day'=b.h->>'day' AND a.h->>'open'<b.h->>'close' AND b.h->>'open'<a.h->>'close';
 RETURN n=0;
END;$$;
CREATE FUNCTION private.availability_contains(p_hours jsonb,p_tz text,p_start timestamptz,p_end timestamptz) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p_start<p_end AND (p_start AT TIME ZONE p_tz)::date=(p_end AT TIME ZONE p_tz)::date AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_hours) h WHERE (h->>'day')::int=extract(dow FROM p_start AT TIME ZONE p_tz) AND (p_start AT TIME ZONE p_tz)::time>=(h->>'open')::time AND (p_end AT TIME ZONE p_tz)::time<=(h->>'close')::time);
$$;
CREATE TABLE private.employee_availability(
 organization_id uuid NOT NULL, user_id uuid NOT NULL, inherit_company boolean NOT NULL DEFAULT true,
 hours jsonb NOT NULL DEFAULT '[]' CHECK(private.availability_hours_valid(hours)),
 blocks jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(blocks)='array' AND jsonb_array_length(blocks)<=200),
 revision integer NOT NULL DEFAULT 1, PRIMARY KEY(organization_id,user_id),
 FOREIGN KEY(organization_id,user_id) REFERENCES public.organization_members(organization_id,user_id)
);
ALTER TABLE private.employee_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.employee_availability FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.employee_availability FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER employee_availability_audit AFTER INSERT OR UPDATE ON private.employee_availability FOR EACH ROW EXECUTE FUNCTION private.company_audit();
ALTER TABLE public.appointments ADD COLUMN responsible_id uuid;
ALTER TABLE public.appointments ADD CONSTRAINT appointment_responsible_member FOREIGN KEY(organization_id,responsible_id) REFERENCES public.organization_members(organization_id,user_id);
-- Company resource exclusion is preserved. This additional guard also covers the same person across organizations.
ALTER TABLE public.appointments ADD CONSTRAINT appointment_responsible_conflict EXCLUDE USING gist(responsible_id extensions.gist_uuid_ops WITH =,slot WITH &&) WHERE(state='confirmed' AND kind='booking' AND responsible_id IS NOT NULL);
CREATE FUNCTION private.availability_own_member(p_org uuid,p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.organization_members m JOIN public.profiles p ON p.id=m.user_id WHERE m.organization_id=p_org AND m.user_id=p_user AND m.status='active' AND p.status='active' AND NOT private.syzia_identity(m.user_id));
$$;
CREATE FUNCTION private.employee_available(p_org uuid,p_user uuid,p_start timestamptz,p_end timestamptz) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a private.employee_availability; tz text; BEGIN
 IF p_user IS NULL THEN RETURN true; END IF;
 IF NOT private.availability_own_member(p_org,p_user) THEN RETURN false; END IF;
 SELECT timezone INTO tz FROM public.organizations WHERE id=p_org;
 SELECT * INTO a FROM private.employee_availability WHERE organization_id=p_org AND user_id=p_user;
 RETURN (a.user_id IS NULL OR a.inherit_company OR private.availability_contains(a.hours,tz,p_start,p_end)) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(a.blocks,'[]')) b WHERE tstzrange((b->>'start')::timestamptz,(b->>'end')::timestamptz,'[)') && tstzrange(p_start,p_end,'[)'));
END;$$;
CREATE FUNCTION public.employee_availability_context(p_org uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.permission_require(p_org,'people.manage');
 RETURN jsonb_build_object('timezone',(SELECT timezone FROM public.organizations WHERE id=p_org),'company_hours',(SELECT business_hours FROM public.company_settings WHERE organization_id=p_org),
 'members',coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',p.display_name,'inherit_company',coalesce(a.inherit_company,true),'hours',coalesce(a.hours,'[]'),'blocks',coalesce(a.blocks,'[]'),'revision',coalesce(a.revision,0),'outside_count',(SELECT count(*) FROM public.appointments x WHERE x.organization_id=p_org AND x.responsible_id=m.user_id AND x.state='confirmed' AND x.ends_at>now() AND NOT private.employee_available(p_org,m.user_id,x.starts_at,x.ends_at))) ORDER BY p.display_name) FROM public.organization_members m JOIN public.profiles p ON p.id=m.user_id LEFT JOIN private.employee_availability a ON a.organization_id=m.organization_id AND a.user_id=m.user_id WHERE m.organization_id=p_org AND private.availability_own_member(p_org,m.user_id)),'[]'));
END;$$;
CREATE FUNCTION public.employee_availability_save(p_org uuid,p_user uuid,p_revision integer,p_inherit boolean,p_hours jsonb,p_blocks jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b jsonb; a private.employee_availability; n integer; normalized jsonb='[]'; tz text; start_ timestamptz; end_ timestamptz; BEGIN
 PERFORM private.permission_require(p_org,'people.manage'); PERFORM pg_advisory_xact_lock(734921501);
 IF NOT private.availability_own_member(p_org,p_user) THEN RAISE EXCEPTION 'availability_member_denied' USING errcode='42501'; END IF;
 SELECT * INTO a FROM private.employee_availability WHERE organization_id=p_org AND user_id=p_user FOR UPDATE;
 IF coalesce(a.revision,0) IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'availability_revision_conflict' USING errcode='40001'; END IF;
 IF p_inherit IS NULL OR NOT private.availability_hours_valid(p_hours) OR p_blocks IS NULL OR jsonb_typeof(p_blocks)<>'array' OR jsonb_array_length(p_blocks)>200 THEN RAISE EXCEPTION 'availability_invalid' USING errcode='22023'; END IF;
 SELECT timezone INTO tz FROM public.organizations WHERE id=p_org;
 FOR b IN SELECT value FROM jsonb_array_elements(p_blocks) LOOP
 IF b?'date' THEN
 IF (b->>'date') IS NULL OR (b->>'date')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'availability_invalid' USING errcode='22023'; END IF;
 start_=((b->>'date')::date+case when coalesce((b->>'all_day')::boolean,false)then time '00:00'else(b->>'open')::time end)AT TIME ZONE tz;
 end_=case when coalesce((b->>'all_day')::boolean,false)then((b->>'date')::date+interval '1 day')AT TIME ZONE tz else((b->>'date')::date+(b->>'close')::time)AT TIME ZONE tz end;
 b=b||jsonb_build_object('start',start_,'end',end_); END IF;
 IF NOT(b ?& array['start','end']) OR (b->>'start')::timestamptz IS NULL OR (b->>'end')::timestamptz IS NULL OR (b->>'start')::timestamptz>=(b->>'end')::timestamptz THEN RAISE EXCEPTION 'availability_invalid' USING errcode='22023'; END IF;
 normalized=normalized||jsonb_build_array(b);
 END LOOP;
 p_blocks=normalized;
 INSERT INTO private.employee_availability(organization_id,user_id,inherit_company,hours,blocks) VALUES(p_org,p_user,p_inherit,p_hours,p_blocks) ON CONFLICT(organization_id,user_id) DO UPDATE SET inherit_company=excluded.inherit_company,hours=excluded.hours,blocks=excluded.blocks,revision=employee_availability.revision+1 RETURNING * INTO a;
 SELECT count(*) INTO n FROM public.appointments x WHERE x.organization_id=p_org AND x.responsible_id=p_user AND x.state='confirmed' AND x.ends_at>now() AND NOT private.employee_available(p_org,p_user,x.starts_at,x.ends_at);
 RETURN to_jsonb(a)||jsonb_build_object('outside_count',n);
END;$$;
CREATE FUNCTION private.appointment_availability_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pub public.consumer_publications; BEGIN
 IF NEW.kind<>'booking' OR NEW.state<>'confirmed' OR NEW.responsible_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.starts_at=OLD.starts_at AND NEW.ends_at=OLD.ends_at AND NEW.responsible_id IS NOT DISTINCT FROM OLD.responsible_id AND NEW.state=OLD.state THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(734921501);
 pub=private.consumer_publication((SELECT slug FROM public.organizations WHERE id=NEW.organization_id));
 IF NOT private.availability_contains(pub.payload->'hours',pub.payload->>'timezone',NEW.starts_at,NEW.ends_at) THEN RAISE EXCEPTION 'availability_company_closed' USING errcode='23P01'; END IF;
 IF NOT private.employee_available(NEW.organization_id,NEW.responsible_id,NEW.starts_at,NEW.ends_at) THEN RAISE EXCEPTION 'professional_unavailable' USING errcode='23P01'; END IF;
 IF EXISTS(SELECT 1 FROM public.appointments a WHERE a.responsible_id=NEW.responsible_id AND a.id<>NEW.id AND a.kind='booking' AND a.state='confirmed' AND a.slot&&tstzrange(NEW.starts_at,NEW.ends_at,'[)')) THEN RAISE EXCEPTION 'professional_conflict' USING errcode='23P01'; END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER appointment_availability_guard BEFORE INSERT OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION private.appointment_availability_guard();
CREATE FUNCTION public.operations_assign_responsible(p_org uuid,p_id uuid,p_user uuid,p_revision integer,p_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.appointments; payload jsonb; prior jsonb; BEGIN
 PERFORM private.permission_require(p_org,'agenda.manage'); PERFORM pg_advisory_xact_lock(734921501);
 payload=jsonb_build_array(p_id,p_user,p_revision); prior=private.consumer_idem(p_org,'assign_responsible',p_key,payload); IF prior IS NOT NULL THEN RETURN prior; END IF;
 SELECT * INTO a FROM public.appointments WHERE organization_id=p_org AND id=p_id FOR UPDATE;
 IF a.id IS NULL OR (p_user IS NOT NULL AND NOT private.availability_own_member(p_org,p_user)) THEN RAISE EXCEPTION 'availability_member_denied' USING errcode='42501'; END IF;
 IF a.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'appointment_revision_conflict' USING errcode='40001'; END IF;
 IF a.kind<>'booking' OR a.state<>'confirmed' OR a.execution_state<>'scheduled' THEN RAISE EXCEPTION 'service_already_started' USING errcode='22023'; END IF;
 UPDATE public.appointments SET responsible_id=p_user WHERE id=a.id RETURNING * INTO a;
 PERFORM private.consumer_remember(p_org,'assign_responsible',p_key,payload,to_jsonb(a)); RETURN to_jsonb(a);
END;$$;
-- Extend the existing planner at its slot predicate; retain its split/order/buffer engine.
CREATE FUNCTION private.execution_responsible_slot(p_pub uuid,p_start timestamptz,p_minutes integer,p_ignore uuid[],p_part integer) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.appointments; org uuid; buffer_ integer; BEGIN
 IF NOT private.execution_slot_allowed(p_pub,p_start,p_minutes,p_ignore) THEN RETURN false; END IF;
 IF coalesce(cardinality(p_ignore),0)=0 THEN RETURN true; END IF;
 SELECT * INTO a FROM public.appointments WHERE id=ANY(p_ignore) AND part_number=p_part AND kind='booking' AND state='confirmed' LIMIT 1;
 IF a.responsible_id IS NULL THEN RETURN true; END IF;
 SELECT s.organization_id,s.buffer_minutes INTO org,buffer_ FROM public.consumer_publications v JOIN public.schedule_resources s ON s.organization_id=v.organization_id WHERE v.id=p_pub;
 RETURN private.employee_available(org,a.responsible_id,p_start,p_start+make_interval(mins=>p_minutes+buffer_)) AND NOT EXISTS(SELECT 1 FROM public.appointments x WHERE x.responsible_id=a.responsible_id AND x.state='confirmed' AND x.kind='booking' AND NOT(x.id=ANY(p_ignore)) AND x.slot&&tstzrange(p_start,p_start+make_interval(mins=>p_minutes+buffer_),'[)'));
END;$$;
REVOKE ALL ON FUNCTION private.execution_responsible_slot(uuid,timestamptz,integer,uuid[],integer) FROM PUBLIC,anon,authenticated,service_role;
DO $$DECLARE d text; BEGIN
 d=pg_get_functiondef('private.execution_plan(uuid,timestamptz,integer,text,integer,uuid[])'::regprocedure);
 d=replace(d,'private.execution_slot_allowed(p_pub,p_start,p_minutes,p_ignore)','private.execution_responsible_slot(p_pub,p_start,p_minutes,p_ignore,1)');
 d=replace(d,'private.execution_slot_allowed(p_pub,cursor_,1,p_ignore)','private.execution_responsible_slot(p_pub,cursor_,1,p_ignore,jsonb_array_length(parts)+1)');
 d=replace(d,'private.execution_slot_allowed(p_pub,candidate,1,p_ignore)','private.execution_responsible_slot(p_pub,candidate,1,p_ignore,jsonb_array_length(parts)+1)');
 d=replace(d,'private.execution_slot_allowed(p_pub,cursor_,mid,p_ignore)','private.execution_responsible_slot(p_pub,cursor_,mid,p_ignore,jsonb_array_length(parts)+1)'); EXECUTE d;
 d=pg_get_functiondef('private.execution_validate_plan(public.quote_requests,timestamptz,jsonb,integer)'::regprocedure);
 d=replace(d,' actual=private.execution_plan', $patch$ IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_periods)WITH ORDINALITY part(v,n) JOIN public.appointments a ON a.id=ANY(ids) AND a.part_number=part.n WHERE a.responsible_id IS NOT NULL AND NOT private.employee_available(a.organization_id,a.responsible_id,(part.v->>'start')::timestamptz,(part.v->>'reserved_until')::timestamptz)) THEN RAISE EXCEPTION 'professional_unavailable' USING errcode='23P01'; END IF;
 actual=private.execution_plan$patch$); EXECUTE d;
END;$$;
-- Enrich the existing detail in one RPC; no request per employee.
DO $$DECLARE d text; BEGIN
 d=pg_get_functiondef('private.v029_operations_detail(uuid,uuid)'::regprocedure);
 d=replace(d,'''appointment'',to_jsonb(a)', '''responsibles'',coalesce((select jsonb_agg(jsonb_build_object(''id'',m.user_id,''name'',p.display_name)order by p.display_name)from public.organization_members m join public.profiles p on p.id=m.user_id where m.organization_id=p_org and private.availability_own_member(p_org,m.user_id)),''[]''),''appointment'',to_jsonb(a)'); EXECUTE d;
 d=pg_get_functiondef('public.permissions_team(uuid)'::regprocedure); d=replace(d,'''catalog'',','''availability'',public.employee_availability_context(p_org),''catalog'','); EXECUTE d;
 -- Replanning must preserve the responsible of each existing part by its ordinal.
 d=pg_get_functiondef('private.central_book_core(text,timestamptz,text,uuid)'::regprocedure);
 d=replace(d,'r jsonb;begin','r jsonb;responsibles jsonb;begin');
 d=replace(d,'group_=case when', 'select coalesce(jsonb_object_agg(part_number::text,responsible_id),''{}'')into responsibles from public.appointments where id=any(ids); if exists(select 1 from public.appointments where id=any(ids)and responsible_id is not null and part_number>jsonb_array_length(plan))then raise exception ''responsible_replan_review_required''using errcode=''22023'';end if; group_=case when');
 d=replace(d,'execution_group,part_number,service_minutes)values','execution_group,part_number,service_minutes,responsible_id)values');
 d=replace(d,$patch$ordinal_,(part->>'minutes')::integer)returning$patch$, $patch$ordinal_,(part->>'minutes')::integer,(responsibles->>ordinal_::text)::uuid)returning$patch$); EXECUTE d;
END;$$;

-- Shared human policy, deliberately unconfigured until the owner supplies commercial values.
CREATE TABLE private.assisted_policy(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), active boolean NOT NULL DEFAULT false,
 hours jsonb NOT NULL DEFAULT '[]' CHECK(private.availability_hours_valid(hours)), timezone text NOT NULL DEFAULT 'UTC',
 outside_message text NOT NULL DEFAULT 'A equipe compartilhada está fora do horário de atendimento. Sua mensagem ficará registrada.',
 revision integer NOT NULL DEFAULT 1, CHECK(length(btrim(outside_message)) BETWEEN 10 AND 400)
);
INSERT INTO private.assisted_policy DEFAULT VALUES;
CREATE TABLE private.assisted_plan_policy(
 plan_version_id uuid PRIMARY KEY REFERENCES public.billing_plan_versions(id), included integer CHECK(included>=0),
 warning_at integer CHECK(warning_at>=0), revision integer NOT NULL DEFAULT 1,
 CHECK((included IS NULL AND warning_at IS NULL) OR (included IS NOT NULL AND warning_at IS NOT NULL AND warning_at<=included))
);
CREATE TABLE private.assisted_cycles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 plan_version_id uuid NOT NULL REFERENCES public.billing_plan_versions(id), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 reference text NOT NULL CHECK(length(reference) BETWEEN 1 AND 160), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(ends_at>starts_at),UNIQUE(organization_id,reference),UNIQUE(organization_id,id),
 EXCLUDE USING gist(organization_id extensions.gist_uuid_ops WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&)
);
CREATE TABLE private.assisted_consumption(
 organization_id uuid NOT NULL, cycle_id uuid NOT NULL,ticket_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(cycle_id,ticket_id),
 FOREIGN KEY(organization_id,cycle_id) REFERENCES private.assisted_cycles(organization_id,id),
 FOREIGN KEY(organization_id,ticket_id) REFERENCES public.tickets(organization_id,id)
);
DO $$DECLARE n text; BEGIN FOREACH n IN ARRAY array['assisted_policy','assisted_plan_policy','assisted_cycles','assisted_consumption'] LOOP
 EXECUTE format('alter table private.%I enable row level security',n); EXECUTE format('alter table private.%I force row level security',n);
 EXECUTE format('revoke all on private.%I from public,anon,authenticated,service_role',n);
 EXECUTE format('create trigger %I after insert or update or delete on private.%I for each row execute function private.company_audit()',n||'_audit',n);
 END LOOP; END;$$;
CREATE TRIGGER assisted_consumption_immutable BEFORE UPDATE OR DELETE ON private.assisted_consumption FOR EACH ROW EXECUTE FUNCTION private.consumer_deny_immutable();
CREATE TRIGGER assisted_cycles_immutable BEFORE UPDATE OR DELETE ON private.assisted_cycles FOR EACH ROW EXECUTE FUNCTION private.consumer_deny_immutable();
CREATE TABLE private.assisted_policy_history(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid, entity text NOT NULL, before_value jsonb, after_value jsonb, created_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE private.assisted_policy_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.assisted_policy_history FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.assisted_policy_history FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER assisted_history_immutable BEFORE UPDATE OR DELETE ON private.assisted_policy_history FOR EACH ROW EXECUTE FUNCTION private.consumer_deny_immutable();
CREATE FUNCTION private.assisted_config_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN INSERT INTO private.assisted_policy_history(actor_id,entity,before_value,after_value) VALUES(auth.uid(),TG_TABLE_NAME,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) END,to_jsonb(NEW));RETURN NEW;END;$$;
CREATE TRIGGER assisted_policy_history AFTER UPDATE ON private.assisted_policy FOR EACH ROW EXECUTE FUNCTION private.assisted_config_history();
CREATE TRIGGER assisted_plan_history AFTER INSERT OR UPDATE ON private.assisted_plan_policy FOR EACH ROW EXECUTE FUNCTION private.assisted_config_history();
CREATE FUNCTION private.assisted_open() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT active AND private.availability_contains(hours,timezone,statement_timestamp(),statement_timestamp()+interval '1 microsecond') FROM private.assisted_policy;
$$;
CREATE FUNCTION public.assisted_policy_save(p_revision integer,p_active boolean,p_hours jsonb,p_timezone text,p_message text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a private.assisted_policy; BEGIN
 IF NOT private.has_global_role('super_admin') THEN RAISE EXCEPTION 'access_denied' USING errcode='42501'; END IF;
 PERFORM pg_advisory_xact_lock(734921501); SELECT * INTO a FROM private.assisted_policy FOR UPDATE;
 IF a.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'availability_revision_conflict' USING errcode='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) OR p_active IS NULL OR NOT private.availability_hours_valid(p_hours) OR (p_active AND jsonb_array_length(p_hours)=0) THEN RAISE EXCEPTION 'availability_invalid' USING errcode='22023'; END IF;
 UPDATE private.assisted_policy SET active=p_active,hours=p_hours,timezone=p_timezone,outside_message=p_message,revision=revision+1 RETURNING * INTO a; RETURN to_jsonb(a);
END;$$;
CREATE FUNCTION public.assisted_plan_save(p_version uuid,p_revision integer,p_included integer,p_warning integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a private.assisted_plan_policy; BEGIN
 IF NOT private.has_global_role('super_admin') THEN RAISE EXCEPTION 'access_denied' USING errcode='42501'; END IF;
 IF (p_included IS NULL) IS DISTINCT FROM (p_warning IS NULL) OR p_included<0 OR p_warning<0 OR p_warning>p_included THEN RAISE EXCEPTION 'availability_invalid' USING errcode='22023'; END IF;
 PERFORM pg_advisory_xact_lock(734921501);
 IF NOT EXISTS(SELECT 1 FROM public.billing_plan_versions WHERE id=p_version AND human_support) THEN RAISE EXCEPTION 'human_support_required' USING errcode='42501'; END IF;
 SELECT * INTO a FROM private.assisted_plan_policy WHERE plan_version_id=p_version FOR UPDATE;
 IF coalesce(a.revision,0) IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'availability_revision_conflict' USING errcode='40001'; END IF;
 INSERT INTO private.assisted_plan_policy(plan_version_id,included,warning_at) VALUES(p_version,p_included,p_warning) ON CONFLICT(plan_version_id) DO UPDATE SET included=excluded.included,warning_at=excluded.warning_at,revision=assisted_plan_policy.revision+1 RETURNING * INTO a; RETURN to_jsonb(a);
END;$$;
CREATE FUNCTION public.assisted_cycle_start(p_org uuid,p_version uuid,p_start timestamptz,p_end timestamptz,p_reference text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a private.assisted_cycles; BEGIN
 IF NOT private.has_global_role('super_admin') THEN RAISE EXCEPTION 'access_denied' USING errcode='42501'; END IF;
 PERFORM pg_advisory_xact_lock(734921501);
 IF NOT EXISTS(SELECT 1 FROM public.billing_plan_versions WHERE id=p_version AND human_support) THEN RAISE EXCEPTION 'human_support_required' USING errcode='42501'; END IF;
 SELECT * INTO a FROM private.assisted_cycles WHERE organization_id=p_org AND reference=p_reference;
 IF a.id IS NOT NULL THEN IF a.plan_version_id<>p_version OR a.starts_at<>p_start OR a.ends_at<>p_end THEN RAISE EXCEPTION 'idempotency_conflict' USING errcode='22023'; END IF; RETURN a.id; END IF;
 INSERT INTO private.assisted_cycles(organization_id,plan_version_id,starts_at,ends_at,reference) VALUES(p_org,p_version,p_start,p_end,p_reference) RETURNING id INTO a.id; RETURN a.id;
END;$$;
CREATE FUNCTION private.assisted_usage(p_org uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.assisted_cycles; v public.billing_plan_versions; p private.assisted_plan_policy; used_ integer; s public.billing_subscriptions; BEGIN
 v=private.billing_effective_version(p_org); SELECT * INTO c FROM private.assisted_cycles WHERE organization_id=p_org AND statement_timestamp()>=starts_at AND statement_timestamp()<ends_at;
 SELECT * INTO s FROM public.billing_subscriptions WHERE organization_id=p_org;
 SELECT * INTO p FROM private.assisted_plan_policy WHERE plan_version_id=coalesce(c.plan_version_id,v.id);
 SELECT count(*) INTO used_ FROM private.assisted_consumption WHERE organization_id=p_org AND cycle_id=c.id;
 RETURN jsonb_build_object('cycle_id',c.id,'plan_version_id',coalesce(c.plan_version_id,v.id),'start',coalesce(c.starts_at,s.period_start),'end',coalesce(c.ends_at,s.period_end),'used',used_,'included',p.included,'warning_at',p.warning_at,'eligible',private.entitlement(p_org,'human_support'),'state',CASE WHEN NOT private.entitlement(p_org,'human_support') THEN 'not_included' WHEN p.included IS NULL THEN 'unconfigured' WHEN c.id IS NULL AND NOT coalesce(statement_timestamp()>=s.period_start AND statement_timestamp()<s.period_end,false) THEN 'cycle_required' WHEN used_>=p.included THEN 'exhausted' WHEN used_>=p.warning_at THEN 'warning' ELSE 'available' END,'human_open',coalesce(private.assisted_open(),false));
END;$$;
CREATE FUNCTION public.assisted_company_usage(p_org uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM private.permission_require(p_org,'billing.manage'); RETURN private.assisted_usage(p_org)||jsonb_build_object('history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'start',c.starts_at,'end',c.ends_at,'used',(SELECT count(*) FROM private.assisted_consumption u WHERE u.cycle_id=c.id)) ORDER BY c.starts_at DESC) FROM private.assisted_cycles c WHERE c.organization_id=p_org),'[]')); END;$$;
CREATE FUNCTION public.assisted_admin_context() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN IF NOT private.has_global_role('super_admin') THEN RAISE EXCEPTION 'access_denied' USING errcode='42501'; END IF;
 RETURN jsonb_build_object('configuration_history',coalesce((SELECT jsonb_agg(to_jsonb(x))FROM(SELECT * FROM private.assisted_policy_history ORDER BY id DESC LIMIT 100)x),'[]'),'policy',(SELECT to_jsonb(p) FROM private.assisted_policy p),'versions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'name',p.name,'version',v.version,'included',a.included,'warning_at',a.warning_at,'revision',coalesce(a.revision,0)) ORDER BY p.name,v.version DESC) FROM public.billing_plan_versions v JOIN public.billing_plans p ON p.id=v.plan_id LEFT JOIN private.assisted_plan_policy a ON a.plan_version_id=v.id WHERE v.human_support),'[]'),'companies',coalesce((SELECT jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'usage',private.assisted_usage(o.id)) ORDER BY o.name) FROM public.organizations o),'[]'),'audit',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT actor_id,action,entity_table,entity_key,changed_fields,created_at FROM public.audit_logs WHERE entity_table LIKE 'assisted_%' ORDER BY id DESC LIMIT 100)x),'[]'),'consumption',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT u.*,t.public_code FROM private.assisted_consumption u JOIN public.tickets t ON t.id=u.ticket_id ORDER BY u.created_at DESC LIMIT 100)x),'[]'));
END;$$;
CREATE FUNCTION private.assisted_assert_open(p_org uuid) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.entitlement(p_org,'human_support') THEN RAISE EXCEPTION 'human_support_required' USING errcode='42501'; END IF;
 IF NOT coalesce(private.assisted_open(),false) THEN RAISE EXCEPTION 'assisted_outside_hours' USING errcode='42501'; END IF;
END;$$;
CREATE FUNCTION private.assisted_consume(p_org uuid,p_ticket uuid,p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.assisted_cycles; v public.billing_plan_versions; p private.assisted_plan_policy; s public.billing_subscriptions; BEGIN
 PERFORM pg_advisory_xact_lock(734921501); PERFORM private.assisted_assert_open(p_org);
 SELECT * INTO c FROM private.assisted_cycles WHERE organization_id=p_org AND statement_timestamp()>=starts_at AND statement_timestamp()<ends_at;
 v=private.billing_effective_version(p_org);
 IF c.id IS NULL THEN
 SELECT * INTO s FROM public.billing_subscriptions WHERE organization_id=p_org;
 IF NOT coalesce(statement_timestamp()>=s.period_start AND statement_timestamp()<s.period_end,false) THEN RAISE EXCEPTION 'assisted_cycle_required' USING errcode='22023'; END IF;
 INSERT INTO private.assisted_cycles(organization_id,plan_version_id,starts_at,ends_at,reference) VALUES(p_org,v.id,s.period_start,s.period_end,'subscription:'||s.period_start::text) RETURNING * INTO c;
 END IF;
 IF EXISTS(SELECT 1 FROM private.assisted_consumption WHERE cycle_id=c.id AND ticket_id=p_ticket) THEN RETURN; END IF;
 SELECT * INTO p FROM private.assisted_plan_policy WHERE plan_version_id=c.plan_version_id;
 IF p.included IS NULL THEN RAISE EXCEPTION 'assisted_unconfigured' USING errcode='22023'; END IF;
 IF (SELECT count(*) FROM private.assisted_consumption WHERE cycle_id=c.id)>=p.included THEN RAISE EXCEPTION 'assisted_limit_reached' USING errcode='42501'; END IF;
 INSERT INTO private.assisted_consumption(organization_id,cycle_id,ticket_id,actor_id) VALUES(p_org,c.id,p_ticket,p_actor);
END;$$;
CREATE FUNCTION private.assisted_actor(p_org uuid,p_actor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT private.syzia_identity(p_actor) AND EXISTS(SELECT 1 FROM public.attendant_organizations WHERE organization_id=p_org AND user_id=p_actor AND status='active'); $$;
CREATE FUNCTION private.assisted_ticket_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.assignee_id IS NOT NULL AND private.assisted_actor(NEW.organization_id,NEW.assignee_id) AND (TG_OP='INSERT' OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id) THEN
 PERFORM private.assisted_consume(NEW.organization_id,NEW.id,NEW.assignee_id);
 END IF; RETURN NEW;
END;$$;
CREATE TRIGGER assisted_ticket_guard AFTER INSERT OR UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION private.assisted_ticket_guard();
-- Historical usage is retained. Current shared activity uses the cycle ledger; own/customer activity does not consume it.
ALTER FUNCTION private.billing_ticket_service() RENAME TO billing_ticket_service_044;
CREATE FUNCTION private.billing_ticket_service() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; tid uuid; BEGIN
 IF TG_TABLE_NAME='ticket_messages' THEN IF NEW.kind='customer' THEN RETURN NEW; END IF; actor=NEW.author_id;tid=NEW.ticket_id;
 ELSE actor=NEW.actor_id;tid=NEW.ticket_id; END IF;
 IF actor IS NOT NULL AND private.assisted_actor(NEW.organization_id,actor) THEN
 PERFORM private.assisted_assert_open(NEW.organization_id);
 -- A legacy assigned ticket is accounted on its first shared action after upgrade; idempotent within the cycle.
 PERFORM private.assisted_consume(NEW.organization_id,tid,actor);
 END IF;
 RETURN NEW;
END;$$;
-- Trigger functions cannot be delegated by a SELECT. Keep historical triggers on their original OID;
-- replace their binding explicitly with the new implementation.
DROP TRIGGER billing_ticket_message ON public.ticket_messages;
DROP TRIGGER billing_ticket_action ON public.ticket_events;
CREATE TRIGGER billing_ticket_message BEFORE INSERT ON public.ticket_messages FOR EACH ROW EXECUTE FUNCTION private.billing_ticket_service();
CREATE TRIGGER billing_ticket_action BEFORE INSERT ON public.ticket_events FOR EACH ROW EXECUTE FUNCTION private.billing_ticket_service();
-- Consumer messages remain enabled. Human status is informational and never gates the composer.
DO $$DECLARE d text; BEGIN
 d=pg_get_functiondef('public.central_consumer_thread(text)'::regprocedure);
 d=replace(d,'''available'',', '''shared_open'',coalesce(private.assisted_open(),false),''shared_message'',case when not private.entitlement(q.organization_id,''human_support'')then null when private.assisted_open()then ''A equipe compartilhada está em horário de atendimento. O retorno depende da fila.''else(select outside_message from private.assisted_policy)end,''available'','); EXECUTE d;
END;$$;
DO $$DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND (p.proname LIKE 'availability_%' OR p.proname LIKE 'employee_%' OR p.proname LIKE 'assisted_%' OR p.proname='appointment_availability_guard') LOOP EXECUTE format('revoke all on function %s from public,anon,authenticated,service_role',f.sig); END LOOP;
 FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'employee_availability_%' OR p.proname LIKE 'assisted_%' OR p.proname='operations_assign_responsible') LOOP EXECUTE format('revoke all on function %s from public,anon,service_role',f.sig);EXECUTE format('grant execute on function %s to authenticated',f.sig); END LOOP;
END;$$;
REVOKE ALL ON FUNCTION private.billing_ticket_service(),private.billing_ticket_service_044() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;

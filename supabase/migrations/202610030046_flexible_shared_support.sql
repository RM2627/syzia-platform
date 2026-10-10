-- Controlled refinement of 045: operational presence, without new schedules or quotas.
BEGIN;

ALTER TABLE private.assisted_policy ADD COLUMN availability_mode text NOT NULL DEFAULT 'flexible'
  CHECK (availability_mode IN ('flexible','scheduled'));
-- Preserve any configured 045 policy. An untouched, inactive policy starts flexible.
UPDATE private.assisted_policy SET availability_mode='scheduled'
 WHERE active OR jsonb_array_length(hours)>0;

CREATE FUNCTION public.assisted_policy_mode_save(p_revision integer,p_active boolean,p_hours jsonb,p_timezone text,p_message text,p_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a private.assisted_policy;
BEGIN
 IF NOT private.has_global_role('super_admin') THEN RAISE EXCEPTION 'access_denied' USING errcode='42501'; END IF;
 PERFORM pg_advisory_xact_lock(734921501);
 SELECT * INTO a FROM private.assisted_policy FOR UPDATE;
 IF a.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'availability_revision_conflict' USING errcode='40001'; END IF;
 IF p_mode IS NULL OR p_mode NOT IN ('flexible','scheduled') OR p_active IS NULL
    OR NOT private.availability_hours_valid(p_hours)
    OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_timezone)
    OR (p_active AND p_mode='scheduled' AND jsonb_array_length(p_hours)=0)
 THEN RAISE EXCEPTION 'availability_invalid' USING errcode='22023'; END IF;
 UPDATE private.assisted_policy SET active=p_active,hours=p_hours,timezone=p_timezone,
   outside_message=p_message,availability_mode=p_mode,revision=revision+1 RETURNING * INTO a;
 RETURN to_jsonb(a);
END;$$;

-- Keep the 045 RPC and its scheduled semantics for existing clients/tests.
CREATE OR REPLACE FUNCTION public.assisted_policy_save(p_revision integer,p_active boolean,p_hours jsonb,p_timezone text,p_message text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RETURN public.assisted_policy_mode_save(p_revision,p_active,p_hours,p_timezone,p_message,'scheduled'); END;$$;

-- This predicate describes policy permission, not a promise of an online human.
CREATE OR REPLACE FUNCTION private.assisted_open() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT active AND (availability_mode='flexible' OR
   private.availability_contains(hours,timezone,statement_timestamp(),statement_timestamp()+interval '1 microsecond'))
 FROM private.assisted_policy;
$$;

CREATE FUNCTION private.assisted_can_receive(p_org uuid,p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.assisted_actor(p_org,p_user) AND private.central_eligible(p_org,p_user)
   AND EXISTS(SELECT 1 FROM public.work_sessions WHERE user_id=p_user AND ended_at IS NULL AND presence='available');
$$;

CREATE FUNCTION private.assisted_ready(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(private.assisted_open(),false) AND private.entitlement(p_org,'human_support')
   AND EXISTS(SELECT 1 FROM public.attendant_organizations a
     WHERE a.organization_id=p_org AND a.status='active' AND private.assisted_can_receive(p_org,a.user_id));
$$;

CREATE OR REPLACE FUNCTION private.assisted_ticket_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.assignee_id IS NOT NULL AND private.assisted_actor(NEW.organization_id,NEW.assignee_id)
    AND (TG_OP='INSERT' OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id) THEN
   PERFORM pg_advisory_xact_lock(734921501);
   IF NOT private.assisted_can_receive(NEW.organization_id,NEW.assignee_id) THEN
     RAISE EXCEPTION 'assisted_presence_required' USING errcode='42501';
   END IF;
   PERFORM private.assisted_consume(NEW.organization_id,NEW.id,NEW.assignee_id);
 END IF;
 RETURN NEW;
END;$$;

CREATE FUNCTION private.assisted_ticket_status(p_org uuid,p_ticket uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.tickets; u jsonb; counted boolean;
BEGIN
 SELECT * INTO t FROM public.tickets WHERE id=p_ticket AND organization_id=p_org;
 u=private.assisted_usage(p_org);
 counted=EXISTS(SELECT 1 FROM private.assisted_consumption WHERE organization_id=p_org AND ticket_id=t.id AND cycle_id=(u->>'cycle_id')::uuid);
 RETURN jsonb_build_object('mode',u->>'availability_mode',
   'eligible',(u->>'eligible')::boolean,'policy_open',(u->>'policy_open')::boolean,
   'team_available',(u->>'human_open')::boolean,'actor_shared',private.assisted_actor(p_org,auth.uid()),
   'actor_available',private.assisted_can_receive(p_org,auth.uid()),'limit_state',u->>'state','counted',counted,
   'waiting',coalesce((u->>'eligible')::boolean AND t.routing_scope='support' AND t.state='queued' AND t.assignee_id IS NULL,false));
END;$$;

-- Add current policy/readiness to the existing aggregate payloads, with the same authorization.
DO $$DECLARE d text; anchor text;
BEGIN
 d=pg_get_functiondef('private.assisted_usage(uuid)'::regprocedure);
 anchor='''human_open'',coalesce(private.assisted_open(),false)';
 IF position(anchor IN d)=0 THEN RAISE EXCEPTION '046_usage_anchor_missing'; END IF;
 d=replace(d,anchor,'''availability_mode'',(SELECT availability_mode FROM private.assisted_policy),''policy_active'',(SELECT active FROM private.assisted_policy),''policy_open'',coalesce(private.assisted_open(),false),''support_hours'',(SELECT hours FROM private.assisted_policy),''support_timezone'',(SELECT timezone FROM private.assisted_policy),''human_open'',private.assisted_ready(p_org)');
 EXECUTE d;
 d=pg_get_functiondef('public.central_context(text)'::regprocedure);
 anchor='perform private.permission_leave(depth_);return result_;';
 IF position(anchor IN d)=0 THEN RAISE EXCEPTION '046_context_anchor_missing'; END IF;
 d=replace(d,anchor,$patch$result_=result_||jsonb_build_object('shared_support',private.assisted_ticket_status(org_,(result_->'ticket'->>'id')::uuid),'recipients',coalesce((SELECT jsonb_agg(r||jsonb_build_object('shared_can_receive',CASE WHEN private.assisted_actor(org_,(r->>'id')::uuid) THEN private.assisted_can_receive(org_,(r->>'id')::uuid) ELSE true END)) FROM jsonb_array_elements(result_->'recipients')r),'[]'));perform private.permission_leave(depth_);return result_;$patch$);
 EXECUTE d;
END;$$;

CREATE OR REPLACE FUNCTION public.central_consumer_thread(p_request text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.quote_requests;t public.tickets;ready_ boolean;message_ text;
BEGIN
 SELECT * INTO q FROM public.quote_requests WHERE public_code=p_request;
 IF q.id IS NULL OR NOT private.central_customer(q.id) THEN RAISE EXCEPTION 'request_access_denied' USING errcode='42501'; END IF;
 SELECT * INTO t FROM public.tickets WHERE request_id=q.id ORDER BY created_at DESC,id DESC LIMIT 1;
 ready_=private.assisted_ready(q.organization_id);
 IF private.entitlement(q.organization_id,'human_support') THEN
   SELECT CASE WHEN availability_mode='scheduled' AND NOT coalesce(private.assisted_open(),false) THEN outside_message
     ELSE 'Recebemos sua mensagem. A equipe responsável responderá assim que estiver disponível.' END INTO message_
   FROM private.assisted_policy;
 END IF;
 RETURN jsonb_build_object('shared_open',ready_,'shared_message',message_,
   'available',EXISTS(SELECT 1 FROM public.company_settings WHERE organization_id=q.organization_id AND(human_enabled OR private.people_solo_conversation(q.organization_id))),
   'code',t.public_code,'state',t.state,'can_send',private.central_customer(q.id,true),
   'messages',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',m.kind,'name',m.author_name,'body',m.body,'at',m.created_at) ORDER BY m.created_at,m.id) FROM public.ticket_messages m WHERE m.ticket_id=t.id),'[]'));
END;$$;

REVOKE ALL ON FUNCTION private.assisted_can_receive(uuid,uuid),private.assisted_ready(uuid),private.assisted_ticket_status(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.assisted_policy_mode_save(integer,boolean,jsonb,text,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.assisted_policy_mode_save(integer,boolean,jsonb,text,text,text) TO authenticated;
COMMIT;

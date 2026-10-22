-- SYZIA 059: narrowly scoped personal identity session completion.
-- Do not change access_register_session or allow cross-user/context takeover.
BEGIN;
CREATE FUNCTION public.access_complete_personal_session(
 p_user uuid,p_session uuid,p_account uuid,p_generation integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a private.enterprise_accounts; s private.enterprise_sessions; idle integer;
BEGIN
 PERFORM pg_advisory_xact_lock(734921501);
 IF p_user IS NULL OR p_session IS NULL OR p_account IS NULL OR p_generation IS NULL THEN RETURN false; END IF;
 PERFORM private.require_eligible_user(p_user);
 SELECT * INTO a FROM private.enterprise_accounts
  WHERE id=p_account AND user_id=p_user AND organization_id IS NULL
    AND role='person' AND state='active' AND generation=p_generation;
 IF a.id IS NULL THEN RETURN false; END IF;
 SELECT * INTO s FROM private.enterprise_sessions WHERE session_id=p_session FOR UPDATE;
 IF s.session_id IS NULL OR s.user_id IS DISTINCT FROM p_user OR s.revoked
    OR s.organization_id IS NOT NULL OR s.account_id IS NOT NULL THEN RETURN false; END IF;
 SELECT idle_seconds INTO idle FROM private.access_policy;
 IF idle IS NULL OR s.last_activity <= clock_timestamp()-make_interval(secs=>idle) THEN RETURN false; END IF;
 UPDATE private.enterprise_sessions SET account_id=a.id,generation=a.generation,
  organization_id=NULL,last_activity=clock_timestamp()
  WHERE session_id=p_session AND user_id=p_user AND NOT revoked;
 RETURN FOUND;
END;$$;
REVOKE ALL ON FUNCTION public.access_complete_personal_session(uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.access_complete_personal_session(uuid,uuid,uuid,integer) TO service_role;
COMMIT;

-- SYZIA HF02: conservative recovery of a completed, stranded change.
-- New service-role-only function; no historical migrations are modified.
BEGIN;
CREATE FUNCTION public.billing056_recover_completed_change(
  p_id uuid, p_lease uuid, p_snapshot jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  c private.billing047_contracts;
  request_time timestamptz;
  changed_time timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(734921501);
  SELECT * INTO c FROM private.billing047_contracts WHERE id=p_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'billing_binding_missing'; END IF;
  IF c.lease IS DISTINCT FROM p_lease OR c.lease_until <= clock_timestamp() THEN
    RAISE EXCEPTION 'billing_lease_conflict';
  END IF;
  IF c.operation IS DISTINCT FROM 'change' OR c.operation_state IS DISTINCT FROM 'uncertain'
     OR c.target_version IS NOT NULL OR c.target_amount IS NOT NULL
     OR c.target_code IS NOT NULL OR c.target_requested_at IS NOT NULL
     OR c.target_effective_at IS NOT NULL
     OR c.state IS DISTINCT FROM 'active' OR c.provider_state IS DISTINCT FROM 'authorized'
     OR c.paid_until IS NULL OR c.paid_until <= clock_timestamp()
     OR c.cancel_requested THEN
    RAISE EXCEPTION 'billing_reconciliation_required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM private.billing047_commands cmd
    WHERE cmd.organization_id=c.organization_id AND cmd.contract_id=c.id
      AND cmd.key=c.operation_id AND cmd.action='change'
      AND cmd.version_id=c.plan_version_id
  ) THEN RAISE EXCEPTION 'billing_reconciliation_required'; END IF;
  SELECT max(created_at) INTO request_time FROM private.billing047_audit
    WHERE contract_id=c.id AND event='change_requested';
  SELECT max(created_at) INTO changed_time FROM private.billing047_audit
    WHERE contract_id=c.id AND event='plan_changed';
  IF request_time IS NULL OR changed_time IS NULL OR changed_time <= request_time
     OR NOT EXISTS (
       SELECT 1 FROM private.billing047_payments pay
       WHERE pay.contract_id=c.id AND pay.state='paid'
         AND pay.amount_cents=c.amount_cents AND pay.paid_at >= request_time
         AND pay.paid_at <= changed_time AND pay.period_end=c.paid_until
     ) THEN RAISE EXCEPTION 'billing_reconciliation_required'; END IF;
  -- Snapshot must have been obtained and independently validated by the backend.
  IF p_snapshot->>'provider_id' IS DISTINCT FROM c.provider_id
     OR p_snapshot->>'state' IS DISTINCT FROM 'authorized'
     OR p_snapshot->>'amount_cents' IS DISTINCT FROM c.amount_cents::text
     OR p_snapshot->>'modified_at' IS NULL
     OR (p_snapshot->>'modified_at')::timestamptz IS DISTINCT FROM c.provider_modified_at
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(COALESCE(p_snapshot->'payments','[]'::jsonb)) pay
       WHERE pay->>'status'='paid' AND (pay->>'amount_cents')::int=c.amount_cents
         AND (pay->>'period_end')::timestamptz=c.paid_until
     ) THEN RAISE EXCEPTION 'billing_reconciliation_required'; END IF;
  UPDATE private.billing047_contracts
     SET operation_state='done', error_code=NULL, provider_http_status=NULL,
         provider_error_stage=NULL, validation_check=NULL,
         lease=NULL, lease_until=NULL, checked_at=clock_timestamp()
   WHERE id=c.id;
  INSERT INTO private.billing047_audit(contract_id,event,state)
    VALUES(c.id,'completed_change_recovered',c.state);
  RETURN jsonb_build_object('state',c.state,'operation_pending',false,'recovered',true);
END;$$;
REVOKE ALL ON FUNCTION public.billing056_recover_completed_change(uuid,uuid,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing056_recover_completed_change(uuid,uuid,jsonb) TO service_role;
COMMIT;

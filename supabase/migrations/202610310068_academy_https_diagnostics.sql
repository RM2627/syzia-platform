begin;
-- Only extends the strict diagnostic validator. No table, grants, states or historical data change.
create or replace function academy.check_mail_diagnostic(d jsonb) returns void language plpgsql set search_path='' as $$
begin

 -- HTTP metadata is distinct from the untouched six-field SMTP contract.
 if d->>'transport'='https_resend' then
  if jsonb_typeof(d)<>'object' or not d ?& array['transport','status','error_code','category','stage','http_status','provider_code','network_code','provider_id'] or
   (d-array['transport','status','error_code','category','stage','http_status','provider_code','network_code','provider_id'])<>'{}'::jsonb or
   coalesce(d->>'status','') not in('accepted','failed','uncertain') or
   coalesce(d->>'category','') not in('accepted','definitive','temporary','uncertain') or
   coalesce(d->>'error_code','') not in('','email_not_configured','email_delivery_failed','email_temporary_failure','email_authentication_failed','email_recipient_or_sender_rejected','email_rate_limited') or
   coalesce(d->>'stage','') not in('configuration','prepare','dns','connection','tls','request','response','authentication','authorization','validation','rate_limit','provider','idempotency','accepted') or
   coalesce(d->>'network_code','') not in('NONE','UNKNOWN','ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ENETUNREACH','EHOSTUNREACH','ETIMEDOUT','ECONNRESET','EPIPE','EPROTO','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','ERR_TLS_CERT_ALTNAME_INVALID','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED') or
   coalesce(d->>'provider_code','') not in('NONE','UNKNOWN','invalid_idempotency_key','validation_error','missing_api_key','restricted_api_key','invalid_permission','suspended_api_key','not_found','method_not_allowed','concurrent_idempotent_requests','invalid_idempotent_request','resource_locked','invalid_attachment','invalid_parameter','missing_required_field','missing_required_parameter','daily_quota_exceeded','monthly_quota_exceeded','rate_limit_exceeded','application_error','service_unavailable') or
   not(d->'http_status'='null'::jsonb or(jsonb_typeof(d->'http_status')='number' and (d->>'http_status')~'^[2-5][0-9]{2}$')) or
   not(d->'provider_id'='null'::jsonb or(jsonb_typeof(d->'provider_id')='string' and (d->>'provider_id')~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')) or
   (d->>'category'='accepted') is distinct from (d->>'status'='accepted') or
   (d->>'category'='uncertain') is distinct from (d->>'status'='uncertain')
  then raise exception 'academy_invalid';end if;
  if d->>'status'='accepted' then
   if d->>'stage'<>'accepted' or (d->'error_code')<>'""'::jsonb or d->'provider_id'='null'::jsonb or d->'http_status'='null'::jsonb or (d->>'http_status')::integer not between 200 and 299 or d->>'provider_code'<>'NONE' or d->>'network_code'<>'NONE' then raise exception 'academy_invalid';end if;
  elsif coalesce(d->>'error_code','')='' or d->'provider_id'<>'null'::jsonb then raise exception 'academy_invalid';end if;
  return;
 end if;
 if d is null or jsonb_typeof(d) <> 'object' or
   not d ?& array['status','error_code','category','stage','smtp_code','response_code'] or
   (d-array['status','error_code','category','stage','smtp_code','response_code']) <> '{}'::jsonb or
   coalesce(d->>'status','') not in('accepted','failed','uncertain') or
   coalesce(d->>'error_code','') not in('','email_not_configured','email_delivery_failed','email_temporary_failure','email_authentication_failed','email_recipient_or_sender_rejected','email_rate_limited') or
   coalesce(d->>'category','') not in('accepted','definitive','temporary','uncertain') or
   coalesce(d->>'stage','') not in('accepted','prepare','configuration','dns','connection','greeting','authentication','sender','recipient','message','tls','connection_or_socket','unknown') or
   coalesce(d->>'smtp_code','') not in('NONE','UNKNOWN','EAUTH','ENOAUTH','EDNS','ENOTFOUND','EAI_AGAIN','ETIMEDOUT','ECONNECTION','ECONNRESET','ECONNREFUSED','ESOCKET','ETLS','EPROTOCOL','EENVELOPE','EMESSAGE','ESTREAM','EFILEACCESS','EURLACCESS','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','ERR_TLS_CERT_ALTNAME_INVALID','UNABLE_TO_VERIFY_LEAF_SIGNATURE','email_not_configured','email_delivery_failed') or
   not (d->'response_code'='null'::jsonb or (jsonb_typeof(d->'response_code')='number' and (d->>'response_code') ~ '^[45][0-9]{2}$')) or
   (d->>'category'='accepted') is distinct from (d->>'status'='accepted') or
   (d->>'category'='uncertain') is distinct from (d->>'status'='uncertain')
 then raise exception 'academy_invalid';end if;
end;$$;
commit;

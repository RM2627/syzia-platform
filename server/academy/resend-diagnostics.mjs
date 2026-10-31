// Explicit enums only. Provider text, headers and bodies never become diagnostic data.
export const providerCodes = [
  "NONE",
  "UNKNOWN",
  "invalid_idempotency_key",
  "validation_error",
  "missing_api_key",
  "restricted_api_key",
  "invalid_permission",
  "suspended_api_key",
  "not_found",
  "method_not_allowed",
  "concurrent_idempotent_requests",
  "invalid_idempotent_request",
  "resource_locked",
  "invalid_attachment",
  "invalid_parameter",
  "missing_required_field",
  "missing_required_parameter",
  "daily_quota_exceeded",
  "monthly_quota_exceeded",
  "rate_limit_exceeded",
  "application_error",
  "service_unavailable",
];
export const networkCodes = [
  "NONE",
  "UNKNOWN",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ETIMEDOUT",
  "ECONNRESET",
  "EPIPE",
  "EPROTO",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED",
];
export const stages = [
  "configuration",
  "prepare",
  "dns",
  "connection",
  "tls",
  "request",
  "response",
  "authentication",
  "authorization",
  "validation",
  "rate_limit",
  "provider",
  "idempotency",
  "accepted",
];
export const errorCodes = [
  "",
  "email_not_configured",
  "email_delivery_failed",
  "email_temporary_failure",
  "email_authentication_failed",
  "email_recipient_or_sender_rejected",
  "email_rate_limited",
];
export const uuid = (v) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export function httpsDiagnostic({
  stage = "response",
  category = "uncertain",
  error_code = "email_delivery_failed",
  http_status = null,
  provider_code = "NONE",
  network_code = "NONE",
  provider_id = null,
} = {}) {
  return {
    transport: "https_resend",
    status:
      category === "accepted"
        ? "accepted"
        : category === "uncertain"
          ? "uncertain"
          : "failed",
    error_code,
    category,
    stage,
    http_status,
    provider_code,
    network_code,
    provider_id,
  };
}
export function sanitizeHttpsDiagnostic(d) {
  const fallback = () => httpsDiagnostic();
  if (
    !d ||
    d.transport !== "https_resend" ||
    !stages.includes(d.stage) ||
    !errorCodes.includes(d.error_code) ||
    !["accepted", "definitive", "temporary", "uncertain"].includes(
      d.category,
    ) ||
    !providerCodes.includes(d.provider_code) ||
    !networkCodes.includes(d.network_code) ||
    !(
      d.http_status === null ||
      (Number.isInteger(d.http_status) &&
        d.http_status >= 200 &&
        d.http_status <= 599)
    ) ||
    !(d.provider_id === null || uuid(d.provider_id))
  )
    return fallback();
  const r = httpsDiagnostic(d);
  if (
    d.status !== r.status ||
    (r.category === "accepted" &&
      (r.stage !== "accepted" ||
        r.error_code !== "" ||
        !uuid(r.provider_id) ||
        r.http_status < 200 ||
        r.http_status >= 300 ||
        r.provider_code !== "NONE" ||
        r.network_code !== "NONE")) ||
    (r.category !== "accepted" &&
      (r.error_code === "" || r.provider_id !== null))
  )
    return fallback();
  return r;
}
export const httpsFailure = (d) =>
  Object.assign(Error("academy_mail_failed"), {
    academyDiagnostic: sanitizeHttpsDiagnostic(d),
  });
export function httpOutcome(status, body) {
  const code =
    providerCodes.includes(body?.name) &&
    !["NONE", "UNKNOWN"].includes(body.name)
      ? body.name
      : "UNKNOWN";
  const args = { http_status: status, provider_code: code };
  if (status >= 200 && status < 300) {
    if (
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      uuid(body.id) &&
      !body.name
    )
      return httpsDiagnostic({
        ...args,
        category: "accepted",
        stage: "accepted",
        error_code: "",
        provider_code: "NONE",
        provider_id: body.id,
      });
    return httpsDiagnostic({ ...args, provider_code: "UNKNOWN" });
  }
  if (status === 401)
    return httpsDiagnostic({
      ...args,
      category: "definitive",
      stage: "authentication",
      error_code: "email_authentication_failed",
    });
  if (status === 403)
    return httpsDiagnostic({
      ...args,
      category: "definitive",
      stage: "authorization",
      error_code:
        code === "validation_error"
          ? "email_recipient_or_sender_rejected"
          : "email_authentication_failed",
    });
  if (status === 400 || status === 422)
    return httpsDiagnostic({
      ...args,
      category: "definitive",
      stage: "validation",
      error_code: "email_delivery_failed",
    });
  if (status === 429)
    return httpsDiagnostic({
      ...args,
      category: "temporary",
      stage: "rate_limit",
      error_code: "email_rate_limited",
    });
  if (status === 409)
    return httpsDiagnostic({
      ...args,
      stage: "idempotency",
      error_code: "email_delivery_failed",
    });
  if (status >= 500)
    return httpsDiagnostic({
      ...args,
      stage: "provider",
      error_code: "email_temporary_failure",
    });
  if (status >= 400 && status !== 408)
    return httpsDiagnostic({
      ...args,
      category: "definitive",
      stage: "response",
      error_code: "email_delivery_failed",
    });
  return httpsDiagnostic({ ...args });
}
export function networkOutcome(error, submitted) {
  const code = networkCodes.includes(error?.code) ? error.code : "UNKNOWN";
  if (submitted)
    return httpsDiagnostic({
      stage: "request",
      error_code: "email_temporary_failure",
      network_code: code,
    });
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code))
    return httpsDiagnostic({
      stage: "dns",
      category: "temporary",
      error_code: "email_temporary_failure",
      network_code: code,
    });
  const tls =
    code.startsWith("CERT_") ||
    code.startsWith("ERR_TLS_") ||
    [
      "EPROTO",
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "SELF_SIGNED_CERT_IN_CHAIN",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    ].includes(code);
  return httpsDiagnostic({
    stage: tls ? "tls" : "connection",
    category: tls ? "definitive" : "temporary",
    error_code: tls ? "email_delivery_failed" : "email_temporary_failure",
    network_code: code,
  });
}

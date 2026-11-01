// Endpoint-scoped diagnostics. Only closed local labels may leave this module.
// These are exact recognition signatures, NOT an official provider error-code
// catalogue. Unknown messages/codes never become log fields or payment decisions.
const signatures = new Map([
  ["bad_request", "request_validation"], ["bad-request", "request_validation"],
  ["bad request", "request_validation"], ["invalid_request", "request_validation"],
  ["validation_error", "request_validation"],
  ["payer_email is required", "payer_email_required"],
  ["payer_email cannot be null", "payer_email_required"],
  ["payer_email is invalid", "payer_email_invalid"],
  ["invalid payer_email", "payer_email_invalid"],
  ["invalid payer email", "payer_email_invalid"],
  ["card_token_id is required", "card_token_required"],
  ["card_token_id cannot be null", "card_token_required"],
  ["invalid card_token_id", "card_token_invalid"],
  ["invalid card token", "card_token_invalid"],
  ["card token is expired", "card_token_expired"],
  ["card token service not found", "card_token_lookup_failed"],
  ["preapproval_plan_id is required", "plan_required"],
  ["invalid preapproval_plan_id", "plan_invalid"],
  ["preapproval_plan_id is invalid", "plan_invalid"],
  ["both payer and collector must be real or test users", "environment_mismatch"],
  ["payer and collector cannot be equal", "payer_collector_conflict"],
  ["the payer and collector must be different users", "payer_collector_conflict"],
  ["back_url must be a valid url", "back_url_invalid"],
  ["notification_url must be a valid url", "notification_url_invalid"],
]);
const reasons = new Set([...signatures.values(), "multiple_validations"]);
const outcomes = new Set(["recognized", "unrecognized", "invalid_schema", "invalid_json",
  "too_large", "unsupported_content_type", "unavailable", "read_timeout"]);
const scoped = e => e?.providerStage === "create" && [400, 422].includes(e?.providerStatus);
const record = v => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (v, keys) => record(v) && Object.keys(v).every(k => keys.includes(k));
const string = (v, limit) => typeof v === "string" && v.length <= limit;

function classify(body, status) {
  if (!exact(body, ["message", "error", "status", "cause"]) ||
      (Object.hasOwn(body, "status") && body.status !== status) ||
      (Object.hasOwn(body, "message") && !string(body.message, 512)) ||
      (Object.hasOwn(body, "error") && !string(body.error, 128)) ||
      (Object.hasOwn(body, "cause") && (!Array.isArray(body.cause) || body.cause.length > 8 ||
        body.cause.some(c => !exact(c, ["code", "description"]) ||
          (Object.hasOwn(c, "description") && !string(c.description, 512)) ||
          (Object.hasOwn(c, "code") && !string(c.code, 128) && !Number.isSafeInteger(c.code))))))
    return { providerDiagnostic: "invalid_schema" };
  const recognized = new Set();
  for (const value of [body.message, body.error, ...(body.cause || []).flatMap(c => [c.code, c.description])]) {
    // Full-string equality only: no substring matching, dynamic values or echo.
    const reason = typeof value === "string" ? signatures.get(value.trim().toLowerCase().replace(/\.$/, "")) : undefined;
    if (reason) recognized.add(reason);
  }
  if (recognized.size > 1) recognized.delete("request_validation");
  return recognized.size ? { providerDiagnostic: "recognized",
    providerReason: recognized.size === 1 ? [...recognized][0] : "multiple_validations" }
    : { providerDiagnostic: "unrecognized" };
}

// The known HTTP refusal must remain definitive even if its diagnostic body is
// malformed, slow or unreadable. Never use response.text()/json() without a bound.
export async function readPreapprovalDiagnostic(response, signal) {
  const limit = 8192;
  let reader, timer, abortListener;
  const cancel = () => { try { Promise.resolve(reader ? reader.cancel() : response.body?.cancel()).catch(() => {}); } catch {} };
  try {
    const length = response.headers?.get("content-length");
    if (length && /^\d+$/.test(length) && Number(length) > limit)
      return { providerDiagnostic: "too_large" };
    if (!/^application\/(?:[a-z0-9.-]+\+)?json(?:\s*;|$)/i.test(response.headers?.get("content-type") || ""))
      return { providerDiagnostic: "unsupported_content_type" };
    if (!response.body?.getReader) return { providerDiagnostic: "unavailable" };
    if (signal?.aborted) return { providerDiagnostic: "read_timeout" };
    reader = response.body.getReader();
    const stop = Symbol("diagnostic_timeout");
    const deadline = new Promise(resolve => {
      timer = setTimeout(() => resolve(stop), 500);
      abortListener = () => resolve(stop);
      signal?.addEventListener("abort", abortListener, { once: true });
    });
    const chunks = []; let size = 0;
    for (let reads = 0; ; reads++) {
      if (reads >= 128) return { providerDiagnostic: "too_large" };
      const part = await Promise.race([reader.read(), deadline]);
      if (part === stop) return { providerDiagnostic: "read_timeout" };
      if (part.done) break;
      if (!(part.value instanceof Uint8Array)) return { providerDiagnostic: "unavailable" };
      size += part.value.byteLength;
      if (size > limit) return { providerDiagnostic: "too_large" };
      chunks.push(Buffer.from(part.value));
    }
    let body;
    try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size))); }
    catch { return { providerDiagnostic: "invalid_json" }; }
    return classify(body, response.status);
  } catch {
    return { providerDiagnostic: signal?.aborted ? "read_timeout" : "unavailable" };
  } finally {
    clearTimeout(timer);
    if (abortListener) signal?.removeEventListener("abort", abortListener);
    cancel(); // Cancellation is deliberately nonblocking (a broken stream may hang).
    try { reader?.releaseLock(); } catch {}
  }
}
export function providerFailure(status, path, method) {
  const providerStage = path === "/preapproval" && method === "POST" ? "create"
    : path.startsWith("/preapproval_plan/") ? "plan"
    : method === "PUT" ? "update" : "lookup";
  const code = status === 401 ? "billing_provider_authentication"
    : status === 403 ? "billing_provider_forbidden"
    : status === 404 ? (providerStage === "plan" ? "billing_plan_unavailable" : "billing_resource_missing")
    : status === 429 ? "billing_provider_rate_limited"
    : status >= 500 || status === 408 ? "billing_provider_unavailable"
    : status === 409 ? "billing_provider_conflict"
    : status === 400 || status === 422 ? "billing_provider_invalid_request"
    : "billing_provider_rejected";
  return { code, providerStatus: Number.isInteger(status) && status >= 400 && status <= 599 ? status : null,
    providerStage, definitiveRejection: [400, 401, 403, 422].includes(status) };
}
export function safeDiagnostic(error) {
  const checks = ["provider_id", "external_reference", "collector_id", "application_id", "plan_id", "recurrence", "currency", "amount", "version", "status", "payer_id", "invoice_subscription", "invoice_reference", "invoice_currency", "payment_id", "payment_collector", "payment_currency", "payment_amount", "payment_reference", "payment_payer", "trial_duration", "trial_dates", "first_charge", "snapshot", "local_history"];
  return {
    ...(checks.includes(error?.validationCheck) ? { validation_check: error.validationCheck } : {}),
    ...(Number.isInteger(error?.providerStatus) && error.providerStatus >= 400 && error.providerStatus <= 599 ? { provider_status: error.providerStatus } : {}),
    ...(["create", "plan", "update", "lookup"].includes(error?.providerStage) ? { provider_stage: error.providerStage } : {}),
    ...(scoped(error) && outcomes.has(error?.providerDiagnostic) ? { provider_diagnostic: error.providerDiagnostic } : {}),
    ...(scoped(error) && error?.providerDiagnostic === "recognized" && reasons.has(error?.providerReason)
      ? { provider_reason: error.providerReason } : {}),
  };
}

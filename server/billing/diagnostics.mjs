// Endpoint-scoped diagnostics. No body, headers, IDs or arbitrary provider text.
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
  };
}

const reasons = new Set([
  "access_denied",
  "permission_denied",
  "company_admin_required",
  "company_media_access_denied",
  "session_expired",
  "account_inactive",
  "organization_suspended",
  "verification_required",
  "billing_feature_unavailable",
  "billing_subscription_required",
  "upload_expired_or_closed",
  "media_not_ready",
  "invalid_image_metadata",
  "invalid_image_size",
  "invalid_image_type",
  "invalid_image_content",
  "storage_unavailable",
  "operation_rejected",
  "origin_denied",
  "rate_limit",
  "session_required",
]);
export function safeDiagnostic(error, operation, status, organization) {
  return {
    event: "operation_failed",
    operation: /^[a-z_]+$/.test(operation || "") ? operation : "unknown",
    organization: /^[a-f0-9-]{36}$/.test(organization || "")
      ? organization
      : null,
    category: ["42501", "401", "403"].includes(String(error?.code || status))
      ? "authorization"
      : operation?.startsWith("storage_")
        ? "storage"
        : "operation",
    reason: reasons.has(error?.message) ? error.message : "unclassified",
    code: /^[A-Z0-9]{5}$/.test(error?.code || "") ? error.code : undefined,
    status: Number.isInteger(Number(status)) ? Number(status) : undefined,
  };
}

// Allowlisted metadata only. Never return error.message, response, command, address or cause.
const codes = new Set([
  "EAUTH",
  "ENOAUTH",
  "EDNS",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ECONNECTION",
  "ECONNRESET",
  "ECONNREFUSED",
  "ESOCKET",
  "ETLS",
  "EPROTOCOL",
  "EENVELOPE",
  "EMESSAGE",
  "ESTREAM",
  "EFILEACCESS",
  "EURLACCESS",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "email_not_configured",
  "email_delivery_failed",
]);
export function mailDiagnostic(error, phase = "smtp") {
  const code = codes.has(error?.code) ? error.code : "UNKNOWN";
  const response =
    Number.isInteger(error?.responseCode) &&
    error.responseCode >= 400 &&
    error.responseCode <= 599
      ? error.responseCode
      : null;
  const command = typeof error?.command === "string" ? error.command : "";
  let stage = /^AUTH(?:[ :]|$)/.test(command)
    ? "authentication"
    : /^MAIL FROM(?:[ :]|$)/.test(command)
      ? "sender"
      : /^RCPT TO(?:[ :]|$)/.test(command)
        ? "recipient"
        : command === "DATA" || command === "."
          ? "message"
          : ["STARTTLS"].includes(command)
            ? "tls"
            : ["EHLO", "HELO", "LHLO"].includes(command)
              ? "greeting"
              : command === "CONN"
                ? "connection_or_socket"
                : "unknown";
  let category = "uncertain",
    status = "uncertain",
    error_code = "email_delivery_failed";
  if (phase === "prepare") {
    stage = "prepare";
    category = "definitive";
    error_code = "email_delivery_failed";
  } else if (phase === "recipient_rejected") {
    stage = "recipient";
    category = "definitive";
    error_code = "email_recipient_or_sender_rejected";
  } else if (code === "email_not_configured") {
    stage = "configuration";
    category = "definitive";
    error_code = code;
  } else if (["EDNS", "ENOTFOUND", "EAI_AGAIN"].includes(code)) {
    stage = "dns";
    category = "temporary";
    error_code = "email_temporary_failure";
  } else if (
    code === "ETIMEDOUT" &&
    ["Connection timeout", "Greeting never received"].includes(error?.message)
  ) {
    // These exact constants in the pinned Nodemailer are emitted only before SMTP authentication.
    stage = error.message === "Connection timeout" ? "connection" : "greeting";
    category = "temporary";
    error_code = "email_temporary_failure";
  } else if (["EAUTH", "ENOAUTH"].includes(code)) {
    stage = "authentication";
    category = response && response < 500 ? "temporary" : "definitive";
    error_code = "email_authentication_failed";
  } else if (
    [
      "ETLS",
      "CERT_HAS_EXPIRED",
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "ERR_TLS_CERT_ALTNAME_INVALID",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    ].includes(code)
  ) {
    stage = "tls";
    category = "definitive";
    error_code = "email_delivery_failed";
  } else if (response) {
    category = response < 500 ? "temporary" : "definitive";
    error_code =
      response < 500
        ? "email_temporary_failure"
        : ["sender", "recipient"].includes(stage)
          ? "email_recipient_or_sender_rejected"
          : "email_delivery_failed";
  } else if (
    [
      "ETIMEDOUT",
      "ECONNECTION",
      "ECONNRESET",
      "ECONNREFUSED",
      "ESOCKET",
    ].includes(code)
  )
    error_code = "email_temporary_failure";
  // CONN alone is NOT proof of failure before transmission: Nodemailer uses it for socket timeout after DATA too.
  if (category !== "uncertain") status = "failed";
  return {
    status,
    error_code,
    category,
    stage,
    smtp_code: code,
    response_code: response,
  };
}
export function diagnosed(error, phase) {
  return Object.assign(new Error("academy_mail_failed"), {
    academyDiagnostic: mailDiagnostic(error, phase),
  });
}
export const acceptedDiagnostic = () => ({
  status: "accepted",
  error_code: "",
  category: "accepted",
  stage: "accepted",
  smtp_code: "NONE",
  response_code: null,
});
export function safeDiagnostic(error) {
  // Only our wrapper creates this object. Still rebuild from enums before persisting/logging.
  const d = error?.academyDiagnostic;
  if (!d) return mailDiagnostic(error);
  const stages = [
    "prepare",
    "configuration",
    "dns",
    "connection",
    "greeting",
    "authentication",
    "sender",
    "recipient",
    "message",
    "tls",
    "connection_or_socket",
    "unknown",
  ];
  if (
    !["definitive", "temporary", "uncertain"].includes(d.category) ||
    !stages.includes(d.stage) ||
    (!codes.has(d.smtp_code) && d.smtp_code !== "UNKNOWN") ||
    ![
      "email_not_configured",
      "email_delivery_failed",
      "email_temporary_failure",
      "email_authentication_failed",
      "email_recipient_or_sender_rejected",
      "email_rate_limited",
    ].includes(d.error_code)
  )
    return mailDiagnostic({});
  return {
    status: d.category === "uncertain" ? "uncertain" : "failed",
    error_code: d.error_code,
    category: d.category,
    stage: d.stage,
    smtp_code: d.smtp_code,
    response_code:
      Number.isInteger(d.response_code) &&
      d.response_code >= 400 &&
      d.response_code <= 599
        ? d.response_code
        : null,
  };
}

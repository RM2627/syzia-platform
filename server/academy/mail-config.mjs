// Academy-only selection. No implicit transport, credential reuse or fallback.
export function academyMailReady(env) {
  if (
    env.ACADEMY_MAIL_ENABLED !== "true" ||
    env.ACCESS_MAIL_ENABLED !== "true" ||
    typeof env.ACCESS_MAIL_FROM !== "string" ||
    !env.ACCESS_MAIL_FROM.trim() ||
    /[\x00-\x1f\x7f]/.test(env.ACCESS_MAIL_FROM)
  )
    return false;
  if (env.ACADEMY_MAIL_TRANSPORT === "https_resend")
    return (
      typeof env.ACADEMY_RESEND_API_KEY === "string" &&
      /^[\x21-\x7e]{8,512}$/.test(env.ACADEMY_RESEND_API_KEY)
    );
  if (env.ACADEMY_MAIL_TRANSPORT === "smtp")
    return (
      !!env.ACCESS_SMTP_HOST &&
      !!env.ACCESS_SMTP_USER &&
      !!env.ACCESS_SMTP_PASSWORD &&
      [465, 587].includes(Number(env.ACCESS_SMTP_PORT || 587))
    );
  return false;
}

import nodemailer from "nodemailer";
const mailError = (code) => Object.assign(new Error(code), { code });
export function deliveryError(error) {
  if (error?.code === "email_not_configured") return "email_not_configured";
  if ([421, 450, 451, 452].includes(error?.responseCode))
    return "email_rate_limited";
  if (["ETIMEDOUT", "ECONNECTION", "ECONNRESET", "EDNS"].includes(error?.code))
    return "email_temporary_failure";
  return "email_delivery_failed";
}
export function instructionMessage(value, origin) {
  if (
    typeof value.email !== "string" ||
    !/^[^\s@<>,;:()\[\]\\"]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value.email)
  )
    throw mailError("email_delivery_failed");
  const url = new URL("/ativar-acesso", origin);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw mailError("email_not_configured");
  if (!/^[A-Za-z0-9_-]{43}$/.test(value.activation_link || ""))
    throw mailError("email_delivery_failed");
  url.hash = new URLSearchParams({ access: value.activation_link }).toString();
  const text = `Seu acesso à SYZIA foi preparado.\n\nEmpresa: ${value.company_name}\nUsuário: ${value.username}\nCódigo temporário: ${value.temporary_code}\nVálido até: ${new Date(value.expires_at).toISOString()} (UTC).\n\nAbra ${url.href}, informe o código temporário e crie sua própria senha.\nO código temporário expira, só pode ser usado uma vez e não é sua senha definitiva. Não compartilhe estas instruções com outras pessoas.\n\nSYZIA — Onde tudo se alinha.`;
  return {
    to: value.email,
    subject: "SYZIA — suas instruções de primeiro acesso",
    text,
  };
}
// No connection is made until an authorized delivery is requested. No provider is preselected.
export function createAccessMailer(
  env,
  createTransport = nodemailer.createTransport,
) {
  if (env.ACCESS_MAIL_ENABLED !== "true")
    return async () => {
      throw mailError("email_not_configured");
    };
  const port = Number(env.ACCESS_SMTP_PORT || 587);
  if (
    !env.ACCESS_SMTP_HOST ||
    !env.ACCESS_SMTP_USER ||
    !env.ACCESS_SMTP_PASSWORD ||
    !env.ACCESS_MAIL_FROM ||
    ![465, 587].includes(port)
  )
    return async () => {
      throw mailError("email_not_configured");
    };
  const transport = createTransport({
    host: env.ACCESS_SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: true,
    auth: { user: env.ACCESS_SMTP_USER, pass: env.ACCESS_SMTP_PASSWORD },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    dnsTimeout: 10000,
    logger: false,
    debug: false,
    transactionLog: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return async (value) => {
    const message = instructionMessage(value, env.PLATFORM_APP_ORIGIN);
    const result = await transport.sendMail({
      ...message,
      from: env.ACCESS_MAIL_FROM,
    });
    if (!result.accepted?.length || result.rejected?.length)
      throw mailError("email_delivery_failed");
    return { accepted: true }; // SMTP acceptance is not proof of inbox receipt.
  };
}

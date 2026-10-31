import { createAccessMailer, deliveryError } from "../access-mail.mjs";
import nodemailer from "nodemailer";
import { createResendHttpsMailer } from "./resend-https.mjs";
import { academyMailReady } from "./mail-config.mjs";
import { diagnosed } from "./mail-diagnostics.mjs";
import { email } from "./validation.mjs";
import { readFileSync } from "node:fs";
export { deliveryError };
const logo = readFileSync(
  new URL(
    "../../public/brand/syzia/syzia-horizontal-light.png",
    import.meta.url,
  ),
);
const escape = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const testSubject = "SYZIA Academy — teste de envio";
export const testBody =
  "Este é um teste de envio autorizado pelo administrador da SYZIA Academy. Nenhuma inscrição foi criada ou confirmada e nenhum aviso de lançamento foi disparado. Se você recebeu esta mensagem, informe ao administrador. A aceitação pelo servidor de e-mail não comprova entrega na caixa de entrada.";
export function message(v) {
  email(v.email);
  if (v.kind === "test")
    return {
      to: v.email,
      subject: testSubject,
      text: `SYZIA Academy\n\n${testSubject}\n\n${testBody}`,
      html: `<!doctype html><html lang="pt-BR"><body style="background:#f4f5ff;font:16px/1.65 Arial;color:#20202e"><main style="max-width:560px;padding:32px;background:white"><img src="cid:syzia-academy" width="180" alt="SYZIA"><h1>${testSubject}</h1><p>${testBody}</p></main></body></html>`,
      attachments: [
        {
          filename: "syzia.png",
          content: logo,
          cid: "syzia-academy",
          contentType: "image/png",
        },
      ],
    };
  const title =
    v.kind === "confirm"
      ? "Confirme sua inscrição gratuita"
      : v.kind === "login"
        ? "Seu acesso à SYZIA Academy"
        : v.subject;
  const body =
    v.kind === "confirm"
      ? "Você pediu para receber informações sobre o minicurso Do improviso à organização. Confirme seu e-mail para entrar na lista. Este link vale por 24 horas. Se não foi você, ignore esta mensagem."
      : v.kind === "login"
        ? "Use este link para acessar suas aulas e seu progresso. Ele expira em 15 minutos e funciona uma única vez. Não compartilhe. Se não pediu este acesso, ignore a mensagem."
        : v.body;
  return {
    to: v.email,
    subject: title,
    attachments: [
      {
        filename: "syzia.png",
        content: logo,
        cid: "syzia-academy",
        contentType: "image/png",
      },
    ],
    text: `SYZIA Academy\n\n${title}\n\n${body}\n\nAcessar: ${v.link}\n\nGratuito. Sem cartão e sem obrigação de contratar a SYZIA.\nPreferências e descadastro: ${v.preferences}\nContato: ${v.contact}`,
    html: `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f5ff;color:#20202e;font:16px/1.65 Arial,sans-serif"><main style="max-width:560px;margin:24px auto;padding:32px;background:white;border-radius:20px"><img src="cid:syzia-academy" width="180" alt="SYZIA — Onde tudo se alinha"><p style="color:#6c4dff">ACADEMY · APRENDER PARA APLICAR</p><h1 style="font-size:26px">${escape(title)}</h1><p style="white-space:pre-line">${escape(body)}</p><p><a href="${escape(v.link)}" style="display:inline-block;padding:14px 22px;background:#6041df;color:white;border-radius:8px">${v.kind === "confirm" ? "Confirmar inscrição" : "Acessar a Academy"}</a></p><p>Gratuito. Sem cartão e sem obrigação de contratar a SYZIA.</p><hr><p><a href="${escape(v.preferences)}">Preferências e descadastro</a><br>Contato: ${escape(v.contact)}</p></main></body></html>`,
  };
}
export function academyMailer(env, transport = nodemailer.createTransport, httpsOptions) {
  if (env.ACADEMY_MAIL_TRANSPORT === "https_resend") return createResendHttpsMailer(env, message, httpsOptions);
  if (env.ACADEMY_MAIL_TRANSPORT !== "smtp" || !academyMailReady(env)) return async () => { throw Object.assign(Error("email_not_configured"), {code:"email_not_configured"}); };
  const observedTransport = (options) => {
    const actual = transport(options);
    return {
      sendMail: async (mail) => {
        try {
          const result = await actual.sendMail(mail);
          if (!result?.accepted?.length || result.rejected?.length) {
            if (!result?.accepted?.length && result?.rejected?.length)
              throw diagnosed({ code: "EENVELOPE" }, "recipient_rejected");
            throw Object.assign(Error("acceptance_unknown"), {
              code: "email_delivery_failed",
            });
          }
          return result;
        } catch (error) {
          throw error?.academyDiagnostic ? error : diagnosed(error);
        }
      },
    };
  };
  return createAccessMailer(
    {
      ...env,
      ACCESS_MAIL_ENABLED:
        env.ACADEMY_MAIL_ENABLED === "true" &&
        env.ACCESS_MAIL_ENABLED === "true"
          ? "true"
          : "false",
    },
    observedTransport,
    (value) => {
      try {
        return message(value);
      } catch (error) {
        throw diagnosed(error, "prepare");
      }
    },
  );
}

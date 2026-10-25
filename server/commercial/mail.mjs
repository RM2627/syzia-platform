import { readFileSync } from "node:fs";
const logo = readFileSync(
  new URL(
    "../../public/brand/syzia/syzia-horizontal-light.png",
    import.meta.url,
  ),
);
import { createAccessMailer, deliveryError } from "../access-mail.mjs";
import { demoOrigin } from "./links.mjs";
export { deliveryError };
const escape = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function invitationMessage(value) {
  if (
    !/^[^\s@<>,;:()\[\]\\"]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(
      value.email || "",
    )
  )
    throw Object.assign(Error("email_delivery_failed"), {
      code: "email_delivery_failed",
    });
  const link = new URL(value.link),
    unsubscribe = new URL(value.unsubscribe);
  demoOrigin(link.origin);
  demoOrigin(unsubscribe.origin);
  if (
    !["demonstration", "activation"].includes(value.purpose) ||
    !value.contact ||
    /[\r\n]/.test(value.contact)
  )
    throw Error("email_not_configured");
  const activation = value.purpose === "activation";
  const heading = activation
    ? "Sua configuração está pronta para revisão"
    : "Conheça a experiência preparada para " + value.company;
  const body = activation
    ? "Entre com a identidade autorizada para este convite, confirme seu e-mail quando necessário e revise as configurações preparadas. Escolha o plano e continue pelo checkout oficial. A liberação depende das validações de identidade, elegibilidade e confirmação financeira. O link sozinho não inicia assinatura ou período grátis."
    : "A SYZIA conecta a página pública, os serviços, o atendimento e a agenda. Explore a apresentação preparada e conheça o painel por dentro. Este é um ambiente demonstrativo, com dados fictícios e sem cobranças ou operações reais.";
  const action = activation ? "Revisar preparação" : "Explorar demonstração";
  const footer = `Convite válido até ${new Date(value.expires_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Dúvidas ou interesse: ${value.contact}.`;
  return {
    attachments: [
      {
        filename: "syzia.png",
        content: logo,
        cid: "syzia-brand",
        contentType: "image/png",
      },
    ],
    to: value.email,
    subject: activation
      ? "SYZIA — convite para revisar e ativar " + value.company
      : "SYZIA — demonstração de " + value.company,
    text: `Olá, ${value.name}.\n\n${heading}\n\n${body}\n\n${action}: ${link.href}\n\n${footer}\n\nPara não receber novos convites: ${unsubscribe.href}\n\nSYZIA — Onde tudo se alinha.`,
    html: `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f7f9;color:#172b35;font:16px/1.6 Arial,sans-serif"><main style="max-width:580px;margin:24px auto;padding:32px;background:white;border-radius:18px"><img src="cid:syzia-brand" alt="SYZIA — Onde tudo se alinha" width="186" style="max-width:100%;height:auto"/><h1 style="font-size:24px">${escape(heading)}</h1><p>Olá, ${escape(value.name)}.</p><p>${escape(body)}</p><p><a style="display:inline-block;background:#0b6867;color:white;padding:12px 20px;border-radius:10px" href="${escape(link.href)}">${action}</a></p><p>${escape(footer)}</p><hr><p style="font-size:13px"><a href="${escape(unsubscribe.href)}">Não quero receber novos convites</a></p><p>Onde tudo se alinha.</p></main></body></html>`,
  };
}
export function createCommercialMailer(env, transport) {
  if (env.COMMERCIAL_MAIL_ENABLED !== "true")
    return async () => {
      throw Object.assign(Error("email_not_configured"), {
        code: "email_not_configured",
      });
    };
  return createAccessMailer(env, transport, invitationMessage);
}

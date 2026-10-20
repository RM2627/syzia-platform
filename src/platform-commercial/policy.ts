import type { Access } from "../api";
export function canSeeCommercial(access: Access | null) {
  return Boolean(
    access?.roles.includes("super_admin") ||
    (access?.identity?.kind === "syzia_staff" &&
      access.identity.permissions.includes("commercial.read")),
  );
}
export const commercialStages: Record<string, string> = {
  prospect: "Prospecto identificado",
  contacted: "Contato realizado",
  interested: "Demonstrou interesse",
  preparing: "Demonstração em preparação",
  demo_sent: "Demonstração enviada",
  demo_accessed: "Demonstração acessada",
  wants_trial: "Interessado em testar",
  activation_sent: "Convite de ativação enviado",
  registration_started: "Cadastro iniciado",
  trialing: "Trial ativo",
  paying: "Cliente pagante",
  not_interested: "Sem interesse",
  archived: "Arquivado",
};
export const manualStages = [
  "prospect",
  "contacted",
  "interested",
  "preparing",
  "wants_trial",
  "not_interested",
  "archived",
];
export function eligibleContact(
  contact: {
    stage: string;
    suppressed: boolean;
    authorizations: {
      purpose: string;
      authorized: boolean;
      expires_at: string;
    }[];
  } | null | undefined,
  purpose: string,
  now = Date.now(),
) {
  return Boolean(
    contact &&
    !contact.suppressed &&
    !["not_interested", "archived"].includes(contact.stage) &&
    contact.authorizations.some(
      (a) =>
        a.purpose === purpose &&
        a.authorized &&
        new Date(a.expires_at).getTime() > now,
    ) &&
    (purpose !== "activation" ||
      ["wants_trial", "activation_sent", "registration_started"].includes(
        contact.stage,
      ))
  );
}

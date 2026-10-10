export type AccessInstructions = {
  name?: string;
  reissued?: boolean;
  administrator_name?: string;
  company_name?: string;
  company_code?: string;
  activation_link: string;
  organization_id?: string | null;
  username: string;
  temporary_code: string;
  expires_at: string;
};
export function firstAccessLink(value: AccessInstructions, origin: string) {
  const url = new URL("/ativar-acesso", origin);
  // Opaque selector identifies the preparation; the separate code proves activation.
  if (!/^[A-Za-z0-9_-]{43}$/.test(value.activation_link))
    throw Error("activation_invalid");
  url.hash = new URLSearchParams({
    access: value.activation_link,
  }).toString();
  return url.href;
}
export function accessInstructions(value: AccessInstructions, origin: string) {
  return [
    value.reissued
      ? "Seu acesso à SYZIA foi atualizado."
      : "Seu acesso à SYZIA foi preparado.",
    value.company_name && value.organization_id
      ? `Empresa: ${value.company_name}`
      : "",
    `Usuário: ${value.username}`,
    `Código temporário: ${value.temporary_code}`,
    `Link de primeiro acesso: ${firstAccessLink(value, origin)}`,
    "Abra o link, informe o código temporário e crie sua senha pessoal. O código só pode ser usado uma vez.",
    value.reissued
      ? "O código e o link anteriores não são mais válidos. Use estas novas instruções."
      : "",
    `Validade: ${new Date(value.expires_at).toLocaleString("pt-BR")}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

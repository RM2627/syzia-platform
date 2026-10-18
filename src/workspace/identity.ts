import type { Access } from "../api";
// Display only. Authorization remains in the existing providers and backend.
export function globalIdentityLabel(access: Access | null) {
  if (access?.roles.includes("super_admin")) return "Super Admin";
  if (
    access?.identity?.kind === "syzia_staff" ||
    access?.roles.includes("atendente")
  )
    return "Equipe SYZIA";
  if (access?.identity?.kind === "consumer") return "Consumidor";
  return "Minha conta";
}
export function permissionIdentityLabel(role?: string) {
  return (
    (
      {
        super_admin: "Super Admin",
        admin_empresa: "Administrador",
        colaborador_empresa: "Colaborador",
        own_attendant: "Atendente próprio",
        shared_attendant: "Equipe SYZIA compartilhada",
      } as Record<string, string>
    )[role || ""] || "Acesso autorizado"
  );
}
export function companyIdentityLabel(access: Access | null, org: string) {
  if (!access?.organizations.some((o) => o.id === org && o.status === "active"))
    return "Empresa indisponível";
  if (access.roles.includes("super_admin")) return "Super Admin";
  const member = access.memberships.find(
    (m) =>
      m.organization_id === org &&
      m.user_id === access.profile.id &&
      m.status === "active",
  );
  if (!member) return "Consultar acesso";
  return permissionIdentityLabel(
    member.role === "admin_empresa"
      ? member.role
      : member.is_attendant
        ? "own_attendant"
        : member.role,
  );
}

// The origin determines the workspace; a URL never grants ticket access.
export function ticketPath(
  code: string,
  companyOrg?: string,
  { pending = false, panel }: { pending?: boolean; panel?: string } = {},
) {
  const query = new URLSearchParams();
  if (companyOrg) query.set("ticket", code);
  if (panel) query.set("panel", panel);
  const path = companyOrg
    ? `/painel/${encodeURIComponent(companyOrg)}/${pending ? "pendencias" : "atendimento"}`
    : `/central/${encodeURIComponent(code)}`;
  return path + (query.size ? `?${query}` : "");
}

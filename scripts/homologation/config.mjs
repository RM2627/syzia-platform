export const accountNames = [
  "root",
  "adminA",
  "adminB",
  "worker",
  "attendant",
  "unlinked",
];
export function validateConfig(c) {
  if (c?.testOnlyAcknowledged !== true)
    throw new Error(
      "Confirme testOnlyAcknowledged somente para um projeto dedicado, sem dados reais.",
    );
  if (
    typeof c.projectRef !== "string" ||
    !/^[a-z0-9]{10,40}$/.test(c.projectRef)
  )
    throw new Error("Informe a referência do projeto de teste.");
  if (c.url !== `https://${c.projectRef}.supabase.co`)
    throw new Error(
      "A URL HTTPS deve corresponder exatamente ao projeto de teste.",
    );
  const key = c.publishableKey;
  if (
    typeof key !== "string" ||
    key.includes("REPLACE") ||
    key.startsWith("sb_secret_")
  )
    throw new Error("Use somente chave pública publishable/anon.");
  if (!key.startsWith("sb_publishable_")) {
    let role;
    try {
      role = JSON.parse(
        Buffer.from(key.split(".")[1] || "", "base64url").toString(),
      ).role;
    } catch {
      throw new Error("Chave pública inválida.");
    }
    if (role !== "anon") throw new Error("Chave privilegiada recusada.");
  }
  const seen = new Set();
  for (const name of accountNames) {
    const a = c.accounts?.[name];
    if (
      !a ||
      typeof a.email !== "string" ||
      !a.email.includes("@") ||
      a.email.includes("REPLACE") ||
      typeof a.password !== "string" ||
      a.password.length < 12 ||
      a.password.includes("REPLACE")
    )
      throw new Error(`Preencha localmente a conta de teste ${name}.`);
    const email = a.email.toLowerCase();
    if (seen.has(email))
      throw new Error("As seis contas de teste devem ser distintas.");
    seen.add(email);
  }
  for (const key of ["a", "b"])
    if (!/^[0-9a-f-]{36}$/i.test(c.organizations?.[key] || ""))
      throw new Error("Informe IDs válidos das empresas fictícias.");
  if (c.organizations.a === c.organizations.b)
    throw new Error("As empresas de teste devem ser distintas.");
  return c;
}
export function safeError(e) {
  // Never copy provider message, URL, passwords, tokens or database details into a report.
  const code = String(e?.code || "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 50);
  return {
    category:
      e?.name === "AssertionError"
        ? "unexpected_result"
        : "request_or_setup_failure",
    code: code || null,
  };
}

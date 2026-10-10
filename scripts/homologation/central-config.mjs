// Preflight only; Auth /user must still verify every token before remote operations.
export function validateCentralConfig(c) {
  if (c?.testOnlyAcknowledged !== true || c?.realCustomerData !== false)
    throw Error("dedicated_test_project_required");
  if (
    !/^[a-z0-9]{10,40}$/.test(c.projectRef) ||
    c.url !== `https://${c.projectRef}.supabase.co`
  )
    throw Error("project_ref_mismatch");
  if (
    typeof c.publishableKey !== "string" ||
    c.publishableKey.includes("REPLACE") ||
    c.publishableKey.startsWith("sb_secret_")
  )
    throw Error("public_key_required");
  if (!c.publishableKey.startsWith("sb_publishable_")) {
    let role;
    try {
      role = JSON.parse(
        Buffer.from(c.publishableKey.split(".")[1], "base64url"),
      ).role;
    } catch {}
    if (role !== "anon") throw Error("public_key_required");
  }
  const identities = [];
  for (const who of [
    "agentA",
    "backup",
    "agentB",
    "adminA",
    "consumerA",
    "consumerB",
  ]) {
    let claims;
    try {
      claims = JSON.parse(
        Buffer.from(c.tokens[who].split(".")[1], "base64url"),
      );
    } catch {}
    if (
      claims?.role !== "authenticated" ||
      !claims?.sub ||
      !Number.isFinite(claims?.exp) ||
      claims.exp * 1000 <= Date.now()
    )
      throw Error("valid_user_token_required");
    identities.push(claims.sub);
  }
  if (new Set(identities).size !== 6) throw Error("distinct_accounts_required");
  for (const k of ["a", "b"]) {
    if (
      !/^[0-9a-f-]{36}$/.test(c.organizations?.[k] || "") ||
      !/^t_[a-f0-9]{24}$/.test(c.tickets?.[k] || "")
    )
      throw Error("fixture_required");
  }
  if (c.organizations.a === c.organizations.b || c.tickets.a === c.tickets.b)
    throw Error("distinct_companies_required");
  if (!/^r_[a-f0-9]{24}$/.test(c.requestA || ""))
    throw Error("fixture_required");
  return c;
}

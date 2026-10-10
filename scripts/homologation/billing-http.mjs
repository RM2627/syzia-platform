// PREPARED ONLY. Run later against a dedicated test project, never as a deployment step.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { validateCommercialConfig } from "./commercial-config.mjs";
if (!process.argv.includes("--read-only")) {
  console.error(
    "Explicit --read-only and dedicated configuration required. No connection opened.",
  );
  process.exit(2);
}
let c;
try {
  c = validateCommercialConfig(
    JSON.parse(await readFile(".homologation/billing.json", "utf8")),
  );
  for (const who of ["adminB", "superadmin"]) {
    const claim = JSON.parse(
      Buffer.from(c.tokens[who].split(".")[1], "base64url"),
    );
    assert.equal(claim.role, "authenticated");
    assert.ok(claim.exp > Date.now() / 1000);
    assert.match(claim.sub, /^[a-f0-9-]{36}$/i);
  }
} catch {
  console.error(
    "Dedicated billing configuration missing/invalid. No connection opened.",
  );
  process.exit(2);
}
const results = [];
const request = async (who, path, args) => {
  const r = await fetch(c.url + path, {
    method: args ? "POST" : "GET",
    headers: {
      apikey: c.publishableKey,
      Authorization: "Bearer " + c.tokens[who],
      "Content-Type": "application/json",
    },
    body: args ? JSON.stringify(args) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  return { ok: r.ok, status: r.status, data: await r.json() };
};
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch {
    results.push({ name, status: "FAIL" });
  }
}
for (const who of [
  "adminA",
  "adminB",
  "agentA",
  "agentB",
  "backup",
  "superadmin",
])
  await check("Real Auth identity " + who, async () => {
    const r = await request(who, "/auth/v1/user");
    assert.equal(r.ok, true);
    assert.equal(
      r.data.id,
      JSON.parse(Buffer.from(c.tokens[who].split(".")[1], "base64url")).sub,
    );
  });
for (const [who, org, allowed] of [
  ["adminA", c.organizations.a, true],
  ["adminA", c.organizations.b, false],
  ["adminB", c.organizations.a, false],
  ["adminB", c.organizations.b, true],
  ["agentA", c.organizations.a, false],
  ["agentB", c.organizations.b, false],
])
  await check(
    "Scoped billing " + who + " " + (org === c.organizations.a ? "A" : "B"),
    async () => {
      const r = await request(who, "/rest/v1/rpc/billing_context", {
        p_org: org,
      });
      assert.equal(r.ok, allowed);
      if (allowed) {
        assert.equal(r.data.real_payments_enabled, false);
        assert.equal(r.data.revenue_cents, null);
        assert.ok(!JSON.stringify(r.data).includes("whatsapp"));
      } else assert.ok([401, 403].includes(r.status));
    },
  );
for (const who of ["adminA", "agentA", "superadmin"])
  await check("Platform billing " + who, async () => {
    const r = await request(who, "/rest/v1/rpc/billing_admin_overview", {});
    assert.equal(r.ok, who === "superadmin");
  });
await writeFile(
  "reports/billing-remote-results.json",
  JSON.stringify(
    {
      environment: "EXTERNAL dedicated Supabase; read-only",
      executed_at: new Date().toISOString(),
      results,
    },
    null,
    2,
  ),
);
console.log(results.map((x) => x.status + " " + x.name).join("\n"));
if (results.some((x) => x.status === "FAIL")) process.exitCode = 1;

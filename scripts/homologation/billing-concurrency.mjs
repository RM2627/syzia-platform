// PREPARED / NOT EXECUTED. Dedicated fictitious data only. This records a mock payment.
import { readFile, writeFile } from "node:fs/promises";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { validateCommercialConfig } from "./commercial-config.mjs";
let c, url, claims;
try {
  assert.ok(process.argv.includes("--mutations"));
  c = validateCommercialConfig(
    JSON.parse(await readFile(".homologation/billing.json", "utf8")),
  );
  assert.match(c.pendingMockInvoice, /^[a-f0-9-]{36}$/i);
  claims = JSON.parse(
    Buffer.from(c.tokens.superadmin.split(".")[1], "base64url"),
  );
  assert.equal(claims.role, "authenticated");
  url = new URL(process.env.BILLING_TEST_DATABASE_URL);
  assert.equal(url.protocol, "postgresql:");
  assert.ok(
    url.hostname === `db.${c.projectRef}.supabase.co` ||
      decodeURIComponent(url.username).endsWith("." + c.projectRef),
  );
} catch {
  console.error(
    "Dedicated billing config, --mutations and matching connection required. No connection opened.",
  );
  process.exit(2);
}
const clients = [
    new Client({
      connectionString: url.toString(),
      ssl: { rejectUnauthorized: true },
    }),
    new Client({
      connectionString: url.toString(),
      ssl: { rejectUnauthorized: true },
    }),
  ],
  results = [];
let pending;
async function begin(client) {
  await client.query("begin");
  await client.query("set local statement_timeout='15s'");
  await client.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: claims.sub, role: "authenticated" }),
  ]);
  await client.query("set local role authenticated");
}
try {
  const auth = await fetch(c.url + "/auth/v1/user", {
    headers: {
      apikey: c.publishableKey,
      Authorization: "Bearer " + c.tokens.superadmin,
    },
    signal: AbortSignal.timeout(20000),
  });
  assert.ok(auth.ok);
  assert.equal((await auth.json()).id, claims.sub);
  await Promise.all(clients.map((x) => x.connect()));
  const [a, b] = clients;
  assert.notEqual(
    (await a.query("select pg_backend_pid() p")).rows[0].p,
    (await b.query("select pg_backend_pid() p")).rows[0].p,
  );
  await begin(a);
  await begin(b);
  const before = (
    await a.query("select billing_context($1) d", [c.organizations.a])
  ).rows[0].d;
  assert.equal(before.mock_enabled, true);
  const invoice = before.invoices.find((x) => x.id === c.pendingMockInvoice);
  assert.equal(invoice?.state, "pending");
  const params = [randomUUID(), invoice.id, "paid", invoice.amount_cents],
    sql = "select billing_mock_event($1,$2,$3,$4) d";
  const first = (await a.query(sql, params)).rows[0].d;
  pending = b.query(sql, params);
  pending.catch(() => {});
  await a.query("commit");
  const second = (await pending).rows[0].d;
  assert.deepEqual(second, first);
  await b.query("commit");
  await begin(a);
  const after = (
    await a.query("select billing_context($1) d", [c.organizations.a])
  ).rows[0].d;
  assert.equal(after.subscription.revision, before.subscription.revision + 1);
  assert.equal(after.invoices.find((x) => x.id === invoice.id).state, "paid");
  assert.equal(after.revenue_cents, null);
  await a.query("commit");
  results.push({
    name: "Independent connections / identical webhook apply exactly once",
    status: "PASS",
  });
} catch {
  results.push({
    name: "Independent connections / identical webhook apply exactly once",
    status: "FAIL",
  });
  process.exitCode = 1;
} finally {
  for (const x of clients) {
    try {
      await x.query("rollback");
    } catch {}
    try {
      await x.end();
    } catch {}
  }
  await writeFile(
    "reports/billing-concurrency-remote.json",
    JSON.stringify(
      {
        environment: "EXTERNAL dedicated PostgreSQL, mock billing only",
        executed_at: new Date().toISOString(),
        results,
      },
      null,
      2,
    ),
  );
  console.log(results);
}

// Independent SQL connections; no impersonation credentials stored or logged.
// Execute only as the dedicated-test database operator, after real Auth identities were prepared.
import { readFile, writeFile } from "node:fs/promises";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { validateCommercialConfig } from "./commercial-config.mjs";
import { safeError } from "./config.mjs";
let c, url;
try {
  c = validateCommercialConfig(
    JSON.parse(await readFile(".homologation/commercial.json", "utf8")),
  );
  url = new URL(process.env.COMMERCIAL_TEST_DATABASE_URL);
  assert.equal(url.protocol, "postgresql:");
  assert.ok(
    url.hostname === `db.${c.projectRef}.supabase.co` ||
      decodeURIComponent(url.username).endsWith("." + c.projectRef),
  );
} catch {
  console.error(
    "Configuração/conexão dedicada ausente ou inválida. Nenhuma conexão aberta.",
  );
  process.exit(2);
}
const a = new Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true },
  }),
  b = new Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true },
  }),
  results = [];
let pending;
const claims = (who) =>
  JSON.parse(Buffer.from(c.tokens[who].split(".")[1], "base64url"));
async function setup(client, who) {
  await client.query("begin");
  await client.query("set local statement_timeout='15s'");
  await client.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: claims(who).sub, role: "authenticated" }),
  ]);
  await client.query("set local role authenticated");
}
try {
  for (const who of ["agentA", "backup"]) {
    const response = await fetch(c.url + "/auth/v1/user", {
      headers: {
        apikey: c.publishableKey,
        Authorization: "Bearer " + c.tokens[who],
      },
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(response.ok, true);
    assert.equal((await response.json()).id, claims(who).sub);
  }
  await a.connect();
  await b.connect();
  assert.notEqual(
    (await a.query("select pg_backend_pid() p")).rows[0].p,
    (await b.query("select pg_backend_pid() p")).rows[0].p,
  );
  await setup(a, "agentA");
  await setup(b, "backup");
  await a.query("select central_presence('available')");
  await a.query("commit");
  await b.query("select central_presence('available')");
  await b.query("commit");
  await setup(a, "agentA");
  await setup(b, "backup");
  const t = (
    await a.query("select commercial_context($1) c", [c.opportunities.a])
  ).rows[0].c.tasks.find((t) => !["completed", "cancelled"].includes(t.state));
  assert.equal(t.assignee_id, null, "Prepare a new unassigned commercial task");
  assert.ok(["pending", "rescheduled"].includes(t.state));
  await a.query("select pg_advisory_xact_lock(734921501)");
  let done = false;
  pending = b
    .query("select commercial_task_act($1,$2,'claim','{}',$3)", [
      t.public_code,
      t.revision,
      randomUUID(),
    ])
    .then(
      (r) => ({ ok: true }),
      (e) => ({ ok: false, e }),
    )
    .finally(() => {
      done = true;
    });
  await a.query("select pg_sleep(0.25)");
  assert.equal(done, false);
  await a.query("select commercial_task_act($1,$2,'claim','{}',$3)", [
    t.public_code,
    t.revision,
    randomUUID(),
  ]);
  await a.query("commit");
  const loser = await pending;
  assert.equal(loser.ok, false);
  assert.equal(loser.e.code, "40001");
  await b.query("rollback");
  results.push({
    name: "Conexões independentes: concorrência de atribuição tem um vencedor",
    status: "PASS",
  });
  // Concurrent stale write after transfer: both sessions originally represented the old owner.
  await setup(a, "agentA");
  await setup(b, "agentA");
  const now = (
    await a.query("select commercial_context($1) c", [c.opportunities.a])
  ).rows[0].c.tasks.find((t) => !["completed", "cancelled"].includes(t.state));
  await a.query("select pg_advisory_xact_lock(734921501)");
  pending = b
    .query("select commercial_task_act($1,$2,'priority',$3,$4)", [
      now.public_code,
      now.revision,
      JSON.stringify({ priority: 2 }),
      randomUUID(),
    ])
    .then(
      (r) => ({ ok: true }),
      (e) => ({ ok: false, e }),
    );
  await a.query("select commercial_task_act($1,$2,'transfer',$3,$4)", [
    now.public_code,
    now.revision,
    JSON.stringify({ user_id: claims("backup").sub }),
    randomUUID(),
  ]);
  await a.query("commit");
  const late = await pending;
  assert.equal(late.ok, false);
  assert.equal(late.e.code, "42501");
  await b.query("rollback");
  results.push({
    name: "Transferência intercalada bloqueia ação do antigo responsável",
    status: "PASS",
  });
} catch (e) {
  results.push({
    name: "Concorrência independente Fase 6",
    status: "FAIL",
    ...safeError(e),
  });
} finally {
  await a.query("rollback").catch(() => {});
  await b.query("rollback").catch(() => {});
  await pending;
  await Promise.allSettled([a.end(), b.end()]);
}
await writeFile(
  "reports/phase-6-concurrency-external.json",
  JSON.stringify(
    {
      environment:
        "PostgreSQL real dedicado; PIDs independentes; JWTs previamente verificados pelo Auth",
      tests: results,
      cleanup: "Tarefa fictícia permanece transferida ao backup para inspeção.",
    },
    null,
    2,
  ),
);
if (results.some((x) => x.status === "FAIL")) process.exitCode = 1;

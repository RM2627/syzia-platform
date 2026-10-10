import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { validateCommercialConfig } from "./commercial-config.mjs";
import { safeError } from "./config.mjs";
let c;
try {
  c = validateCommercialConfig(
    JSON.parse(await readFile(".homologation/commercial.json", "utf8")),
  );
} catch {
  console.error(
    "Configuração dedicada ausente/inválida. Nenhuma conexão aberta.",
  );
  process.exit(2);
}
const mode = process.argv.includes("--mutations")
  ? "mutations"
  : process.argv.includes("--read-only")
    ? "read-only"
    : null;
if (!mode) {
  console.error("Escolha --read-only ou --mutations. Nenhuma conexão aberta.");
  process.exit(2);
}
const results = [];
async function request(who, path, body) {
  const r = await fetch(c.url + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      apikey: c.publishableKey,
      Authorization: "Bearer " + c.tokens[who],
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  return { ok: r.ok, data: await r.json() };
}
async function rpc(who, name, args) {
  const r = await request(who, "/rest/v1/rpc/" + name, args);
  if (!r.ok)
    throw Object.assign(Error("remote_operation_failed"), {
      code: r.data?.code,
    });
  return r.data;
}
async function denied(who, name, args) {
  const r = await request(who, "/rest/v1/rpc/" + name, args);
  assert.equal(r.ok, false);
  assert.equal(r.data?.code, "42501");
}
const context = (who) =>
    rpc(who, "commercial_context", { p_code: c.opportunities.a }),
  active = (x) =>
    x.tasks.find((t) => !["completed", "cancelled"].includes(t.state));
try {
  for (const who of Object.keys(c.tokens)) {
    const r = await request(who, "/auth/v1/user");
    assert.equal(r.ok, true);
    assert.equal(
      r.data.id,
      JSON.parse(Buffer.from(c.tokens[who].split(".")[1], "base64url")).sub,
    );
  }
  results.push({ name: "JWTs verificados pelo Auth real", status: "PASS" });
  const x = await context("agentA");
  assert.equal(x.organization_id, c.organizations.a);
  await denied("agentB", "commercial_context", { p_code: c.opportunities.a });
  await denied("consumerA", "commercial_context", {
    p_code: c.opportunities.a,
  });
  await denied("agentA", "commercial_context", { p_code: c.opportunities.b });
  assert.deepEqual(
    (
      await rpc("agentA", "commercial_list", {
        p_filters: { org: c.organizations.b },
        p_offset: 0,
      })
    ).items,
    [],
  );
  for (const table of [
    "commercial_opportunity_state",
    "commercial_tasks",
    "commercial_attempts",
    "commercial_events",
  ]) {
    const r = await request("consumerA", "/rest/v1/" + table + "?select=*");
    assert.equal(r.ok, true);
    assert.deepEqual(r.data, []);
  }
  results.push({
    name: "Isolamento A/B, consumidor e SELECT via PostgREST",
    status: "PASS",
  });
  if (mode === "mutations") {
    await rpc("agentA", "commercial_refresh", { p_org: c.organizations.a });
    const t = active(await context("agentA"));
    assert.ok(t);
    assert.equal(
      t.assignee_id,
      null,
      "Prepare tarefa fictícia nova sem responsável",
    );
    assert.ok(
      new Date(t.due_at) <= new Date(),
      "Prepare tarefa vencida dentro da janela de contato",
    );
    for (const who of ["agentA", "backup"])
      await rpc(who, "central_presence", { p_state: "available" });
    const args = {
      p_code: t.public_code,
      p_revision: t.revision,
      p_action: "claim",
      p_data: {},
      p_key: randomUUID(),
    };
    const race = await Promise.all(
      ["agentA", "backup"].map((who) =>
        request(who, "/rest/v1/rpc/commercial_task_act", {
          ...args,
          p_key: randomUUID(),
        }),
      ),
    );
    assert.equal(race.filter((r) => r.ok).length, 1);
    assert.equal(race.find((r) => !r.ok).data.code, "40001");
    const winner = race[0].ok ? "agentA" : "backup";
    results.push({
      name: "Assunções HTTP simultâneas têm único vencedor",
      status: "PASS",
    });
    let current = active(await context(winner));
    await rpc(winner, "commercial_task_act", {
      ...args,
      p_revision: current.revision,
      p_action: "start",
      p_key: randomUUID(),
    });
    current = active(await context(winner));
    const payload = {
        ...args,
        p_revision: current.revision,
        p_action: "result",
        p_data: {
          outcome: "other",
          note: "Homologação fictícia; cliente respondeu.",
        },
        p_key: randomUUID(),
      },
      before = (await context(winner)).attempts.length;
    await Promise.all([
      rpc(winner, "commercial_task_act", payload),
      rpc(winner, "commercial_task_act", payload),
    ]);
    assert.equal((await context(winner)).attempts.length, before + 1);
    results.push({
      name: "Resultado concorrente idempotente tem um efeito",
      status: "PASS",
    });
    const stale = await request(winner, "/rest/v1/rpc/commercial_task_act", {
      ...payload,
      p_key: randomUUID(),
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.data.code, "40001");
    results.push({ name: "Revisão obsoleta recusada", status: "PASS" });
  }
} catch (e) {
  results.push({
    name: "Homologação comercial externa",
    status: "FAIL",
    ...safeError(e),
  });
}
await writeFile(
  "reports/phase-6-http-external.json",
  JSON.stringify(
    {
      environment: "Supabase dedicado real; executado pelo operador",
      at: new Date().toISOString(),
      mode,
      tests: results,
      cleanup:
        "Tarefa fictícia permanece para inspeção. Nenhuma limpeza destrutiva automática.",
    },
    null,
    2,
  ),
);
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;

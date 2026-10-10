import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { validateCentralConfig } from "./central-config.mjs";
import { safeError } from "./config.mjs";
let c;
try {
  c = validateCentralConfig(
    JSON.parse(await readFile(".homologation/central.json", "utf8")),
  );
} catch {
  console.error(
    "Configuração de homologação inválida ou ausente. Nenhuma conexão aberta.",
  );
  process.exit(2);
}
const mutation = process.argv.includes("--mutations");
if (!mutation && !process.argv.includes("--read-only")) {
  console.error("Escolha --read-only ou --mutations.");
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
  const data = await r.json();
  return { ok: r.ok, status: r.status, data };
}
async function rpc(who, name, args) {
  const r = await request(who, "/rest/v1/rpc/" + name, args);
  if (!r.ok)
    throw Object.assign(Error("remote_operation_failed"), {
      code: r.data?.code,
      status: r.status,
    });
  return r.data;
}
async function denied(who, name, args) {
  const r = await request(who, "/rest/v1/rpc/" + name, args);
  assert.equal(r.ok, false);
  assert.equal(r.data?.code, "42501");
}
try {
  for (const who of Object.keys(c.tokens)) {
    const r = await request(who, "/auth/v1/user");
    assert.equal(r.ok, true);
    assert.ok(r.data.id);
    const decoded = JSON.parse(
      Buffer.from(c.tokens[who].split(".")[1], "base64url"),
    );
    assert.equal(r.data.id, decoded.sub);
  }
  results.push({
    name: "Todos os JWTs verificados pelo Auth real",
    status: "PASS",
  });
  const ctx = await rpc("agentA", "central_context", { p_code: c.tickets.a });
  assert.equal(ctx.organization.id, c.organizations.a);
  await denied("agentA", "central_context", { p_code: c.tickets.b });
  await denied("agentB", "central_context", { p_code: c.tickets.a });
  await denied("adminA", "central_context", { p_code: c.tickets.b });
  await denied("consumerB", "central_consumer_thread", {
    p_request: c.requestA,
  });
  const raw = await request("consumerA", "/rest/v1/ticket_notes?select=*");
  assert.equal(raw.ok, true);
  assert.deepEqual(raw.data, []);
  const publicThread = await rpc("consumerA", "central_consumer_thread", {
    p_request: c.requestA,
  });
  assert.equal(publicThread.notes, undefined);
  assert.equal(publicThread.escalations, undefined);
  results.push({
    name: "Isolamento de tickets e notas via HTTP/PostgREST",
    status: "PASS",
  });
  const q = await rpc("agentA", "central_queue", {
    p_org: c.organizations.b,
    p_search: "",
    p_state: null,
    p_mine: false,
    p_offset: 0,
  });
  assert.deepEqual(q.tickets, []);
  results.push({
    name: "Busca não revela empresa sem vínculo",
    status: "PASS",
  });
  if (mutation) {
    assert.equal(
      ctx.ticket.assignee_id,
      null,
      "Prepare a new unassigned fictional ticket",
    );
    assert.equal(ctx.ticket.state, "queued");
    for (const who of ["agentA", "backup"])
      await rpc(who, "central_presence", { p_state: "available" });
    const revision = ctx.ticket.revision;
    const attempts = await Promise.all(
      ["agentA", "backup"].map((who) =>
        request(who, "/rest/v1/rpc/central_act", {
          p_code: c.tickets.a,
          p_revision: revision,
          p_action: "claim",
          p_data: {},
          p_key: randomUUID(),
        }),
      ),
    );
    assert.equal(attempts.filter((x) => x.ok).length, 1);
    assert.equal(attempts.find((x) => !x.ok).data.code, "40001");
    results.push({
      name: "Duas requisições HTTP simultâneas: somente um assume",
      status: "PASS",
    });
    const winner = attempts[0].ok ? "agentA" : "backup",
      current = await rpc(winner, "central_context", { p_code: c.tickets.a });
    const params = {
      p_code: c.tickets.a,
      p_revision: current.ticket.revision,
      p_action: "message",
      p_data: { body: "Mensagem fictícia de homologação técnica." },
      p_key: randomUUID(),
    };
    await rpc(winner, "central_act", params);
    await rpc(winner, "central_act", params);
    const after = await rpc(winner, "central_context", { p_code: c.tickets.a });
    assert.equal(after.messages.length, current.messages.length + 1);
    results.push({
      name: "Mensagem idempotente real tem somente um efeito",
      status: "PASS",
    });
    const stale = await request(winner, "/rest/v1/rpc/central_act", {
      ...params,
      p_key: randomUUID(),
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.data.code, "40001");
    results.push({
      name: "Revisão antiga recusada no banco real",
      status: "PASS",
    });
  }
} catch (e) {
  results.push({
    name: "Validação externa Fase 5",
    status: "FAIL",
    ...safeError(e),
  });
}
await writeFile(
  "reports/phase-5-http-external.json",
  JSON.stringify(
    {
      environment: "Supabase dedicado real; operador executou este script",
      at: new Date().toISOString(),
      mode: mutation ? "mutations" : "read-only",
      tests: results,
      cleanup:
        "Tickets e mensagens fictícios permanecem para inspeção. Não há limpeza destrutiva automática.",
    },
    null,
    2,
  ),
);
if (results.some((x) => x.status === "FAIL")) process.exitCode = 1;

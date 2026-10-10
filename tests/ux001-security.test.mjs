import * as h from "./support/current-db.mjs";
import { mkdir, writeFile } from "node:fs/promises";
const {
  db,
  as,
  rpc,
  orgs,
  legacy,
  users,
  grantWorker,
  centralGrants,
  denied,
  assert,
} = h;
const results = [];
async function check(name, fn) {
  await db.exec("begin");
  h.resetTrace();
  try {
    await fn();
    results.push({ name, status: "PASS", steps: h.getTrace() });
  } catch (e) {
    results.push({
      name,
      status: "FAIL",
      error: e.message,
      where: e.where,
      steps: h.getTrace(),
    });
  } finally {
    await db.exec("rollback;reset role");
  }
  console.log(results.at(-1).status, name, results.at(-1).error || "");
}
await check(
  "ADM A lê A, não lê B nem recebe administração global",
  async () => {
    await as("adminA");
    assert.equal(
      (await rpc("central_context", { p_code: legacy.codes.A })).organization
        .id,
      orgs.A,
    );
    await denied(() => rpc("central_context", { p_code: legacy.codes.B }));
    await denied(() => rpc("foundation_global_audit"));
  },
);
await check(
  "Colaborador sem grant negado; conceder e revogar central.read revalida no servidor",
  async () => {
    await grantWorker([]);
    await as("worker");
    await denied(() => rpc("central_context", { p_code: legacy.codes.A }));
    await grantWorker(centralGrants);
    await as("worker");
    assert.equal(
      (await rpc("central_context", { p_code: legacy.codes.A })).organization
        .id,
      orgs.A,
    );
    await grantWorker([]);
    await as("worker");
    await denied(() => rpc("central_context", { p_code: legacy.codes.A }));
  },
);
await check(
  "Vínculo empresarial revogado bloqueia ticket antes autorizado",
  async () => {
    await grantWorker(centralGrants);
    await as("worker");
    assert.ok(await rpc("central_context", { p_code: legacy.codes.A }));
    await db.exec("reset role");
    await db.query(
      "update organization_members set status='suspended' where organization_id=$1 and user_id=$2",
      [orgs.A, users.worker],
    );
    await as("worker");
    await denied(() => rpc("central_context", { p_code: legacy.codes.A }));
  },
);
await check(
  "Equipe SYZIA atribuída lê A, não atribuída a B é negada",
  async () => {
    await as("agentA");
    assert.equal(
      (await rpc("central_context", { p_code: legacy.codes.A })).organization
        .id,
      orgs.A,
    );
    await denied(() => rpc("central_context", { p_code: legacy.codes.B }));
  },
);
await check(
  "Revogação da atribuição SYZIA nega nova leitura do ticket",
  async () => {
    await as("agentA");
    assert.ok(await rpc("central_context", { p_code: legacy.codes.A }));
    await db.exec("reset role");
    await db.query(
      "update attendant_organizations set status='suspended' where organization_id=$1 and user_id=$2",
      [orgs.A, users.agentA],
    );
    await as("agentA");
    await denied(() => rpc("central_context", { p_code: legacy.codes.A }));
  },
);
await check(
  "Não autenticado e consumidor não entram na Central por código de ticket",
  async () => {
    await as("anon");
    await denied(
      () => rpc("central_context", { p_code: legacy.codes.A }),
      /denied|required|permission/,
    );
    await as("alice");
    await denied(() => rpc("central_context", { p_code: legacy.codes.A }));
  },
);
await mkdir("reports/ux001", { recursive: true });
await writeFile(
  "reports/ux001/security.json",
  JSON.stringify(
    {
      engine: "SQL real das migrations em PGlite local; dados fictícios",
      status: results.every((r) => r.status === "PASS") ? "PASS" : "FAIL",
      results,
    },
    null,
    2,
  ),
);
await db.close();
if (results.some((r) => r.status !== "PASS")) process.exitCode = 1;

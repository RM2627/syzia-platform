import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
const c = await consumerDB(),
  { db, as, rpc, orgs } = c,
  results = [];
async function denied(fn, codes = ["42501"]) {
  await db.exec("savepoint rejection");
  try {
    await fn();
  } catch (e) {
    await db.exec("rollback to savepoint rejection");
    assert.ok(codes.includes(e.code), e.code + ": " + e.message);
    return;
  }
  throw Error("Expected rejection");
}
async function test(name, fn) {
  await db.exec("begin");
  try {
    await as("adminA");
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS " + name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message });
    console.error("FAIL " + name + ": " + e.stack);
  } finally {
    await db.exec("rollback;reset role");
  }
}
const context = (org = orgs.A) => rpc("onboarding_context", { p_org: org });
async function act(action, revision, key = randomUUID(), org = orgs.A) {
  return rpc("onboarding_act", {
    p_org: org,
    p_action: action,
    p_revision: revision,
    p_key: key,
  });
}
await test("Primeira entrada: estado não iniciado sem progresso fictício", async () => {
  const d = await context();
  assert.equal(d.guide.status, "not_started");
  assert.equal(d.guide.revision, 0);
  assert.equal(d.shared_support, false);
  assert.ok(!d.items.some((i) => i.id === "manual"));
  assert.equal(
    d.ready,
    d.items.filter((i) => i.required).every((i) => i.complete),
  );
  assert.ok(d.items.every((i) => i.href.startsWith("/painel/" + orgs.A)));
});
await test("Checklist acompanha informações persistidas e recomendações opcionais", async () => {
  await db.exec("reset role");
  await db.query(
    "update company_settings set description='',business_hours='[]' where organization_id=$1",
    [orgs.A],
  );
  await as("adminA");
  const d = await context();
  assert.equal(d.ready, false);
  assert.equal(d.items.find((i) => i.id === "company").complete, false);
  assert.equal(d.items.find((i) => i.id === "hours").complete, false);
  assert.equal(d.items.find((i) => i.id === "portfolio").required, false);
});
await test("Manual, FAQ e autonomia apenas após optar pelo atendimento compartilhado", async () => {
  let d = await context();
  assert.equal(d.shared_support, false);
  const revision = await c.scalar(
    "select revision from company_settings where organization_id=$1",
    [orgs.A],
  );
  await rpc("operations_support_mode", {
    p_org: orgs.A,
    p_mode: "shared",
    p_revision: revision,
  });
  d = await context();
  assert.equal(d.shared_support, true);
  assert.ok(d.items.find((i) => i.id === "manual").required);
  assert.ok(d.items.find((i) => i.id === "autonomy").required);
});
await test("Retomada preserva etapa e usuário após nova sessão técnica", async () => {
  let d = await act("start", 0);
  d = await act("next", d.guide.revision);
  await as("adminB");
  await as("adminA");
  assert.deepEqual((await context()).guide, d.guide);
  assert.equal(d.guide.step, 1);
});
await test("Anterior, próximo e concluir persistem sem reaparecer como convite", async () => {
  let d = await act("start", 0);
  d = await act("next", d.guide.revision);
  d = await act("previous", d.guide.revision);
  assert.equal(d.guide.step, 0);
  for (let i = 0; i < 4; i++) d = await act("next", d.guide.revision);
  d = await act("complete", d.guide.revision);
  assert.equal(d.guide.status, "completed");
  assert.ok(d.guide.completed_at);
  assert.equal((await context()).guide.status, "completed");
});
await test("Pular persiste e refazer reinicia sem alterar checklist", async () => {
  const before = (await context()).items;
  let d = await act("skip", 0);
  assert.equal(d.guide.status, "skipped");
  assert.ok(d.guide.skipped_at);
  d = await act("restart", d.guide.revision);
  assert.equal(d.guide.step, 0);
  assert.equal(d.guide.status, "in_progress");
  assert.equal(d.guide.skipped_at, null);
  assert.deepEqual(d.items, before);
});
await test("Repetição do mesmo comando é idempotente; duas abas detectam revisão antiga", async () => {
  const key = randomUUID(),
    d = await act("start", 0, key);
  assert.deepEqual(await act("start", 0, key), d);
  await denied(() => act("next", 0), ["40001"]);
  assert.equal((await context()).guide.step, 0);
});
await test("Frontend não conclui etapa antecipadamente nem altera tabela diretamente", async () => {
  let d = await act("start", 0);
  await denied(() => act("complete", d.guide.revision), ["22023"]);
  await denied(() =>
    db.query(
      "update organization_user_guides set status='completed',step=4,completed_at=now() where organization_id=$1",
      [orgs.A],
    ),
  );
  assert.equal((await context()).guide.status, "in_progress");
});
await test("Usuários sem gestão empresarial não consultam nem modificam A", async () => {
  await act("start", 0);
  for (const name of ["adminB", "worker", "alice", "anon"]) {
    await as(name);
    await denied(() => context());
    await denied(() => act("restart", 0));
  }
});
await test("Mesmo gestor em duas organizações mantém tutoriais separados", async () => {
  await as("adminB");
  await c.scalar(
    "select foundation_set_member($1,$2,'admin_empresa','active')",
    [orgs.B, users.adminA],
  );
  await as("adminA");
  await act("skip", 0);
  assert.equal((await context(orgs.B)).guide.status, "not_started");
  await act("start", 0, randomUUID(), orgs.B);
  assert.equal((await context()).guide.status, "skipped");
});
await test("Dois gestores da mesma empresa não compartilham estado ou leitura direta", async () => {
  await as("adminA");
  await c.scalar(
    "select foundation_set_member($1,$2,'admin_empresa','active')",
    [orgs.A, users.adminB],
  );
  await as("adminA");
  await act("skip", 0);
  await as("adminB");
  assert.equal((await context()).guide.status, "not_started");
  assert.equal(
    (await db.query("select * from organization_user_guides")).rows.length,
    0,
  );
  await act("start", 0);
  assert.equal(
    (await db.query("select * from organization_user_guides")).rows.length,
    1,
  );
});
await test("Revogação impede leitura e comando com sessão preexistente", async () => {
  await act("start", 0);
  await db.exec("reset role");
  await db.query(
    "update organization_members set status='suspended' where organization_id=$1 and user_id=$2",
    [orgs.A, users.adminA],
  );
  await as("adminA");
  await denied(() => context());
  await denied(() => act("restart", 2));
  assert.equal(
    (await db.query("select * from organization_user_guides")).rows.length,
    0,
  );
});
await test("RLS, FORCE RLS e auditoria do tutorial", async () => {
  await act("skip", 0);
  await db.exec("reset role");
  const row = (
    await db.query(
      "select relrowsecurity,relforcerowsecurity from pg_class where oid='organization_user_guides'::regclass",
    )
  ).rows[0];
  assert.ok(row.relrowsecurity && row.relforcerowsecurity);
  assert.ok(
    await c.scalar(
      "select count(*)>0 from audit_logs where organization_id=$1",
      [orgs.A],
    ),
  );
});
await writeFile(
  "reports/onboarding-local.json",
  JSON.stringify(
    {
      environment: "LOCAL PostgreSQL/PGlite; Auth simulado; sem Supabase real",
      tests: results,
      passed: results.filter((r) => r.status === "PASS").length,
      failed: results.filter((r) => r.status === "FAIL").length,
    },
    null,
    2,
  ),
);
await db.close();
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;

import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
const { db, as, rpc, scalar, orgs } = await consumerDB({
  through: "202609200027_organization_activation.sql",
});
const results = [];
// Populate real tutorial progress before the upgrade, then compare persisted state.
await db.exec("begin");
await as("adminA");
await rpc("onboarding_act", {
  p_org: orgs.A,
  p_action: "start",
  p_revision: 0,
  p_key: randomUUID(),
});
await db.exec("commit;reset role");
const snapshot = () =>
  scalar(`select jsonb_build_object(
 'organizations',(select jsonb_agg(to_jsonb(x) order by id) from organizations x),
 'members',(select jsonb_agg(to_jsonb(x) order by organization_id,user_id) from organization_members x),
 'settings',(select jsonb_agg(to_jsonb(x) order by organization_id) from company_settings x),
 'guides',(select jsonb_agg(to_jsonb(x) order by organization_id,user_id) from organization_user_guides x),
 'audit',(select count(*) from audit_logs),'trial',(select count(*) from private.trial_grants),
 'rls',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity) order by n.nspname,c.relname)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r'))`);
const before = await snapshot();
await db.exec(
  await readFile(
    "supabase/migrations/202609200028_company_workspace_authorization.sql",
    "utf8",
  ),
);
assert.deepEqual(await snapshot(), before);
results.push({
  name: "Upgrade 027 → 028 preserves rows, tutorial progress, audit, trial and RLS flags",
  status: "PASS",
});
async function test(name, fn) {
  await db.exec("begin");
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message });
    console.error("FAIL", name, e.stack);
  } finally {
    await db.exec("rollback;reset role");
  }
}
async function deny(fn) {
  await db.exec("savepoint denied");
  try {
    await fn();
  } catch (e) {
    await db.exec("rollback to savepoint denied");
    assert.equal(e.code, "42501");
    return;
  }
  throw Error("Expected access denied");
}
const context = (org) => rpc("onboarding_context", { p_org: org });
const home = (org) => rpc("operations_home", { p_org: org });
const company = (org) => scalar("select company_context($1)", [org]);
const save = async (org, entity, data, id = null) =>
  scalar("select company_save($1,$2,$3,$4,$5)", [
    org,
    entity,
    id,
    (
      await db.query(
        "select revision from company_settings where organization_id=$1",
        [org],
      )
    ).rows[0]?.revision ?? 1,
    JSON.stringify(data),
  ]);
async function create() {
  await as("root");
  return (
    await rpc("access_create_organization", {
      p_name: "Empresa sem ADM",
      p_slug: "sem-adm-" + randomUUID(),
      p_key: randomUUID(),
    })
  ).organization_id;
}
async function globalSession() {
  const sid = randomUUID();
  await db.exec("reset role");
  await db.query(
    "insert into private.access_enforced_users(user_id) values($1) on conflict do nothing",
    [users.root],
  );
  await rpc("access_register_session", {
    p_user: users.root,
    p_session: sid,
    p_account: null,
    p_generation: null,
  });
  await as("root");
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: users.root, session_id: sid, is_anonymous: false }),
  ]);
  return sid;
}
await test("A/F: global session configures company without administrator or fabricated membership", async () => {
  const org = await create();
  await globalSession();
  assert.equal((await context(org)).ready, false);
  assert.equal((await home(org)).company, "Empresa sem ADM");
  assert.equal((await company(org)).editable, true);
  await scalar("select company_initialize($1)", [org]);
  await save(org, "settings", {
    description: "Descrição empresarial fictícia",
    service_regions: "Lagoa Grande",
    payment_methods: "Pix",
    business_hours: [{ day: 1, open: "08:00", close: "18:00" }],
  });
  const service = await save(org, "service", {
    name: "Serviço teste",
    price_mode: "fixed",
    price_cents: 12000,
    duration_minutes: 60,
    direct_booking: false,
  });
  await save(org, "addon", {
    service_id: service,
    name: "Adicional",
    price_mode: "fixed",
    price_cents: 2000,
    duration_minutes: 10,
  });
  const c = await company(org);
  assert.equal(c.services.length, 1);
  assert.equal(c.addons.length, 1);
  const d = await context(org);
  for (const id of ["company", "services", "prices", "hours"])
    assert.equal(d.items.find((i) => i.id === id).complete, true, id);
  assert.ok(await rpc("consumer_presence_context", { p_org: org }));
  assert.ok(await rpc("consumer_admin_context", { p_org: org }));
  assert.equal(
    await scalar(
      "select count(*)::int from organization_members where organization_id=$1",
      [org],
    ),
    0,
  );
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(*)::int from private.enterprise_accounts where organization_id=$1",
      [org],
    ),
    0,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from private.trial_grants where organization_id=$1",
      [org],
    ),
    0,
  );
});
await test("B/C: pending and active administrator do not change global workspace authorization", async () => {
  const org = await create();
  const a = await rpc("access_reserve", {
    p_org: org,
    p_name: "",
    p_slug: "",
    p_display: "Ana Teste",
    p_username: "ana.teste",
    p_email: "ana@example.invalid",
    p_phone: "",
    p_role: "admin_empresa",
    p_key: randomUUID(),
  });
  await db.exec("reset role");
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
    [a.user_id, a.user_id + "@access.vireloq.invalid"],
  );
  const hash = (x) => createHash("sha256").update(x).digest("hex");
  const code = await rpc("access_finish_provision", {
    p_id: a.id,
    p_actor: users.root,
    p_hash: hash("temporary"),
  });
  await as("root");
  assert.ok(await context(org));
  assert.ok(await home(org));
  const beforeCount = await scalar(
    "select count(*) from organization_members where organization_id=$1",
    [org],
  );
  await db.exec("reset role");
  await rpc("access_verify_code", {
    p_code: code.company_code,
    p_username: code.username,
    p_hash: hash("temporary"),
    p_proof: hash("proof"),
  });
  const start = await rpc("access_begin_activation", {
    p_proof: hash("proof"),
  });
  await rpc("access_finish_activation", {
    p_id: a.id,
    p_operation: start.operation,
    p_success: true,
  });
  await as("root");
  assert.ok(await context(org));
  assert.ok(await home(org));
  assert.equal(
    await scalar(
      "select count(*) from organization_members where organization_id=$1",
      [org],
    ),
    beforeCount,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from organization_members where user_id=$1",
      [users.root],
    ),
    0,
  );
});
await test("F/G: existing checklist and per-user tutorial progress stay authoritative", async () => {
  await as("adminA");
  const old = await context(orgs.A);
  assert.equal(old.guide.status, "in_progress");
  await as("root");
  const d = await context(orgs.A);
  assert.deepEqual(d.items, old.items);
  assert.equal(d.ready, old.ready);
  assert.equal(d.guide.status, "not_started");
  await rpc("onboarding_act", {
    p_org: orgs.A,
    p_action: "start",
    p_revision: 0,
    p_key: randomUUID(),
  });
  await rpc("onboarding_act", {
    p_org: orgs.A,
    p_action: "next",
    p_revision: 2,
    p_key: randomUUID(),
  });
  assert.equal((await context(orgs.A)).guide.step, 1);
  assert.equal((await context(orgs.B)).guide.step, 0);
  const rows = (await db.query("select * from organization_user_guides")).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, users.root);
  await as("adminA");
  assert.deepEqual((await context(orgs.A)).guide, old.guide);
});
await test("D/E: access management remains explicit and separate from workspace reads", async () => {
  const org = await create();
  assert.equal((await rpc("access_team", { p_org: org })).accounts.length, 0);
  await db.exec("reset role");
  const b = await snapshot();
  await as("root");
  await home(org);
  await context(org);
  await company(org);
  await db.exec("reset role");
  assert.deepEqual(await snapshot(), b);
});
for (const who of ["adminB", "worker", "agentA", "alice", "anon"])
  await test("I: " + who + " cannot manage company A via RPC", async () => {
    await as(who);
    await deny(() => context(orgs.A));
    await deny(() => home(orgs.A));
    await deny(() =>
      save(orgs.A, "settings", { description: "Unauthorized change" }),
    );
    await deny(() =>
      rpc("onboarding_act", {
        p_org: orgs.A,
        p_action: "start",
        p_revision: 0,
        p_key: randomUUID(),
      }),
    );
  });
await test("I: admin A reads only own company rows and cannot change B", async () => {
  await as("adminA");
  assert.ok(await context(orgs.A));
  assert.deepEqual(
    (await db.query("select organization_id from company_settings")).rows.map(
      (x) => x.organization_id,
    ),
    [orgs.A],
  );
  await deny(() => company(orgs.B));
  await deny(() => save(orgs.B, "settings", { description: "Forbidden" }));
  await deny(() => rpc("consumer_admin_context", { p_org: orgs.B }));
});
await test("Global role is checked in the database, never accepted from JWT metadata", async () => {
  await as("adminB");
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({
      sub: users.adminB,
      role: "super_admin",
      user_metadata: { role: "super_admin" },
    }),
  ]);
  await deny(() => context(orgs.A));
  await deny(() => save(orgs.A, "settings", { description: "Forbidden" }));
});
for (const mutation of ["role", "profile", "organization", "session", "idle"])
  await test(
    "Existing global session stops after " +
      mutation +
      " revocation/suspension",
    async () => {
      const sid = await globalSession();
      assert.ok(await home(orgs.A));
      await db.exec("reset role");
      const changes = {
        role: "update platform_roles set active=false where user_id=$1",
        profile: "update profiles set status='suspended' where id=$1",
        organization: "update organizations set status='suspended' where id=$1",
        session:
          "update private.enterprise_sessions set revoked=true where session_id=$1",
        idle: "update private.enterprise_sessions set last_activity=now()-interval '31 minutes' where session_id=$1",
      };
      await db.query(changes[mutation], [
        mutation === "organization"
          ? orgs.A
          : ["session", "idle"].includes(mutation)
            ? sid
            : users.root,
      ]);
      await as("root");
      await db.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: users.root, session_id: sid }),
      ]);
      await deny(() => context(orgs.A));
      await deny(() => home(orgs.A));
      await deny(() => save(orgs.A, "settings", { description: "Forbidden" }));
      assert.equal(
        (
          await db.query("select * from services where organization_id=$1", [
            orgs.A,
          ])
        ).rows.length,
        0,
      );
    },
  );
await test("Global session obeys enterprise scope even if role exists", async () => {
  const sid = await globalSession();
  await db.exec("reset role");
  await db.query(
    "update private.enterprise_sessions set organization_id=$1 where session_id=$2",
    [orgs.A, sid],
  );
  await as("root");
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: users.root, session_id: sid }),
  ]);
  await deny(() => context(orgs.B));
});
await test("Authenticated clients cannot write tables or call server/private entry points", async () => {
  await as("root");
  await deny(() =>
    db.query(
      "update company_settings set description='bypass' where organization_id=$1",
      [orgs.A],
    ),
  );
  await deny(() =>
    db.query(
      "insert into organization_user_guides(organization_id,user_id) values($1,$2)",
      [orgs.B, users.root],
    ),
  );
  await deny(() =>
    rpc("analytics_company_before_operations", {
      p_org: orgs.A,
      p_from: "2026-09-01",
      p_to: "2026-09-20",
      p_service: null,
      p_source: null,
    }),
  );
});
await test("Global changes retain the real actor in audit logs", async () => {
  await as("root");
  await save(orgs.A, "settings", {
    description: "Atualizado pela administração global",
  });
  const row = (
    await db.query(
      "select actor_id from audit_logs where organization_id=$1 and entity_table='company_settings' order by created_at desc,id desc limit 1",
      [orgs.A],
    )
  ).rows[0];
  assert.equal(row.actor_id, users.root);
});
await writeFile(
  "reports/company-workspace-sql.json",
  JSON.stringify(
    {
      environment: "LOCAL PGlite; Auth fixture; no real Supabase",
      passed: results.filter((r) => r.status === "PASS").length,
      failed: results.filter((r) => r.status === "FAIL").length,
      tests: results,
    },
    null,
    2,
  ),
);
await db.close();
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;

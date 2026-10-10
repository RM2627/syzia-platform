import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
const { db, as, rpc, scalar, orgs } = await consumerDB({
  through: "202609200028_company_workspace_authorization.sql",
});
const results = [];
const snapshot = () =>
  scalar(
    `select jsonb_build_object('orgs',(select jsonb_agg(to_jsonb(x) order by id) from organizations x),'members',(select jsonb_agg(to_jsonb(x) order by organization_id,user_id) from organization_members x),'settings',(select jsonb_agg(to_jsonb(x) order by organization_id) from company_settings x),'codes',(select jsonb_agg(to_jsonb(x) order by organization_id) from private.enterprise_codes x),'guides',(select jsonb_agg(to_jsonb(x) order by organization_id,user_id) from organization_user_guides x),'audit',(select count(*) from audit_logs),'trial',(select count(*) from private.trial_grants),'billing',(select count(*) from billing_subscriptions))`,
  );
const before = await snapshot();
await db.exec(
  await readFile(
    "supabase/migrations/202609200029_authorized_support.sql",
    "utf8",
  ),
);
assert.deepEqual(await snapshot(), before);
assert.equal(await scalar("select count(*) from private.support_requests"), 0);
results.push({
  name: "Upgrade 028 → 029 preserves business data/codes/history and creates no retroactive grants",
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
    console.error("FAIL", name, e.message, e.where);
  } finally {
    await db.exec("rollback;reset role");
  }
}
async function denied(fn, code = "42501") {
  await db.exec("savepoint denial");
  try {
    await fn();
  } catch (e) {
    await db.exec("rollback to denial");
    if (code) assert.equal(e.code, code);
    return e;
  }
  throw Error("Expected rejection");
}
const ctx = (o) => rpc("support_context", { p_org: o });
const request = (o = orgs.A, emergency = false, key = randomUUID()) =>
  rpc("support_request", {
    p_org: o,
    p_reason: "Investigar configuração solicitada pela empresa",
    p_hours: 1,
    p_key: key,
    p_emergency: emergency,
  });
async function approve() {
  await as("root");
  const id = await request();
  await as("adminA");
  await rpc("support_decide", { p_id: id, p_approve: true });
  await as("root");
  return id;
}
async function create(name = "Empresa sem administrador") {
  await as("root");
  return (
    await rpc("access_create_organization", {
      p_name: name,
      p_slug: "mestre-" + randomUUID(),
      p_key: randomUUID(),
    })
  ).organization_id;
}
await test("Code generation normalizes accents/Unicode, bounds length, handles repeated names and remains stable", async () => {
  const codes = new Set();
  for (const name of [
    "MS Auto Details",
    "MS Auto Details",
    "MS",
    "M sá",
    "123 & 456",
    "Æ ♥ 東京",
    "😀😀",
    "Empresa ".repeat(14),
    ...Array(24).fill("Mesmo Nome"),
  ]) {
    const o = await create(name);
    await db.exec("reset role");
    const code = await scalar(
      "select code from private.enterprise_codes where organization_id=$1",
      [o],
    );
    assert.match(code, /^[A-Z0-9]{1,8}-[A-F0-9]{5}$/);
    assert(!codes.has(code));
    codes.add(code);
    await as("root");
    await rpc("foundation_update_organization", {
      p_org: o,
      p_name: "Nome alterado",
      p_status: "active",
    });
    await db.exec("reset role");
    assert.equal(
      await scalar(
        "select code from private.enterprise_codes where organization_id=$1",
        [o],
      ),
      code,
    );
  }
});
await test("Global administrator configures company without ADM and no artificial membership", async () => {
  const o = await create();
  assert.equal((await ctx(o)).responsible, false);
  assert.equal((await ctx(o)).allowed, true);
  await rpc("company_initialize", { p_org: o });
  assert.equal((await rpc("onboarding_context", { p_org: o })).ready, false);
  await rpc("support_enter", { p_org: o, p_key: randomUUID() });
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(*) from organization_members where organization_id=$1",
      [o],
    ),
    0,
  );
});
await test("Upgrade blocks direct global RPCs, RLS and team management for company with responsible ADM", async () => {
  await as("root");
  assert.equal((await ctx(orgs.A)).allowed, false);
  for (const name of [
    "company_context",
    "company_initialize",
    "onboarding_context",
    "operations_home",
    "operations_directory",
    "access_team",
  ])
    await denied(() => rpc(name, { p_org: orgs.A }));
  await denied(() =>
    rpc("foundation_set_member", {
      p_org: orgs.A,
      p_user: users.worker,
      p_role: "admin_empresa",
      p_status: "active",
    }),
  );
  for (const table of [
    "company_settings",
    "services",
    "customers",
    "quote_requests",
    "appointments",
    "ticket_messages",
    "commercial_tasks",
  ])
    assert.equal(
      await scalar(`select count(*) from ${table} where organization_id=$1`, [
        orgs.A,
      ]),
      0,
      table,
    );
});
await test("Global aggregate analytics and organization/billing administration remain available without support", async () => {
  await as("root");
  const data = await rpc("analytics_platform", {
    p_from: "2026-01-01",
    p_to: "2026-12-31",
  });
  assert.equal(data.organizations, 2);
  assert.equal(data.revenue_cents, null);
  assert.equal(data.billing, "simulation_only");
  assert.equal(data.without_admin, 0);
  assert(Array.isArray(data.plans));
  assert.equal((await rpc("access_organizations")).length, 2);
  await rpc("foundation_update_organization", {
    p_org: orgs.A,
    p_name: "Administração global autorizada",
    p_status: "active",
  });
});
await test("Normal request is idempotent, visible to ADM and cannot be self-approved/cross-tenant/employee-approved", async () => {
  await as("root");
  const key = randomUUID(),
    id = await request(orgs.A, false, key);
  assert.equal(await request(orgs.A, false, key), id);
  await denied(() => rpc("support_decide", { p_id: id, p_approve: true }));
  await as("adminB");
  await denied(() => rpc("support_decide", { p_id: id, p_approve: true }));
  await as("worker");
  await denied(() => rpc("support_decide", { p_id: id, p_approve: true }));
  await as("adminA");
  assert.equal((await ctx(orgs.A)).requests[0].id, id);
  await rpc("support_decide", { p_id: id, p_approve: true });
  await rpc("support_decide", { p_id: id, p_approve: true });
  await as("root");
  assert.equal((await ctx(orgs.A)).allowed, true);
  assert.equal((await ctx(orgs.B)).allowed, false);
  await rpc("company_context", { p_org: orgs.A });
  await denied(() => rpc("company_context", { p_org: orgs.B }));
  const visit = randomUUID();
  await rpc("support_enter", { p_org: orgs.A, p_key: visit });
  await rpc("support_enter", { p_org: orgs.A, p_key: visit });
  assert.equal((await ctx(orgs.A)).visits.length, 1);
});
await test("Revocation denies next operational RPC and row read; keeps company-visible entry history", async () => {
  const id = await approve();
  await rpc("support_enter", { p_org: orgs.A, p_key: randomUUID() });
  await as("adminA");
  await rpc("support_revoke", { p_id: id });
  assert.equal((await ctx(orgs.A)).visits.length, 1);
  await as("root");
  assert.equal((await ctx(orgs.A)).allowed, false);
  await denied(() => rpc("operations_home", { p_org: orgs.A }));
  assert.equal(
    await scalar("select count(*) from services where organization_id=$1", [
      orgs.A,
    ]),
    0,
  );
});
await test("Support expires in database even if UI retains old state", async () => {
  const id = await approve();
  await db.exec("reset role");
  await db.query(
    "update private.support_requests set decided_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where id=$1",
    [id],
  );
  await as("root");
  assert.equal((await ctx(orgs.A)).allowed, false);
  await denied(() => rpc("company_context", { p_org: orgs.A }));
});
await test("Emergency requires reason, lasts 15 minutes, rate limits and is visible/auditable to ADM", async () => {
  await as("root");
  await denied(
    () =>
      rpc("support_request", {
        p_org: orgs.A,
        p_reason: "curto",
        p_hours: 1,
        p_key: randomUUID(),
        p_emergency: true,
      }),
    "22023",
  );
  const id = await request(orgs.A, true);
  const grant = (await ctx(orgs.A)).requests[0];
  assert.equal(grant.id, id);
  assert.equal(grant.mode, "emergency");
  assert(
    Math.abs(new Date(grant.expires_at) - new Date(grant.decided_at) - 900000) <
      1000,
  );
  await denied(() => request(orgs.A, true), "P0001");
  await rpc("support_enter", { p_org: orgs.A, p_key: randomUUID() });
  await as("adminA");
  assert.equal((await ctx(orgs.A)).requests[0].mode, "emergency");
  await rpc("support_revoke", { p_id: id });
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(*) from audit_logs where action='support_emergency'",
    ),
    1,
  );
});
await test("Company suspension/re-activation preserves identity and does not revive authorization", async () => {
  await approve();
  await rpc("foundation_update_organization", {
    p_org: orgs.A,
    p_name: "Empresa A",
    p_status: "suspended",
  });
  await denied(() => ctx(orgs.A));
  await rpc("foundation_update_organization", {
    p_org: orgs.A,
    p_name: "Empresa A",
    p_status: "active",
  });
  assert.equal((await ctx(orgs.A)).allowed, false);
});
await test("Revoked ADM role/profile invalidates an approval when another ADM remains responsible", async () => {
  await approve();
  await db.exec("reset role");
  await db.query(
    "insert into organization_members(organization_id,user_id,role) values($1,$2,'admin_empresa')",
    [orgs.A, users.backup],
  );
  await db.query("update profiles set status='suspended' where id=$1", [
    users.adminA,
  ]);
  await as("root");
  assert.equal((await ctx(orgs.A)).responsible, true);
  assert.equal((await ctx(orgs.A)).allowed, false);
});
await test("No valid ADM restores direct VIRELOQ management without fabricating membership", async () => {
  await db.exec("reset role");
  await db.query("update profiles set status='suspended' where id=$1", [
    users.adminA,
  ]);
  await as("root");
  assert.equal((await ctx(orgs.A)).responsible, false);
  assert.equal((await ctx(orgs.A)).allowed, true);
  const organizations = await rpc("access_organizations");
  const company = organizations.find((o) => o.id === orgs.A);
  assert.equal(company.setup_state, "awaiting_admin");
  assert.equal(company.responsible_admin, false);
});
await test("Password recovery for previously activated ADM never reopens unrestricted global access", async () => {
  await db.exec("reset role");
  await db.query(
    "insert into private.enterprise_accounts(organization_id,user_id,username,display_name,contact_email,role,state,activated_at,requested_by,request_key) values($1,$2,'admin.teste','ADM Teste','admin@example.invalid','admin_empresa','pending',now(),$3,$4)",
    [orgs.A, users.adminA, users.root, randomUUID()],
  );
  await as("root");
  assert.equal((await ctx(orgs.A)).responsible, true);
  assert.equal((await ctx(orgs.A)).allowed, false);
});
await test("Adopting an already responsible legacy ADM cannot reopen global access", async () => {
  await db.exec("reset role");
  await db.query(
    "insert into private.enterprise_accounts(organization_id,user_id,username,display_name,contact_email,role,state,requested_by,request_key) values($1,$2,'admin.legado','ADM Legado','legado@example.invalid','admin_empresa','reserved',$3,$4)",
    [orgs.A, users.adminA, users.root, randomUUID()],
  );
  await as("root");
  assert.equal((await ctx(orgs.A)).responsible, true);
  assert.equal((await ctx(orgs.A)).allowed, false);
});
await test("Shadow global membership cannot bypass operational/support restrictions", async () => {
  await db.exec("reset role");
  await db.query(
    "insert into organization_members(organization_id,user_id,role) values($1,$2,'admin_empresa')",
    [orgs.A, users.root],
  );
  await as("root");
  assert.equal((await ctx(orgs.A)).allowed, false);
  await denied(() => rpc("company_context", { p_org: orgs.A }));
  assert.equal(
    await scalar("select count(*) from services where organization_id=$1", [
      orgs.A,
    ]),
    0,
  );
});
await test("Tenant admins cannot read global analytics, audit, another company or private support records", async () => {
  await as("adminA");
  await denied(() =>
    rpc("analytics_platform", { p_from: "2026-01-01", p_to: "2026-12-31" }),
  );
  await denied(() => rpc("foundation_global_audit"));
  await denied(() => ctx(orgs.B));
  await denied(() => rpc("company_context", { p_org: orgs.B }));
  await denied(() => scalar("select * from private.support_requests"));
});
await test("Aggregate analytics and support queries are side-effect-free", async () => {
  await db.exec("reset role");
  const count = await scalar("select count(*) from audit_logs");
  await as("root");
  await rpc("analytics_platform", { p_from: "2026-01-01", p_to: "2026-12-31" });
  await ctx(orgs.A);
  await db.exec("reset role");
  assert.equal(await scalar("select count(*) from audit_logs"), count);
});
await test("New support tables retain FORCE RLS and authenticated cannot execute internal helpers", async () => {
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in ('support_requests','support_visits') and c.relrowsecurity and c.relforcerowsecurity",
    ),
    2,
  );
  await as("root");
  await denied(() =>
    scalar("select private.support_actor_allowed($1,$2)", [orgs.A, users.root]),
  );
});
await db.close();
await writeFile(
  "reports/master-audit-sql.json",
  JSON.stringify(
    {
      engine: process.env.FOUNDATION_NATIVE_SOCKET
        ? "PostgreSQL native"
        : "PGlite",
      results,
    },
    null,
    2,
  ),
);
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;

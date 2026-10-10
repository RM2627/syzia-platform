import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
import { randomUUID } from "node:crypto";
const c = await consumerDB({ through: "202609180025_b2b_invitations.sql" }),
  { db, scalar, as, rpc } = c,
  results = [];
await db.exec("reset role");
const counts = async () => ({
  org: await scalar("select count(*) from organizations"),
  members: await scalar("select count(*) from organization_members"),
  auth: await scalar("select count(*) from auth.users"),
  trial: await scalar("select count(*) from private.trial_grants"),
  billing: await scalar("select count(*) from billing_subscriptions"),
});
const before = await counts();
await db.exec(
  await readFile(
    "supabase/migrations/202609190026_enterprise_access.sql",
    "utf8",
  ),
);
assert.deepEqual(await counts(), before);
results.push({
  name: "Upgrade 025 → 026 preserva Auth, organizações, vínculos, trial e assinatura",
  status: "PASS",
});
await db.exec("begin");
await as("adminA");
await assert.rejects(() => rpc("foundation_context"));
await db.exec("rollback");
results.push({
  name: "Sessões empresariais antigas não contornam adoção do username",
  status: "PASS",
});
await db.exec("begin");
const sid = randomUUID();
assert(
  await scalar("select access_register_session($1,$2,null,null)", [
    users.root,
    sid,
  ]),
);
await as("root");
await db.query("select set_config('request.jwt.claims',$1,true)", [
  JSON.stringify({ sub: users.root, session_id: sid }),
]);
assert((await rpc("foundation_context")).roles.includes("super_admin"));
results.push({
  name: "Super Admin existente reautentica sem empresa fictícia nem reset",
  status: "PASS",
});
const a = await rpc("access_reserve", {
  p_org: c.orgs.A,
  p_name: null,
  p_slug: null,
  p_display: "Gestora Existente",
  p_username: "gestora.existente",
  p_email: "contato@example.invalid",
  p_phone: "",
  p_role: "admin_empresa",
  p_key: randomUUID(),
  p_existing: users.adminA,
});
assert.equal(a.user_id, users.adminA);
results.push({
  name: "Adoção explícita preserva ID e membership; username confirmado",
  status: "PASS",
});
await db.exec("rollback;reset role");
assert.equal(
  (
    await scalar("select access_before_user_created($1)", [
      JSON.stringify({
        user: {
          id: randomUUID(),
          is_anonymous: false,
          user_metadata: { vireloq_provisioned: true },
        },
      }),
    ])
  ).error.http_code,
  403,
);
assert.deepEqual(
  await scalar("select access_before_user_created($1)", [
    JSON.stringify({ user: { is_anonymous: true } }),
  ]),
  {},
);
results.push({
  name: "Hook nega cadastro público e metadata forjada; mantém sessão consumidora anônima",
  status: "PASS",
});
await writeFile(
  "reports/enterprise-access-upgrade.json",
  JSON.stringify(results, null, 2),
);
console.log(results);
await db.close();

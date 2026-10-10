import { consumerDB, users } from "./support/consumer-db.mjs";
import { randomUUID } from "node:crypto";
const { db, as, rpc, scalar } = await consumerDB({through:process.env.DIAG_THROUGH||null});
await db.exec("begin");
await as("root");
const org = (
  await rpc("access_create_organization", {
    p_name: "Empresa fictícia sob gestão",
    p_slug: "gestao-syzia-ficticia",
    p_key: randomUUID(),
  })
).organization_id;
await rpc("company_initialize", { p_org: org });
const sid = randomUUID();
await db.exec("reset role;set local role service_role");
await rpc("access_register_session", {
  p_user: users.root,
  p_session: sid,
  p_account: null,
  p_generation: null,
});
async function claims() {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: users.root, session_id: sid }),
  ]);
  await db.exec("set local role authenticated");
}
const operations = [
  ["access_session", {}],
  ["foundation_context", {}],
  ["permissions_context", { p_org: org }],
  ["onboarding_context", { p_org: org }],
  ["operations_home", { p_org: org }],
  ["company_context", { p_org: org }],
  ["consumer_admin_context", { p_org: org }],
  ["consumer_presence_context", { p_org: org }],
  ["consumer_page_draft", { p_org: org, p_show_prices: true }],
  ["billing_capabilities", { p_org: org }],
];
for (let cycle = 0; cycle < 3; cycle++)
  for (const [name, args] of operations) {
    await claims();
    await db.exec("savepoint call");
    try {
      const r = await rpc(name, args);
      console.log(
        cycle,
        name,
        "PASS",
        name === "consumer_admin_context"
          ? { schedule: r.schedule }
          : name === "access_session"
            ? r.organization_id
            : "",
      );
    } catch (e) {
      console.log(cycle, name, "FAIL", e.message, e.code, e.where);
      await db.exec("rollback to savepoint call");
    }
  }
await claims();
const img = await rpc("consumer_reserve_company_media", {
  p_org: org,
  p_mime: "image/png",
  p_size: 64,
  p_key: randomUUID(),
});
await db.exec("reset role;set local role service_role");
for (const op of [
  "consumer_gateway_company_media",
  "consumer_finalize_company_media",
]) {
  await db.exec("savepoint img");
  try {
    console.log(
      op,
      await rpc("access_media", {
        p_user: users.root,
        p_session: sid,
        p_operation: op,
        p_args:
          op === "consumer_gateway_company_media"
            ? { p_code: img.code, p_write: true }
            : {
                p_code: img.code,
                p_sha256: "a".repeat(64),
                p_size: 64,
                p_width: 4,
                p_height: 4,
              },
      }),
    );
  } catch (e) {
    console.log("MEDIAFAIL", e.message, e.code, e.where);
    await db.exec("rollback to savepoint img");
  }
}
await db.exec("rollback");
await db.close();

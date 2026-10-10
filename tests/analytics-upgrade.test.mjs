import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { consumerDB } from "./support/consumer-db.mjs";
import { seedCommercial } from "./fixtures/commercial.mjs";
const c = await consumerDB({ through: "202609160016_commercial_commands.sql" });
let status = "PASS",
  error;
try {
  await seedCommercial(c);
  const counts = () =>
    c.scalar(
      "select jsonb_build_object('opportunities',(select count(*) from opportunities),'events',(select count(*) from commercial_events),'audit',(select count(*) from audit_logs))",
    );
  const before = await counts();
  await c.db.exec(
    await readFile("supabase/migrations/202609170017_analytics.sql", "utf8"),
  );
  assert.deepEqual(await counts(), before);
  await c.db.exec("begin");
  await c.as("adminA");
  const y = new Date().getUTCFullYear();
  const x = await c.rpc("analytics_company", {
    p_org: c.orgs.A,
    p_from: y + "-01-01",
    p_to: y + "-12-31",
  });
  assert.equal(x.totals.opportunities, 1);
  assert.equal(x.values.quoted_cents, 12000);
  assert.equal(x.values.revenue_cents, null);
  await c.db.exec("rollback;reset role");
  console.log("PASS upgrade 016→017 sem reescrever histórico");
} catch (e) {
  status = "FAIL";
  error = e.message;
  process.exitCode = 1;
  console.error(error);
} finally {
  await c.db.close();
  await writeFile(
    "reports/analytics-upgrade-results.json",
    JSON.stringify(
      {
        environment: "LOCAL PGlite",
        results: [
          { name: "Upgrade 016→017 sem reescrever histórico", status, error },
        ],
      },
      null,
      2,
    ),
  );
}

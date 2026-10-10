import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { consumerDB } from "./support/consumer-db.mjs";
import { seedCommercial } from "./fixtures/commercial.mjs";
const c = await consumerDB({ through: "202609170017_analytics.sql" });
let status = "PASS",
  error;
try {
  await seedCommercial(c);
  const tables = [
    "organizations",
    "services",
    "quote_requests",
    "quote_versions",
    "request_events",
    "commercial_events",
    "tickets",
    "appointments",
  ];
  const snapshot = async () =>
    Object.fromEntries(
      await Promise.all(
        tables.map(async (t) => [
          t,
          (
            await c.db.query(
              `select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]') d from ${t} x`,
            )
          ).rows[0].d,
        ]),
      ),
    );
  const before = await snapshot();
  for (const m of [
    "202609180018_billing_schema.sql",
    "202609180019_billing_commands.sql",
    "202609180020_billing_limits.sql",
  ])
    await c.db.exec(await readFile("supabase/migrations/" + m, "utf8"));
  assert.deepEqual(await snapshot(), before);
  assert.equal(await c.scalar("select count(*) from billing_subscriptions"), 0);
  assert.equal(await c.scalar("select count(*) from billing_invoices"), 0);
  assert.equal(
    await c.scalar(
      "select count(*) from billing_usage where metric='requests'",
    ),
    2,
  );
  assert.equal(
    await c.scalar("select mock_enabled from private.billing_runtime"),
    false,
  );
} catch (e) {
  status = "FAIL";
  error = e.message;
  process.exitCode = 1;
} finally {
  await c.db.close();
  await writeFile(
    "reports/billing-upgrade-results.json",
    JSON.stringify(
      {
        environment: "LOCAL PGlite",
        results: [
          {
            name: "Upgrade 017→020 preserves business/history, backfills actual usage, no automatic billing",
            status,
            error,
          },
        ],
      },
      null,
      2,
    ),
  );
  console.log(status, error || "upgrade 017→020");
}

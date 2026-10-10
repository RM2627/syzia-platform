import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { consumerDB, users } from "./support/consumer-db.mjs";
const c = await consumerDB({ through: "202609180020_billing_limits.sql" }),
  { db, as, rpc, orgs, scalar } = c;
let status = "PASS",
  error;
try {
  await db.exec("begin");
  await as("root");
  const plan = await rpc("billing_plan_save", {
    p_id: null,
    p_revision: 0,
    p_data: {
      name: "Legacy fictício",
      price_cents: 1000,
      interval_months: 1,
      trial_days: 14,
      active: true,
      available: true,
    },
  });
  await as("adminA");
  await rpc("billing_subscription_action", {
    p_org: orgs.A,
    p_action: "trial",
    p_plan: plan,
    p_revision: 0,
    p_key: randomUUID(),
  });
  await db.exec("commit;reset role");
  const before = await scalar(
    "select jsonb_agg(to_jsonb(s)) from billing_subscriptions s",
  );
  await db.exec(
    await readFile(
      "supabase/migrations/202609180021_trial_eligibility.sql",
      "utf8",
    ),
  );
  assert.deepEqual(
    await scalar("select jsonb_agg(to_jsonb(s)) from billing_subscriptions s"),
    before,
  );
  assert.equal(await scalar("select count(*) from private.trial_grants"), 1);
  assert.equal(
    await scalar(
      "select count(*) from private.trial_claims where kind='account'",
    ),
    1,
  );
  await db.exec("begin");
  await as("root");
  const other = await scalar(
    "select foundation_create_organization('Legacy nova','legacy-nova',$1)",
    [users.adminA],
  );
  await rpc("billing_trial_verify", {
    p_org: other,
    p_kind: "business",
    p_value: "ZZ:DEMO:LEGACYNEW",
    p_evidence: "fixture-evidence",
    p_reason: "Fictitious verification after migration",
    p_verified: true,
  });
  await as("adminA");
  assert.equal(
    (
      await rpc("billing_subscription_action", {
        p_org: other,
        p_action: "trial",
        p_plan: plan,
        p_revision: 0,
        p_key: randomUUID(),
      })
    ).review_required,
    true,
  );
  await db.exec("rollback");
} catch (e) {
  status = "FAIL";
  error = e.message;
  process.exitCode = 1;
} finally {
  await db.close();
  await writeFile(
    "reports/trial-upgrade-results.json",
    JSON.stringify(
      {
        environment: "LOCAL PGlite",
        results: [
          {
            name: "Upgrade 020→021 preserves subscription and backfills historical trial/account claims",
            status,
            error,
          },
        ],
      },
      null,
      2,
    ),
  );
  console.log(status, error || "upgrade 020→021");
}

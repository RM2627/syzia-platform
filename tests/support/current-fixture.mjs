import { consumerDB as historical, users } from "./consumer-db.mjs";
import { readFile } from "node:fs/promises";
export { users };
export async function consumerDB() {
  const c = await historical({
    through: "202609260042_operational_refinements.sql",
  });
  await c.db.exec(
    await readFile(
      "supabase/migrations/202609260044_approved_audit_corrections.sql",
      "utf8",
    ),
  );
  if (process.env.SYZIA_TEAM_CURRENT === "1")
    await (
      await import("../../scripts/team-availability/fixture.mjs")
    ).upgradeTeamFixture(c.db);
  if (process.env.SYZIA_FLEXIBLE_CURRENT === "1" && process.env.SYZIA_TEAM_CURRENT === "1")
    await (await import("../../scripts/flexible-support/fixture.mjs")).upgradeFlexibleFixture(c.db);
  if (process.env.SYZIA_BILLING_CURRENT === "1" && process.env.SYZIA_FLEXIBLE_CURRENT === "1" && process.env.SYZIA_TEAM_CURRENT === "1")
    await (await import("../../scripts/billing-047/fixture.mjs")).upgradeBillingFixture(c.db);
if(process.env.SYZIA_OPERATION_CURRENT === "1") (await import("../../scripts/syzia-049/fixture.mjs")).attachOperationRPC(c);
  return c;
}

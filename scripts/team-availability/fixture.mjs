import { readFile } from "node:fs/promises";
// Explicitly fictitious operational policy; never imported by production code/migration.
// Large capacity avoids changing unrelated historic scenarios. Dedicated tests exercise finite quotas.
export async function upgradeTeamFixture(db, { configure = true } = {}) {
  await db.exec("reset role");
  await db.exec(
    await readFile(
      "supabase/migrations/202610030045_team_availability_assisted.sql",
      "utf8",
    ),
  );
  if (configure) await configureTeamFixture(db);
}
export async function configureTeamFixture(db) {
  await db.exec("reset role");
  const hours = Array.from({ length: 7 }, (_, day) => ({
    day,
    open: "00:00",
    close: "23:59",
  }));
  await db.query(
    "update private.assisted_policy set active=true,hours=$1,timezone='UTC'",
    [JSON.stringify(hours)],
  );
  await db.exec(
    "insert into private.assisted_plan_policy(plan_version_id,included,warning_at) select id,10000,9000 from billing_plan_versions where human_support on conflict do nothing",
  );
}

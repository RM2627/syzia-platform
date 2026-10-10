import { consumerDB } from "../../tests/support/consumer-db.mjs";
import { seedCentral } from "../../tests/fixtures/central.mjs";
import { writeFile } from "node:fs/promises";
const c = await consumerDB({
  through: "202609260041_self_service_journeys.sql",
});
await seedCentral(c);
await c.db.exec("begin");
await c.as("adminA");
const result = {};
for (const name of [
  "permissions_context",
  "operations_agenda",
  "operations_home",
  "access_team",
]) {
  try {
    await c.db.exec("savepoint check_call");
    const data = await c.rpc(name, {
      p_org: c.orgs.A,
      p_from: "2026-09-26",
      p_to: "2026-09-27",
    });
    result[name] = {
      ok: true,
      keys: Object.keys(data),
      ...(name === "operations_home" ? { data } : {}),
    };
  } catch (e) {
    await c.db.exec("rollback to savepoint check_call");
    result[name] = {
      ok: false,
      message: e.message,
      code: e.code,
      where: e.where,
      detail: e.detail,
    };
  }
}
await writeFile(
  "reports/syzia-042/diagnosis.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
await c.db.exec("rollback;begin read only");
await c.as("adminA");
try {
  await c.rpc("operations_home", { p_org: c.orgs.A });
  result.home_read_only = { ok: true };
} catch (e) {
  result.home_read_only = {
    ok: false,
    message: e.message,
    code: e.code,
    where: e.where,
  };
}
await c.db.exec("rollback");
await writeFile(
  "reports/syzia-042/diagnosis.json",
  JSON.stringify(result, null, 2),
);
console.log("READ ONLY", result.home_read_only);
await c.db.close();

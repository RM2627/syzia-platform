// Executes the unchanged operational suite on the current disposable schema + 054.
import { readFile, mkdir } from "node:fs/promises";
for (const name of [
  "SYZIA_TEAM_CURRENT",
  "SYZIA_FLEXIBLE_CURRENT",
  "SYZIA_BILLING_CURRENT",
  "SYZIA_OPTIONAL_MANUAL_CURRENT",
  "SYZIA_OPERATION_CURRENT",
])
  process.env[name] = "1";
const h = await import("../../tests/support/current-db.mjs");
try {
  await h.db.exec("commit;reset role");
  await h.db.exec(
    await readFile(
      "supabase/migrations/202610180054_commercial_preparation.sql",
      "utf8",
    ),
  );
  await mkdir("reports/syzia-044", { recursive: true });
  await import("../../tests/syzia-044-sql.test.mjs");
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
  try {
    await h.db.close();
  } catch {}
}

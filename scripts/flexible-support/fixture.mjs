import { readFile } from "node:fs/promises";
export async function upgradeFlexibleFixture(db) {
  await db.exec("reset role");
  await db.exec(
    await readFile(
      "supabase/migrations/202610030046_flexible_shared_support.sql",
      "utf8",
    ),
  );
}

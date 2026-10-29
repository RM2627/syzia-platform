import { fixture as billingFixture } from "../billing-047/fixture.mjs";
import { readFile, readdir } from "node:fs/promises";
export async function fixture({ through = 63 } = {}) {
  process.env.SYZIA_OPTIONAL_MANUAL_CURRENT = "1";
  process.env.SYZIA_OPERATION_CURRENT = "1";
  const c = await billingFixture();
  for (const n of (await readdir("supabase/migrations"))
    .filter(
      (n) =>
        /^202610(18|20|21|22|25|28)00(54|55|56|57|58|59|60|61|62|63)_/.test(
          n,
        ) && Number(n.slice(8, 12)) <= through,
    )
    .sort()) {
    try {
      await c.db.exec(await readFile("supabase/migrations/" + n, "utf8"));
    } catch (e) {
      await c.db.close();
      throw new Error(n + ": " + e.message + " at " + e.position);
    }
  }
  return c;
}

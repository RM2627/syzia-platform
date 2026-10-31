import { fixture as original } from "../academy-066/fixture.mjs";
import { readFile } from "node:fs/promises";
import { academyController } from "../../server/academy/controller.mjs";
export async function fixture({ beforeUpgrade } = {}) {
  const c = await original();
  try {
    if (beforeUpgrade) await beforeUpgrade(c);
    await c.db.exec(
      await readFile(
        "supabase/migrations/202610310067_academy_mail_diagnostics.sql",
        "utf8",
      ),
    );
  } catch (e) {
    await c.db.close();
    throw e;
  }
  const service = (a, d = {}) =>
    c.tx("service", () =>
      c.rpc(
        a === "delivery_finish" || a.startsWith("mail_test_")
          ? "academy_mail_service"
          : "academy_service",
        { p_action: a, p_data: d },
      ),
    );
  const asUser = (u, a, d = {}) =>
    c.asUser(
      u,
      a === "overview" || a.startsWith("mail_test_")
        ? "academy_mail_admin"
        : "academy_admin",
      { p_action: a, p_data: d },
    );
  const logs = [];
  const make = (extra = {}) =>
    academyController({
      service,
      asUser,
      send: async (v) => c.sent.push(v),
      storage: c.storage,
      origin: "http://127.0.0.1:5197",
      secret: "ab".repeat(32),
      mailEnabled: true,
      log: (r) => logs.push(r),
      ...extra,
    });
  return {
    ...c,
    service,
    admin: (a, d) => asUser("root", a, d),
    make,
    controller: make(),
    logs,
  };
}

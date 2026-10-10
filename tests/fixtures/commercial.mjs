import { seedCentral } from "./central.mjs";
import { randomUUID } from "node:crypto";
export async function seedCommercial(c, options={}) {
  const f = await seedCentral(c, { commercial: true, ...options }),
    { db, as, rpc, scalar, orgs } = c,
    codes = {};
  await db.exec("begin");
  for (const k of ["A", "B"]) {
    await as(k === "A" ? "alice" : "bob");
    await rpc("consumer_set_contact", {
      p_code: f.requests[k],
      p_allowed: true,
    });
    await as("admin" + k);
    await rpc("commercial_config_save", {
      p_org: orgs[k],
      p_revision: 1,
      p_data: {
        enabled: true,
        interval_minutes: 120,
        contact_hours: Array.from({ length: 7 }, (_, day) => ({
          day,
          open: "00:00",
          close: "23:59",
        })),
      },
    });
    const q = await rpc("consumer_request_context", { p_code: f.requests[k] });
    await rpc("consumer_send_quote", {
      p_code: f.requests[k],
      p_items: [{ name: "Lavagem de cuidado", quantity: 1, unit_cents: 12000 }],
      p_duration: 60,
      p_expires: new Date(Date.now() + 7 * 86400000).toISOString(),
      p_expected_revision: q.revision,
      p_key: randomUUID(),
    });
    await db.exec("reset role");
    codes[k] = await scalar(
      "select s.commercial_code from commercial_opportunity_state s join quote_requests q on q.opportunity_id=s.id where q.public_code=$1",
      [f.requests[k]],
    );
  }
  await db.exec(
    "reset role;update commercial_tasks set due_at=now()-interval '10 minutes';commit;reset role",
  );
  return { ...f, opportunities: codes };
}

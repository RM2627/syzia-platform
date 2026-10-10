import { readFile } from "node:fs/promises";
process.env.SYZIA_TEAM_CURRENT = "0";
process.env.SYZIA_FLEXIBLE_CURRENT = "0";
export const h = await import("./current-db.mjs");
export const { db, as, scalar, orgs, users, assert, denied, randomUUID } = h;
await db.exec(
  await readFile(
    "supabase/migrations/202610030045_team_availability_assisted.sql",
    "utf8",
  ),
);
export async function upgrade() {
  await db.exec("reset role");
  await db.exec(
    await readFile(
      "supabase/migrations/202610030046_flexible_shared_support.sql",
      "utf8",
    ),
  );
}
export async function rpc(name, args = {}) {
  const m = (
    await db.query(
      "select proargnames,proargtypes::oid[] types from pg_proc where pronamespace='public'::regnamespace and proname=$1",
      [name],
    )
  ).rows[0];
  assert.ok(m, name);
  return scalar(
    `select public.${name}(${(m.proargnames || []).map((n, i) => `${n}=>$${i + 1}`).join(",")})`,
    (m.proargnames || []).map((n, i) =>
      m.types[i] === 3802 ? JSON.stringify(args[n] ?? null) : (args[n] ?? null),
    ),
  );
}
export const weekly = () =>
  Array.from({ length: 7 }, (_, day) => ({
    day,
    open: "00:00",
    close: "23:59",
  })); // Fictitious test window, never a commercial default.
export async function policy({
  mode = "flexible",
  active = true,
  hours = [],
  timezone = "UTC",
} = {}) {
  await as("root");
  const d = await rpc("assisted_admin_context");
  return rpc("assisted_policy_mode_save", {
    p_revision: d.policy.revision,
    p_active: active,
    p_hours: hours,
    p_timezone: timezone,
    p_message: "Mensagem de teste: sua solicitação permanece registrada.",
    p_mode: mode,
  });
}
export async function quota(included = 3, warning = 2, org = orgs.A) {
  await as("root");
  const d = await rpc("assisted_admin_context");
  const v = d.companies.find((c) => c.id === org).usage.plan_version_id;
  return rpc("assisted_plan_save", {
    p_version: v,
    p_revision: d.versions.find((x) => x.id === v)?.revision || 0,
    p_included: included,
    p_warning: warning,
  });
}
export async function presence(actor, state) {
  await as(actor);
  return rpc("central_presence", { p_state: state });
}
export async function nobody() {
  for (const u of ["agentA", "backup", "agentB", "shared"])
    await presence(u, "offline");
}
export async function act(code, action, data = {}, actor = "shared") {
  await as(actor);
  const c = await rpc("central_context", { p_code: code });
  return rpc("central_act", {
    p_code: code,
    p_revision: c.ticket.revision,
    p_action: action,
    p_data: data,
    p_key: randomUUID(),
  });
}
export async function usage(org = orgs.A) {
  await as(org === orgs.A ? "adminA" : "adminB");
  return rpc("assisted_company_usage", { p_org: org });
}
export async function ticket(code = h.legacy.codes.A) {
  await db.exec("reset role");
  return scalar("select to_jsonb(t) from tickets t where public_code=$1", [
    code,
  ]);
}
export async function freshTicket() {
  const { p, s } = await h.setup({ mode: "fixed", contract: "immediate" });
  await h.autonomy(["price_list", "schedule", "reschedule", "cancel"]);
  const q = await h.draft(p, [h.empty(s)]);
  await h.complete(q, (await h.slots(p, [h.empty(s)]))[0]);
  await as("alice");
  await rpc("central_consumer_send", {
    p_request: q.code,
    p_body: "Dúvida fictícia para a equipe",
    p_key: randomUUID(),
  });
  const t = await rpc("central_consumer_thread", { p_request: q.code });
  return { q, code: t.code };
}

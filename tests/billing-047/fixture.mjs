import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { MercadoPagoSubscriptions } from "../../server/billing/mercado-pago.mjs";
import { subscriptions } from "../../server/billing/subscriptions.mjs";
import { fakeMercadoPago } from "./fake-provider.mjs";
export async function fixture({ beforeUpgrade, afterUpgrade, checkoutDiagnostics = true, integrated = checkoutDiagnostics, verifiedIdentity = true } = {}) {
  process.env.SYZIA_BILLING_CURRENT = "0";
  process.env.SYZIA_TEAM_CURRENT = "1"; process.env.SYZIA_FLEXIBLE_CURRENT = "1";
  const { consumerDB, users } = await import("../support/current-fixture.mjs");
  const c = await consumerDB();
  await c.db.exec("commit;reset role");
  if (beforeUpgrade) await beforeUpgrade(c);
  await c.db.exec(await readFile("supabase/migrations/202610050047_mercado_pago_subscriptions.sql", "utf8"));
  if (checkoutDiagnostics) await c.db.exec(await readFile("supabase/migrations/202610130051_checkout_diagnostics.sql", "utf8"));
  if (integrated) await c.db.exec(await readFile("supabase/migrations/202610140052_integrated_subscription_safety.sql", "utf8"));
  if (process.env.SYZIA_OPTIONAL_MANUAL_CURRENT === "1") await (await import("../../scripts/syzia-048/fixture.mjs")).upgradeOptionalManualFixture(c.db);
  if (afterUpgrade) await afterUpgrade(c);
  await c.db.exec("begin;update private.billing_runtime set mock_enabled=false;update organization_members set status='suspended'where role='colaborador_empresa'");
  const rpc = async (name, args = {}) => {
    const { rows: [meta] } = await c.db.query("select proargnames,proargtypes::oid[] types from pg_proc where pronamespace='public'::regnamespace and proname=$1", [name]);
    return c.scalar(`select public.${name}(${meta.proargnames.map((n, i) => `${n}=>$${i + 1}`).join(",")})`, meta.proargnames.map((n, i) => meta.types[i] === 3802 ? JSON.stringify(args[n] ?? null) : args[n] ?? null));
  };
  const versions = {};
  for (const [code, name, price, members, full] of [["essencial", "Essencial", 4990, 1, false], ["profissional", "Profissional", 8990, 3, true], ["equipe", "Equipe", 14990, 8, true]]) {
    await c.as("root");
    const plan = await rpc("billing_plan_save", { p_id: null, p_revision: 0, p_data: { name, price_cents: price, interval_months: 1, trial_days: 7, active: true, available: true, self_service: true, self_service_trial: true, site_visible: true,
      member_limit: members, service_limit: null, request_limit: null, ticket_limit: null, followup_limit: null, human_support: false, commercial_followups: full, quota_semantics: 2,
      capabilities: { software: true, finance: full, analytics: full, commercial_followups: full, human_support: false } } });
    await c.db.exec("reset role");
    versions[code] = await c.scalar("select id from billing_plan_versions where plan_id=$1 order by version desc limit 1", [plan]);
    await c.db.exec("set local role service_role");
    await rpc("billing047_offer_set", { p_code: code, p_version: versions[code], p_trial_plan: code + "-trial", p_paid_plan: code + "-paid" });
  }
  for (const k of ["A", "B"]) {
    await c.as("admin" + k);
    await rpc("billing047_identify", { p_org: c.orgs[k], p_kind: "CPF", p_document: k === "A" ? "52998224725" : "11144477735" });
  }
  if (integrated && verifiedIdentity) {
    await c.as("root");
    for (const k of ["A", "B"]) await rpc("billing051_verify_identity", { p_org: c.orgs[k], p_type: "CPF", p_value: k === "A" ? "52998224725" : "11144477735", p_method: "document_checked", p_confirmed: true });
  }
  await c.db.exec("commit");
  // Serialize short SQL transactions; network operations remain outside the queue.
  let queue = Promise.resolve();
  const tx = (role, fn) => {
    const run = async () => { await c.db.exec("begin"); try { if (role === "service") await c.db.exec("reset role;set local role service_role"); else await c.as(role); const r = await fn(); await c.db.exec("commit"); return r; } catch (e) { await c.db.exec("rollback"); throw e; } };
    const job = queue.then(run, run); queue = job.catch(() => {}); return job;
  };
  const service = (name, args) => tx("service", () => rpc(name, args));
  const asUser = (name, method, args) => tx(name, () => method === "access_session" ? { id: users[name] } : rpc(method, args));
  const fake = fakeMercadoPago();
  const gateway = new MercadoPagoSubscriptions({ accessToken: "offline-fixture-credential", publicKey: "offline-public-key", collectorId: 101, applicationId: 202,
    appOrigin: "https://syzia.example.invalid", notificationUrl: "https://billing.example.invalid/billing/notifications", fetchImpl: fake.fetchImpl });
  const engine = subscriptions({ gateway, service, asUser, auth: async name => users[name] ? { id: users[name], email: name + "@example.invalid" } : null });
  const view = (k = "A") => asUser("admin" + k, "billing047_context", { p_org: c.orgs[k] });
  const command = (action = "checkout", code = "essencial", k = "A", extra = {}) => engine.user("command", { organization_id: c.orgs[k], action, request_key: randomUUID(), ...(action === "checkout" ? { trial_expected: true, payer_email: 'admin' + k + '@example.invalid' } : {}), ...(["checkout", "change"].includes(action) ? { plan_version_id: versions[code] } : {}), ...(["checkout", "method"].includes(action) ? { card_token: "offline-token-for-tests-only" } : {}), ...extra }, "admin" + k);
  const rawSQL = (query, args = []) => tx("service", async () => { await c.db.exec("reset role"); return c.db.query(query, args); });
  return { ...c, users, rpc, tx, service, asUser, fake, gateway, engine, view, command, versions, rawSQL };
}

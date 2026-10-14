import { MercadoPagoSubscriptions } from "../../server/billing/mercado-pago.mjs";
import { subscriptions } from "../../server/billing/subscriptions.mjs";
import { fakeMercadoPago } from "../../tests/billing-047/fake-provider.mjs";
export async function browserBillingFixture({ c, invoke, getName, user, serialize }) {
  if (process.env.DEMO_TEST_MODE !== "true" || process.env.DEMO_BILLING_047 !== "true") throw Error("local_billing_fixture_only");
  await c.db.exec("begin;reset role;update private.billing_runtime set mock_enabled=false;update organization_members set status='suspended'where role='colaborador_empresa'");
  for (const [code, name, price, members, full] of [["essencial", "Essencial", 4990, 1, false], ["profissional", "Profissional", 8990, 3, true], ["equipe", "Equipe", 14990, 8, true]]) {
    await c.as("root");
    const plan = await c.rpc("billing_plan_save", { p_id: null, p_revision: 0, p_data: { name, price_cents: price, interval_months: 1, trial_days: 7, active: true, available: true, self_service: true, self_service_trial: true, site_visible: true, member_limit: members, human_support: false, commercial_followups: full, quota_semantics: 2,
      capabilities: { software: true, finance: full, analytics: full, commercial_followups: full, human_support: false } } });
    await c.db.exec("reset role");
    const version = await c.scalar("select id from billing_plan_versions where plan_id=$1 order by version desc limit 1", [plan]);
    await c.db.exec("set local role service_role");
    await c.rpc("billing047_offer_set", { p_code: code, p_version: version, p_trial_plan: code + "-trial", p_paid_plan: code + "-paid" });
  }
  // Explicit fictitious superadmin review, only in the disposable test database.
  // A typed identifier or an unaudited seed row is not trusted identity proof.
  await c.as("root");
  await c.rpc("billing051_verify_identity", {p_org:c.orgs.A,p_type:"CPF",p_value:"52998224725",p_method:"document_checked",p_confirmed:true});
  await c.db.exec("commit");
  const fake = fakeMercadoPago();
  let rejectFirst = process.env.DEMO_BILLING_047_REJECT_FIRST === "true";
  const gateway = new MercadoPagoSubscriptions({ accessToken: "offline-fixture-only", publicKey: "offline-public-key", collectorId: 101, applicationId: 202, appOrigin: "https://app.example.invalid", notificationUrl: "https://api.example.invalid/billing/notifications", fetchImpl: async (url, init) => { if (rejectFirst && new URL(url).pathname === "/preapproval" && init.method === "POST") { rejectFirst = false; return new Response("{}", { status: 400 }); } return fake.fetchImpl(url, init); } });
  const billing = subscriptions({ gateway, service: (name, args) => serialize(() => invoke(name,args)), asUser: (token,name,args) => serialize(() => invoke(name,args,getName(token),token)), auth: async token => user(getName(token)) });
  return { billing, fake };
}

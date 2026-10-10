import { randomUUID } from "node:crypto";
export async function seedBillingDemo(c) {
  if (c.db.constructor.name !== "PGlite")
    throw Error("Billing fixtures require disposable LOCAL PGlite");
  const { db, as, rpc, orgs } = c;
  await db.exec("begin;update private.billing_runtime set mock_enabled=true");
  await as("root");
  const base = {
    description:
      "Oferta fictícia para demonstrar recursos. Preço editável; não há cobrança real.",
    active: true,
    available: true,
    interval_months: 1,
    trial_days: 15,
    commercial_followups: true,
    member_limit: 10,
    service_limit: 20,
    request_limit: 200,
    ticket_limit: 200,
    followup_limit: 200,
  };
  const software = await rpc("billing_plan_save", {
    p_id: null,
    p_revision: 0,
    p_data: {
      ...base,
      name: "Essencial · demonstração",
      price_cents: 9900,
      position: 1,
      human_support: false,
    },
  });
  const human = await rpc("billing_plan_save", {
    p_id: null,
    p_revision: 0,
    p_data: {
      ...base,
      name: "Com equipe · demonstração",
      price_cents: 29900,
      position: 2,
      human_support: true,
      member_limit: 25,
      service_limit: 50,
      request_limit: 500,
      ticket_limit: 500,
      followup_limit: 500,
    },
  });
  for (const k of ["A", "B"]) {
    await rpc("billing_trial_verify", {
      p_org: orgs[k],
      p_kind: "business",
      p_value: "ZZ:DEMO:COMPANY" + k,
      p_evidence: "fixture-local-" + k,
      p_reason: "Identidade totalmente fictícia da demonstração local",
      p_verified: true,
    });
  }
  // Keep both organizations operational to preserve the complete demo journeys.
  for (const k of ["A", "B"]) {
    await as("admin" + k);
    const x = await rpc("billing_subscription_action", {
      p_org: orgs[k],
      p_action: k === "A" ? "subscribe" : "trial",
      p_plan: human,
      p_revision: 0,
      p_key: randomUUID(),
    });
    if (x.invoice_id) {
      await as("root");
      await rpc("billing_mock_event", {
        p_event: randomUUID(),
        p_invoice: x.invoice_id,
        p_state: "paid",
        p_amount: 29900,
      });
    }
  }
  await db.exec("commit;reset role");
  return { software, human };
}

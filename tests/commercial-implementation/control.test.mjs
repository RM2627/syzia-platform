import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import { fixture } from "../billing-047/fixture.mjs";
import { commercialController } from "../../server/commercial/controller.mjs";
import { secretBox, digest } from "../../server/commercial/crypto.mjs";
let c, ctl, lead, d, claim, draft, org, activation, config;
const sent = [];
let mailFailure = false;
const rpc = (name, args = {}, who = "root") => c.asUser(who, name, args),
  service = (action, data = {}) =>
    c.service("commercial_service", { p_action: action, p_data: data });
const authorize = (purpose) =>
  rpc("commercial_contact_authorize", {
    p_id: lead,
    p_purpose: purpose,
    p_authorized: true,
    p_notice: "commercial-v1",
    p_evidence: "Solicitou convite e autorizou contato por e-mail.",
    p_expires: new Date(Date.now() + 86400000 * 10).toISOString(),
  });
before(async () => {
  process.env.SYZIA_OPTIONAL_MANUAL_CURRENT = "1";
  process.env.SYZIA_OPERATION_CURRENT = "1";
  c = await fixture();
  await c.db.exec(
    await readFile(
      "supabase/migrations/202610180054_commercial_preparation.sql",
      "utf8",
    ),
  );
  ctl = commercialController({
    asUser: c.asUser,
    service: c.service,
    auth: async (token) => (c.users[token] ? { id: c.users[token] } : null),
    store: {},
    sendMail: async (x) => {
      if (mailFailure)
        throw Object.assign(Error("private response"), { code: "ETIMEDOUT" });
      sent.push(x);
    },
    box: secretBox(randomBytes(32).toString("base64")),
    origins: {
      appOrigin: "https://app.example.invalid",
      publicOrigin: "https://demo.example.invalid",
    },
    contact: "contato@example.invalid",
  });
  lead = (
    await rpc("commercial_contact_save", {
      p_id: null,
      p_revision: 0,
      p_key: randomUUID(),
      p_data: {
        name: "Marina Costa",
        company: "Aurora Interiores",
        email: "aurora@example.invalid",
        stage: "wants_trial",
      },
    })
  ).id;
  const id = (
    await rpc("commercial_demo_save", {
      p_id: null,
      p_revision: 0,
      p_key: randomUUID(),
      p_lead: lead,
      p_name: "Aurora Interiores",
      p_slug: "aurora-interiores",
      p_plan: c.versions.profissional,
      p_expires: new Date(Date.now() + 86400000 * 14).toISOString(),
    })
  ).id;
  config = (
    await c.rawSQL("select private.commercial_config_export($1)cfg", [c.orgs.A])
  ).rows[0].cfg;
  d = await rpc("commercial_demo_edit_context", { p_id: id });
  await rpc("commercial_demo_publish", {
    p_id: d.id,
    p_revision: d.revision,
    p_config: config,
  });
  d = await rpc("commercial_demo_edit_context", { p_id: id });
});
after(async () => {
  await ctl?.close();
  await c?.db.close();
});
test("A01 published prep does not create organization or billing record", async () => {
  assert.equal(
    (await c.rawSQL("select count(*)::int n from private.billing047_contracts"))
      .rows[0].n,
    0,
  );
  assert.equal(
    (await c.rawSQL("select count(*)::int n from private.commercial_claims"))
      .rows[0].n,
    0,
  );
});
test("M01 no link or delivery without purpose authorization", async () => {
  await assert.rejects(
    ctl.operator("invite", { id: d.id, purpose: "demonstration" }, "root"),
    /not_authorized/,
  );
  await authorize("demonstration");
  await authorize("activation");
});
test("M02 per-recipient links contain no identity/admin credential and sealed token is absent from UI projection", async () => {
  const a = await ctl.operator(
      "invite",
      { id: d.id, purpose: "demonstration" },
      "root",
    ),
    b = await ctl.operator(
      "invite",
      { id: d.id, purpose: "demonstration" },
      "root",
    );
  assert.notEqual(a.url, b.url);
  assert.equal(new URL(a.url).pathname, "/aurora-interiores");
  assert.doesNotMatch(a.url, /aurora@example|root|access_token/);
  const m = await rpc("commercial_management");
  assert.ok(
    m.invites.every((i) => !("sealed_token" in i) && !("token_hash" in i)),
  );
});
test("M03 preview never sends; changed selection and missing confirmation are rejected", async () => {
  const p = await ctl.operator(
    "preview",
    { demo_ids: [d.id], purpose: "demonstration" },
    "root",
  );
  assert.equal(sent.length, 0);
  assert.equal(p.count, 1);
  await assert.rejects(
    ctl.operator("send", { ...p, confirmed: true }, "root"),
    /commercial_invalid/,
  );
  await assert.rejects(
    ctl.operator(
      "send",
      { id: p.id, hash: p.hash, items: p.items, confirmed: false },
      "root",
    ),
    /confirmation/,
  );
  await assert.rejects(
    ctl.operator(
      "send",
      {
        id: p.id,
        hash: p.hash,
        items: [{ ...p.items[0], lead_id: randomUUID() }],
        confirmed: true,
      },
      "root",
    ),
    /confirmation/,
  );
});
test("M04 two tabs submit one explicit authorization; SMTP invoked only once", async () => {
  const p = await ctl.operator(
      "preview",
      { demo_ids: [d.id], purpose: "demonstration" },
      "root",
    ),
    body = { id: p.id, hash: p.hash, items: p.items, confirmed: true };
  const r = await Promise.all([
    ctl.operator("send", body, "root"),
    ctl.operator("send", body, "root"),
  ]);
  await ctl.drain();
  assert.equal(sent.length, 1);
  assert.equal(r.filter((x) => x.reused).length, 1);
  assert.equal(
    (await rpc("commercial_management")).deliveries[0].state,
    "accepted",
  );
  assert.equal(
    (await rpc("commercial_management")).contacts[0].stage,
    "wants_trial",
  );
});
test("M05 recent delivery, duplicate IDs and tenant administrators cannot bypass sending controls", async () => {
  await assert.rejects(
    ctl.operator(
      "preview",
      { demo_ids: [d.id, d.id], purpose: "demonstration" },
      "root",
    ),
    /batch_invalid/,
  );
  const p = await ctl.operator(
    "preview",
    { demo_ids: [d.id], purpose: "demonstration" },
    "root",
  );
  await assert.rejects(
    ctl.operator(
      "send",
      { id: p.id, hash: p.hash, items: p.items, confirmed: true },
      "root",
    ),
    /recent_delivery/,
  );
  await assert.rejects(
    ctl.operator(
      "preview",
      { demo_ids: [d.id], purpose: "demonstration" },
      "adminA",
    ),
    /access_denied/,
  );
});
test("M06 timeout is uncertain, preserved, never automatically resent", async () => {
  mailFailure = true;
  const p = await ctl.operator(
      "preview",
      { demo_ids: [d.id], purpose: "activation" },
      "root",
    ),
    body = { id: p.id, hash: p.hash, items: p.items, confirmed: true };
  await ctl.operator("send", body, "root");
  await ctl.drain();
  assert.equal(
    (await rpc("commercial_management")).deliveries.filter(
      (d) => d.state === "uncertain",
    ).length,
    1,
  );
  const prior = sent.length;
  await ctl.operator("send", body, "root");
  await ctl.drain();
  assert.equal(sent.length, prior);
  mailFailure = false;
});
test("A02 possession of invitation does not assign ownership or approve relationship", async () => {
  activation = await ctl.operator(
    "invite",
    { id: d.id, purpose: "activation" },
    "root",
  );
  const secret = new URLSearchParams(new URL(activation.url).hash.slice(1)).get(
    "convite",
  );
  const h = digest(secret);
  claim = await rpc(
    "commercial_claim_request",
    {
      p_hash: h,
      p_statement:
        "Sou responsável pela Aurora e posso confirmar o vínculo pelo canal previamente combinado.",
    },
    "adminA",
  );
  assert.equal(claim.state, "requested");
  await assert.rejects(
    rpc(
      "commercial_claim_request",
      {
        p_hash: h,
        p_statement: "Outro responsável pede acesso sem verificação.",
      },
      "adminB",
    ),
    /claim_conflict/,
  );
  assert.equal(
    (await rpc("commercial_claim_context", { p_id: claim.id }, "adminA"))
      .organization_id,
    null,
  );
  await assert.rejects(
    rpc("commercial_claim_context", { p_id: claim.id }, "adminB"),
    /denied/,
  );
});
test("A03 only Super Admin approves; every decision retains audit detail", async () => {
  const a = {
    p_id: claim.id,
    p_approve: true,
    p_note:
      "Vínculo confirmado em contato independente e registrado pelo proprietário.",
  };
  await assert.rejects(rpc("commercial_claim_review", a, "adminA"), /denied/);
  await rpc("commercial_claim_review", { ...a, p_approve: false });
  await rpc("commercial_claim_review", a);
  const m = await rpc("commercial_management");
  assert.equal(m.claims[0].reviews.length, 2);
  assert.equal(m.claims[0].state, "approved");
});
test("A04 configuration approval and original identity/plan/consent checks remain mandatory", async () => {
  await c.rawSQL(
    "update auth.users set email='responsavel@example.invalid'where id=$1",
    [c.users.adminA],
  );
  await c.service("access_selfservice_identity", {
    p_user: c.users.adminA,
    p_name: "Marina Costa",
    p_username: "marina.aurora",
  });
  const plan = (
    await c.rawSQL("select plan_id from billing_plan_versions where id=$1", [
      c.versions.profissional,
    ])
  ).rows[0].plan_id;
  draft = await rpc(
    "selfservice_save",
    {
      p_id: null,
      p_revision: 0,
      p_name: "Aurora Interiores",
      p_slug: "aurora-vinculada",
      p_phone: "81999990000",
      p_kind: "CPF",
      p_document: "52998224725",
      p_plan: plan,
      p_key: randomUUID(),
    },
    "adminA",
  );
  const args = {
    p_id: claim.id,
    p_snapshot: d.snapshot_hash,
    p_draft: draft.id,
    p_revision: draft.revision,
    p_consent: true,
    p_conditions: "billing-047",
    p_reviewed: true,
  };
  await assert.rejects(
    rpc("commercial_claim_complete", { ...args, p_reviewed: false }, "adminA"),
    /review_required/,
  );
  await assert.rejects(
    rpc(
      "commercial_claim_complete",
      { ...args, p_snapshot: "altered" },
      "adminA",
    ),
    /review_required/,
  );
  await assert.rejects(
    rpc("commercial_claim_complete", { ...args, p_consent: false }, "adminA"),
    /consent_required/,
  );
});
test("A05 repeated completion creates exactly one restricted organization without trial/publication", async () => {
  const args = {
    p_id: claim.id,
    p_snapshot: d.snapshot_hash,
    p_draft: draft.id,
    p_revision: draft.revision,
    p_consent: true,
    p_conditions: "billing-047",
    p_reviewed: true,
  };
  const r = await Promise.all([
    rpc("commercial_claim_complete", args, "adminA"),
    rpc("commercial_claim_complete", args, "adminA"),
  ]);
  org = r[0].organization_id;
  assert.ok(org);
  assert.equal(r[1].organization_id, org);
  assert.equal(
    (await rpc("billing_capabilities", { p_org: org }, "adminA")).software,
    false,
  );
  for (const table of [
    "quote_requests",
    "appointments",
    "billing_invoices",
    "private.billing047_contracts",
    "private.trial_grants",
    "consumer_publications",
  ])
    assert.equal(
      (
        await c.rawSQL(
          "select count(*)::int n from " + table + " where organization_id=$1",
          [org],
        )
      ).rows[0].n,
      0,
    );
  assert.equal(
    (
      await c.rawSQL(
        "select count(*)::int n from services where organization_id=$1 and active",
        [org],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await c.rawSQL(
        "select count(*)::int n from organization_members where organization_id=$1",
        [org],
      )
    ).rows[0].n,
    1,
  );
});
test("A06 prepared catalog does not unlock capabilities; cross-tenant finalize is forbidden", async () => {
  assert.equal(
    (await rpc("commercial_import_finalize", { p_org: org }, "adminA")).pending,
    true,
  );
  await assert.rejects(
    rpc("commercial_import_finalize", { p_org: org }, "adminB"),
    /denied/,
  );
  assert.equal(
    (await rpc("billing_capabilities", { p_org: org }, "adminA")).software,
    false,
  );
});
test("A06b existing checkout with simulated provider confirms access; import never starts trial itself", async () => {
  await rpc("billing051_verify_identity", {
    p_org: org,
    p_type: "CPF",
    p_value: "52998224725",
    p_method: "document_checked",
    p_confirmed: true,
  });
  const context = await rpc("billing047_context", { p_org: org }, "adminA");
  const command = {
    organization_id: org,
    action: "checkout",
    plan_version_id: c.versions.profissional,
    request_key: randomUUID(),
    card_token: "offline-only-card",
    payer_email: "pagador@example.invalid",
    trial_expected: true,
  };
  let r;
  try {
    r = await c.engine.user("command", command, "adminA");
  } catch (e) {
    if (e.code !== "billing_trial_changed") throw e;
    r = await c.engine.user(
      "command",
      { ...command, request_key: randomUUID(), trial_expected: false },
      "adminA",
    );
  }
  if (r.subscription.state === "payment_pending") {
    const p = [...c.fake.subscriptions.values()].find(
      (x) => x.external_reference === r.subscription.id,
    );
    c.fake.charge(p.id);
    await c.engine.process(r.subscription.id);
  }
  const before = (
    await c.rawSQL(
      "select count(*)::int n from private.trial_grants where organization_id=$1",
      [org],
    )
  ).rows[0].n;
  const done = await rpc(
    "commercial_import_finalize",
    { p_org: org },
    "adminA",
  );
  assert.equal(done.activated, true);
  assert.equal(
    (await rpc("billing_capabilities", { p_org: org }, "adminA")).software,
    true,
  );
  assert.equal(
    (
      await c.rawSQL(
        "select count(*)::int n from services where organization_id=$1 and active",
        [org],
      )
    ).rows[0].n,
    config.tables.services.filter((x) => x.active).length,
  );
  assert.equal(
    (
      await c.rawSQL(
        "select count(*)::int n from private.trial_grants where organization_id=$1",
        [org],
      )
    ).rows[0].n,
    before,
  );
  assert.equal(
    (await rpc("commercial_import_finalize", { p_org: org }, "adminA")).pending,
    false,
  );
  assert.equal(
    (
      await c.rawSQL(
        "select count(*)::int n from consumer_publications where organization_id=$1",
        [org],
      )
    ).rows[0].n,
    0,
  );
});
test("A06c commercial stage follows verified local billing and an unrelated contact edit preserves event history", async () => {
  const management = await rpc("commercial_management");
  const contact = management.contacts.find((x) => x.id === lead);
  const billing = (
    await c.rawSQL(
      "select state from private.billing047_contracts where organization_id=$1",
      [org],
    )
  ).rows[0];
  assert.equal(
    contact.display_stage,
    billing.state === "trialing" ? "trialing" : "paying",
  );
  await rpc("commercial_contact_save", {
    p_id: lead,
    p_revision: contact.revision,
    p_key: randomUUID(),
    p_data: {
      name: contact.name,
      company: contact.company,
      email: contact.email,
      notes: "Configuração revisada.",
    },
  });
  const updated = (await rpc("commercial_management")).contacts.find(
    (x) => x.id === lead,
  );
  assert.equal(updated.stage, contact.stage);
  assert.equal(updated.display_stage, contact.display_stage);
  await assert.rejects(
    rpc("commercial_contact_save", {
      p_id: lead,
      p_revision: updated.revision,
      p_key: randomUUID(),
      p_data: {
        name: contact.name,
        company: contact.company,
        email: contact.email,
        stage: "paying",
      },
    }),
    /commercial_event_required/,
  );
});
test("A07 unsafe configuration fails transactionally and private review history cannot be written directly", async () => {
  const bad = structuredClone(config);
  bad.tables.services[0].organization_id = c.orgs.B;
  const before = (await c.rawSQL("select count(*)::int n from services"))
    .rows[0].n;
  await assert.rejects(
    c.rawSQL("select private.commercial_config_apply($1,$2,$3)", [
      c.orgs.B,
      JSON.stringify(bad),
      c.users.adminB,
    ]),
    /configuration_invalid/,
  );
  assert.equal(
    (await c.rawSQL("select count(*)::int n from services")).rows[0].n,
    before,
  );
  for (const role of ["anon", "authenticated", "service_role"])
    assert.equal(
      (
        await c.rawSQL(
          "select has_table_privilege($1,'private.commercial_claim_reviews','insert')ok",
          [role],
        )
      ).rows[0].ok,
      false,
    );
});
test("M07 unsubscribe is explicit and applies to all future invitations to the address", async () => {
  const secret = new URLSearchParams(new URL(activation.url).hash.slice(1)).get(
    "convite",
  );
  await assert.rejects(
    ctl.visitor("unsubscribe", { invitation: secret, confirmed: false }),
    /confirmation/,
  );
  await ctl.visitor("unsubscribe", { invitation: secret, confirmed: true });
  await assert.rejects(
    ctl.operator("invite", { id: d.id, purpose: "activation" }, "root"),
    /not_authorized/,
  );
});
test("A08 revocation invalidates public resolution and later claim completion", async () => {
  await rpc("commercial_demo_revoke", { p_id: d.id, p_revision: d.revision });
  await assert.rejects(service("demo", { id: d.id }), /unavailable/);
  await assert.rejects(
    ctl.visitor("invite", {
      invitation: new URLSearchParams(
        new URL(activation.url).hash.slice(1),
      ).get("convite"),
    }),
    /invalid/,
  );
  assert.equal(
    (await rpc("commercial_claim_context", { p_id: claim.id }, "adminA"))
      .organization_id,
    org,
  );
});
test("A09 snapshot revision/revocation requires a new relationship review; email alone grants nothing", async () => {
  const newLead = (
    await rpc("commercial_contact_save", {
      p_id: null,
      p_revision: 0,
      p_key: randomUUID(),
      p_data: {
        name: "Lia Costa",
        company: "Casa Horizonte",
        email: "lia@example.invalid",
        stage: "wants_trial",
      },
    })
  ).id;
  await rpc("commercial_contact_authorize", {
    p_id: newLead,
    p_purpose: "activation",
    p_authorized: true,
    p_notice: "commercial-v1",
    p_evidence: "Solicitação expressa de convite para ativação.",
    p_expires: new Date(Date.now() + 86400000).toISOString(),
  });
  const a = await rpc("commercial_demo_save", {
    p_id: null,
    p_revision: 0,
    p_key: randomUUID(),
    p_lead: newLead,
    p_name: "Casa Horizonte",
    p_slug: "casa-horizonte",
    p_plan: c.versions.profissional,
    p_expires: new Date(Date.now() + 86400000 * 2).toISOString(),
  });
  await rpc("commercial_demo_publish", {
    p_id: a.id,
    p_revision: a.revision,
    p_config: config,
  });
  const current = await rpc("commercial_demo_edit_context", { p_id: a.id });
  const i = await ctl.operator(
      "invite",
      { id: a.id, purpose: "activation" },
      "root",
    ),
    h = digest(
      new URLSearchParams(new URL(i.url).hash.slice(1)).get("convite"),
    );
  const q = await rpc(
    "commercial_claim_request",
    {
      p_hash: h,
      p_statement:
        "Responsável pela Casa Horizonte solicita análise do vínculo.",
    },
    "adminB",
  );
  await rpc("commercial_demo_publish", {
    p_id: a.id,
    p_revision: current.revision,
    p_config: config,
  });
  assert.equal(
    (await rpc("commercial_claim_context", { p_id: q.id }, "adminB")).stale,
    true,
  );
  await assert.rejects(
    rpc("commercial_claim_review", {
      p_id: q.id,
      p_approve: true,
      p_note: "A versão foi alterada; esta aprovação deve ser recusada.",
    }),
    /review_stale/,
  );
  await assert.rejects(service("invite", { hash: h }), /invite_invalid/);
});

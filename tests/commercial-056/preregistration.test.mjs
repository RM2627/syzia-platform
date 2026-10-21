import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { fixture } from "../billing-047/fixture.mjs";
import { eligibleContact } from "../../src/platform-commercial/policy.ts";
let c, id, demo, prior, financial, security;
const rpc = (name, args = {}, who = "root") => c.asUser(who, name, args);
const save = (
  data,
  key = randomUUID(),
  lead = null,
  revision = 0,
  who = "root",
) =>
  rpc(
    "commercial_contact_save",
    { p_id: lead, p_revision: revision, p_key: key, p_data: data },
    who,
  );
const context = () => rpc("commercial_management");
const counts = async () =>
  (
    await c.rawSQL(
      "select (select count(*) from organizations) orgs,(select count(*) from private.billing047_contracts) contracts,(select count(*) from private.trial_grants) trials",
    )
  ).rows;
const acl = async () =>
  (
    await c.rawSQL(
      "select oid::regprocedure::text signature,proacl::text,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname in('commercial_contact_save','commercial_contact_authorize','commercial_contact_suppress','acquisition_lead_submit')order by 1",
    )
  ).rows;
before(async () => {
  process.env.SYZIA_OPTIONAL_MANUAL_CURRENT = "1";
  process.env.SYZIA_OPERATION_CURRENT = "1";
  c = await fixture();
  for (const n of [
    "202610180054_commercial_preparation.sql",
    "202610200055_commercial_versions.sql",
  ])
    await c.db.exec(await readFile("supabase/migrations/" + n, "utf8"));
  prior = (
    await save({
      name: "Marina Costa",
      company: "Aurora",
      email: "marina@example.invalid",
      stage: "wants_trial",
      notes: "Dados anteriores preservados",
    })
  ).id;
  financial = await counts();
  security = await acl();
  const functions = (
    await c.rawSQL(
      "select oid::regprocedure::text signature,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and (proname like 'commercial_claim_%' or proname like 'commercial_materialization_%' or proname like 'billing047_%')order by 1",
    )
  ).rows;
  await c.db.exec(
    await readFile(
      "supabase/migrations/202610210056_commercial_preregistration.sql",
      "utf8",
    ),
  );
  assert.deepEqual(
    (
      await c.rawSQL(
        "select oid::regprocedure::text signature,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and (proname like 'commercial_claim_%' or proname like 'commercial_materialization_%' or proname like 'billing047_%')order by 1",
      )
    ).rows,
    functions,
  );
});
after(() => c?.db.close());
test("056-C01 populated upgrade preserves financial records, function ACLs and FORCE RLS", async () => {
  assert.deepEqual(await counts(), financial);
  assert.deepEqual(await acl(), security);
  const a = (await context()).contacts.find((x) => x.id === prior);
  assert.equal(a.email, "marina@example.invalid");
  assert.equal(a.notes, "Dados anteriores preservados");
  const rows = (
    await c.rawSQL(
      "select relrowsecurity,relforcerowsecurity from pg_class where oid in('private.acquisition_leads'::regclass,'private.commercial_contacts'::regclass,'private.commercial_authorizations'::regclass)",
    )
  ).rows;
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.relrowsecurity && r.relforcerowsecurity));
});
test("056-C02 only name: unknown data remains NULL, no invented consent/interest/contact date", async () => {
  id = (await save({ name: "Estúdio Horizonte" })).id;
  const a = (await context()).contacts.find((x) => x.id === id);
  assert.equal(a.name, "Estúdio Horizonte");
  for (const key of ["company", "email", "phone", "first_contact"])
    assert.equal(a[key], null);
  assert.equal(a.stage, "prospect");
  assert.deepEqual(a.authorizations, []);
  assert.equal(a.suppressed, false);
  assert.equal(
    (
      await c.rawSQL(
        "select interest from private.acquisition_leads where id=$1",
        [id],
      )
    ).rows[0].interest,
    null,
  );
  assert.deepEqual(await counts(), financial);
});
test("056-C03 linking appears automatically without issuing any invitation", async () => {
  demo = (
    await rpc("commercial_demo_save", {
      p_id: null,
      p_revision: 0,
      p_key: randomUUID(),
      p_lead: null,
      p_name: "Aurora",
      p_slug: null,
      p_plan: null,
      p_expires: new Date(Date.now() + 86400000).toISOString(),
    })
  ).id;
  await rpc("commercial_demo_link", { p_demo: demo, p_lead: id });
  await rpc("commercial_demo_link", { p_demo: demo, p_lead: id });
  const ctx = await context();
  assert.equal(
    ctx.links.filter((x) => x.demo_id === demo && x.lead_id === id).length,
    1,
  );
  assert.equal(ctx.invites.length, 0);
  assert.equal(ctx.deliveries.length, 0);
});
test("056-C04 no email cannot be authorized, suppressed or become eligible", async () => {
  await assert.rejects(
    rpc("commercial_contact_authorize", {
      p_id: id,
      p_purpose: "demonstration",
      p_authorized: true,
      p_notice: "local-v1",
      p_evidence: "Autorização fictícia para teste isolado.",
      p_expires: new Date(Date.now() + 86400000).toISOString(),
    }),
    /commercial_email_required/,
  );
  await assert.rejects(
    rpc("commercial_contact_suppress", { p_id: id }),
    /commercial_email_required/,
  );
  assert.equal(
    (
      await c.rawSQL(
        "select private.commercial_mail_eligible($1,'demonstration') e",
        [id],
      )
    ).rows[0].e,
    false,
  );
});
test("056-C05 email can be added later; omitted existing fields and stage are preserved", async () => {
  await save({ email: "  HORIZONTE@example.invalid  " }, randomUUID(), id, 1);
  const a = (await context()).contacts.find((x) => x.id === id);
  assert.equal(a.email, "horizonte@example.invalid");
  assert.equal(a.name, "Estúdio Horizonte");
  assert.equal(a.stage, "prospect");
  assert.equal(a.company, null);
});
test("056-C06 change/remove email invalidates current authorization, preserves history", async () => {
  await rpc("commercial_contact_authorize", {
    p_id: id,
    p_purpose: "demonstration",
    p_authorized: true,
    p_notice: "local-v1",
    p_evidence: "Autorização fictícia para teste isolado.",
    p_expires: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(
    eligibleContact(
      (await context()).contacts.find((x) => x.id === id),
      "demonstration",
    ),
    true,
  );
  await save({ email: "" }, randomUUID(), id, 2);
  const a = (await context()).contacts.find((x) => x.id === id);
  assert.equal(a.email, null);
  assert.deepEqual(a.authorizations, []);
  assert.equal(
    (
      await c.rawSQL(
        "select count(*)::int n from private.commercial_authorization_history where lead_id=$1",
        [id],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(eligibleContact(a, "demonstration"), false);
});
test("056-C07 replay and revision conflict: no duplicate or stale update", async () => {
  const key = randomUUID(),
    data = { name: "Ponto Claro" };
  const results = await Promise.all([save(data, key), save(data, key)]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(results[1].reused, true);
  await assert.rejects(
    save({ ...data, email: "different@example.invalid" }, key),
    /idempotency_conflict/,
  );
  await assert.rejects(
    save({ email: "stale@example.invalid" }, randomUUID(), id, 1),
    /commercial_revision_conflict/,
  );
});
for (const data of [
  {},
  { name: " " },
  { name: "A" },
  { name: "Aurora", email: "invalid" },
  { name: "Aurora", email: "a@example.invalid\nBcc:bad@example.invalid" },
  { name: "Aurora", organization_id: randomUUID() },
  { name: "Aurora", stage: "trialing" },
])
  test(
    "056-C08 invalid or invented data rejected: " + JSON.stringify(data),
    async () => {
      await assert.rejects(save(data));
    },
  );
for (const who of ["adminA", "adminB", "worker", "alice"])
  test("056-C09 company identities denied: " + who, async () => {
    await assert.rejects(
      save({ name: "Intruso" }, randomUUID(), null, 0, who),
      /access_denied/,
    );
  });
test("056-C10 public site still requires company/email/interest, no relaxed anonymous submission", async () => {
  const args = {
    p_key: randomUUID(),
    p_name: "Marina",
    p_company: "Aurora",
    p_phone: "11999999999",
    p_email: "aurora@example.invalid",
    p_interest: "Informações sobre a plataforma",
  };
  for (const field of ["p_company", "p_email", "p_interest"])
    await assert.rejects(
      c.service("acquisition_lead_submit", { ...args, [field]: null }),
      /acquisition_invalid/,
    );
  assert.equal(
    (await c.service("acquisition_lead_submit", args)).received,
    true,
  );
  assert.equal(
    (
      await c.service("acquisition_lead_submit", {
        ...args,
        p_key: randomUUID(),
        p_phone: null,
      })
    ).received,
    true,
  );
});
test("056-C11 UI eligibility excludes missing email, expiry, suppression, and unconfirmed activation interest", () => {
  const a = {
    email: "aurora@example.invalid",
    stage: "prospect",
    suppressed: false,
    authorizations: [
      { purpose: "demonstration", authorized: true, expires_at: "2099-01-01" },
      { purpose: "activation", authorized: true, expires_at: "2099-01-01" },
    ],
  };
  assert.equal(eligibleContact(a, "demonstration"), true);
  assert.equal(eligibleContact(a, "activation"), false);
  for (const b of [
    { ...a, email: null },
    { ...a, email: "bad" },
    { ...a, suppressed: true },
    { ...a, stage: "archived" },
    { ...a, authorizations: [] },
  ])
    assert.equal(eligibleContact(b, "demonstration"), false);
  assert.equal(
    eligibleContact({ ...a, stage: "wants_trial" }, "activation"),
    true,
  );
});

test("056-C12 failed optional metadata rolls back the lead and command atomically", async () => {
  const key = randomUUID();
  await assert.rejects(
    save({ name: "Falha transacional", first_contact: "not-a-date" }, key),
  );
  const r = (
    await c.rawSQL(
      "select (select count(*)::int from private.acquisition_leads where request_key=$1) leads,(select count(*)::int from private.commercial_commands where request_key=$1) commands",
      [key],
    )
  ).rows[0];
  assert.deepEqual(r, { leads: 0, commands: 0 });
});

// Characterization of a pre-existing limitation, NOT approval of recipient verification.
test("056-D01 existing first-claim binding accepts a different recipient; review still blocks ownership", async () => {
  const cfg = (
    await c.rawSQL("select private.commercial_config_export($1) cfg", [
      c.orgs.A,
    ])
  ).rows[0].cfg;
  const d = await rpc("commercial_demo_edit_context", { p_id: demo });
  const review = await rpc("commercial_demo_draft", {
    p_id: demo,
    p_revision: d.revision,
    p_config: cfg,
    p_review: true,
  });
  await rpc("commercial_demo_publish", {
    p_id: demo,
    p_revision: review.revision,
    p_config: cfg,
  });
  await rpc("commercial_demo_link", { p_demo: demo, p_lead: prior });
  await rpc("commercial_contact_authorize", {
    p_id: prior,
    p_purpose: "activation",
    p_authorized: true,
    p_notice: "local-v1",
    p_evidence: "Autorização fictícia somente para este diagnóstico.",
    p_expires: new Date(Date.now() + 86400000).toISOString(),
  });
  const email = (
    await c.rawSQL("select email from auth.users where id=$1", [c.users.adminB])
  ).rows[0].email;
  assert.notEqual(email, "marina@example.invalid");
  const hash = createHash("sha256").update(randomUUID()).digest("hex");
  await rpc("commercial_invite_for_contact", {
    p_demo: demo,
    p_lead: prior,
    p_purpose: "activation",
    p_id: randomUUID(),
    p_hash: hash,
    p_expires: new Date(Date.now() + 3600000).toISOString(),
  });
  const claimed = await rpc(
    "commercial_claim_request",
    {
      p_hash: hash,
      p_statement:
        "Usuário diferente recebeu um link encaminhado; diagnóstico local.",
    },
    "adminB",
  );
  assert.equal(claimed.state, "requested");
  const claim = await rpc(
    "commercial_claim_context",
    { p_id: claimed.id },
    "adminB",
  );
  assert.equal(claim.organization_id, null);
  await assert.rejects(
    rpc(
      "commercial_claim_review",
      {
        p_id: claimed.id,
        p_approve: true,
        p_note: "Tentativa de autoaprovação indevida",
      },
      "adminB",
    ),
    /access_denied/,
  );
  await assert.rejects(
    rpc(
      "commercial_claim_request",
      {
        p_hash: hash,
        p_statement:
          "Responsável tenta usar o mesmo convite após o primeiro vínculo.",
      },
      "adminA",
    ),
    /claim_conflict/,
  );
  assert.deepEqual(await counts(), financial);
});

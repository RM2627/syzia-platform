import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fixture } from "../billing-047/fixture.mjs";
let c, id, other, baseline;
const payload = (extra = {}) => ({
  name: "Marina Costa",
  company: "Ateliê Aurora",
  email: "marina@example.invalid",
  phone: "",
  instagram: "@atelieaurora",
  segment: "Interiores",
  stage: "prospect",
  first_contact: "2026-10-18",
  notes: "Apresentação solicitada por contato comercial.",
  ...extra,
});
const save = (who, data, key = randomUUID(), id = null, revision = 0) =>
  c.asUser(who, "commercial_contact_save", {
    p_id: id,
    p_revision: revision,
    p_key: key,
    p_data: data,
  });
const context = (who = "root") => c.asUser(who, "commercial_context", {});
const state = async () => {
  const r = await c.rawSQL(
    "select (select count(*)::int from organizations) organizations,(select count(*)::int from organization_members) members,(select count(*)::int from private.billing047_contracts) contracts,(select count(*)::int from private.trial_grants) trials",
  );
  return r.rows;
};
before(async () => {
  process.env.SYZIA_OPTIONAL_MANUAL_CURRENT = "1";
  process.env.SYZIA_OPERATION_CURRENT = "1";
  c = await fixture();
  baseline = await state();
  await c.db.exec("reset role");
  await c.db.exec(
    await readFile(
      "supabase/migrations/202610180054_commercial_preparation.sql",
      "utf8",
    ),
  );
  for (const who of ["agentA", "agentB"]) {
    await c.rawSQL(
      "insert into private.enterprise_accounts(user_id,username,display_name,role,state,requested_by,request_key) values($1,$2,$3,'syzia_staff','active',$4,$5)",
      [
        c.users[who],
        who === "agentA" ? "operador.aurora" : "operador.horizonte",
        "Operador comercial",
        c.users.root,
        randomUUID(),
      ],
    );
    await c.asUser("root", "people_permissions", {
      p_user: c.users[who],
      p_permissions: [
        "commercial.read",
        "commercial.manage",
        "commercial.send",
      ],
    });
  }
});
after(() => c?.db.close());
test("C01 populated upgrade preserves existing organizations, memberships, contracts and trial history", async () =>
  assert.deepEqual(await state(), baseline));
test("C02 platform administrator creates contact with optional WhatsApp, without tenant creation", async () => {
  id = (await save("root", payload())).id;
  const a = (await context()).contacts.find((x) => x.id === id);
  assert.equal(a.phone, null);
  assert.equal(a.instagram, "@atelieaurora");
  assert.equal(a.stage, "prospect");
  assert.deepEqual(await state(), baseline);
});
for (const who of ["adminA", "adminB", "worker", "alice"])
  test("C03 subscriber/consumer denied: " + who, async () => {
    await assert.rejects(context(who), /access_denied/);
    await assert.rejects(save(who, payload()), /access_denied/);
  });
test("C04 grants alone never turn a subscriber into a platform operator", async () => {
  await c.rawSQL(
    "insert into private.people_grants values($1,ARRAY['commercial.read','commercial.manage'])",
    [c.users.adminA],
  );
  await assert.rejects(context("adminA"), /access_denied/);
});
test("C05 two simultaneous submissions with identical key return one contact", async () => {
  const key = randomUUID(),
    p = payload({ company: "Horizonte", email: "horizonte@example.invalid" });
  const results = await Promise.all([
    save("agentA", p, key),
    save("agentA", p, key),
  ]);
  assert.equal(results[0].id, results[1].id);
  other = results[0].id;
  assert.equal((await context("agentA")).contacts.length, 1);
});
test("C06 a reused key with a different optional field is rejected", async () => {
  const key = randomUUID();
  await save("agentA", payload(), key);
  await assert.rejects(
    save("agentA", payload({ instagram: "@outra" }), key),
    /idempotency_conflict/,
  );
});
test("C07 another operator cannot read or mutate the first portfolio", async () => {
  assert.equal((await context("agentB")).contacts.length, 0);
  await assert.rejects(
    c.asUser("agentB", "commercial_contact_history", { p_id: other }),
    /access_denied/,
  );
  await assert.rejects(
    save("agentB", payload(), randomUUID(), other, 1),
    /access_denied/,
  );
});
test("C08 operators cannot assign contacts to other identities", async () =>
  await assert.rejects(
    save("agentA", payload({ owner_id: c.users.agentB })),
    /access_denied/,
  ));
for (const stage of [
  "trialing",
  "paying",
  "registration_started",
  "activation_sent",
  "demo_sent",
  "demo_accessed",
])
  test(
    "C09 derived state cannot be fabricated: " + stage,
    async () =>
      await assert.rejects(
        save("root", payload({ stage })),
        /commercial_event_required/,
      ),
  );
for (const data of [
  { email: "bad" },
  { name: "x" },
  { instagram: "https://instagram.com/company" },
  { phone: "123" },
  { email: "a@example.invalid\nBcc:b@example.invalid" },
  { organization_id: randomUUID() },
  { trial: true },
])
  test(
    "C10 invalid/extra fields rejected: " +
      Object.keys(data)[0] +
      " " +
      JSON.stringify(data).length,
    async () => await assert.rejects(save("root", payload(data))),
  );
test("C11 concurrent edits require the current revision", async () => {
  await save("root", payload({ stage: "interested" }), randomUUID(), id, 1);
  await assert.rejects(
    save("root", payload({ stage: "archived" }), randomUUID(), id, 1),
    /commercial_revision_conflict/,
  );
  assert.equal(
    (await context()).contacts.find((x) => x.id === id).stage,
    "interested",
  );
});
test("C12 contact history has no effect on commercial interest/financial states", async () => {
  await c.asUser("root", "commercial_contact_note", {
    p_id: id,
    p_event: "contact",
    p_detail: "Conversa inicial realizada pelo canal autorizado.",
  });
  await assert.rejects(
    c.asUser("root", "commercial_contact_note", {
      p_id: id,
      p_event: "mail_accepted",
      p_detail: "Não é um evento confiável.",
    }),
    /commercial_invalid/,
  );
  assert.equal(
    (await context()).contacts.find((x) => x.id === id).stage,
    "interested",
  );
});
test("C13 purpose-specific authorization needs evidence and validity", async () => {
  const base = {
    p_id: id,
    p_purpose: "demonstration",
    p_authorized: true,
    p_notice: "commercial-v1",
    p_evidence: "Solicitou apresentação pelo canal informado.",
    p_expires: new Date(Date.now() + 86400000).toISOString(),
  };
  await c.asUser("root", "commercial_contact_authorize", base);
  await assert.rejects(
    c.asUser("root", "commercial_contact_authorize", {
      ...base,
      p_evidence: "",
    }),
  );
  assert.equal(
    (await context()).contacts.find((x) => x.id === id).authorizations.length,
    1,
  );
});
test("C14 changing the email does not transfer communication authorization", async () => {
  await save(
    "root",
    payload({ email: "another@example.invalid" }),
    randomUUID(),
    id,
    2,
  );
  assert.equal(
    (await context()).contacts.find((x) => x.id === id).authorizations.length,
    0,
  );
  assert.equal(
    (
      await c.rawSQL(
        "select count(*)::int n from private.commercial_authorization_history where lead_id=$1",
        [id],
      )
    ).rows[0].n,
    1,
  );
});
test("C15 suppression prevents accidental reuse of an address in a new lead", async () => {
  await c.asUser("root", "commercial_contact_suppress", { p_id: id });
  const n = (await save("root", payload({ email: "another@example.invalid" })))
    .id;
  assert.equal(
    (await context()).contacts.find((x) => x.id === n).suppressed,
    true,
  );
});
test("C16 new private tables have FORCE RLS and no direct API grants", async () => {
  for (const name of [
    "commercial_contacts",
    "commercial_contact_events",
    "commercial_authorizations",
    "commercial_suppressions",
    "commercial_authorization_history",
    "commercial_commands",
    "company_page_templates",
  ]) {
    const r = (
      await c.rawSQL(
        "select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass",
        ["private." + name],
      )
    ).rows[0];
    assert.ok(r.relrowsecurity && r.relforcerowsecurity);
    for (const role of ["anon", "authenticated", "service_role"])
      assert.equal(
        (
          await c.rawSQL("select has_table_privilege($1,$2,'select') ok", [
            role,
            "private." + name,
          ])
        ).rows[0].ok,
        false,
      );
  }
});
test("C17 root can adopt a site lead once, preserving original identity/history", async () => {
  const key = randomUUID();
  await c.service("acquisition_lead_submit", {
    p_key: key,
    p_name: "Lia Costa",
    p_company: "Casa Horizonte",
    p_phone: "11999998888",
    p_email: "lia@example.invalid",
    p_interest: "Conhecer a apresentação",
  });
  const raw = (
    await c.rawSQL(
      "select * from private.acquisition_leads where request_key=$1",
      [key],
    )
  ).rows[0];
  await c.asUser("root", "commercial_contact_adopt", { p_id: raw.id });
  await c.asUser("root", "commercial_contact_adopt", { p_id: raw.id });
  assert.deepEqual(
    (
      await c.rawSQL("select * from private.acquisition_leads where id=$1", [
        raw.id,
      ])
    ).rows[0],
    raw,
  );
  assert.equal(
    (await context()).contacts.filter((x) => x.id === raw.id).length,
    1,
  );
});
test("C18 previous global permissions remain available alongside new grants", async () => {
  await c.asUser("root", "people_permissions", {
    p_user: c.users.agentB,
    p_permissions: ["people.read", "acquisition.read", "commercial.read"],
  });
  assert.equal((await context("agentB")).can_manage, false);
  await assert.rejects(save("agentB", payload()), /access_denied/);
});
test("T01 template starts with current and does not change the published snapshot", async () => {
  const d = await c.asUser("adminA", "consumer_page_draft", {
    p_org: c.orgs.A,
    p_show_prices: true,
  });
  assert.equal(d.preview.template, "current");
  const before = (
    await c.rawSQL(
      "select *from consumer_publications where organization_id=$1",
      [c.orgs.A],
    )
  ).rows;
  await c.asUser("adminA", "company_page_template_set", {
    p_org: c.orgs.A,
    p_template: "modern",
    p_revision: 0,
  });
  const next = await c.asUser("adminA", "consumer_page_draft", {
    p_org: c.orgs.A,
    p_show_prices: true,
  });
  assert.equal(next.preview.template, "modern");
  assert.notEqual(next.token, d.token);
  assert.deepEqual(
    (
      await c.rawSQL(
        "select *from consumer_publications where organization_id=$1",
        [c.orgs.A],
      )
    ).rows,
    before,
  );
});
test("T02 stale revisions and unsupported templates fail", async () => {
  await assert.rejects(
    c.asUser("adminA", "company_page_template_set", {
      p_org: c.orgs.A,
      p_template: "catalog",
      p_revision: 0,
    }),
    /page_draft_changed/,
  );
  await assert.rejects(
    c.asUser("adminA", "company_page_template_set", {
      p_org: c.orgs.A,
      p_template: "arbitrary-html",
      p_revision: 1,
    }),
  );
});
test("T03 A/B isolation and permissions remain enforced", async () => {
  await assert.rejects(
    c.asUser("adminB", "company_page_template_set", {
      p_org: c.orgs.A,
      p_template: "catalog",
      p_revision: 1,
    }),
  );
  await assert.rejects(
    c.asUser("worker", "company_page_template_set", {
      p_org: c.orgs.A,
      p_template: "catalog",
      p_revision: 1,
    }),
  );
  assert.equal(
    (
      await c.asUser("adminB", "consumer_page_draft", {
        p_org: c.orgs.B,
        p_show_prices: true,
      })
    ).preview.template,
    "current",
  );
});
test("T04 predecessor RPCs cannot bypass current checks", async () => {
  for (const name of [
    "consumer_public_page_pre054(text)",
    "consumer_page_draft_pre054(uuid,boolean)",
  ])
    for (const role of ["anon", "authenticated", "service_role"])
      assert.equal(
        (
          await c.rawSQL("select has_function_privilege($1,$2,'execute') ok", [
            role,
            "public." + name,
          ])
        ).rows[0].ok,
        false,
      );
});
test("C19 failed mutation rolls back lead and metadata together", async () => {
  const key = randomUUID();
  await assert.rejects(
    save("root", payload({ segment: "x".repeat(121) }), key),
  );
  assert.equal(
    (
      await c.rawSQL(
        "select count(*)::int n from private.acquisition_leads where request_key=$1",
        [key],
      )
    ).rows[0].n,
    0,
  );
});
test("C20 business, tenant and financial state remain unchanged by commercial actions", async () =>
  assert.deepEqual(await state(), baseline));
test("C21 updating a contact as root does not silently take ownership", async () => {
  const original = (await context()).contacts.find((x) => x.id === other);
  await save(
    "root",
    payload({ company: "Horizonte" }),
    randomUUID(),
    other,
    original.revision,
  );
  assert.equal(
    (await context()).contacts.find((x) => x.id === other).owner_id,
    c.users.agentA,
  );
});
test("C22 operator suspension blocks previously granted commercial access", async () => {
  await c.rawSQL(
    "update private.enterprise_accounts set state='disabled'where user_id=$1",
    [c.users.agentB],
  );
  await assert.rejects(context("agentB"), /access_denied/);
});
test("T05 existing preview/publish/public-page flow publishes the selected template only after review", async () => {
  // This uses the existing simulated provider fixture, never a real gateway.
  await c.command("checkout", "profissional");
  const before = await state();
  // Normalize the historical fixture publication through the current official publish flow first.
  await c.asUser("adminA", "company_page_template_set", {
    p_org: c.orgs.A,
    p_template: "current",
    p_revision: 1,
  });
  const initial = await c.asUser("adminA", "consumer_page_draft", {
    p_org: c.orgs.A,
    p_show_prices: true,
  });
  await c.asUser("adminA", "consumer_publish_draft", {
    p_org: c.orgs.A,
    p_token: initial.token,
    p_show_prices: true,
    p_expected_revision: initial.page_revision,
  });
  const previous = await c.asUser("alice", "consumer_public_page", {
    p_slug: "ms-auto-ficticia",
  });
  assert.equal(previous.template, "current");
  await c.asUser("adminA", "company_page_template_set", {
    p_org: c.orgs.A,
    p_template: "modern",
    p_revision: 2,
  });
  const d = await c.asUser("adminA", "consumer_page_draft", {
    p_org: c.orgs.A,
    p_show_prices: true,
  });
  assert.equal(d.ready, true);
  await c.asUser("adminA", "consumer_publish_draft", {
    p_org: c.orgs.A,
    p_token: d.token,
    p_show_prices: true,
    p_expected_revision: d.page_revision,
  });
  const page = await c.asUser("alice", "consumer_public_page", {
    p_slug: "ms-auto-ficticia",
  });
  assert.equal(page.template, "modern");
  assert.equal(page.services.length, previous.services.length);
  assert.deepEqual(page.services, previous.services);
  const after = await c.asUser("adminA", "consumer_page_draft", {
    p_org: c.orgs.A,
    p_show_prices: true,
  });
  assert.equal(after.changed, false);
  assert.deepEqual(await state(), before);
});

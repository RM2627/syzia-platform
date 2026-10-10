import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { consumerDB } from "./support/consumer-db.mjs";
import { seedPresence } from "./fixtures/presence.mjs";
import { seedCommercial } from "./fixtures/commercial.mjs";
import { seedAnalyticsDemo } from "./fixtures/analytics-demo.mjs";
import { seedBillingDemo } from "./fixtures/billing-demo.mjs";
import { seedMultisegment } from "./fixtures/multisegment.mjs";
const c = await consumerDB({through:"202609200029_authorized_support.sql"});
await seedPresence(c);
await seedCommercial(c);
await seedAnalyticsDemo(c);
const plans = await seedBillingDemo(c);
await seedMultisegment(c, plans.software);
await c.db.exec(await (await import("node:fs/promises")).readFile("supabase/migrations/202609210030_business_finance_permissions.sql","utf8"));
const { db, as, rpc, orgs } = c,
  results = [];
async function test(name, fn) {
  await db.exec("begin");
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS " + name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message });
    console.error(e);
  } finally {
    await db.exec("rollback;reset role");
  }
}
const scenarios = [
  ["A", "ms-auto-ficticia", "fixed"],
  ["B", "horizonte-ficticio", "quote"],
  ["C", "clara-nutricao-ficticia", "fixed"],
];
for (const [key, slug, mode] of scenarios)
  await test(
    key + ": página, portfólio opcional, solicitação e contratação",
    async () => {
      await as("anon");
      const page = await rpc("consumer_public_page", { p_slug: slug });
      assert.ok(page);
      if (key === "A")
        assert.ok(
          page.portfolio.some(
            (w) => w.format === "before_after" && w.images.length === 2,
          ),
        );
      if (key === "B")
        assert.ok(
          page.portfolio.some(
            (w) => w.format === "gallery" && w.images.length === 1,
          ),
        );
      if (key === "C") {
        assert.equal(page.portfolio.length, 0);
        assert.equal(
          page.services[0].questions[0].label,
          "Modalidade do atendimento",
        );
      }
      const s = page.services.find((s) => s.price_mode === mode);
      await as("alice");
      const request = await rpc("consumer_create_request", {
        p_slug: slug,
        p_revision: page.revision,
        p_service: s.code,
        p_addons: [],
        p_answers: Object.fromEntries(
          s.questions.map((q) => [
            q.code,
            q.options?.[0] || "Exemplo fictício",
          ]),
        ),
        p_customer: {
          name: "Pessoa Fictícia",
          whatsapp: "81999990000",
          email: null,
          accepted_notice: true,
          notice_version: "consumer-v1",
        },
        p_notes: "Solicitação administrativa fictícia",
        p_contact: false,
        p_expected_cents: s.price_cents,
        p_key: randomUUID(),
      });
      await rpc("consumer_submit_request", {
        p_code: request.code,
        p_attachment_count: 0,
        p_key: randomUUID(),
      });
      if (key === "B") {
        await as("adminB");
        let q = await rpc("consumer_request_context", { p_code: request.code });
        await rpc("consumer_send_quote", {
          p_code: request.code,
          p_items: [
            { name: "Projeto fictício", quantity: 1, unit_cents: 75000 },
          ],
          p_duration: 60,
          p_expires: new Date(Date.now() + 86400000).toISOString(),
          p_expected_revision: q.revision,
          p_key: randomUUID(),
        });
        await as("alice");
        q = await rpc("consumer_request_context", { p_code: request.code });
        assert.equal(q.state, "quoted");
      } else {
        const slots = await rpc("consumer_slots", {
          p_slug: slug,
          p_service: s.code,
          p_addons: [],
          p_day: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
        });
        assert.ok(slots.length);
        await rpc("consumer_book", {
          p_code: request.code,
          p_start: slots[0],
          p_previous: null,
          p_key: randomUUID(),
        });
        const q = await rpc("consumer_request_context", {
          p_code: request.code,
        });
        assert.ok(q.appointments.length);
      }
    },
  );
await test("C: onboarding não exige portfólio nem cria categoria profissional", async () => {
  await as("adminC");
  const setup = await rpc("onboarding_context", { p_org: orgs.C });
  const p = setup.items.find((x) => x.id === "portfolio");
  assert.equal(p.required, false);
  assert.equal(p.complete, false);
  assert.equal(setup.ready, true);
  assert.equal(setup.shared_support, false);
});
await test("A/B/C: dados internos não aparecem e tokens de outro gestor não dão acesso", async () => {
  for (const [key, slug] of scenarios) {
    await as("anon");
    const p = await rpc("consumer_public_page", { p_slug: slug });
    const text = JSON.stringify(p);
    for (const id of Object.values(orgs)) assert.ok(!text.includes(id));
    assert.ok(!text.includes("INTERNO SECRETO"));
    await as(key === "A" ? "adminC" : "adminA");
    await db.exec("savepoint deny");
    try {
      await rpc("consumer_presence_context", { p_org: orgs[key] });
      throw Error("Expected denial");
    } catch (e) {
      await db.exec("rollback to savepoint deny");
      assert.equal(e.code, "42501");
    }
  }
});
await writeFile(
  "reports/multisegment-sql.json",
  JSON.stringify(
    {
      environment: "LOCAL PGlite; fictional administrative data only",
      tests: results,
    },
    null,
    2,
  ),
);
await db.close();
if (results.some((x) => x.status === "FAIL")) process.exitCode = 1;

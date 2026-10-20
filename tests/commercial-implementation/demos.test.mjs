import http from "node:http";
import sharp from "sharp";
import { createDemoMediaHandler } from "../../server/commercial/media.mjs";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fixture } from "../billing-047/fixture.mjs";
import { demoFixture } from "./demo-fixture.mjs";
let c, x, lead, d, editor, visitor, configuration, second;
const m = async(name,args)=>{
 if(name==='commercial_demo_publish'){
  await x.store.freeze(d.id,args.p_config);
  const a=await c.asUser('root','commercial_demo_draft',{...args,p_review:true});args={...args,p_revision:a.revision};
 }
 return c.asUser('root',name,args);
};
const manage = () => m("commercial_management", {});
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
  await c.db.exec(await readFile("supabase/migrations/202610200055_commercial_versions.sql","utf8"));
  x = await demoFixture();
  lead = (
    await m("commercial_contact_save", {
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
  const r = await m("commercial_demo_save", {
    p_id: null,
    p_revision: 0,
    p_key: randomUUID(),
    p_lead: lead,
    p_name: "Aurora Interiores",
    p_slug: "aurora-interiores",
    p_plan: null,
    p_expires: new Date(Date.now() + 86400000 * 14).toISOString(),
  });
  d = await m("commercial_demo_edit_context", { p_id: r.id });
});
after(async () => {
  await c?.db.close();
  await x?.store.close();
});
test("D01 editor uses separate migrated database without creating an operational organization", async () => {
  const before = (await c.rawSQL("select count(*)::int n from organizations"))
    .rows[0].n;
  editor = await x.store.begin(d, "editor", c.users.root);
  assert.equal(editor.kind, "editor");
  assert.equal(
    (await c.rawSQL("select count(*)::int n from organizations")).rows[0].n,
    before,
  );
  assert.equal(
    (await x.db.query("select count(*)::int n from billing_subscriptions"))
      .rows[0].n,
    0,
  );
  assert.equal(
    (
      await x.db.query(
        "select count(*)::int n from private.billing047_contracts",
      )
    ).rows[0].n,
    0,
  );
});
test("D02 real company RPC edits description, hours and direct service", async () => {
  const call = (name, args) =>
    x.store.rpc(editor.token, d, "company", name, args);
  let ctx = await call("company_context", { p_org: editor.organization.id });
  await call("company_save", {
    p_org: editor.organization.id,
    p_entity: "settings",
    p_id: null,
    p_expected_revision: ctx.settings.revision,
    p_data: {
      description: "Projetos e cuidados para ambientes acolhedores.",
      service_regions: "Petrolina e região",
      payment_methods: "Conforme condições do serviço",
      business_hours: Array.from({ length: 7 }, (_, day) => ({
        day,
        open: "08:00",
        close: "18:00",
      })),
    },
  });
  ctx = await call("company_context", { p_org: editor.organization.id });
  await call("company_save", {
    p_org: editor.organization.id,
    p_entity: "service",
    p_id: null,
    p_expected_revision: ctx.settings.revision,
    p_data: {
      name: "Consultoria de ambiente",
      description: "Orientação inicial para o ambiente.",
      price_mode: "fixed",
      price_cents: 18000,
      duration_minutes: 60,
      contract_mode: "immediate",
      execution_mode: "continuous",
      quotes_allowed: true,
    },
  });
  await call("consumer_schedule_config", {
    p_org: editor.organization.id,
    p_expected_revision: 0,
    p_rules: {
      active: true,
      lead_minutes: 30,
      horizon_days: 30,
      step_minutes: 30,
      buffer_minutes: 0,
      cancel_minutes: 120,
    },
  });
  ctx = await call("company_context", { p_org: editor.organization.id });
  await call("company_service_save_with_checklist", {
    p_org: editor.organization.id,
    p_id: ctx.services[0].id,
    p_expected_revision: ctx.settings.revision,
    p_data: { name: "Consultoria de ambiente" },
    p_checklist_revision: 0,
    p_items: [{ title: "Conferir as medidas do ambiente" }],
    p_key: randomUUID(),
  });
  assert.equal(ctx.services.length, 1);
  assert.equal(
    ctx.settings.description,
    "Projetos e cuidados para ambientes acolhedores.",
  );
});
test("D02b uploads/downloads use existing sanitizer and gateway rules in the demo database", async () => {
  const bytes = await sharp({
    create: { width: 40, height: 30, channels: 3, background: "#166c69" },
  })
    .png()
    .withMetadata({ exif: { IFD0: { Artist: "SYNTHETIC-METADATA" } } })
    .toBuffer();
  const reserved = await x.store.rpc(
    editor.token,
    d,
    "company",
    "consumer_reserve_company_media",
    {
      p_org: editor.organization.id,
      p_mime: "image/png",
      p_size: bytes.length,
      p_key: randomUUID(),
    },
  );
  const handler = createDemoMediaHandler({
    store: x.store,
    origins: { publicOrigin: "https://demo.example.invalid", appOrigin:"https://app.example.invalid" },
    controller: {
      demoDefinition: async (token) => {
        if (token !== editor.token) throw Error("demo_session_expired");
        return { d };
      },
    },
    resolvePublic: async () => d,
  });
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const url =
        "http://127.0.0.1:" +
        server.address().port +
        "/demonstration-media/company-media/" +
        reserved.code,
      headers = {
        Origin: "https://app.example.invalid",
        "X-Commercial-Authorization":"Bearer original-admin-session",
        Authorization: "Bearer " + editor.token + ".company",
      };
    const up = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      method: "POST",
      headers: { ...headers, "Content-Type": "image/png" },
      body: bytes,
    });
    assert.equal(up.status, 200, await up.text());
    const down = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers,
    });
    assert.equal(down.status, 200);
    const actual = Buffer.from(await down.arrayBuffer());
    assert.equal((await sharp(actual).metadata()).exif, undefined);
    assert.equal(
      (
        await fetch(url, {
          signal: AbortSignal.timeout(8000),
          headers: { ...headers, Authorization: "Bearer invalid.company" },
        })
      ).status,
      403,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
test("D03 prepared snapshot is whitelisted, contains no operation or subscriptions", async () => {
  configuration = await x.store.export(editor.token, d);
  assert.equal(configuration.format, "syzia-config-054");
  assert.ok(configuration.tables.services.length);
  assert.equal(
    configuration.tables.service_checklist_items[0].title,
    "Conferir as medidas do ambiente",
  );
  assert.equal(configuration.tables.customers, undefined);
  assert.equal(configuration.tables.billing_subscriptions, undefined);
  await m("commercial_demo_publish", {
    p_id: d.id,
    p_revision: d.revision,
    p_config: configuration,
  });
  d = await c.service("commercial_service", {
    p_action: "demo",
    p_data: { id: d.id },
  });
});
test("D04 publishing invalidates editor sessions from the previous generation", async () =>
  await assert.rejects(
    x.store.rpc(editor.token, d, "company", "company_context", {
      p_org: editor.organization.id,
    }),
    /session_expired/,
  ));
test("D05 two visitors use isolated company instances and the same public-page RPC", async () => {
  // New visitors must survive removal of the editor's mutable media objects.
  assert.ok((await x.db.query('select count(*)::int n from demo_private.frozen_media')).rows[0].n>0);
  await x.db.query("delete from demo_private.objects where path like $1",[editor.organization.id+'/%']);
  [visitor, second] = await Promise.all([x.store.begin(d), x.store.begin(d)]);
  assert.notEqual(visitor.organization.id, second.organization.id);
  assert.equal(visitor.organization.slug,d.slug);
  const p = await x.store.rpc(
    visitor.token,
    d,
    "consumer",
    "consumer_public_page",
    { p_slug: d.slug },
  );
  assert.equal(p.name, d.name);
  assert.equal(p.services[0].name, "Consultoria de ambiente");
  assert.equal(p.slug, d.slug);
  const checklist = (
    await x.db.query(
      "select count(*)::int n from private.service_checklist_items i join private.service_checklist_models m on m.service_id=i.service_id where m.organization_id=$1",
      [visitor.organization.id],
    )
  ).rows[0].n;
  assert.equal(checklist, 1);
});
test("D06 visitor cannot select another tenant or global/financial RPC", async () => {
  await assert.rejects(
    x.store.rpc(visitor.token, d, "company", "company_context", {
      p_org: second.organization.id,
    }),
    /scope_denied/,
  );
  for (const name of [
    "analytics_platform",
    "commercial_management",
    "billing047_context",
    "foundation_create_organization",
    "access_context_select",
  ])
    await assert.rejects(
      x.store.rpc(visitor.token, d, "company", name, {}),
      /operation_denied/,
    );
});
test("D07 separate consumer and company views track the SAME direct-acceptance record", async () => {
  const rpc = (role, name, args) =>
    x.store.rpc(visitor.token, d, role, name, args);
  const p = await rpc("consumer", "consumer_public_page", { p_slug: d.slug });
  const s = p.services[0],
    items = [{ service: s.code, addons: [], answers: {}, notes: "" }];
  const q = await rpc("consumer", "consumer_create_multi_request", {
    p_slug: d.slug,
    p_revision: p.revision,
    p_items: items,
    p_customer: {
      name: "Cliente Aurora",
      whatsapp: "81999990000",
      email: "cliente@example.invalid",
      accepted_notice: true,
      notice_version: "consumer-v1",
    },
    p_notes: "Consulta de ambiente",
    p_contact: false,
    p_expected_cents: 18000,
    p_key: randomUUID(),
  });
  const o = await rpc("consumer", "consumer_journey_options", {
    p_slug: d.slug,
    p_revision: p.revision,
    p_items: items,
    p_day: (await x.db.query("select (current_date+3)::text as demo_day"))
      .rows[0].demo_day,
    p_next: false,
  });
  assert.ok(o.plans.length);
  const plan = o.plans[0];
  await rpc("consumer", "consumer_complete_execution", {
    p_code: q.code,
    p_start: plan.start,
    p_attachment_count: 0,
    p_periods: plan.periods,
    p_key: randomUUID(),
  });
  const company = await rpc("company", "operations_requests", {
    p_org: visitor.organization.id,
    p_search: "",
    p_offset: 0,
  });
  assert.ok(company.some((row) => row.code === q.code));
  const real = (
    await x.db.query(
      "select state,organization_id from quote_requests where public_code=$1",
      [q.code],
    )
  ).rows[0];
  assert.equal(real.organization_id, visitor.organization.id);
  assert.equal(
    (
      await x.db.query(
        "select count(*)::int n from quote_versions where organization_id=$1 and kind='final'",
        [visitor.organization.id],
      )
    ).rows[0].n,
    0,
  );
  await assert.rejects(
    x.store.rpc(second.token, d, "consumer", "consumer_request_context", {
      p_code: q.code,
    }),
  );
});
test("D08 bounded demonstration profile enforces eight members without selecting a commercial plan", async () => {
  await x.store.team(visitor.token, d, {
    name: "Lia Andrade",
    role: "colaborador_empresa",
  });
  await x.store.team(visitor.token, d, {
    name: "Caio Freitas",
    role: "colaborador_empresa",
  });
  for(const name of ['Nina Rocha','Bruno Lima','Clara Alves','Pedro Luz','Rosa Maia'])await x.store.team(visitor.token,d,{name,role:'colaborador_empresa'});
  await assert.rejects(
    x.store.team(visitor.token, d, {
      name: "Rita Alves",
      role: "colaborador_empresa",
    }),
    /limit/,
  );
  assert.equal((await x.store.team(visitor.token, d)).length, 8);
});
test("D09 demos never create real or fictitious subscriptions, invoices or billing contracts", async () => {
  for (const table of [
    "billing_subscriptions",
    "billing_invoices",
    "private.billing047_contracts",
  ])
    assert.equal(
      (await x.db.query("select count(*)::int n from " + table)).rows[0].n,
      0,
    );
});
test("D10 explicit session end immediately rejects subsequent operations", async () => {
  await x.store.end(visitor.token);
  await assert.rejects(
    x.store.rpc(visitor.token, d, "company", "company_context", {
      p_org: visitor.organization.id,
    }),
    /session_expired/,
  );
});
test('D11 expiry cleanup invalidates sessions and suspends visitors without deleting published media',async()=>{
 await x.db.query("update demo_private.sessions set expires_at=clock_timestamp()-interval '1 minute'where instance_id in(select id from demo_private.instances where organization_id=$1)",[second.organization.id]);
 await x.db.query("update demo_private.instances set expires_at=clock_timestamp()-interval '1 minute'where organization_id=$1",[second.organization.id]);
 await x.store.cleanup();
 await assert.rejects(x.store.rpc(second.token,d,'company','company_context',{p_org:second.organization.id}),/session_expired/);
 assert.equal((await x.db.query('select status from organizations where id=$1',[second.organization.id])).rows[0].status,'suspended');
 assert.ok((await x.db.query('select count(*)::int n from demo_private.frozen_media')).rows[0].n>0);
});

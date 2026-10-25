import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fixture } from "../billing-047/fixture.mjs";
import { demoFixture } from "../commercial-implementation/demo-fixture.mjs";
import { studioController } from "../../server/studio/controller.mjs";
import { commercialController } from "../../server/commercial/controller.mjs";
import sharp from "sharp";
test("060 Studio: persistência privada, biblioteca, imagens, conversão e visitas isoladas", async (t) => {
  process.env.SYZIA_OPTIONAL_MANUAL_CURRENT = "1";
  process.env.SYZIA_OPERATION_CURRENT = "1";
  const c = await fixture(),
    x = await demoFixture();
  try {
    for (const n of (await readdir("supabase/migrations"))
      .filter((n) => /^202610(18|20|21|22|25)00(54|55|56|57|58|59|60)_/.test(n))
      .sort()) {
      const sql = await readFile("supabase/migrations/" + n, "utf8");
      if (n.includes("0060_")) {
        const before = (
          await c.rawSQL(
            "select pg_get_functiondef('public.consumer_document(text,text,text)'::regprocedure) body",
          )
        ).rows[0].body;
        await assert.rejects(
          c.db.exec(sql.replace(/commit;\s*$/, "select 1/0;commit;")),
          /division by zero/,
        );
        await c.db.exec("rollback");
        assert.equal(
          (
            await c.rawSQL(
              "select pg_get_functiondef('public.consumer_document(text,text,text)'::regprocedure) body",
            )
          ).rows[0].body,
          before,
        );
      }
      await c.db.exec(sql);
    }
    const call = (action, data = {}, who = "root") =>
      c.asUser(who, "commercial_studio", { p_action: action, p_data: data });
    const permissions = (
      await c.rawSQL(
        "select relrowsecurity,relforcerowsecurity,has_table_privilege('authenticated',oid,'SELECT') readable from pg_class where relnamespace='private'::regnamespace and relname in('studio_segments','studio_drafts','studio_assets','studio_events')",
      )
    ).rows;
    assert.equal(permissions.length, 4);
    assert.ok(
      permissions.every(
        (p) => p.relrowsecurity && p.relforcerowsecurity && !p.readable,
      ),
    );
    const library = await call("list");
    assert.equal(library.segments.length, 15);
    const cfg = library.segments.find((x) => x.id === "automotiva").model;
    let d;
    await t.test(
      "cria sem empresa, plano, interessado; reabre e controla versão",
      async () => {
        const before = (
          await c.rawSQL("select count(*)::int n from organizations")
        ).rows[0].n;
        d = await call("create", {
          id: randomUUID(),
          name: "Aurora Cuidados",
          segment_id: "automotiva",
          configuration: cfg,
        });
        assert.equal((await call("get", { id: d.id })).name, d.name);
        assert.equal(
          (await c.rawSQL("select count(*)::int n from organizations")).rows[0]
            .n,
          before,
        );
        await assert.rejects(call("get", { id: d.id }, "adminA"), /denied/);
        await assert.rejects(
          c.service("commercial_studio", { p_action: "list", p_data: {} }),
          /permission denied/,
        );
        const [a, b] = await Promise.allSettled([
          call("save", {
            id: d.id,
            revision: d.revision,
            name: d.name,
            configuration: cfg,
          }),
          call("save", {
            id: d.id,
            revision: d.revision,
            name: d.name,
            configuration: cfg,
          }),
        ]);
        assert.equal([a, b].filter((x) => x.status === "fulfilled").length, 1);
        d = await call("get", { id: d.id });
      },
    );
    await t.test(
      "operadores comerciais não acessam preparações alheias; conta desabilitada bloqueada",
      async () => {
        for (const who of ["agentA", "agentB"]) {
          await c.rawSQL(
            "insert into private.enterprise_accounts(user_id,username,display_name,role,state,requested_by,request_key)values($1,$2,'Operador comercial','syzia_staff','active',$3,$4)",
            [
              c.users[who],
              "studio." + who.toLowerCase(),
              c.users.root,
              randomUUID(),
            ],
          );
          await c.asUser("root", "people_permissions", {
            p_user: c.users[who],
            p_permissions: ["commercial.read", "commercial.manage"],
          });
        }
        const one = await call(
          "create",
          {
            id: randomUUID(),
            name: "Preparação privada",
            segment_id: "outros",
            configuration: cfg,
          },
          "agentA",
        );
        await assert.rejects(call("get", { id: one.id }, "agentB"), /denied/);
        assert.ok(
          !(await call("list", {}, "agentB")).drafts.some(
            (x) => x.id === one.id,
          ),
        );
        await assert.rejects(
          call(
            "segment-save",
            { id: "outros", name: "Alterado", revision: 1, model: cfg },
            "agentA",
          ),
          /denied/,
        );
        await c.rawSQL(
          "update private.enterprise_accounts set state='disabled'where user_id=$1",
          [c.users.agentA],
        );
        await assert.rejects(call("get", { id: one.id }, "agentA"), /denied/);
        assert.equal((await call("get", { id: one.id })).id, one.id);
      },
    );
    await t.test(
      "modelo editável sem alteração dos rascunhos já criados",
      async () => {
        const s = library.segments[0],
          model = structuredClone(s.model);
        model.tables.company_settings[0].description =
          "Nova apresentação revisada pelo administrador.";
        await call("segment-save", {
          id: s.id,
          name: s.name,
          revision: s.revision,
          model,
        });
        assert.deepEqual((await call("get", { id: d.id })).configuration, cfg);
      },
    );
    let removeFails = true;
    const blobs = new Map();
    const storage = {
      from: () => ({
        upload: async (path, bytes) => {
          blobs.set(path, Buffer.from(bytes));
          return {};
        },
        remove: async (paths) => {
          if (removeFails) return { error: true };
          for (const p of paths) blobs.delete(p);
          return {};
        },
        download: async (path) =>
          blobs.has(path)
            ? { data: new Blob([blobs.get(path)]) }
            : { error: true },
      }),
    };
    const rawStudio = studioController({
      asUser: c.asUser,
      service: c.service,
      storage,
      store: x.store,
    });
    const studio = (p, b, t) => rawStudio(p, b, t, { id: c.users[t] });
    let asset;
    await t.test(
      "imagem sanitizada persistida; metadata não pode ser forjada",
      async () => {
        const bytes = await sharp({
          create: {
            width: 400,
            height: 300,
            channels: 3,
            background: "#276e6a",
          },
        })
          .png()
          .toBuffer();
        asset = await studio(
          "studio-upload",
          { id: d.id, mime: "image/png", bytes: bytes.toString("base64") },
          "root",
        );
        const cfg = structuredClone(d.configuration);
        cfg.tables.company_settings[0].business_hours = [
          { day: 1, open: "09:00", close: "17:00" },
        ];
        cfg.tables.business_rules = [
          {
            pricing_policy:
              "Escopo e condições sujeitos à revisão do responsável.",
          },
        ];
        cfg.tables.service_addons = [
          {
            id: randomUUID(),
            service_id: cfg.tables.services[0].id,
            name: "Complemento autorizado",
            price_mode: "quote",
            price_cents: null,
            duration_minutes: 0,
            active: true,
          },
        ];
        cfg.tables.service_intake_fields = [
          {
            id: randomUUID(),
            service_id: cfg.tables.services[0].id,
            label: "Como podemos preparar o atendimento?",
            kind: "text",
            required: false,
            options: [],
            position: 0,
            active: true,
          },
        ];
        cfg.tables.company_media = [asset];
        cfg.tables.company_branding[0].cover_id = asset.id;
        d = await call("save", {
          id: d.id,
          revision: d.revision,
          name: d.name,
          configuration: cfg,
        });
        const img = await studio(
          "studio-image",
          { id: d.id, asset_id: asset.id },
          "root",
        );
        assert.equal(img.mime, "image/png");
        assert.ok(img.bytes.length > 0);
        cfg.tables.company_media[0].object_path = "another/private";
        await assert.rejects(
          call("save", {
            id: d.id,
            revision: d.revision,
            name: d.name,
            configuration: cfg,
          }),
          /media_invalid/,
        );
        await assert.rejects(
          studio(
            "studio-upload",
            {
              id: d.id,
              mime: "image/png",
              bytes: Buffer.from("not an image").toString("base64"),
            },
            "root",
          ),
          /invalid_image/,
        );
      },
    );
    await t.test(
      "duplicação compartilha asset autorizado; exclusão não apaga imagem referenciada",
      async () => {
        const dup = await call("duplicate", {
          id: d.id,
          revision: d.revision,
          new_id: randomUUID(),
        });
        assert.equal(dup.configuration.tables.company_media[0].id, asset.id);
        assert.ok(
          (
            await studio(
              "studio-image",
              { id: dup.id, asset_id: asset.id },
              "root",
            )
          ).bytes,
        );
        await call("delete", { id: dup.id, revision: dup.revision });
        await assert.rejects(call("get", { id: dup.id }), /not_found/);
        assert.equal(blobs.size, 1);
      },
    );
    await t.test(
      "limpeza só remove objetos sem referência; falha externa fica recuperável",
      async () => {
        const temp = await call("create", {
          id: randomUUID(),
          name: "Preparação descartável",
          segment_id: "outros",
          configuration: cfg,
        });
        const image = await sharp({
          create: { width: 20, height: 20, channels: 3, background: "#123456" },
        })
          .png()
          .toBuffer();
        const media = await studio(
          "studio-upload",
          { id: temp.id, mime: "image/png", bytes: image.toString("base64") },
          "root",
        );
        await call("delete", { id: temp.id, revision: temp.revision });
        const candidates = await call("cleanup");
        assert.ok(candidates.some((x) => x.id === media.id));
        assert.ok(!candidates.some((x) => x.id === asset.id));
        assert.equal((await studio("studio-cleanup", {}, "root")).pending, 1);
        assert.ok(blobs.has(media.object_path));
        removeFails = false;
        assert.equal((await studio("studio-cleanup", {}, "root")).deleted, 1);
        assert.ok(!blobs.has(media.object_path));
        assert.ok(!(await call("cleanup")).some((x) => x.id === media.id));
      },
    );
    let demo;
    await t.test(
      "aprovação idempotente via fluxo oficial; configuração aplicada sem dados operacionais",
      async () => {
        await assert.rejects(
          studio(
            "studio-approve",
            { id: d.id, revision: d.revision, reviewed: false },
            "root",
          ),
          /review_required/,
        );
        const failing = studioController({
          asUser: c.asUser,
          service: c.service,
          storage,
          store: {
            ...x.store,
            stageStudioAssets: async () => {
              throw Error("commercial_storage_unavailable");
            },
          },
        });
        await assert.rejects(
          failing(
            "studio-approve",
            { id: d.id, revision: d.revision, reviewed: true },
            "root",
            { id: c.users.root },
          ),
          /unavailable/,
        );
        const pending = await call("get", { id: d.id });
        assert.equal(pending.state, "converting");
        assert.ok(pending.demo_id);

        const results = await Promise.all([
          studio(
            "studio-approve",
            { id: d.id, revision: d.revision, reviewed: true },
            "root",
          ),
          studio(
            "studio-approve",
            { id: d.id, revision: d.revision, reviewed: true },
            "root",
          ),
        ]);
        assert.equal(results[0].demo_id, results[1].demo_id);
        d = results[0];
        demo = await c.asUser("root", "commercial_demo_edit_context", {
          p_id: d.demo_id,
        });
        const ed = await x.store.begin(demo, "editor", c.users.root);
        const page = await x.store.rpc(
          ed.token,
          demo,
          "company",
          "consumer_page_draft",
          { p_org: ed.organization.id, p_show_prices: true },
        );
        assert.equal(page.preview.services.length, 2);
        assert.equal(page.preview.hours[0].open, "09:00");
        assert.ok(
          page.preview.services.some(
            (s) => s.addons.length === 1 && s.questions.length === 1,
          ),
        );

        const config = await x.store.export(ed.token, demo, {
          requireReady: true,
        });
        await x.store.freeze(demo.id, config);
        const v = await c.asUser("root", "commercial_demo_draft", {
          p_id: demo.id,
          p_revision: demo.revision,
          p_config: config,
          p_review: true,
        });
        await c.asUser("root", "commercial_demo_publish", {
          p_id: demo.id,
          p_revision: v.revision,
          p_config: config,
        });
        demo = await c.service("commercial_service", {
          p_action: "demo",
          p_data: { id: demo.id },
        });
      },
    );
    await t.test(
      "link individual sem email; ativação e envio não recebem autorização fictícia",
      async () => {
        const lead = (
          await c.asUser("root", "commercial_contact_save", {
            p_id: null,
            p_revision: 0,
            p_key: randomUUID(),
            p_data: { name: "Interessada Aurora" },
          })
        ).id;
        await c.asUser("root", "commercial_demo_link", {
          p_demo: demo.id,
          p_lead: lead,
        });
        const ctl = commercialController({
          asUser: c.asUser,
          service: c.service,
          auth: async () => ({ id: c.users.root }),
          store: x.store,
          origins: {
            publicOrigin: "https://demo.example.invalid",
            appOrigin: "https://app.example.invalid",
          },
        });
        const a = await ctl.operator(
          "invite",
          { id: demo.id, lead_id: lead, purpose: "demonstration" },
          "root",
        );
        const b = await ctl.operator(
          "invite",
          { id: demo.id, lead_id: lead, purpose: "demonstration" },
          "root",
        );
        assert.notEqual(a.url, b.url);
        await assert.rejects(
          ctl.operator(
            "invite",
            { id: demo.id, lead_id: lead, purpose: "activation" },
            "root",
          ),
          /authorized/,
        );
        assert.equal(
          (
            await c.rawSQL(
              "select private.commercial_mail_eligible($1,'demonstration')ok",
              [lead],
            )
          ).rows[0].ok,
          false,
        );
        const invitation = new URLSearchParams(
          new URL(a.url).hash.slice(1),
        ).get("convite");
        const [one, two] = await Promise.all([
          ctl.visitor("start", { slug: demo.slug, invitation }),
          ctl.visitor("start", { slug: demo.slug, invitation }),
        ]);
        assert.notEqual(one.organization.id, two.organization.id);
        assert.notEqual(one.token, two.token);
        await ctl.visitor("restore", {}, one.token);
        await ctl.visitor("restore", {}, two.token);
        await assert.rejects(
          ctl.visitor(
            "rpc",
            {
              perspective: "company",
              name: "company_context",
              args: { p_org: two.organization.id },
            },
            one.token,
          ),
          /scope_denied/,
        );
        await ctl.visitor("end", {}, one.token);
        await assert.rejects(ctl.visitor("restore", {}, one.token), /expired/);
        await ctl.visitor("restore", {}, two.token);
        await ctl.close();
      },
    );
  } finally {
    await c.db.close();
    await x.store.close();
  }
});

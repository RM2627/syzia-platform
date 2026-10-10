import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { consumerDB, users } from "./support/consumer-db.mjs";
import { seedPresence } from "./fixtures/presence.mjs";
const c = await consumerDB({
    through: "202609210030_business_finance_permissions.sql",
  }),
  { db, as, rpc, scalar, orgs } = c;
await seedPresence(c);
const results = [];
async function snapshot() {
  return scalar(
    "select jsonb_build_object('services',(select jsonb_agg(to_jsonb(s)-'image_media_id'order by id)from services s),'categories',(select jsonb_agg(to_jsonb(s)order by id)from service_categories s),'branding',(select jsonb_agg(to_jsonb(s)order by organization_id)from company_branding s),'works',(select jsonb_agg(to_jsonb(s)order by id)from portfolio_items s),'pages',(select jsonb_agg(to_jsonb(s)order by organization_id)from consumer_pages s),'publications',(select jsonb_agg(to_jsonb(s)order by id)from consumer_publications s))",
  );
}
const before = await snapshot();
await db.exec(
  await readFile(
    "supabase/migrations/202609220031_public_presence_experience.sql",
    "utf8",
  ),
);
assert.deepEqual(await snapshot(), before);
results.push({
  name: "Upgrade 030→031 conserva categorias, serviços, identidade, imagens vinculadas, portfólio e publicações existentes",
  status: "PASS",
});
async function test(name, fn) {
  await db.exec("begin");
  try {
    await as("adminA");
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message, where: e.where });
    console.log("FAIL", name, e.message, e.where || "", e.stack);
  } finally {
    await db.exec("rollback;reset role");
  }
}
async function deny(fn) {
  await db.exec("savepoint denied");
  try {
    await fn();
  } catch (e) {
    await db.exec("rollback to savepoint denied");
    return e;
  }
  throw Error("Expected denial");
}
const rev = () =>
  scalar("select revision from company_settings where organization_id=$1", [
    orgs.A,
  ]);
async function media(org = orgs.A, actor = "adminA") {
  await as(actor);
  const m = await rpc("consumer_reserve_company_media", {
    p_org: org,
    p_mime: "image/png",
    p_size: 64,
    p_key: randomUUID(),
  });
  await db.exec("reset role;set local role service_role");
  await rpc("consumer_finalize_company_media", {
    p_code: m.code,
    p_user: users[actor],
    p_sha256: "a".repeat(64),
    p_size: 64,
    p_width: 4,
    p_height: 4,
  });
  await as(actor);
  return m.code;
}
const draft = () =>
  rpc("consumer_page_draft", { p_org: orgs.A, p_show_prices: true });
async function publish(d = undefined) {
  d = d || (await draft());
  return rpc("consumer_publish_draft", {
    p_org: orgs.A,
    p_token: d.token,
    p_show_prices: true,
    p_expected_revision: d.page_revision,
  });
}
await test("Categorias existentes/reutilizáveis: criação, seleção, duplicação evitada, ordem e isolamento A/B", async () => {
  const old = await rpc("company_categories", { p_org: orgs.A });
  assert.ok(old.length);
  const cat = await rpc("company_category_save", {
    p_org: orgs.A,
    p_id: null,
    p_revision: 0,
    p_data: { name: "Projetos fictícios" },
    p_key: randomUUID(),
  });
  const again = await rpc("company_category_save", {
    p_org: orgs.A,
    p_id: null,
    p_revision: 0,
    p_data: { name: "  PROJETOS FICTÍCIOS " },
    p_key: randomUUID(),
  });
  assert.equal(again.id, cat.id);
  const id = await rpc("company_save", {
    p_org: orgs.A,
    p_entity: "service",
    p_id: null,
    p_expected_revision: await rev(),
    p_data: {
      name: "Projeto de teste",
      category_id: cat.id,
      price_mode: "quote",
    },
  });
  assert.equal(
    await scalar("select category_id from services where id=$1", [id]),
    cat.id,
  );
  await rpc("company_category_save", {
    p_org: orgs.A,
    p_id: cat.id,
    p_revision: cat.revision,
    p_data: { position: 5 },
    p_key: randomUUID(),
  });
  await as("adminB");
  assert.ok(
    !(await rpc("company_categories", { p_org: orgs.B })).some(
      (x) => x.id === cat.id,
    ),
  );
  await deny(() =>
    rpc("company_category_save", {
      p_org: orgs.A,
      p_id: cat.id,
      p_revision: 1,
      p_data: { name: "Ataque" },
      p_key: randomUUID(),
    }),
  );
});
await test("Logo, capa e HEX persistem; mídia da outra empresa e CSS malformado são recusados", async () => {
  const a = await media(),
    b = await media(orgs.B, "adminB");
  await as("adminA");
  let d = await rpc("consumer_presence_context", { p_org: orgs.A });
  await rpc("consumer_branding_save", {
    p_org: orgs.A,
    p_revision: d.revision,
    p_data: { ...d.branding, logo: a, cover: a, primary_color: "#FFFF00" },
  });
  d = await rpc("consumer_presence_context", { p_org: orgs.A });
  assert.equal(d.branding.logo, a);
  assert.equal(d.branding.cover, a);
  assert.equal(d.branding.primary_color, "#FFFF00");
  await deny(() =>
    rpc("consumer_branding_save", {
      p_org: orgs.A,
      p_revision: d.revision,
      p_data: { ...d.branding, logo: b },
    }),
  );
  await deny(() =>
    rpc("consumer_branding_save", {
      p_org: orgs.A,
      p_revision: d.revision,
      p_data: { ...d.branding, primary_color: "red;display:none" },
    }),
  );
});
await test("Imagem de serviço: acesso privado, vínculo próprio, snapshot público e remoção sem apagar publicação", async () => {
  const image = await media(),
    sid = c.services.A[0],
    foreign = await media(orgs.B, "adminB");
  await as("adminA");
  await deny(async () =>
    rpc("company_save", {
      p_org: orgs.A,
      p_entity: "service",
      p_id: sid,
      p_expected_revision: await rev(),
      p_data: { image_media: foreign },
    }),
  );
  await rpc("company_save", {
    p_org: orgs.A,
    p_entity: "service",
    p_id: sid,
    p_expected_revision: await rev(),
    p_data: { image_media: image },
  });
  assert.equal(
    (await rpc("company_context", { p_org: orgs.A })).services.find(
      (s) => s.id === sid,
    ).image_media,
    image,
  );
  await db.exec("reset role;set local role service_role");
  await deny(() => rpc("consumer_gateway_public_media", { p_code: image }));
  await as("adminA");
  await publish();
  await db.exec("reset role;set local role service_role");
  assert.ok(
    (await rpc("consumer_gateway_public_media", { p_code: image })).path,
  );
  await as("adminA");
  await rpc("company_save", {
    p_org: orgs.A,
    p_entity: "service",
    p_id: sid,
    p_expected_revision: await rev(),
    p_data: { image_media: null },
  });
  const pub = await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" });
  assert.ok(pub.services.some((s) => s.image_media === image));
  await publish();
  await db.exec("reset role;set local role service_role");
  await deny(() => rpc("consumer_gateway_public_media", { p_code: image }));
});
await test("Portfólio foto única/antes-depois/galeria: ordem, ocultar/excluir rascunho e snapshot preservado", async () => {
  const imgs = [await media(), await media(), await media()];
  const codes = [];
  for (const [format, images] of [
    ["gallery", [imgs[0]]],
    ["before_after", imgs.slice(0, 2)],
    ["gallery", imgs],
  ])
    codes.push(
      await rpc("consumer_portfolio_save", {
        p_org: orgs.A,
        p_code: null,
        p_data: {
          title: "Trabalho " + format,
          format,
          images,
          position: 0,
          active: true,
        },
      }),
    );
  await publish();
  await rpc("consumer_portfolio_delete", { p_org: orgs.A, p_code: codes[0] });
  assert.ok(
    !(
      await rpc("consumer_presence_context", { p_org: orgs.A })
    ).portfolio_all.some((w) => w.code === codes[0]),
  );
  assert.ok(
    (
      await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" })
    ).portfolio.some((w) => w.code === codes[0]),
  );
  await as("adminB");
  await deny(() =>
    rpc("consumer_portfolio_delete", { p_org: orgs.A, p_code: codes[1] }),
  );
  await deny(() =>
    rpc("consumer_portfolio_save", {
      p_org: orgs.B,
      p_code: null,
      p_data: { title: "Inválido", images: [imgs[0]], format: "gallery" },
    }),
  );
});
await test("Prévia sem efeitos colaterais e publicação revisada sem alterar manual/autonomia/atendimento", async () => {
  const state = await scalar(
    "select to_jsonb(s)from company_settings s where organization_id=$1",
    [orgs.A],
  );
  const n = await scalar("select count(*)from consumer_publications");
  let d = await draft();
  assert.ok(!JSON.stringify(d.preview).includes("REGRA PRIVADA"));
  assert.ok(!JSON.stringify(d.preview).includes("INTERNO SECRETO"));
  assert.equal(await scalar("select count(*)from consumer_publications"), n);
  await rpc("company_save", {
    p_org: orgs.A,
    p_entity: "settings",
    p_id: null,
    p_expected_revision: await rev(),
    p_data: { description: "Novo texto fictício, só no rascunho" },
  });
  assert.equal(
    (await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" }))
      .description,
    before.publications.find(
      (x) =>
        x.id ===
        before.pages.find((p) => p.organization_id === orgs.A).publication_id,
    ).payload.description,
  );
  await deny(() => publish(d));
  d = await draft();
  await publish(d);
  const after = await scalar(
    "select to_jsonb(s)from company_settings s where organization_id=$1",
    [orgs.A],
  );
  assert.equal(after.published_manual_id, state.published_manual_id);
  assert.equal(after.human_enabled, state.human_enabled);
  assert.equal(
    (await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" }))
      .description,
    d.preview.description,
  );
  await as("adminB");
  await deny(() => draft());
  await as("alice");
  await deny(() => draft());
  await as("anon");
  await deny(() => draft());
});
// Separate transaction for the public consumer path (no client helper access).
await test("Nova publicação: criar solicitação com item e valor publicado mesmo após editar o rascunho", async () => {
  await publish();
  const page = await rpc("consumer_public_page", {
      p_slug: "ms-auto-ficticia",
    }),
    s = page.services.find((x) => x.price_mode === "fixed");
  const answers = Object.fromEntries(
    s.questions.map((f) => [
      f.code,
      f.kind === "boolean"
        ? true
        : f.kind === "number"
          ? 2
          : f.kind === "choice"
            ? f.options[0]
            : "Resposta fictícia",
    ]),
  );
  await rpc("company_save", {
    p_org: orgs.A,
    p_entity: "service",
    p_id: c.services.A[0],
    p_expected_revision: await rev(),
    p_data: { price_cents: 99900 },
  });
  await as("alice");
  const result = await rpc("consumer_create_request", {
    p_slug: page.slug,
    p_revision: page.revision,
    p_service: s.code,
    p_addons: [],
    p_answers: answers,
    p_customer: {
      name: "Cliente fictício",
      whatsapp: "81999990000",
      accepted_notice: true,
      notice_version: "consumer-v1",
    },
    p_notes: "Teste local",
    p_contact: false,
    p_expected_cents: s.price_cents,
    p_key: randomUUID(),
  });
  assert.ok(result.code);
});
await test("Nova empresa publica sem manual, opcionais não bloqueiam; falta de descrição é explicada", async () => {
  await as("root");
  const o = (
    await rpc("access_create_organization", {
      p_name: "Nova fictícia",
      p_slug: "nova-presenca-ficticia",
      p_key: randomUUID(),
    })
  ).organization_id;
  await rpc("company_initialize", { p_org: o });
  const revision = async () =>
    scalar("select revision from company_settings where organization_id=$1", [
      o,
    ]);
  let d = await rpc("consumer_page_draft", { p_org: o, p_show_prices: true });
  assert.equal(d.ready, false);
  await rpc("company_save", {
    p_org: o,
    p_entity: "settings",
    p_id: null,
    p_expected_revision: await revision(),
    p_data: { description: "Descrição fictícia da nova empresa" },
  });
  await rpc("company_save", {
    p_org: o,
    p_entity: "service",
    p_id: null,
    p_expected_revision: await revision(),
    p_data: { name: "Serviço fictício", price_mode: "quote" },
  });
  d = await rpc("consumer_page_draft", { p_org: o, p_show_prices: true });
  assert.equal(d.ready, true);
  assert.ok(d.checklist.some((x) => !x.required && !x.complete));
  await rpc("consumer_publish_draft", {
    p_org: o,
    p_token: d.token,
    p_show_prices: true,
    p_expected_revision: d.page_revision,
  });
  assert.ok(
    await rpc("consumer_public_page", { p_slug: "nova-presenca-ficticia" }),
  );
  assert.ok(
    (await rpc("onboarding_context", { p_org: o })).items.find(
      (i) => i.id === "publication",
    ).complete,
  );
});

await test("Permissões granulares: editor de serviço usa apenas mídia própria/vinculada; prévia completa não vaza módulos", async () => {
  async function grant(actions) {
    await as("adminA");
    const team = await rpc("permissions_team", { p_org: orgs.A });
    const m = team.members.find((x) => x.user_id === users.worker);
    await scalar("select permissions_save($1,$2,$3,$4,$5)", [
      orgs.A,
      users.worker,
      m.revision,
      JSON.stringify(
        actions.map((action) => ({
          action,
          scope: "organization",
          granted: true,
        })),
      ),
      randomUUID(),
    ]);
  }
  const privateImage = await media(),
    foreign = await media(orgs.B, "adminB");
  await grant(["services.read", "services.manage"]);
  const own = await media(orgs.A, "worker");
  await rpc("company_save", {
    p_org: orgs.A,
    p_entity: "service",
    p_id: c.services.A[0],
    p_expected_revision: (await rpc("company_context", { p_org: orgs.A }))
      .settings.revision,
    p_data: { image_media: own },
  });
  await deny(() => draft());
  async function gateway(code, user = "worker") {
    await as(user);
    await db.exec("reset role;set local role service_role");
    return rpc("consumer_gateway_company_media", {
      p_code: code,
      p_user: users[user],
      p_write: false,
    });
  }
  assert.ok((await gateway(own)).path);
  await deny(() => gateway(privateImage));
  await deny(() => gateway(foreign));
  await grant(["page.read"]);
  await as("worker");
  await deny(() => draft());
  await grant([
    "page.read",
    "services.read",
    "portfolio.read",
    "settings.read",
  ]);
  await as("worker");
  assert.ok((await draft()).preview);
  await deny(() => publish());
  await db.exec("reset role");
  for (const role of ["authenticated", "anon"])
    assert.equal(
      await scalar(
        "select count(*)::int from pg_proc where pronamespace='private'::regnamespace and (proname like 'presence_%' or proname='v030_company_save')and has_function_privilege($1,oid,'execute')",
        [role],
      ),
      0,
    );
});
await test("Publicação antiga e nova preservam adicionais e respostas obrigatórias na solicitação", async () => {
  for (const version of ["legacy", "draft"]) {
    await as("adminA");
    if (version === "draft") await publish();
    const p = await rpc("consumer_public_page", { p_slug: "ms-auto-ficticia" }),
      s = p.services.find((x) => x.price_mode === "fixed");
    assert.ok(s.addons.length);
    assert.ok(s.questions.length);
    const a = s.addons.filter((x) => x.price_mode === "fixed"),
      expected = s.price_cents + a.reduce((sum, x) => sum + x.price_cents, 0);
    const answers = Object.fromEntries(
      s.questions.map((f) => [
        f.code,
        f.kind === "boolean"
          ? true
          : f.kind === "number"
            ? 2
            : f.kind === "choice"
              ? f.options[0]
              : "Resposta fictícia",
      ]),
    );
    await as("alice");
    const r = await rpc("consumer_create_request", {
      p_slug: p.slug,
      p_revision: p.revision,
      p_service: s.code,
      p_addons: a.map((x) => x.code),
      p_answers: answers,
      p_customer: {
        name: "Cliente fictício",
        whatsapp: "81999990000",
        accepted_notice: true,
        notice_version: "consumer-v1",
      },
      p_notes: "Verificação " + version,
      p_contact: false,
      p_expected_cents: expected,
      p_key: randomUUID(),
    });
    assert.ok(r.code);
  }
});
await writeFile(
  "reports/presence-correction/backend.json",
  JSON.stringify(
    {
      environment: "LOCAL PGlite; dados fictícios; sem serviços externos",
      results,
    },
    null,
    2,
  ),
);
await db.close();
if (results.some((r) => r.status !== "PASS")) process.exitCode = 1;

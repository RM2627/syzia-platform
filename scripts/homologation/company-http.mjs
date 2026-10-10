// Operator-run Phase 3 homologation only. Never run against production or MS Auto Details.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { validateConfig, accountNames, safeError } from "./config.mjs";
let config;
try {
  config = validateConfig(
    JSON.parse(await readFile(".homologation/connection.json", "utf8")),
  );
} catch {
  console.error(
    "Configuração de homologação ausente ou inválida. Nenhuma requisição enviada.",
  );
  process.exit(2);
}
const mode = process.argv[2] || "--read-only";
if (!["--read-only", "--mutations"].includes(mode)) {
  console.error("Use --read-only ou --mutations.");
  process.exit(2);
}
const results = [],
  clients = {},
  tokens = {},
  ids = {};
const A = config.organizations.a,
  B = config.organizations.b;
const transport = (url, init = {}) =>
  fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
async function rpc(name, fn, args = {}) {
  const r = await clients[name].rpc(fn, args);
  if (r.error) throw r.error;
  return r.data;
}
async function context(name, org) {
  return rpc(name, "company_context", { p_org: org });
}
async function record(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS " + name);
  } catch (e) {
    results.push({ name, status: "FAIL", ...safeError(e) });
    console.log("FAIL " + name);
  }
}
async function expectDenied(name, fn, args, codes = ["42501"]) {
  const r = await clients[name].rpc(fn, args);
  assert.ok(codes.includes(r.error?.code));
}
async function rev(name, org) {
  return (await context(name, org)).settings.revision;
}
async function save(name, org, entity, data, id = null) {
  return rpc(name, "company_save", {
    p_org: org,
    p_entity: entity,
    p_id: id,
    p_expected_revision: await rev(name, org),
    p_data: data,
  });
}
async function raw(table, token) {
  const r = await transport(
    config.url + "/rest/v1/" + table + "?select=organization_id",
    {
      headers: {
        apikey: config.publishableKey,
        Authorization: "Bearer " + token,
      },
    },
  );
  assert.equal(r.status, 200);
  return r.json();
}
try {
  for (const name of accountNames) {
    clients[name] = createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: transport },
    });
    const r = await clients[name].auth.signInWithPassword(
      config.accounts[name],
    );
    if (r.error) throw r.error;
    assert.ok(r.data.user.email_confirmed_at);
    tokens[name] = r.data.session.access_token;
    ids[name] = r.data.user.id;
  }
  assert.equal(new Set(Object.values(ids)).size, 6);
  const rootContext = await rpc("root", "foundation_context");
  assert.ok(rootContext.roles.includes("super_admin"));
  assert.equal(rootContext.organizations.length, 2);
  assert.ok(
    rootContext.organizations.every(
      (o) =>
        [A, B].includes(o.id) &&
        o.status === "active" &&
        o.slug.startsWith("homologacao-fundacao-"),
    ),
  );
  const profiles = await clients.root.from("profiles").select("id,status");
  if (profiles.error) throw profiles.error;
  assert.equal(profiles.data.length, 6);
  assert.ok(
    profiles.data.every(
      (p) => Object.values(ids).includes(p.id) && p.status === "active",
    ),
  );
  const roles = await clients.root
    .from("platform_roles")
    .select("user_id,role,active");
  if (roles.error) throw roles.error;
  assert.deepEqual(
    roles.data
      .filter((r) => r.role === "super_admin" && r.active)
      .map((r) => r.user_id),
    [ids.root],
  );
  // Mutations bootstrap ONLY an empty Company module. Refuse reruns or partially populated datasets.
  if (mode === "--mutations") {
    for (const [name, org] of [
      ["adminA", A],
      ["adminB", B],
    ]) {
      const c = await context(name, org);
      assert.equal(c.settings, null);
      for (const k of [
        "services",
        "addons",
        "fields",
        "manuals",
        "sections",
        "faqs",
        "replies",
      ])
        assert.deepEqual(c[k], []);
    }
    for (const [name, org] of [
      ["adminA", A],
      ["adminB", B],
    ]) {
      await rpc(name, "company_initialize", { p_org: org });
      await save(name, org, "settings", {
        description: "Empresa exclusivamente fictícia de homologação.",
        service_regions: "Região de teste",
        payment_methods: "Pagamento fictício",
        business_hours: [{ day: 1, open: "08:00", close: "18:00" }],
        human_hours: [{ day: 1, open: "09:00", close: "17:00" }],
        exception_contact_name: "Responsável fictício",
        exception_contact: "teste@example.invalid",
      });
      await save(
        name,
        org,
        "rules",
        Object.fromEntries(
          [
            "pricing",
            "payment",
            "cancellation",
            "rescheduling",
            "service",
            "deadlines",
            "exception",
          ].map((k) => [k + "_policy", "Política fictícia de homologação."]),
        ),
      );
      await save(name, org, "permissions", {
        reviewed: true,
        allowed_actions: ["price_list"],
      });
      const sid = await save(name, org, "service", {
        name: "Serviço fictício " + name,
        price_mode: "fixed",
        price_cents: 10000,
        duration_minutes: 60,
      });
      await save(name, org, "addon", {
        service_id: sid,
        name: "Adicional fictício",
        price_mode: "fixed",
        price_cents: 1000,
      });
      await save(name, org, "field", {
        service_id: sid,
        label: "Qual opção fictícia?",
        kind: "choice",
        options: ["Uma", "Duas"],
      });
      await save(name, org, "faq", {
        question: "Como funciona o teste?",
        answer: "Somente dados fictícios para homologação.",
      });
      await save(name, org, "reply", {
        title: "Resposta fictícia",
        body: "Esta é uma resposta de teste.",
      });
      const mid = await rpc(name, "company_create_manual", {
        p_org: org,
        p_expected_revision: await rev(name, org),
        p_title: "Manual fictício de homologação",
      });
      for (const section of (await context(name, org)).sections.filter(
        (s) => s.manual_id === mid,
      ))
        await save(
          name,
          org,
          "section",
          {
            content:
              "Orientação exclusivamente fictícia para homologação técnica.",
          },
          section.id,
        );
      await rpc(name, "company_publish_manual", {
        p_org: org,
        p_manual: mid,
        p_expected_revision: await rev(name, org),
      });
    }
    results.push({
      name: "Fixture Empresa criada e publicada por RPCs autenticados",
      status: "PASS",
    });
  }
  for (const [name, org] of [
    ["adminA", A],
    ["adminB", B],
  ]) {
    await record("Contexto isolado " + name, async () => {
      const c = await context(name, org);
      assert.ok(c.settings);
      assert.ok(c.services.length && c.manuals.length);
      assert.ok(c.services.every((s) => s.organization_id === org));
    });
    for (const table of [
      "company_settings",
      "services",
      "service_addons",
      "service_intake_fields",
      "manual_versions",
      "manual_sections",
      "faqs",
      "quick_replies",
      "business_rules",
      "attendant_permissions",
    ])
      await record("PostgREST " + name + " " + table, async () => {
        const rows = await raw(table, tokens[name]);
        assert.ok(rows.length);
        assert.ok(rows.every((r) => r.organization_id === org));
      });
  }
  await record("Contexto cruzado e atendente sem vínculo negados", async () => {
    await expectDenied("adminA", "company_context", { p_org: B });
    await expectDenied("adminB", "company_context", { p_org: A });
    await expectDenied("unlinked", "company_context", { p_org: A });
  });
  if (mode === "--mutations") {
    await record(
      "Alteração direta de autonomia e promoção via RPC negadas",
      async () => {
        const r = await clients.adminA
          .from("attendant_permissions")
          .update({ max_discount_percent: 100 })
          .eq("organization_id", A)
          .select();
        assert.ok(r.error || r.data.length === 0);
        for (const name of ["attendant", "worker", "unlinked"])
          await expectDenied(name, "company_save", {
            p_org: A,
            p_entity: "permissions",
            p_id: null,
            p_expected_revision: await rev("adminA", A),
            p_data: {
              allowed_actions: ["discount"],
              max_discount_percent: 100,
            },
          });
      },
    );
    await record("FK composta impede adicional em serviço de B", async () => {
      const sid = (await context("adminB", B)).services[0].id;
      await expectDenied(
        "adminA",
        "company_save",
        {
          p_org: A,
          p_entity: "addon",
          p_id: null,
          p_expected_revision: await rev("adminA", A),
          p_data: {
            service_id: sid,
            name: "Tentativa de teste",
            price_mode: "quote",
          },
        },
        ["23503"],
      );
    });
    await record("Contradição de preço rejeitada", async () => {
      await expectDenied(
        "adminA",
        "company_save",
        {
          p_org: A,
          p_entity: "permissions",
          p_id: null,
          p_expected_revision: await rev("adminA", A),
          p_data: { allowed_actions: ["negotiate"], never_change_price: true },
        },
        ["23514"],
      );
    });
    await record("Manual publicado não pode ser reescrito", async () => {
      const c = await context("adminA", A);
      await expectDenied(
        "adminA",
        "company_save",
        {
          p_org: A,
          p_entity: "section",
          p_id: c.sections[0].id,
          p_expected_revision: c.settings.revision,
          p_data: { content: "Tentativa de reescrever publicação." },
        },
        ["23514"],
      );
    });
    await record(
      "Ativação e revogação de autonomia usam mesmo JWT",
      async () => {
        await rpc("adminA", "company_set_activation", {
          p_org: A,
          p_expected_revision: await rev("adminA", A),
          p_human: true,
          p_public_faq: false,
        });
        assert.equal(
          await rpc("attendant", "company_attendant_permission", {
            p_org: A,
            p_action: "price_list",
          }),
          true,
        );
        await save("adminA", A, "permissions", { allowed_actions: [] });
        // Explicitly reuse original token, no fresh sign-in or refresh.
        const r = await transport(
          config.url + "/rest/v1/rpc/company_attendant_permission",
          {
            method: "POST",
            headers: {
              apikey: config.publishableKey,
              Authorization: "Bearer " + tokens.attendant,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ p_org: A, p_action: "price_list" }),
          },
        );
        assert.equal(r.status, 200);
        assert.equal(await r.json(), false);
      },
    );
    await record("Atualização obsoleta é rejeitada", async () => {
      const previous = await rev("adminA", A);
      await save("adminA", A, "settings", {
        legal_name: "Nome fictício atualizado",
      });
      await expectDenied(
        "adminA",
        "company_save",
        {
          p_org: A,
          p_entity: "settings",
          p_id: null,
          p_expected_revision: previous,
          p_data: { legal_name: "Alteração obsoleta" },
        },
        ["40001"],
      );
    });
    // Public FAQ exposure is intentionally not activated automatically by this runner.
  }
} catch (e) {
  results.push({
    name: "Pré-condições ou preparação",
    status: "FAIL",
    ...safeError(e),
  });
  console.error(
    "Falha de pré-condição. Consulte o guia; não execute contra outra base.",
  );
} finally {
  for (const name of Object.keys(clients))
    try {
      const r = await clients[name].auth.signOut({ scope: "local" });
      if (r.error) throw r.error;
    } catch (e) {
      results.push({ name: "Logout " + name, status: "FAIL", ...safeError(e) });
    }
  await mkdir(".homologation/reports", { recursive: true });
  const report = {
    timestamp: new Date().toISOString(),
    projectRef: config.projectRef,
    mode,
    homologated: false,
    limits: [
      "Execução não substitui e-mail/SMTP, concorrência em conexões independentes, FAQ anônima habilitada pelo operador ou restauração.",
      "O modo mutations mantém os dados de teste e a auditoria. Não faz limpeza destrutiva nem habilita FAQ pública.",
      "Ao final, a autonomia A é revogada e o manual fica desatualizado intencionalmente.",
    ],
    results,
  };
  await writeFile(
    ".homologation/reports/company-http-" + Date.now() + ".json",
    JSON.stringify(report, null, 2),
  );
}
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { validateConfig, accountNames, safeError } from "./config.mjs";

// Operator-run tests only. No deploy, paid service, Auth administration or production data.
// Credentials stay in .homologation/connection.json and memory; reports never store tokens/emails.
const mode = process.argv[2] || "--read-only";
if (!["--read-only", "--mutations"].includes(mode)) {
  console.error("Use --read-only ou --mutations.");
  process.exit(2);
}
let config;
try {
  config = validateConfig(
    JSON.parse(await readFile(".homologation/connection.json", "utf8")),
  );
} catch (e) {
  console.error(
    "Configuração local de homologação ausente ou inválida. Siga docs/homologation-guide.md. Nenhuma requisição foi enviada.",
  );
  process.exit(2);
}
const clients = {},
  tokens = {},
  ids = {},
  results = [];
const now = () => new Date().toISOString();
async function record(name, work) {
  try {
    await work();
    results.push({ name, status: "PASS" });
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push({ name, status: "FAIL", ...safeError(e) });
    console.log(`FAIL ${name}`);
  }
}
function rpc(client, name, args) {
  return client.rpc(name, args);
}
async function command(name, args) {
  const r = await rpc(clients.root, name, args);
  if (r.error) throw r.error;
  return r.data;
}
async function select(client, table, filters = {}) {
  let q = client.from(table).select("*");
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const r = await q;
  if (r.error) throw r.error;
  return r.data;
}
async function denied(client, name, args) {
  const r = await rpc(client, name, args);
  assert.equal(r.error?.code, "42501");
}
async function raw(path, token, options = {}) {
  return fetch(config.url + path, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: {
      apikey: config.publishableKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}
async function rawOrganizations(name) {
  const r = await raw("/rest/v1/organizations?select=id", tokens[name]);
  assert.equal(r.status, 200);
  return r.json();
}
async function readDeniedWithOldToken(name) {
  const r = await raw("/rest/v1/rpc/foundation_context", tokens[name], {
    method: "POST",
    body: "{}",
  });
  assert.equal(r.status, 403);
  const b = await r.json();
  assert.equal(b.code, "42501");
}
const A = config.organizations.a,
  B = config.organizations.b;
let setupComplete = false;
try {
  for (const name of accountNames) {
    const c = createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (url, options) =>
          fetch(url, {
            ...options,
            redirect: "error",
            signal: AbortSignal.timeout(20000),
          }),
      },
    });
    const { data, error } = await c.auth.signInWithPassword(
      config.accounts[name],
    );
    if (error) throw error;
    assert.ok(data.session && data.user?.email_confirmed_at);
    ids[name] = data.user.id;
    tokens[name] = data.session.access_token;
    clients[name] = c;
    results.push({
      name: `Auth real: login confirmado (${name})`,
      status: "PASS",
    });
  }
  assert.equal(new Set(Object.values(ids)).size, accountNames.length);
  const rootContext = await rpc(clients.root, "foundation_context");
  if (rootContext.error) throw rootContext.error;
  assert.ok(rootContext.data.roles.includes("super_admin"));
  // Refuse an unexpected dataset BEFORE running any negative write attempt.
  const orgs = await select(clients.root, "organizations");
  assert.equal(orgs.length, 2);
  assert.deepEqual(orgs.map((o) => o.id).sort(), [A, B].sort());
  assert.ok(
    orgs.every(
      (o) =>
        o.slug.startsWith("homologacao-fundacao-") && o.status === "active",
    ),
  );
  const people = await select(clients.root, "profiles");
  assert.deepEqual(people.map((p) => p.id).sort(), Object.values(ids).sort());
  assert.ok(people.every((p) => p.status === "active"));
  const roles = await select(clients.root, "platform_roles");
  assert.equal(
    roles.filter((r) => r.role === "super_admin" && r.active).length,
    1,
  );
  assert.equal(
    roles.find((r) => r.role === "super_admin" && r.active)?.user_id,
    ids.root,
  );
  setupComplete = true;
  await record("A só lê empresa A", async () =>
    assert.deepEqual(
      (await select(clients.adminA, "organizations")).map((o) => o.id),
      [A],
    ),
  );
  await record("B só lê empresa B", async () =>
    assert.deepEqual(
      (await select(clients.adminB, "organizations")).map((o) => o.id),
      [B],
    ),
  );
  await record("A não lê membros de B", async () =>
    assert.equal(
      (
        await select(clients.adminA, "organization_members", {
          organization_id: B,
        })
      ).length,
      0,
    ),
  );
  await record("A não lê perfil do administrador B", async () =>
    assert.equal(
      (await select(clients.adminA, "profiles", { id: ids.adminB })).length,
      0,
    ),
  );
  await record("A não lê auditoria de B", async () =>
    assert.equal(
      (await select(clients.adminA, "audit_logs", { organization_id: B }))
        .length,
      0,
    ),
  );
  await record("Atendente acessa somente A", async () =>
    assert.deepEqual(
      (await select(clients.attendant, "organizations")).map((o) => o.id),
      [A],
    ),
  );
  await record("Atendente sem vínculo não vê empresas", async () =>
    assert.equal((await select(clients.unlinked, "organizations")).length, 0),
  );
  await record("Colaborador vê somente seu vínculo", async () =>
    assert.deepEqual(
      (await select(clients.worker, "organization_members")).map(
        (m) => m.user_id,
      ),
      [ids.worker],
    ),
  );
  await record("Colaborador não lê auditoria", async () =>
    assert.equal((await select(clients.worker, "audit_logs")).length, 0),
  );
  await record("Requisição sem token não lê organizações", async () => {
    const r = await raw("/rest/v1/organizations?select=id");
    assert.ok([401, 403].includes(r.status));
  });
  await record("JWT adulterado é rejeitado pelo serviço real", async () => {
    const token = tokens.adminA;
    const r = await raw(
      "/rest/v1/organizations?select=id",
      token.slice(0, token.lastIndexOf(".") + 1) + "invalid-signature",
    );
    assert.ok([401, 403].includes(r.status));
  });
  if (mode === "--mutations") {
    // Negative writes only run in mutation mode: a security bug could otherwise make them succeed.
    await record("Empresa não modifica outra empresa", async () =>
      denied(clients.adminA, "foundation_update_organization", {
        p_org: B,
        p_name: "HOMOLOGAÇÃO B",
        p_status: "active",
      }),
    );
    await record("Colaborador não administra membros", async () =>
      denied(clients.worker, "foundation_set_member", {
        p_org: A,
        p_user: ids.worker,
        p_role: "colaborador_empresa",
        p_status: "active",
      }),
    );
    await record("Suspensão bloqueia token já emitido", async () => {
      try {
        await command("foundation_set_profile_status", {
          p_user: ids.adminA,
          p_status: "suspended",
        });
        await readDeniedWithOldToken("adminA");
        assert.equal((await rawOrganizations("adminA")).length, 0);
      } finally {
        await command("foundation_set_profile_status", {
          p_user: ids.adminA,
          p_status: "active",
        });
      }
    });
    await record(
      "Revogação de membro bloqueia empresa com token antigo",
      async () => {
        try {
          await command("foundation_set_member", {
            p_org: A,
            p_user: ids.worker,
            p_role: "colaborador_empresa",
            p_status: "suspended",
          });
          assert.equal((await rawOrganizations("worker")).length, 0);
        } finally {
          await command("foundation_set_member", {
            p_org: A,
            p_user: ids.worker,
            p_role: "colaborador_empresa",
            p_status: "active",
          });
        }
      },
    );
    await record(
      "Revogação de vínculo de atendente bloqueia token antigo",
      async () => {
        try {
          await command("foundation_set_attendant", {
            p_org: A,
            p_user: ids.attendant,
            p_kind: "primary",
            p_status: "suspended",
          });
          assert.equal((await rawOrganizations("attendant")).length, 0);
        } finally {
          await command("foundation_set_attendant", {
            p_org: A,
            p_user: ids.attendant,
            p_kind: "primary",
            p_status: "active",
          });
        }
      },
    );
    await record("Revogação global não reativa vínculos antigos", async () => {
      try {
        await command("foundation_set_global_role", {
          p_user: ids.attendant,
          p_role: "atendente",
          p_active: false,
        });
        assert.equal((await rawOrganizations("attendant")).length, 0);
        await command("foundation_set_global_role", {
          p_user: ids.attendant,
          p_role: "atendente",
          p_active: true,
        });
        assert.equal((await rawOrganizations("attendant")).length, 0);
      } finally {
        await command("foundation_set_global_role", {
          p_user: ids.attendant,
          p_role: "atendente",
          p_active: true,
        });
        await command("foundation_set_attendant", {
          p_org: A,
          p_user: ids.attendant,
          p_kind: "primary",
          p_status: "active",
        });
      }
    });
    await record(
      "Revogação de superadmin bloqueia comando com token antigo",
      async () => {
        try {
          await command("foundation_set_global_role", {
            p_user: ids.adminA,
            p_role: "super_admin",
            p_active: true,
          });
          await command("foundation_set_global_role", {
            p_user: ids.adminA,
            p_role: "super_admin",
            p_active: false,
          });
          const r = await raw(
            "/rest/v1/rpc/foundation_set_profile_status",
            tokens.adminA,
            {
              method: "POST",
              body: JSON.stringify({ p_user: ids.adminB, p_status: "active" }),
            },
          );
          assert.equal(r.status, 403);
        } finally {
          await command("foundation_set_global_role", {
            p_user: ids.adminA,
            p_role: "super_admin",
            p_active: false,
          });
        }
      },
    );
    await record(
      "Pedidos paralelos: duas revogações não retiram ambos os papéis",
      async () => {
        try {
          for (const n of ["adminA", "adminB"])
            await command("foundation_set_global_role", {
              p_user: ids[n],
              p_role: "super_admin",
              p_active: true,
            });
          const r = await Promise.all([
            rpc(clients.adminA, "foundation_set_global_role", {
              p_user: ids.adminB,
              p_role: "super_admin",
              p_active: false,
            }),
            rpc(clients.adminB, "foundation_set_global_role", {
              p_user: ids.adminA,
              p_role: "super_admin",
              p_active: false,
            }),
          ]);
          assert.equal(r.filter((x) => !x.error).length, 1);
          assert.equal(r.filter((x) => x.error?.code === "42501").length, 1);
        } finally {
          for (const n of ["adminA", "adminB"])
            await command("foundation_set_global_role", {
              p_user: ids[n],
              p_role: "super_admin",
              p_active: false,
            });
        }
      },
    );
    await record(
      "Pedidos paralelos: apenas um principal é criado",
      async () => {
        try {
          const r = await Promise.all([
            command("foundation_set_attendant", {
              p_org: B,
              p_user: ids.attendant,
              p_kind: "primary",
              p_status: "active",
            }).then(
              () => ({ ok: true }),
              (e) => ({ ok: false, code: e.code }),
            ),
            command("foundation_set_attendant", {
              p_org: B,
              p_user: ids.unlinked,
              p_kind: "primary",
              p_status: "active",
            }).then(
              () => ({ ok: true }),
              (e) => ({ ok: false, code: e.code }),
            ),
          ]);
          assert.equal(r.filter((x) => x.ok).length, 1);
          assert.equal(r.filter((x) => x.code === "23505").length, 1);
        } finally {
          for (const n of ["attendant", "unlinked"])
            await command("foundation_set_attendant", {
              p_org: B,
              p_user: ids[n],
              p_kind: "primary",
              p_status: "suspended",
            });
        }
      },
    );
  } else
    results.push({
      name: "Mutações, suspensão e pedidos paralelos",
      status: "NOT_EXECUTED",
      reason:
        "Executar separadamente com --mutations no ambiente fictício validado.",
    });
} catch (e) {
  results.push({
    name: "Pré-condições do projeto e das contas",
    status: "FAIL",
    ...safeError(e),
  });
} finally {
  for (const [name, c] of Object.entries(clients))
    await record(`Auth real: logout (${name})`, async () => {
      const { error } = await c.auth.signOut({ scope: "local" });
      if (error) throw error;
      assert.equal((await c.auth.getSession()).data.session, null);
    });
  const report = {
    timestamp: now(),
    environment: {
      projectRef: config.projectRef,
      mode,
      channel: "Auth e HTTP/PostgREST reais quando executado pelo operador",
    },
    setupComplete,
    passed: results.filter((r) => r.status === "PASS").length,
    failed: results.filter((r) => r.status === "FAIL").length,
    results,
    limits: [
      "Não comprova entrega de e-mail, callback PKCE ou recuperação manual.",
      "Pedidos HTTP paralelos não comprovam sobreposição controlada ou backend_pid distintos; usar o roteiro de conexões SQL independentes.",
      "Logout não invalida retroativamente todo access token: verificar separadamente sua expiração e as regras de suspensão no banco.",
      "Restores, configuração de abuso e migrations exigem suas próprias evidências.",
    ],
    homologated: false,
  };
  await mkdir(".homologation/reports", { recursive: true });
  await writeFile(
    `.homologation/reports/http-${Date.now()}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(
    `${report.passed} PASS; ${report.failed} FAIL. Relatório salvo localmente sem senhas ou tokens.`,
  );
  if (report.failed) process.exitCode = 1;
}

import {upgrade030Fixture} from "./support/upgrade030.mjs";
import {authorizeSupport} from "./support/authorized-support.mjs";
import { PGlite } from "./support/pglite.mjs";
import pg from "pg";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const native = Boolean(process.env.FOUNDATION_NATIVE_SOCKET);
const connection = {
  host: process.env.FOUNDATION_NATIVE_SOCKET,
  user: "postgres",
  database: "foundation_phase2_test",
};
const client = native ? new pg.Client(connection) : null;
if (client) await client.connect();
const db = client
  ? {
      exec: (s) => client.query(s),
      query: (s, a) => client.query(s, a),
      close: () => client.end(),
    }
  : new PGlite();
const results = [];
const U = Object.fromEntries(
  [
    "root",
    "adminA",
    "adminB",
    "workerA",
    "attendantA",
    "unlinked",
    "suspended",
    "anonymous",
    "unconfirmed",
    "root2",
    "newUser",
  ].map((k, i) => [
    k,
    `00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
  ]),
);
await db.exec(await readFile("tests/auth-fixture.sql", "utf8"));
const migrations = (await readdir("supabase/migrations"))
  .filter((x) => x.endsWith(".sql")&&!x.includes("0030_"))
  .sort();
for (const file of migrations)
  await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
for (const [name, id] of Object.entries(U))
  await db.query(
    "insert into auth.users(id,email_confirmed_at,is_anonymous) values($1,$2,$3)",
    [
      id,
      name === "unconfirmed" ? null : new Date().toISOString(),
      name === "anonymous",
    ],
  );
await db.query(
  "insert into public.platform_roles(user_id,role) values($1,'super_admin'),($2,'super_admin'),($3,'atendente'),($4,'atendente')",
  [U.root, U.root2, U.attendantA, U.unlinked],
);
await db.query("update public.profiles set status='suspended' where id=$1", [
  U.suspended,
]);
async function as(name, extra = {}) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({
      sub: U[name],
      is_anonymous: name === "anonymous",
      ...extra,
    }),
  ]);
  await db.exec("set local role authenticated");
}
async function scalar(sql, args = []) {
  return Object.values((await db.query(sql, args)).rows[0])[0];
}
async function denied(sql, args = [], codes = ["42501"]) {
  await db.exec("savepoint expected_denial");
  try {
    await db.query(sql, args);
  } catch (e) {
    await db.exec("rollback to savepoint expected_denial");
    assert.ok(
      codes.includes(e.code),
      `Expected ${codes}; got ${e.code}: ${e.message}`,
    );
    return;
  }
  throw new Error("Expected denial; operation succeeded");
}
await db.exec("begin");
await as("root");
const A = await scalar(
  "select public.foundation_create_organization('Empresa A','empresa-a',$1)",
  [U.adminA],
);
const B = await scalar(
  "select public.foundation_create_organization('Empresa B','empresa-b',$1)",
  [U.adminB],
);
await authorizeSupport({as,scalar},A,"adminA");
await authorizeSupport({as,scalar},B,"adminB");
await db.query(
  "select public.foundation_set_member($1,$2,'colaborador_empresa','active')",
  [A, U.workerA],
);
await db.query(
  "select public.foundation_set_attendant($1,$2,'primary','active')",
  [A, U.attendantA],
);
await db.exec("commit");
await upgrade030Fixture(db,[A,B]);
async function test(name, fn) {
  await db.exec("reset role; begin");
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message });
    console.error(`FAIL ${name}: ${e.message}`);
  } finally {
    await db.exec("rollback; reset role");
  }
}
await test("Empresa A vê somente A", async () => {
  await as("adminA");
  assert.deepEqual(
    (await db.query("select id from public.organizations")).rows,
    [{ id: A }],
  );
});
await test("Empresa B vê somente B", async () => {
  await as("adminB");
  assert.deepEqual(
    (await db.query("select id from public.organizations")).rows,
    [{ id: B }],
  );
});
await test("Alterar UUID de organização não expõe B", async () => {
  await as("adminA");
  assert.equal(
    await scalar("select count(*)::int from public.organizations where id=$1", [
      B,
    ]),
    0,
  );
});
await test("Empresa A não lê membros de B", async () => {
  await as("adminA");
  assert.equal(
    await scalar(
      "select count(*)::int from public.organization_members where organization_id=$1",
      [B],
    ),
    0,
  );
});
await test("Empresa A não lê perfil do administrador B", async () => {
  await as("adminA");
  assert.equal(
    await scalar("select count(*)::int from public.profiles where id=$1", [
      U.adminB,
    ]),
    0,
  );
});
await test("Empresa A não lê vínculos de B", async () => {
  await as("root");
  await db.query(
    "select public.foundation_set_attendant($1,$2,'primary','active')",
    [B, U.unlinked],
  );
  await as("adminA");
  assert.equal(
    await scalar(
      "select count(*)::int from public.attendant_organizations where organization_id=$1",
      [B],
    ),
    0,
  );
});
await test("Empresa A não lê auditoria de B nem global", async () => {
  await as("adminA");
  assert.equal(
    await scalar(
      "select count(*)::int from public.audit_logs where organization_id is distinct from $1",
      [A],
    ),
    0,
  );
  assert.ok((await scalar("select count(*)::int from public.audit_logs")) > 0);
});
await test("Atendente acessa somente empresa vinculada", async () => {
  await as("attendantA");
  assert.deepEqual(
    (await db.query("select id from public.organizations")).rows,
    [{ id: A }],
  );
});
await test("Atendente sem vínculo não acessa empresa", async () => {
  await as("unlinked");
  assert.equal(
    await scalar("select count(*)::int from public.organizations"),
    0,
  );
});
await test("Colaborador acessa sua organização", async () => {
  await as("workerA");
  assert.equal(
    await scalar("select count(*)::int from public.organizations"),
    1,
  );
});
await test("Colaborador não consulta demais membros", async () => {
  await as("workerA");
  assert.deepEqual(
    (await db.query("select user_id from public.organization_members")).rows,
    [{ user_id: U.workerA }],
  );
});
await test("Colaborador não consulta auditoria", async () => {
  await as("workerA");
  assert.equal(await scalar("select count(*)::int from public.audit_logs"), 0);
});
await test("Superadmin consulta organizações e auditoria global", async () => {
  await as("root");
  assert.equal(
    await scalar("select count(*)::int from public.organizations"),
    2,
  );
  assert.ok(
    (await scalar(
      "select count(*)::int from public.audit_logs where organization_id is null",
    )) > 0,
  );
});
await test("Visitante anon não lê dados", async () => {
  await db.exec("set local role anon");
  await denied("select * from public.organizations");
});
await test("Visitante anon não executa comandos", async () => {
  await db.exec("set local role anon");
  await denied("select public.foundation_context()");
});
await test("JWT ausente não libera dados nem comando", async () => {
  await as("root", { sub: null });
  assert.equal(
    await scalar("select count(*)::int from public.organizations"),
    0,
  );
  await denied("select public.foundation_context()");
});
await test("Sessão anônima não se torna funcionário por metadata", async () => {
  await as("anonymous", {
    role: "super_admin",
    user_metadata: { role: "super_admin" },
  });
  assert.equal(await scalar("select count(*)::int from public.profiles"), 0);
  await denied("select public.foundation_context()");
});
await test("Flag anônima no JWT bloqueia até identidade permanente", async () => {
  await as("root", { is_anonymous: true });
  assert.equal(
    await scalar("select count(*)::int from public.organizations"),
    0,
  );
  await denied("select public.foundation_context()");
});
await test("Conta sem email confirmado não recebe privilégio", async () => {
  await as("unconfirmed");
  await denied("select public.foundation_context()");
});
await test("Metadata de superadmin não concede papel", async () => {
  await as("workerA", {
    user_metadata: { role: "super_admin" },
    role: "super_admin",
  });
  await denied(
    "select public.foundation_set_global_role($1,'super_admin',true)",
    [U.workerA],
  );
});
await test("Usuário não insere papel diretamente", async () => {
  await as("workerA");
  await denied(
    "insert into public.platform_roles(user_id,role) values($1,'super_admin')",
    [U.workerA],
  );
});
await test("Usuário não altera status diretamente", async () => {
  await as("workerA");
  await denied("update public.profiles set status='active' where id=$1", [
    U.suspended,
  ]);
});
await test("Administrador da empresa não se promove", async () => {
  await as("adminA");
  await denied(
    "select public.foundation_set_global_role($1,'super_admin',true)",
    [U.adminA],
  );
});
await test("Administrador da empresa não cria organizações", async () => {
  await as("adminA");
  await denied(
    "select public.foundation_create_organization('Empresa C','empresa-c',$1)",
    [U.adminA],
  );
});
await test("Empresa A não adiciona membro a B", async () => {
  await as("adminA");
  await denied(
    "select public.foundation_set_member($1,$2,'admin_empresa','active')",
    [B, U.newUser],
  );
});
await test("Empresa A não altera organização B via RPC", async () => {
  await as("adminA");
  await denied(
    "select public.foundation_update_organization($1,'Invadida','active')",
    [B],
  );
});
await test("Colaborador não altera membros", async () => {
  await as("workerA");
  await denied(
    "select public.foundation_set_member($1,$2,'admin_empresa','active')",
    [A, U.newUser],
  );
});
await test("Atendente não gerencia membros", async () => {
  await as("attendantA");
  await denied(
    "select public.foundation_set_member($1,$2,'admin_empresa','active')",
    [A, U.newUser],
  );
});
await test("Empresa não concede vínculo de atendente", async () => {
  await as("adminA");
  await denied(
    "select public.foundation_set_attendant($1,$2,'backup','active')",
    [A, U.unlinked],
  );
});
await test("Admin da empresa adiciona colaborador elegível", async () => {
  await as("adminA");
  await db.query(
    "select public.foundation_set_member($1,$2,'colaborador_empresa','active')",
    [A, U.newUser],
  );
  assert.equal(
    await scalar(
      "select count(*)::int from public.organization_members where user_id=$1",
      [U.newUser],
    ),
    1,
  );
});
await test("Admin da empresa renomeia sua empresa", async () => {
  await as("adminA");
  await db.query(
    "select public.foundation_update_organization($1,'Novo nome A','active')",
    [A],
  );
  assert.equal(
    await scalar("select name from public.organizations where id=$1", [A]),
    "Novo nome A",
  );
});
await test("Empresa não suspende conta organizacional", async () => {
  await as("adminA");
  await denied(
    "select public.foundation_update_organization($1,'Empresa A','suspended')",
    [A],
  );
});
await test("Usuário edita somente seu nome via RPC", async () => {
  await as("workerA");
  await db.query("select public.foundation_update_profile('Nome seguro')");
  assert.equal(
    await scalar("select display_name from public.profiles where id=$1", [
      U.workerA,
    ]),
    "Nome seguro",
  );
});
await test("Validação de nome vazia", async () => {
  await as("workerA");
  await denied("select public.foundation_update_profile(' ')", [], ["22023"]);
});
await test("Autoalteração de vínculo bloqueada", async () => {
  await as("adminA");
  await denied(
    "select public.foundation_set_member($1,$2,'colaborador_empresa','active')",
    [A, U.adminA],
  );
});
await test("Último administrador empresarial preservado", async () => {
  await as("root");
  await denied(
    "select public.foundation_set_member($1,$2,'colaborador_empresa','active')",
    [A, U.adminA],
    ["23514"],
  );
});
await test("Superadmin não remove seu próprio papel", async () => {
  await as("root");
  await denied(
    "select public.foundation_set_global_role($1,'super_admin',false)",
    [U.root],
  );
});
await test("Superadmin não suspende a si mesmo", async () => {
  await as("root");
  await denied("select public.foundation_set_profile_status($1,'suspended')", [
    U.root,
  ]);
});
await test("Superadmin pode revogar outro admin; token antigo perde autoridade", async () => {
  await as("root");
  await db.query(
    "select public.foundation_set_global_role($1,'super_admin',false)",
    [U.root2],
  );
  await as("root2");
  await denied(
    "select public.foundation_set_global_role($1,'super_admin',false)",
    [U.root],
  );
});
await test("Usuário suspenso não lê nem escreve", async () => {
  await as("suspended");
  assert.equal(await scalar("select count(*)::int from public.profiles"), 0);
  await denied("select public.foundation_update_profile('Outro nome')");
});
await test("Suspensão de perfil revoga acesso com mesmo sub/JWT", async () => {
  await as("adminA");
  assert.equal(
    await scalar("select count(*)::int from public.organizations"),
    1,
  );
  await as("root");
  await db.query(
    "select public.foundation_set_profile_status($1,'suspended')",
    [U.adminA],
  );
  await as("adminA");
  assert.equal(
    await scalar("select count(*)::int from public.organizations"),
    0,
  );
  await denied(
    "select public.foundation_update_organization($1,'Tentativa','active')",
    [A],
  );
});
await test("Banimento do Auth também bloqueia usuário", async () => {
  await db.query(
    "update auth.users set banned_until=now()+interval '1 day' where id=$1",
    [U.adminA],
  );
  await as("adminA");
  await denied("select public.foundation_context()");
});
await test("Suspensão da organização revoga acesso do membro", async () => {
  await as("root");
  await db.query(
    "select public.foundation_update_organization($1,'Empresa A','suspended')",
    [A],
  );
  await as("adminA");
  assert.equal(
    await scalar("select count(*)::int from public.organizations"),
    0,
  );
  await denied(
    "select public.foundation_set_member($1,$2,'colaborador_empresa','active')",
    [A, U.newUser],
  );
});
await test("Suspensão do membro revoga acesso imediatamente", async () => {
  await as("adminA");
  await db.query(
    "select public.foundation_set_member($1,$2,'colaborador_empresa','suspended')",
    [A, U.workerA],
  );
  await as("workerA");
  assert.equal(
    await scalar("select count(*)::int from public.organizations"),
    0,
  );
});
await test("Suspensão do vínculo revoga acesso da atendente", async () => {
  await as("root");
  await db.query(
    "select public.foundation_set_attendant($1,$2,'primary','suspended')",
    [A, U.attendantA],
  );
  await as("attendantA");
  assert.equal(
    await scalar("select count(*)::int from public.organizations"),
    0,
  );
});
await test("Revogação global de atendente desativa vínculos antigos", async () => {
  await as("root");
  await db.query(
    "select public.foundation_set_global_role($1,'atendente',false)",
    [U.attendantA],
  );
  await db.query(
    "select public.foundation_set_global_role($1,'atendente',true)",
    [U.attendantA],
  );
  await as("attendantA");
  assert.equal(
    await scalar("select count(*)::int from public.organizations"),
    0,
  );
});
await test("Não pode vincular pessoa sem papel atendente", async () => {
  await as("root");
  await denied(
    "select public.foundation_set_attendant($1,$2,'backup','active')",
    [A, U.newUser],
    ["23514"],
  );
});
await test("Não concede papel a sessão anônima", async () => {
  await as("root");
  await denied(
    "select public.foundation_set_global_role($1,'atendente',true)",
    [U.anonymous],
    ["22023"],
  );
});
await test("Não adiciona membro sem email verificado", async () => {
  await as("adminA");
  await denied(
    "select public.foundation_set_member($1,$2,'colaborador_empresa','active')",
    [A, U.unconfirmed],
    ["22023"],
  );
});
await test("Não ativa membro suspenso", async () => {
  await as("adminA");
  await denied(
    "select public.foundation_set_member($1,$2,'colaborador_empresa','active')",
    [A, U.suspended],
    ["22023"],
  );
});
await test("Não existem dois principais ativos na mesma empresa", async () => {
  await as("root");
  await denied(
    "select public.foundation_set_attendant($1,$2,'primary','active')",
    [A, U.unlinked],
    ["23505"],
  );
});
await test("Não cria vínculo com organização inexistente", async () => {
  await as("root");
  await denied(
    "select public.foundation_set_attendant($1,$2,'backup','active')",
    ["ffffffff-ffff-ffff-ffff-ffffffffffff", U.unlinked],
    ["23503", "42501"],
  );
});
await test("Slug duplicado rejeitado e criação atômica", async () => {
  await as("root");
  await denied(
    "select public.foundation_create_organization('Duplicada','empresa-a',$1)",
    [U.adminA],
    ["23505"],
  );
  assert.equal(
    await scalar("select count(*)::int from public.organizations"),
    2,
  );
});
await test("Slug reservado rejeitado", async () => {
  await as("root");
  await denied(
    "select public.foundation_create_organization('Reservada','admin',$1)",
    [U.adminA],
    ["23514"],
  );
});
await test("Auditoria registra ator, empresa e campos alterados", async () => {
  await as("adminA");
  await db.query(
    "select public.foundation_update_organization($1,'Nome auditado','active')",
    [A],
  );
  const rows = (
    await db.query(
      "select actor_id,organization_id,changed_fields from public.audit_logs where entity_table='organizations' and action='update' order by id desc limit 1",
    )
  ).rows;
  assert.equal(rows[0].actor_id, U.adminA);
  assert.equal(rows[0].organization_id, A);
  assert.deepEqual(rows[0].changed_fields, ["name"]);
});
await test("Auditoria não armazena nome privado em payload", async () => {
  await as("workerA");
  await db.query("select public.foundation_update_profile('Segredo Pessoal')");
  await as("root");
  assert.equal(
    await scalar(
      "select count(*)::int from public.audit_logs where to_jsonb(audit_logs)::text like '%Segredo Pessoal%'",
    ),
    0,
  );
});
await test("Cliente autenticado não insere auditoria falsa", async () => {
  await as("root");
  await denied(
    "insert into public.audit_logs(action,entity_table,entity_key) values('fake','profiles','{}')",
  );
});
await test("Não pode editar, apagar ou truncar auditoria", async () => {
  await as("root");
  await denied("update public.audit_logs set action='fake'");
  await denied("delete from public.audit_logs");
  await denied("truncate public.audit_logs");
});
await test("Trigger bloqueia edição de auditoria até em sessão proprietária", async () => {
  await denied("update public.audit_logs set action='fake'");
  await denied("truncate public.audit_logs");
});
await test("RLS impede escrita mesmo com GRANT adicionado por engano", async () => {
  await db.exec("grant insert on public.organizations to authenticated");
  await as("adminA");
  await denied(
    "insert into public.organizations(name,slug) values('Ataque','ataque')",
  );
});
await test("RLS oculta atualização cruzada mesmo com GRANT acidental", async () => {
  await db.exec("grant update on public.organization_members to authenticated");
  await as("adminA");
  const r = await db.query(
    "update public.organization_members set organization_id=$1 where organization_id=$2 returning *",
    [A, B],
  );
  assert.equal(r.rows.length, 0);
});
await test("Todas as tabelas cumulativas têm RLS e FORCE RLS", async () => {
  const rows = (
    await db.query(
      "select relname,relrowsecurity,relforcerowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r'",
    )
  ).rows;
  assert.equal(rows.length, 75);
  assert.ok(rows.every((r) => r.relrowsecurity && r.relforcerowsecurity));
});
await test("Todas as policies são SELECT e destinadas a authenticated", async () => {
  const rows = (
    await db.query(
      "select policyname,cmd,roles from pg_policies where schemaname='public'",
    )
  ).rows;
  assert.equal(rows.length, 75);
  assert.ok(
    rows.every(
      (r) =>
        r.cmd === "SELECT" && JSON.stringify(r.roles).includes("authenticated"),
    ),
  );
});
await test("Nenhuma função SECURITY DEFINER usa search_path mutável", async () => {
  const rows = (
    await db.query(
      "select proname,proconfig from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname in ('public','private') and prosecdef",
    )
  ).rows;
  assert.ok(rows.length > 5);
  assert.ok(
    rows.every((r) => r.proconfig?.includes('search_path=""')),
    JSON.stringify(rows),
  );
});
await test("Helpers de mutação não podem ser invocados pelo cliente", async () => {
  await as("root");
  await denied("select private.lock_authorize('global')");
  await denied("select private.require_eligible_user($1)", [U.adminA]);
});
await test("Anon não executa nenhum RPC da Fundação", async () => {
  const rows = (
    await db.query(
      "select proname,has_function_privilege('anon',p.oid,'EXECUTE') allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'foundation_%'",
    )
  ).rows;
  assert.equal(rows.length, 15);
  assert.ok(rows.every((r) => !r.allowed));
});
await test("Contexto empresarial só retorna organização autorizada", async () => {
  await as("adminA");
  const c = await scalar("select public.foundation_context()");
  assert.equal(c.organizations.length, 1);
  assert.equal(c.organizations[0].id, A);
  assert.deepEqual(c.roles, []);
});
await test("Trigger de identidade ignora metadata privilegiada", async () => {
  const id = "ffffffff-0000-0000-0000-000000000001";
  await db.query(
    'insert into auth.users(id,email_confirmed_at,raw_user_meta_data) values($1,now(),\'{"role":"super_admin","status":"active"}\')',
    [id],
  );
  assert.equal(
    await scalar("select count(*)::int from public.profiles where id=$1", [id]),
    1,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from public.platform_roles where user_id=$1",
      [id],
    ),
    0,
  );
});
if (native) {
  async function concurrentCommand(name, sql, args) {
    const c = new pg.Client(connection);
    await c.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: U[name], is_anonymous: false }),
      ]);
      await c.query("set local role authenticated");
      await c.query(sql, args);
      await c.query("commit");
      return "ok";
    } catch (e) {
      await c.query("rollback");
      return e.code;
    } finally {
      await c.end();
    }
  }
  await test("CONCORRÊNCIA: dois admins não revogam ambos os papéis", async () => {
    const r = await Promise.all([
      concurrentCommand(
        "root",
        "select public.foundation_set_global_role($1,'super_admin',false)",
        [U.root2],
      ),
      concurrentCommand(
        "root2",
        "select public.foundation_set_global_role($1,'super_admin',false)",
        [U.root],
      ),
    ]);
    assert.deepEqual(r.sort(), ["42501", "ok"]);
    assert.equal(
      await scalar(
        "select count(*)::int from public.platform_roles where role='super_admin' and active",
      ),
      1,
    );
  });
  await db.query(
    "update public.platform_roles set active=true where role='super_admin'",
  );
  await test("CONCORRÊNCIA: dois principais não são ativados na mesma empresa", async () => {
    const r = await Promise.all([
      concurrentCommand(
        "root",
        "select public.foundation_set_attendant($1,$2,'primary','active')",
        [B, U.attendantA],
      ),
      concurrentCommand(
        "root2",
        "select public.foundation_set_attendant($1,$2,'primary','active')",
        [B, U.unlinked],
      ),
    ]);
    assert.deepEqual(r.sort(), ["23505", "ok"]);
    assert.equal(
      await scalar(
        "select count(*)::int from public.attendant_organizations where organization_id=$1 and status='active' and kind='primary'",
        [B],
      ),
      1,
    );
  });
}
const metadata = {
  timestamp: new Date().toISOString(),
  engine: native
    ? "PostgreSQL nativo, conexões independentes"
    : "PGlite (PostgreSQL WASM; real SQL/RLS execution)",
  version: await scalar("select version()"),
  auth: "Fixture local de auth.users e JWT helpers; não testa GoTrue/SMTP/HTTP",
  migrations,
  passed: results.filter((x) => x.status === "PASS").length,
  failed: results.filter((x) => x.status === "FAIL").length,
  tests: results,
};
await mkdir("reports", { recursive: true });
await writeFile(
  native
    ? "reports/security-native-results.json"
    : "reports/security-results.json",
  JSON.stringify(metadata, null, 2),
);
console.log(
  `\n${metadata.passed} passed; ${metadata.failed} failed. ${metadata.version}`,
);
await db.close();
if (metadata.failed) process.exitCode = 1;

import {authorizeSupport} from "./support/authorized-support.mjs";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
const c = await consumerDB(),
  { db, rpc, as, scalar, orgs } = c,
  results = [];
const hash = (x) => createHash("sha256").update(x).digest("hex");
const cmd = (name, args) => rpc(name, args);
async function service(name, args) {
  await db.exec("reset role");
  return cmd(name, args);
}
async function test(name, fn) {
  await db.exec("begin");
  try {
    await authorizeSupport(c,orgs.A,"adminA");
    await authorizeSupport(c,orgs.B,"adminB");
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message });
    console.log("FAIL", name, e.message);
  } finally {
    await db.exec("rollback;reset role");
  }
}
async function deny(fn) {
  await db.exec("savepoint refusal");
  let rejected = false;
  try {
    await fn();
  } catch {
    rejected = true;
    await db.exec("rollback to savepoint refusal");
  }
  assert.ok(rejected, "must reject");
}
async function prepare({
  org = orgs.A,
  username = "rodrigo.santos",
  role = "colaborador_empresa",
  email = "",
  key = randomUUID(),
} = {}) {
  await as("root");
  const a = await cmd("access_reserve", {
    p_org: org,
    p_name: "Empresa provisionada",
    p_slug: "nova-provisionada",
    p_display: "Rodrigo Santos",
    p_username: username,
    p_email: email,
    p_phone: "",
    p_role: role,
    p_key: key,
  });
  await db.exec("reset role");
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at,is_anonymous) values($1,$2,now(),false) on conflict do nothing",
    [a.user_id, a.user_id + "@access.vireloq.invalid"],
  );
  const code = await cmd("access_finish_provision", {
    p_id: a.id,
    p_actor: users.root,
    p_hash: hash("code"),
  });
  return { ...a, ...code };
}
async function activate(a) {
  assert(
    await service("access_verify_code", {
      p_code: a.company_code,
      p_username: a.username,
      p_hash: hash("code"),
      p_proof: hash("proof"),
    }),
  );
  const begin = await service("access_begin_activation", {
    p_proof: hash("proof"),
  });
  assert(begin);
  assert(
    await service("access_finish_activation", {
      p_id: a.id,
      p_operation: begin.operation,
      p_success: true,
    }),
  );
  return begin;
}
async function login(a) {
  const lookup = await service("access_lookup", {
    p_code: a.company_code,
    p_username: a.username,
  });
  assert(lookup);
  const sid = randomUUID();
  assert(
    await service("access_register_session", {
      p_user: a.user_id,
      p_session: sid,
      p_account: a.id,
      p_generation: lookup.generation,
    }),
  );
  await identity(a.user_id, sid);
  return sid;
}
async function identity(id, sid) {
  await as(id);
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: id, session_id: sid, is_anonymous: false }),
  ]);
}
await test("Super Admin legado mantém acesso e contexto", async () => {
  await as("root");
  assert((await cmd("foundation_context")).roles.includes("super_admin"));
});
await test("Visitante não provisiona nem usa RPCs server-only", async () => {
  await as("anon");
  await deny(() =>
    cmd("access_reserve", {
      p_org: orgs.A,
      p_name: "x",
      p_slug: "x",
      p_display: "Nome Pessoa",
      p_username: "nome.pessoa",
      p_email: "",
      p_phone: "",
      p_role: "super_admin",
      p_key: randomUUID(),
    }),
  );
  await deny(() => cmd("access_lookup", { p_code: "x", p_username: "x" }));
});
await test("Empresa + primeiro admin provisionados sem trial/assinatura automáticos", async () => {
  const a = await prepare({
    org: null,
    role: "admin_empresa",
    email: "admin@example.invalid",
  });
  assert.equal(
    await scalar(
      "select count(*)::int from billing_subscriptions where organization_id=$1",
      [a.organization_id],
    ),
    0,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from private.trial_grants where organization_id=$1",
      [a.organization_id],
    ),
    0,
  );
  assert.match(a.company_code, /^[A-Z0-9]{1,8}-[A-F0-9]{5}$/);
});
await test("Email obrigatório antes de criar administrador", async () => {
  await as("root");
  await deny(() =>
    cmd("access_reserve", {
      p_org: orgs.A,
      p_name: "",
      p_slug: "",
      p_display: "Nome Sobrenome",
      p_username: "nome.sobrenome",
      p_email: "",
      p_phone: "",
      p_role: "admin_empresa",
      p_key: randomUUID(),
    }),
  );
});
await test("Username case insensitive e igual em empresas diferentes", async () => {
  const a = await prepare();
  const b = await prepare({ org: orgs.B });
  assert.notEqual(a.user_id, b.user_id);
  await activate(a);
  assert.equal(
    (
      await service("access_lookup", {
        p_code: a.company_code.toLowerCase(),
        p_username: "RODRIGO.SANTOS",
      })
    ).user_id,
    a.user_id,
  );
});
await test("Username duplicado na mesma empresa recusado por constraint", async () => {
  await prepare();
  await deny(() => prepare({ username: "RODRIGO.SANTOS" }));
});
await test("Username confusable Unicode recusado", async () => {
  await deny(() => prepare({ username: "rоdrigo.santos" }));
});
await test("Duplo clique com mesma chave retorna mesma reserva sem duplicação", async () => {
  await as("root");
  const p = {
    p_org: orgs.A,
    p_name: "",
    p_slug: "",
    p_display: "Pessoa Teste",
    p_username: "pessoa.teste",
    p_email: "",
    p_phone: "",
    p_role: "colaborador_empresa",
    p_key: randomUUID(),
  };
  const a = await cmd("access_reserve", p);
  assert.deepEqual(await cmd("access_reserve", p), a);
  await deny(() => cmd("access_reserve", { ...p, p_username: "outra.pessoa" }));
});
await test("Código errado incrementa tentativas persistentemente", async () => {
  const a = await prepare();
  assert.equal(
    await service("access_verify_code", {
      p_code: a.company_code,
      p_username: a.username,
      p_hash: hash("wrong"),
      p_proof: hash("proof"),
    }),
    null,
  );
  assert.equal(
    await scalar(
      "select attempts from private.enterprise_accounts where id=$1",
      [a.id],
    ),
    1,
  );
});
await test("Limite de cinco tentativas bloqueia código correto", async () => {
  const a = await prepare();
  for (let i = 0; i < 5; i++)
    await service("access_verify_code", {
      p_code: a.company_code,
      p_username: a.username,
      p_hash: hash("wrong"),
      p_proof: hash("proof"),
    });
  assert.equal(
    await service("access_verify_code", {
      p_code: a.company_code,
      p_username: a.username,
      p_hash: hash("code"),
      p_proof: hash("proof"),
    }),
    null,
  );
});
await test("Código expirado não ativa", async () => {
  const a = await prepare();
  await db.query(
    "update private.enterprise_accounts set code_expires=now()-interval '1 second' where id=$1",
    [a.id],
  );
  assert.equal(
    await service("access_verify_code", {
      p_code: a.company_code,
      p_username: a.username,
      p_hash: hash("code"),
      p_proof: hash("proof"),
    }),
    null,
  );
});
await test("Código só persiste em hash; validade de 48 horas", async () => {
  const a = await prepare();
  const row = (
    await db.query("select * from private.enterprise_accounts where id=$1", [
      a.id,
    ])
  ).rows[0];
  assert.equal(row.code_hash, hash("code"));
  assert(
    Math.abs((Date.parse(row.code_expires) - Date.now()) / 3600000 - 48) < 0.1,
  );
});
await test("Duas ativações do mesmo grant só obtêm uma operação", async () => {
  const a = await prepare();
  await service("access_verify_code", {
    p_code: a.company_code,
    p_username: a.username,
    p_hash: hash("code"),
    p_proof: hash("proof"),
  });
  const results = await Promise.all([
    service("access_begin_activation", { p_proof: hash("proof") }),
    service("access_begin_activation", { p_proof: hash("proof") }),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
});
await test("Reset durante alteração de senha é recusado", async () => {
  const a = await prepare();
  await service("access_verify_code", {
    p_code: a.company_code,
    p_username: a.username,
    p_hash: hash("code"),
    p_proof: hash("proof"),
  });
  await service("access_begin_activation", { p_proof: hash("proof") });
  await deny(() =>
    service("access_reset", {
      p_id: a.id,
      p_actor: users.root,
      p_hash: hash("new"),
    }),
  );
});
await test("Primeiro acesso ativa vínculo único e invalida código antigo", async () => {
  const a = await prepare();
  await activate(a);
  assert.equal(
    await service("access_verify_code", {
      p_code: a.company_code,
      p_username: a.username,
      p_hash: hash("code"),
      p_proof: hash("proof"),
    }),
    null,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from organization_members where user_id=$1",
      [a.user_id],
    ),
    1,
  );
  assert.equal(
    await scalar("select count(*)::int from platform_roles where user_id=$1", [
      a.user_id,
    ]),
    0,
  );
});
await test("Sessão Auth sem registro do gateway não libera operação", async () => {
  const a = await prepare();
  await activate(a);
  await identity(a.user_id, randomUUID());
  await deny(() => cmd("foundation_context"));
});
await test("Login seleciona A e nunca expõe B", async () => {
  const a = await prepare();
  await activate(a);
  await login(a);
  const ctx = await cmd("foundation_context");
  assert.equal(ctx.organizations.length, 1);
  assert.equal(ctx.organizations[0].id, orgs.A);
  assert.equal(
    await scalar("select count(*)::int from organizations where id=$1", [
      orgs.B,
    ]),
    0,
  );
});
await test("Usuário com dois memberships fica limitado ao tenant escolhido", async () => {
  const a = await prepare({
    role: "admin_empresa",
    email: "a@example.invalid",
  });
  await db.query(
    "insert into organization_members(organization_id,user_id,role) values($1,$2,'admin_empresa')",
    [orgs.B, a.user_id],
  );
  await activate(a);
  await login(a);
  assert.equal((await cmd("foundation_context")).organizations.length, 1);
  await deny(() => cmd("company_initialize", { p_org: orgs.B }));
});
await test("Administrador A não provisiona B nem concede Super Admin", async () => {
  await as("adminA");
  const p = {
    p_org: orgs.B,
    p_name: "",
    p_slug: "",
    p_display: "Pessoa Teste",
    p_username: "pessoa.teste",
    p_email: "",
    p_phone: "",
    p_role: "colaborador_empresa",
    p_key: randomUUID(),
  };
  await deny(() => cmd("access_reserve", p));
  await deny(() =>
    cmd("access_reserve", { ...p, p_org: orgs.A, p_role: "super_admin" }),
  );
});
await test("Atendente e colaborador não criam usuários", async () => {
  for (const actor of ["worker", "agentA"]) {
    await as(actor);
    await deny(() => cmd("access_team", { p_org: orgs.A }));
  }
});
await test("Desativação nega login, código anterior e sessão existente", async () => {
  const a = await prepare();
  await activate(a);
  const sid = await login(a);
  await as("root");
  await cmd("access_manage", { p_id: a.id, p_action: "disable" });
  assert.equal(
    await service("access_lookup", {
      p_code: a.company_code,
      p_username: a.username,
    }),
    null,
  );
  await identity(a.user_id, sid);
  await deny(() => cmd("foundation_context"));
});
await test("Redefinição preserva primeira ativação, identidade e contagem de ativações", async () => {
  const a = await prepare();
  await activate(a);
  const first = await scalar("select activated_at from private.enterprise_accounts where id=$1", [a.id]);
  await service("access_reset", { p_id: a.id, p_actor: users.root, p_hash: hash("code") });
  await activate(a);
  const after = await scalar("select activated_at from private.enterprise_accounts where id=$1", [a.id]);
  assert.equal(String(after), String(first));
  assert.equal(await scalar("select count(*)::int from organization_members where user_id=$1", [a.user_id]), 1);
});
await test("Reativação mantém histórico e exige código novo", async () => {
  const a = await prepare();
  await activate(a);
  await as("root");
  await cmd("access_manage", { p_id: a.id, p_action: "disable" });
  await cmd("access_manage", { p_id: a.id, p_action: "enable" });
  await service("access_reset", {
    p_id: a.id,
    p_actor: users.root,
    p_hash: hash("new"),
  });
  assert.equal(
    await scalar(
      "select count(*)::int from organization_members where user_id=$1",
      [a.user_id],
    ),
    1,
  );
  assert.equal(
    await service("access_verify_code", {
      p_code: a.company_code,
      p_username: a.username,
      p_hash: hash("code"),
      p_proof: hash("proof"),
    }),
    null,
  );
});
await test("Troca de username preserva identidade e invalida sessão", async () => {
  const a = await prepare();
  await activate(a);
  const sid = await login(a);
  await as("root");
  await cmd("access_manage", {
    p_id: a.id,
    p_action: "edit",
    p_username: "novo.usuario",
    p_email: "",
    p_role: "colaborador_empresa",
  });
  await identity(a.user_id, sid);
  await deny(() => cmd("foundation_context"));
  assert.equal(
    (
      await service("access_lookup", {
        p_code: a.company_code,
        p_username: "novo.usuario",
      })
    ).user_id,
    a.user_id,
  );
});
await test("Promoção sem contato email é negada; com contato mantém user id", async () => {
  const a = await prepare();
  await activate(a);
  await as("root");
  await deny(() =>
    cmd("access_manage", {
      p_id: a.id,
      p_action: "edit",
      p_username: a.username,
      p_email: "",
      p_role: "admin_empresa",
    }),
  );
  await cmd("access_manage", {
    p_id: a.id,
    p_action: "edit",
    p_username: a.username,
    p_email: "a@example.invalid",
    p_role: "admin_empresa",
  });
  await db.exec("reset role");
  assert.equal(
    await scalar("select role from organization_members where user_id=$1", [
      a.user_id,
    ]),
    "admin_empresa",
  );
});
await test("Último administrador não pode ser desativado", async () => {
  const a = await prepare({
    org: null,
    role: "admin_empresa",
    email: "a@example.invalid",
  });
  await as("root");
  await deny(() => cmd("access_manage", { p_id: a.id, p_action: "disable" }));
});
await test("Empresa suspensa impede novo login e sessão existente", async () => {
  const a = await prepare();
  await activate(a);
  const sid = await login(a);
  await db.exec("reset role");
  await db.query("update organizations set status='suspended' where id=$1", [
    orgs.A,
  ]);
  assert.equal(
    await service("access_lookup", {
      p_code: a.company_code,
      p_username: a.username,
    }),
    null,
  );
  await identity(a.user_id, sid);
  await deny(() => cmd("foundation_context"));
});
await test("29 minutos mantém sessão; 30 bloqueia mesmo JWT válido", async () => {
  const a = await prepare();
  await activate(a);
  const sid = await login(a);
  await db.exec("reset role");
  await db.query(
    "update private.enterprise_sessions set last_activity=clock_timestamp()-interval '29 minutes' where session_id=$1",
    [sid],
  );
  await identity(a.user_id, sid);
  assert(await cmd("foundation_context"));
  await db.exec("reset role");
  await db.query(
    "update private.enterprise_sessions set last_activity=clock_timestamp()-interval '30 minutes' where session_id=$1",
    [sid],
  );
  await identity(a.user_id, sid);
  await deny(() => cmd("foundation_context"));
  await deny(() => cmd("access_session", { p_activity: true }));
});
await test("Polling não renova; atividade explícita renova", async () => {
  const a = await prepare();
  await activate(a);
  const sid = await login(a);
  await db.exec("reset role");
  await db.query(
    "update private.enterprise_sessions set last_activity=clock_timestamp()-interval '10 minutes' where session_id=$1",
    [sid],
  );
  await identity(a.user_id, sid);
  const before = await cmd("access_session");
  assert.equal(
    (await cmd("access_session")).last_activity,
    before.last_activity,
  );
  assert.notEqual(
    (await cmd("access_session", { p_activity: true })).last_activity,
    before.last_activity,
  );
});
await test("Logout revoga autorização no banco", async () => {
  const a = await prepare();
  await activate(a);
  await login(a);
  await cmd("access_session", { p_logout: true });
  await deny(() => cmd("foundation_context"));
});
await test("Admin da empresa não altera política global", async () => {
  await as("adminA");
  await deny(() =>
    cmd("access_policy_set", {
      p_idle: 900,
      p_warning: 60,
      p_hours: 24,
      p_attempts: 5,
    }),
  );
});
await test("Termos e Privacidade públicos sem dados privados", async () => {
  await as("anon");
  assert.equal(await scalar("select count(*)::int from legal_documents"), 2);
  await deny(() => scalar("select count(*) from private.enterprise_accounts"));
});
await test("Sem aceite bloqueia operação; versão exata aceita libera onboarding", async () => {
  const a = await prepare({
    org: null,
    role: "admin_empresa",
    email: "a@example.invalid",
  });
  await activate(a);
  await login(a);
  assert((await cmd("access_session")).legal_required);
  await deny(() => cmd("foundation_context"));
  await deny(() => cmd("company_initialize", { p_org: a.organization_id }));
  await deny(() =>
    cmd("access_legal_accept", {
      p_terms: "wrong",
      p_privacy: "draft-2026-09-19",
    }),
  );
  await cmd("access_legal_accept", {
    p_terms: "draft-2026-09-19",
    p_privacy: "draft-2026-09-19",
  });
  assert(!(await cmd("access_session")).legal_required);
  assert(
    (await cmd("foundation_context")).organizations.some(
      (o) => o.id === a.organization_id,
    ),
  );
  await db.exec("reset role");
  const row = (
    await db.query(
      "select * from private.legal_acceptances where organization_id=$1",
      [a.organization_id],
    )
  ).rows[0];
  assert.equal(row.user_id, a.user_id);
  assert(row.accepted_at);
});
await test("Funcionário não aceita contrato pela empresa", async () => {
  const a = await prepare();
  await activate(a);
  await login(a);
  await deny(() =>
    cmd("access_legal_accept", {
      p_terms: "draft-2026-09-19",
      p_privacy: "draft-2026-09-19",
    }),
  );
});
await test("Versão material exige novo aceite; correção editorial conserva grupo", async () => {
  const a = await prepare({
    org: null,
    role: "admin_empresa",
    email: "a@example.invalid",
  });
  await activate(a);
  const sid = await login(a);
  await cmd("access_legal_accept", {
    p_terms: "draft-2026-09-19",
    p_privacy: "draft-2026-09-19",
  });
  await db.exec("reset role");
  await db.exec(
    "update legal_documents set current=false where kind='terms';insert into legal_documents select kind,'draft-edit',acceptance_version,title,body,true,true,now() from legal_documents where kind='terms' limit 1",
  );
  await identity(a.user_id, sid);
  assert(!(await cmd("access_session")).legal_required);
  await db.exec("reset role");
  await db.exec(
    "update legal_documents set current=false where current and kind='terms';insert into legal_documents select kind,'draft-material','material-2',title,body,true,true,now() from legal_documents where kind='terms' limit 1",
  );
  await identity(a.user_id, sid);
  assert((await cmd("access_session")).legal_required);
  await deny(() => cmd("foundation_context"));
});
await test("Convite legado não pode mais ativar nem enviar", async () => {
  await as("adminA");
  await deny(() =>
    cmd("foundation_accept_invitation", { p_invite: randomUUID() }),
  );
  await deny(() =>
    cmd("foundation_invite", {
      p_org: orgs.A,
      p_name: "Pessoa Nome",
      p_email: "p@example.invalid",
      p_role: "colaborador_empresa",
      p_key: randomUUID(),
    }),
  );
});
await test("Novas tabelas com RLS e FORCE RLS", async () => {
  await db.exec("reset role");
  const tables = (
    await db.query(
      "select relrowsecurity,relforcerowsecurity from pg_class where relname in ('enterprise_accounts','enterprise_sessions','enterprise_codes','legal_acceptances','access_limits','access_policy','access_enforced_users','legal_documents')",
    )
  ).rows;
  assert.equal(tables.length, 8);
  assert(tables.every((t) => t.relrowsecurity && t.relforcerowsecurity));
});
await test("Limite de risco persiste no banco e volta após janela", async () => {
  const p = { p_key: hash("limit"), p_limit: 2, p_seconds: 60 };
  assert(await service("access_rate", p));
  assert(await service("access_rate", p));
  assert.equal(await service("access_rate", p), false);
  await db.query(
    "update private.access_limits set window_at=now()-interval '2 minutes'",
  );
  assert(await service("access_rate", p));
});

await test("Retomada autorizada preserva reserva; outra empresa não retoma", async () => {
  await as("root");
  const a = await cmd("access_reserve", {
    p_org: orgs.A,
    p_name: "",
    p_slug: "",
    p_display: "Reserva Fictícia",
    p_username: "reserva.teste",
    p_email: "",
    p_phone: "",
    p_role: "colaborador_empresa",
    p_key: randomUUID(),
  });
  await as("adminB");
  await deny(() => cmd("access_resume", { p_id: a.id }));
  await as("adminA");
  const b = await cmd("access_resume", { p_id: a.id });
  assert.equal(b.user_id, a.user_id);
  assert.equal(b.id, a.id);
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select requested_by from private.enterprise_accounts where id=$1",
      [a.id],
    ),
    users.adminA,
  );
});
await test("Mídia mantém sessão verificada, escopo e rejeita sessão expirada", async () => {
  const a = await prepare({
    role: "admin_empresa",
    email: "a@example.invalid",
  });
  await activate(a);
  const sid = await login(a);
  const media = await cmd("consumer_reserve_company_media", {
    p_org: orgs.A,
    p_mime: "image/png",
    p_size: 100,
    p_key: randomUUID(),
  });
  const args = {
    p_user: a.user_id,
    p_session: sid,
    p_operation: "consumer_gateway_company_media",
    p_args: { p_code: media.code, p_write: true },
  };
  await deny(() => cmd("access_media", args));
  assert.equal((await service("access_media", args)).state, "pending");
  await deny(() => service("access_media", { ...args, p_user: users.adminB }));
  await db.exec("reset role");
  await db.query(
    "update private.enterprise_sessions set last_activity=now()-interval '31 minutes' where session_id=$1",
    [sid],
  );
  await deny(() => service("access_media", args));
});
await test("Política global aceita limites seguros e rejeita desligar expiração", async () => {
  await as("root");
  await cmd("access_policy_set", {
    p_idle: 1800,
    p_warning: 60,
    p_hours: 24,
    p_attempts: 3,
  });
  await deny(() =>
    cmd("access_policy_set", {
      p_idle: 0,
      p_warning: 0,
      p_hours: 0,
      p_attempts: 0,
    }),
  );
});
await test("Revogação de papel invalida JWT previamente registrado", async () => {
  const a = await prepare({
    role: "admin_empresa",
    email: "a@example.invalid",
  });
  await activate(a);
  const sid = await login(a);
  await as("root");
  await cmd("foundation_set_member", {
    p_org: orgs.A,
    p_user: a.user_id,
    p_role: "colaborador_empresa",
    p_status: "active",
  });
  await identity(a.user_id, sid);
  await deny(() => cmd("foundation_context"));
});

await test("Identidade legada compartilhada exige Super Admin para recuperação e preserva ambos usernames", async () => {
  const a = await prepare({
    role: "admin_empresa",
    email: "a@example.invalid",
  });
  await activate(a);
  await db.exec("reset role");
  await db.query(
    "insert into organization_members(organization_id,user_id,role) values($1,$2,'colaborador_empresa')",
    [orgs.B, a.user_id],
  );
  const payload = {
    p_org: orgs.B,
    p_name: "",
    p_slug: "",
    p_display: "Rodrigo Santos",
    p_username: "rodrigo.santos",
    p_email: "",
    p_phone: "",
    p_role: "colaborador_empresa",
    p_key: randomUUID(),
    p_existing: a.user_id,
  };
  await as("adminB");
  await deny(() => cmd("access_reserve", payload));
  await as("root");
  const reserved = await cmd("access_reserve", payload);
  const b = {
    ...reserved,
    ...(await service("access_finish_provision", {
      p_id: reserved.id,
      p_actor: users.root,
      p_hash: hash("code"),
    })),
  };
  const operation = await activate(b);
  await db.exec("reset role");
  assert.equal(
    (
      await service("access_lookup", {
        p_code: a.company_code,
        p_username: a.username,
      })
    ).operation,
    operation.operation,
  );
  assert.equal(
    (
      await service("access_lookup", {
        p_code: b.company_code,
        p_username: b.username,
      })
    ).operation,
    operation.operation,
  );
  await deny(() =>
    service("access_reset", {
      p_id: b.id,
      p_actor: users.adminB,
      p_hash: hash("new"),
    }),
  );
  assert(
    await service("access_reset", {
      p_id: b.id,
      p_actor: users.root,
      p_hash: hash("new"),
    }),
  );
});
await writeFile(
  "reports/enterprise-access-sql.json",
  JSON.stringify(results, null, 2),
);
await db.close();
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;

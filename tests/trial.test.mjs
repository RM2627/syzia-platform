import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
const c = await consumerDB(),
  { db, as, rpc, scalar, orgs } = c,
  results = [];
await db.exec("begin");
await as("root");
const plan = await rpc("billing_plan_save", {
  p_id: null,
  p_revision: 0,
  p_data: {
    name: "Teste fictício",
    price_cents: 9900,
    interval_months: 1,
    trial_days: 15,
    active: true,
    available: true,
    human_support: true,
  },
});
await db.exec("commit;reset role");
async function test(name, fn) {
  await db.exec("begin");
  try {
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
async function deny(fn, codes = ["42501"]) {
  await db.exec("savepoint reject");
  try {
    await fn();
  } catch (e) {
    await db.exec("rollback to savepoint reject");
    assert.ok(codes.includes(e.code), e.code + ": " + e.message);
    return;
  }
  throw Error("Expected rejection");
}
const ctx = (org = orgs.A) => rpc("billing_context", { p_org: org });
async function verify(
  org = orgs.A,
  value = "ZZ:TEST:COMPANYA",
  kind = "business",
) {
  await as("root");
  return rpc("billing_trial_verify", {
    p_org: org,
    p_kind: kind,
    p_value: value,
    p_evidence: "fictional-evidence",
    p_reason: "Verified fictitious test identity",
    p_verified: true,
  });
}
const request = (org = orgs.A, key = randomUUID()) =>
  rpc("billing_subscription_action", {
    p_org: org,
    p_action: "trial",
    p_plan: plan,
    p_revision: 0,
    p_key: key,
  });
async function start() {
  await verify();
  await as("adminA");
  assert.equal((await request()).trial, true);
  return ctx();
}
async function command(
  action,
  requestId = null,
  days = 5,
  override = true,
  key = randomUUID(),
  revision = null,
  org = orgs.A,
) {
  await as("root");
  return rpc("billing_trial_admin", {
    p_org: org,
    p_action: action,
    p_request: requestId,
    p_revision: revision ?? (await ctx(org)).subscription?.revision ?? 0,
    p_days: days,
    p_reason: "Legitimate exception after fictitious review",
    p_override: override,
    p_key: key,
  });
}
async function newOrg(admin = users.adminA) {
  await as("root");
  const id=await scalar("select foundation_create_organization($1,$2,$3)", ["Outra fictícia","fixture-"+randomUUID(),admin]);
  await as(admin===users.adminA?"adminA":"adminB");
  await rpc('access_verify_document',{p_org:id,p_kind:'CPF',p_document:admin===users.adminA?'52998224725':'12345678909',p_revision:0,p_key:randomUUID()});
  return id;
}
await test("15 dias vêm do plano; grant persistente e sem cobrança", async () => {
  const x = await start();
  assert.equal(x.trial.grants[0].remaining_days, 15);
  assert.equal(
    (Date.parse(x.subscription.period_end) -
      Date.parse(x.subscription.period_start)) /
      86400000,
    15,
  );
  assert.equal(x.invoices.length, 0);
  assert.equal(x.trial.grants[0].plan_name, "Teste fictício");
});
await test("Sem prova forte solicita análise, sem trial ou assinatura automática", async () => {
  await as("adminA");
  assert.equal((await request()).review_required, true);
  const x = await ctx();
  assert.equal(x.subscription, null);
  assert.equal(x.trial.requests[0].state, "pending");
});
await test("Nova chave não duplica solicitação pendente", async () => {
  await as("adminA");
  const a = await request();
  const b = await request();
  assert.equal(a.request_id, b.request_id);
  assert.equal((await ctx()).trial.requests.length, 1);
});
await test("Repetição idempotente não duplica grant", async () => {
  await verify();
  await as("adminA");
  const key = randomUUID();
  assert.deepEqual(await request(orgs.A, key), await request(orgs.A, key));
  assert.equal((await ctx()).trial.grants.length, 1);
});
await test("Outra organização da mesma conta não ganha novo teste", async () => {
  await start();
  const other = await newOrg();
  await verify(other, "ZZ:TEST:DIFFERENT");
  await as("adminA");
  assert.equal((await request(other)).review_required, true);
});
await test("E-mail alterado não apaga consumo ligado à conta", async () => {
  await start();
  await db.exec("reset role");
  await db.exec("alter table auth.users add column if not exists email text");
  await db.query("update auth.users set email=$1 where id=$2", [
    "new-fictitious@example.invalid",
    users.adminA,
  ]);
  const other = await newOrg();
  await verify(other, "ZZ:TEST:DIFFERENT");
  await as("adminA");
  assert.equal((await request(other)).review_required, true);
});
await test("Conta e e-mail diferentes com mesma empresa exigem análise", async () => {
  await start();
  await verify(orgs.B, "zz:test:company a");
  await as("adminB");
  assert.equal((await request(orgs.B)).review_required, true);
});
await test("Responsável verificado reaparece em outra empresa/conta", async () => {
  await verify(orgs.A, "ZZ:PERSON:FICTION123", "responsible");
  await as("adminA");
  await request();
  await verify(orgs.B, "ZZ:PERSON:FICTION123", "responsible");
  await as("adminB");
  assert.equal((await request(orgs.B)).review_required, true);
});
await test("Telefone informado sem verificação não concede identidade", async () => {
  await as("adminA");
  await deny(() =>
    rpc("billing_trial_verify", {
      p_org: orgs.A,
      p_kind: "phone",
      p_value: "+5599999999999",
      p_evidence: "fixture-phone",
      p_reason: "Only an unverified input",
      p_verified: true,
    }),
  );
  assert.equal((await request()).review_required, true);
});
await test("Telefone verificado coincidente encaminha à revisão, não recusa definitiva", async () => {
  await verify(orgs.A, "+5599999999999", "phone");
  await start();
  await verify(orgs.B, "ZZ:TEST:COMPANYB");
  await verify(orgs.B, "+55 (99) 99999-9999", "phone");
  await as("adminB");
  const x = await request(orgs.B);
  assert.equal(x.review_required, true);
  await command("approve", x.request_id, 15, true, randomUUID(), 0, orgs.B);
  await as("adminB");
  assert.equal((await ctx(orgs.B)).subscription.state, "trial");
});
await test("Só telefone não atende política padrão de prova forte", async () => {
  await verify(orgs.A, "+5599999999999", "phone");
  await as("adminA");
  assert.equal((await request()).review_required, true);
});
await test("Identidade forte ainda ausente impede recadastro com nova conta", async () => {
  await start();
  await as("adminB");
  assert.equal((await request(orgs.B)).review_required, true);
});
await test("Cancelamento e recriação não apagam elegibilidade", async () => {
  await start();
  await rpc("billing_subscription_action", {
    p_org: orgs.A,
    p_action: "cancel",
    p_plan: null,
    p_revision: 1,
    p_key: randomUUID(),
  });
  const other = await newOrg(users.adminB);
  await verify(other);
  await as("adminB");
  assert.equal((await request(other)).review_required, true);
});
await test("Suspensão da empresa não libera identidade anterior", async () => {
  await start();
  await db.exec("reset role");
  await db.query("update organizations set status='suspended' where id=$1", [
    orgs.A,
  ]);
  await verify(orgs.B);
  await as("adminB");
  assert.equal((await request(orgs.B)).review_required, true);
});
await test("Histórico não tem FK de exclusão em cascata para organização/conta", async () => {
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(*) from pg_constraint where contype='f' and connamespace='private'::regnamespace and conrelid::regclass::text like 'private.trial_%' and confrelid in ('public.organizations'::regclass,'public.profiles'::regclass,'auth.users'::regclass)",
    ),
    0,
  );
});
await test("Registry tombstone identifica empresa recriada após remoção", async () => {
  await start();
  await db.exec("reset role");
  const old = randomUUID();
  await db.query(
    "update private.trial_grants set organization_id=$1 where organization_id=$2",
    [old, orgs.A],
  );
  await verify(orgs.B);
  await as("adminB");
  assert.equal((await request(orgs.B)).review_required, true);
});
await test("Histórico/claims não aceitam delete ou truncate nem pelo owner", async () => {
  await start();
  await db.exec("reset role");
  await deny(() => db.exec("delete from private.trial_grants"), ["23514"]);
  await deny(() => db.exec("truncate private.trial_claims"), ["23514"]);
});
await test("Consumidor, atendente e empresa B não consultam trial A", async () => {
  await start();
  for (const who of ["alice", "agentA", "adminB", "anon"]) {
    await as(who);
    await deny(() => ctx());
  }
});
await test("Identificadores brutos/hashes não aparecem no contexto administrativo", async () => {
  await start();
  await as("root");
  const x = JSON.stringify(await ctx());
  assert.ok(!x.includes("COMPANYA"));
  assert.ok(!x.includes("fingerprint"));
  await db.exec("reset role");
  const i = (await db.query("select * from private.trial_identifiers")).rows[0];
  assert.equal(i.fingerprint.length, 32);
  assert.equal(i.p_value, undefined);
});
await test("Grant e política não podem ser escritos diretamente pelo frontend", async () => {
  await as("adminA");
  await deny(() =>
    db.exec("update private.trial_policy set auto_enabled=true"),
  );
  await deny(() =>
    db.exec(
      "update billing_subscriptions set period_end=now()+interval '90 days'",
    ),
  );
  await deny(() =>
    scalar(
      "select private.trial_record($1,$2,now(),now()+interval '1 day','automatic','bypass')",
      [orgs.A, randomUUID()],
    ),
  );
});
await test("RPC base anterior não concede bypass antifraude", async () => {
  await as("adminA");
  await deny(() =>
    scalar(
      "select private.billing_subscription_action_base($1,'trial',$2,0,$3)",
      [orgs.A, plan, randomUUID()],
    ),
  );
});
await test("Usuário não pode afirmar verificado; root exige atestação explícita", async () => {
  await as("root");
  await deny(
    () =>
      rpc("billing_trial_verify", {
        p_org: orgs.A,
        p_kind: "business",
        p_value: "ZZ:TEST:UNPROVEN",
        p_evidence: "fixture-proof",
        p_reason: "Not verified independently",
        p_verified: false,
      }),
    ["22023"],
  );
});
await test("Parâmetros não canônicos e dias abusivos são rejeitados", async () => {
  await as("root");
  await deny(() => verify(orgs.A, "not an identity"), ["22023"]);
  await start();
  await deny(() => command("extend", null, 999), ["22023"]);
});
await test("Exceção legítima exige confirmação; decisão auditada", async () => {
  await as("adminA");
  const r = await request();
  await deny(() => command("approve", r.request_id, 15, false), ["22023"]);
  await command("approve", r.request_id, 15, true);
  await as("root");
  const x = await ctx();
  assert.equal(x.trial.grants[0].mode, "administrative");
  assert.ok(x.trial.audit.some((a) => a.action === "approve"));
});
await test("Recusa preserva solicitação/histórico e não concede assinatura", async () => {
  await as("adminA");
  const r = await request();
  await command("deny", r.request_id);
  await as("adminA");
  const x = await ctx();
  assert.equal(x.subscription, null);
  assert.equal(x.trial.requests[0].state, "denied");
});
await test("Conta comum não aprova/estende nem muda política", async () => {
  await as("adminA");
  await deny(() =>
    rpc("billing_trial_admin", {
      p_org: orgs.A,
      p_action: "extend",
      p_request: null,
      p_revision: 0,
      p_days: 15,
      p_reason: "Attempt of privilege escalation",
      p_override: true,
      p_key: randomUUID(),
    }),
  );
  await deny(() =>
    rpc("billing_trial_policy_save", {
      p_revision: 1,
      p_auto: true,
      p_required: ["phone"],
      p_match: ["business", "responsible"],
      p_max_days: 365,
      p_reason: "Attempt of privilege escalation",
    }),
  );
});
await test("Revogação do papel root impede comando com sessão anterior", async () => {
  await start();
  await db.exec("reset role");
  await db.query("update platform_roles set active=false where user_id=$1", [
    users.root,
  ]);
  await deny(() => command("extend"));
});
await test("Extensão soma dias, atualiza contrato e grava histórico", async () => {
  const x = await start();
  await command("extend", null, 5);
  await as("adminA");
  const y = await ctx();
  assert.equal(y.trial.grants[0].extensions, 1);
  assert.equal(
    Date.parse(y.subscription.period_end) -
      Date.parse(x.subscription.period_end),
    5 * 86400000,
  );
  assert.equal(y.trial.grants[0].ends_at, y.subscription.period_end);
});
await test("Extensão repetida com mesma chave não soma duas vezes", async () => {
  await start();
  const key = randomUUID();
  const x = await command("extend", null, 5, true, key, 1);
  const y = await command("extend", null, 5, true, key, 1);
  assert.deepEqual(x, y);
  assert.equal((await ctx()).trial.grants[0].extensions, 1);
});
await test("Revisão obsoleta não estende novamente", async () => {
  await start();
  await command("extend", null, 5, true, randomUUID(), 1);
  await deny(
    () => command("extend", null, 5, true, randomUUID(), 1),
    ["40001"],
  );
});
await test("Fim do trial bloqueia nova operação e preserva dados", async () => {
  await start();
  await db.exec("reset role");
  await db.query(
    "update billing_subscriptions set period_start=now()-interval '16 days',period_end=now()-interval '1 day' where organization_id=$1",
    [orgs.A],
  );
  await db.query(
    "update private.trial_grants set starts_at=now()-interval '16 days',ends_at=now()-interval '1 day' where organization_id=$1",
    [orgs.A],
  );
  await as("adminA");
  const x = await ctx();
  assert.equal(x.subscription.effective_state, "expired");
  assert.equal(x.trial.grants[0].status, "expired");
  assert.equal(x.trial.grants[0].remaining_days, 0);
  await db.exec("reset role");
  assert.equal(
    await scalar("select count(*) from organizations where id=$1", [orgs.A]),
    1,
  );
  await as("adminA");
  await db.exec("reset role");
  await deny(() =>
    db.query(
      "insert into services(organization_id,name,price_mode,price_cents) values($1,'Bloqueado','fixed',100)",
      [orgs.A],
    ),
  );
});
await test("Trial expirado pode ser estendido só pela administração", async () => {
  await start();
  await db.exec("reset role");
  await db.query(
    "update billing_subscriptions set period_start=now()-interval '16 days',period_end=now()-interval '1 day' where organization_id=$1",
    [orgs.A],
  );
  await db.query(
    "update private.trial_grants set starts_at=now()-interval '16 days',ends_at=now()-interval '1 day' where organization_id=$1",
    [orgs.A],
  );
  await command("extend", null, 5);
  assert.equal((await ctx()).subscription.effective_state, "trial");
});
await test("Após expirar, contratação fictícia reativa sem apagar grant", async () => {
  await start();
  await db.exec("reset role");
  await db.query(
    "update billing_subscriptions set period_start=now()-interval '16 days',period_end=now()-interval '1 day' where organization_id=$1",
    [orgs.A],
  );
  await db.exec("update private.billing_runtime set mock_enabled=true");
  await as("adminA");
  const x = await rpc("billing_subscription_action", {
    p_org: orgs.A,
    p_action: "renew",
    p_plan: null,
    p_revision: 1,
    p_key: randomUUID(),
  });
  await as("root");
  await rpc("billing_mock_event", {
    p_event: randomUUID(),
    p_invoice: x.invoice_id,
    p_state: "paid",
    p_amount: 9900,
  });
  const y = await ctx();
  assert.equal(y.subscription.state, "active");
  assert.equal(y.trial.grants[0].status, "converted");
  await deny(() => command("extend"), ["22023"]);
});
await test("Política configurável pode exigir análise de todas as concessões", async () => {
  await verify();
  await rpc("billing_trial_policy_save", {
    p_revision: 1,
    p_auto: false,
    p_required: ["business", "responsible"],
    p_match: ["business", "responsible", "phone"],
    p_max_days: 30,
    p_reason: "Manual review during fictitious test",
  });
  await as("adminA");
  assert.equal((await request()).review_required, true);
});
await test("Política não desliga checagem de empresa/responsável", async () => {
  await as("root");
  await deny(
    () =>
      rpc("billing_trial_policy_save", {
        p_revision: 1,
        p_auto: true,
        p_required: ["phone"],
        p_match: ["phone"],
        p_max_days: 30,
        p_reason: "Try bypassing identity history",
      }),
    ["23514"],
  );
});
await test("Datas/duração novas seguem versão configurada, não constante 15", async () => {
  await verify();
  await rpc("billing_plan_save", {
    p_id: plan,
    p_revision: 1,
    p_data: {
      name: "Teste configurável",
      price_cents: 9900,
      interval_months: 1,
      trial_days: 9,
      active: true,
      available: true,
    },
  });
  await as("adminA");
  await request();
  assert.equal((await ctx()).trial.grants[0].remaining_days, 9);
});
await test("Verificação posterior associa identidade a trial já concedido", async () => {
  await as("adminA");
  const r = await request();
  await command("approve", r.request_id, 15);
  await verify();
  await verify(orgs.B);
  await as("adminB");
  assert.equal((await request(orgs.B)).review_required, true);
});
await test("Mesma rede/dispositivo não são usados como bloqueio definitivo", async () => {
  await start();
  await verify(orgs.B, "ZZ:TEST:UNRELATED");
  await as("adminB");
  assert.equal((await request(orgs.B)).trial, true);
});
await test("Duas solicitações serializadas com identidade igual dão um único grant", async () => {
  await verify();
  await verify(orgs.B);
  await as("adminA");
  assert.equal((await request()).trial, true);
  await as("adminB");
  assert.equal((await request(orgs.B)).review_required, true);
  await db.exec("reset role");
  assert.equal(await scalar("select count(*) from private.trial_grants"), 1);
});
await test("Todas as dez tabelas antifraude usam FORCE RLS sem grants cliente", async () => {
  await db.exec("reset role");
  assert.equal(
    await scalar(
      "select count(*) from pg_class where relnamespace='private'::regnamespace and relname like 'trial_%' and relkind='r' and relrowsecurity and relforcerowsecurity",
    ),
    10,
  );
  assert.equal(
    await scalar(
      "select count(*) from information_schema.role_table_grants where table_schema='private' and table_name like 'trial_%' and grantee in ('anon','authenticated','service_role')",
    ),
    0,
  );
});
await test("Índice único impede concessão automática duplicada mesmo sem pré-checagem", async () => {
  await start();
  await verify(orgs.B);
  await db.exec("reset role");
  const v = await scalar(
    "select plan_version_id from billing_subscriptions where organization_id=$1",
    [orgs.A],
  );
  await deny(
    () =>
      scalar(
        "select private.trial_record($1,$2,now(),now()+interval '15 days','automatic','Concurrent snapshot simulation')",
        [orgs.B, v],
      ),
    ["23505"],
  );
  assert.equal(await scalar("select count(*) from private.trial_grants"), 1);
});
await test("Solicitação em revisão ou recusada não libera operação gratuita sem vigência", async () => {
  await as("adminA");
  const r = await request();
  await db.exec("reset role");
  assert.equal(
    await scalar("select private.billing_feature($1,'human_support')", [
      orgs.A,
    ]),
    false,
  );
  await deny(() =>
    db.query(
      "insert into services(organization_id,name,price_mode,price_cents) values($1,'Bloqueado','fixed',100)",
      [orgs.A],
    ),
  );
  await command("deny", r.request_id);
  await db.exec("reset role");
  await deny(() =>
    db.query(
      "insert into services(organization_id,name,price_mode,price_cents) values($1,'Continua bloqueado','fixed',100)",
      [orgs.A],
    ),
  );
});
await writeFile(
  "reports/trial-results.json",
  JSON.stringify(
    {
      environment:
        "LOCAL PGlite; manual verification fictitious; serial interleavings are NOT independent concurrency",
      results,
    },
    null,
    2,
  ),
);
await db.close();
if (results.some((x) => x.status === "FAIL")) process.exitCode = 1;

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
import { enterpriseAccess } from "../server/enterprise-access.mjs";
const c = await consumerDB(),
  { db } = c,
  results = [],
  session = randomUUID();
let created = 0,
  passwordChanges = 0;
async function invoke(name, args = {}, actor = null) {
  await db.exec("begin");
  try {
    if (actor) {
      await db.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({
          sub: users[actor],
          session_id: session,
          is_anonymous: false,
        }),
      ]);
      await db.exec("set local role authenticated");
    } else await db.exec("set local role service_role");
    const r = await c.rpc(name, args);
    await db.exec("commit;reset role");
    return r;
  } catch (e) {
    await db.exec("rollback;reset role");
    throw e;
  }
}
const run = enterpriseAccess({
  service: invoke,
  asUser: (token, n, a) => invoke(n, a, token),
  auth: {
    getUser: async (token) => ({
      data: { user: { id: users[token], is_anonymous: false } },
    }),
    admin: {
      getUserById: async (id) => ({
        data: {
          user: (await db.query("select * from auth.users where id=$1", [id]))
            .rows[0],
        },
      }),
      createUser: async (a) => {
        await db.query(
          "insert into auth.users(id,email,email_confirmed_at,is_anonymous)values($1,$2,now(),false)",
          [a.id, a.email],
        );
        created++;
        return { data: { user: { id: a.id } } };
      },
      updateUserById: async () => {
        passwordChanges++;
        return {};
      },
    },
  },
});
const root = { token: "root" },
  row = async (id) =>
    (
      await db.query("select * from private.enterprise_accounts where id=$1", [
        id,
      ])
    ).rows[0];
const verify = (i) =>
  run("/access/verify", {
    activation_link: i.activation_link,
    code: i.temporary_code,
  });
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, status: "FAIL", error: e.message });
    throw e;
  }
}
async function snapshot() {
  const result = {};
  for (const table of [
    "auth.users",
    "public.profiles",
    "public.organizations",
    "public.organization_members",
    "public.platform_roles",
    "private.trial_grants",
    "public.billing_subscriptions",
  ])
    result[table] = (
      await db.query(
        `select to_jsonb(t) row from ${table} t order by to_jsonb(t)::text`,
      )
    ).rows;
  return result;
}
const newPerson = (username) =>
  run(
    "/access/person",
    {
      name: "Pessoa Fictícia",
      username,
      email: username + "@example.invalid",
      role: "person",
      request_key: randomUUID(),
    },
    root,
  );
try {
  await invoke("access_register_session", {
    p_user: users.root,
    p_session: session,
    p_account: null,
    p_generation: null,
  });
  const a = await newPerson("reemissao.pessoa"),
    b = await newPerson("outra.pessoa");
  const accountA = (
    await db.query(
      "select * from private.enterprise_accounts where username='reemissao.pessoa'",
    )
  ).rows[0];
  const accountB = (
    await db.query(
      "select * from private.enterprise_accounts where username='outra.pessoa'",
    )
  ).rows[0];
  const org = await invoke(
    "access_create_organization",
    {
      p_name: "Empresa Fictícia 037",
      p_slug: "ficticia-reemissao037",
      p_key: randomUUID(),
    },
    "root",
  );
  const plan = await invoke(
    "billing_plan_save",
    {
      p_id: null,
      p_revision: 0,
      p_data: {
        name: "Trial fictício 037",
        active: true,
        available: true,
        price_cents: 9900,
        interval_months: 1,
        trial_days: 15,
      },
    },
    "root",
  );
  const review = await invoke(
    "billing_subscription_action",
    {
      p_org: org.organization_id,
      p_action: "trial",
      p_plan: plan,
      p_revision: 0,
      p_key: randomUUID(),
    },
    "root",
  );
  await invoke(
    "billing_trial_admin",
    {
      p_org: org.organization_id,
      p_action: "approve",
      p_request: review.request_id,
      p_revision: 0,
      p_days: 15,
      p_reason: "Cenário fictício de preservação na reemissão",
      p_override: true,
      p_key: randomUUID(),
    },
    "root",
  );
  await invoke(
    "people_link",
    {
      p_user: accountA.user_id,
      p_org: org.organization_id,
      p_role: "admin_empresa",
      p_active: true,
    },
    "root",
  );
  const before = await snapshot(),
    linked = (
      await db.query(
        "select * from private.enterprise_accounts where user_id=$1 and organization_id is not null",
        [accountA.user_id],
      )
    ).rows;
  let next, grant;
  await check(
    "Emissão inicial usa o protocolo 036 e persiste somente hashes; duas identidades distintas",
    async () => {
      assert.equal(created, 2);
      for (const i of [a, b]) {
        assert.match(i.activation_link, /^[\w-]{43}$/);
        assert(i.temporary_code);
        assert.equal(i.delivery, "manual");
      }
      const records = JSON.stringify([
        await row(accountA.id),
        await row(accountB.id),
      ]);
      for (const s of [
        a.temporary_code,
        a.activation_link,
        b.temporary_code,
        b.activation_link,
      ])
        assert(!records.includes(s));
      assert(before["private.trial_grants"].length > 0);
    },
  );
  const oldProof = await verify(a);
  await check(
    "Reemissão preserva pessoa/Auth/vínculos/papel/empresa/username e trial; B não muda",
    async () => {
      next = await run("/access/reset", { id: accountA.id }, root);
      assert(next.reissued);
      assert.notEqual(next.activation_link, a.activation_link);
      assert.notEqual(next.temporary_code, a.temporary_code);
      const current = await row(accountA.id);
      assert.equal(current.state, "pending");
      for (const key of [
        "id",
        "user_id",
        "organization_id",
        "username",
        "display_name",
        "contact_email",
        "role",
        "requested_by",
        "request_key",
        "activated_at",
      ])
        assert.deepEqual(current[key], accountA[key]);
      assert.deepEqual(await snapshot(), before);
      assert.deepEqual(await row(accountB.id), accountB);
      assert.deepEqual(
        (
          await db.query(
            "select * from private.enterprise_accounts where user_id=$1 and organization_id is not null",
            [accountA.user_id],
          )
        ).rows,
        linked,
      );
      assert.equal(created, 2);
      assert.equal(passwordChanges, 0);
    },
  );
  await check(
    "Par e prova anteriores são recusados; novo par valida mantendo A aguardando",
    async () => {
      await assert.rejects(verify(a), /activation_invalid/);
      await assert.rejects(
        run("/access/activate", {
          proof: oldProof.proof,
          password: "Fictitious037Password!",
          confirmation: "Fictitious037Password!",
        }),
        /activation_invalid/,
      );
      grant = await verify(next);
      assert(grant.proof);
      assert.equal((await row(accountA.id)).state, "pending");
      assert.equal(passwordChanges, 0);
      const directory = JSON.stringify(
        await invoke("people_directory", {}, "root"),
      );
      for (const s of [next.temporary_code, next.activation_link])
        assert(!directory.includes(s));
    },
  );
  await check(
    "Falha por falta de autorização não emite par nem modifica as contas",
    async () => {
      const previous = await row(accountA.id);
      await assert.rejects(
        run("/access/reset", { id: accountA.id }, { token: "adminB" }),
        /access_denied/,
      );
      assert.deepEqual(await row(accountA.id), previous);
      assert.deepEqual(await row(accountB.id), accountB);
      assert.deepEqual(await snapshot(), before);
    },
  );
  await check(
    "Expiração continua valendo; nova reemissão usa o mesmo cadastro e invalida a anterior",
    async () => {
      await db.query(
        "update private.enterprise_accounts set code_expires=now()-interval '1 second' where id=$1",
        [accountA.id],
      );
      await assert.rejects(verify(next), /activation_invalid/);
      const previous = next;
      next = await run("/access/reset", { id: accountA.id }, root);
      await assert.rejects(verify(previous), /activation_invalid/);
      grant = await verify(next);
      assert(grant.proof);
      assert.deepEqual(await snapshot(), before);
      assert.equal(created, 2);
    },
  );
  await check(
    "Ativação pelo novo par é de uso único e não afeta B",
    async () => {
      await run("/access/activate", {
        proof: grant.proof,
        password: "Fictitious037Password!",
        confirmation: "Fictitious037Password!",
      });
      const current = await row(accountA.id);
      assert.equal(current.state, "active");
      assert.equal(current.code_hash, null);
      assert.equal(current.proof_hash, null);
      assert.equal(passwordChanges, 1);
      await assert.rejects(verify(next), /activation_invalid/);
      assert.deepEqual(await row(accountB.id), accountB);
      assert.equal(created, 2);
    },
  );
} finally {
  await writeFile(
    "reports/syzia-037/sql.json",
    JSON.stringify(
      {
        environment:
          "LOCAL PGlite; RPCs existentes da 036 e Auth simulado; sem banco externo",
        results,
      },
      null,
      2,
    ),
  );
  await db.close();
}

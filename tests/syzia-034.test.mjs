import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
import { enterpriseAccess } from "../server/enterprise-access.mjs";
const c = await consumerDB(),
  { db, rpc, as, orgs } = c;
const results = [];
async function test(name, fn) {
  await fn();
  results.push({ name, status: "PASS" });
  console.log("PASS", name);
}
async function invoke(name, args, actor) {
  await db.exec("begin");
  try {
    if (actor) await as(actor);
    else await db.exec("set local role service_role");
    const result = await rpc(name, args);
    await db.exec("commit;reset role");
    return result;
  } catch (e) {
    await db.exec("rollback;reset role");
    throw e;
  }
}
const counts = async () =>
  (
    await db.query(
      `select (select count(*) from auth.users)::int auth,(select count(*) from private.enterprise_accounts)::int accounts,(select count(*) from organization_members)::int links,(select count(*) from organizations)::int organizations,(select count(*) from platform_roles)::int roles,(select count(*) from private.trial_grants)::int trials,(select count(*) from billing_subscriptions)::int subscriptions`,
    )
  ).rows[0];
let failure = "",
  sent = 0,
  created = 0;
const run = enterpriseAccess({
  asUser: (token, name, args) => invoke(name, args, token),
  service: async (name, args) => {
    if (failure === "finalize" && name === "access_finish_provision_link")
      throw Error("unavailable");
    return invoke(name, args);
  },
  auth: {
    getUser: async (token) => ({
      data: { user: { id: users[token], is_anonymous: false } },
    }),
    admin: {
      getUserById: async (id) =>
        failure === "lookup"
          ? { error: { status: 503 } }
          : {
              data: {
                user:
                  (await db.query("select * from auth.users where id=$1", [id]))
                    .rows[0] || null,
              },
            },
      createUser: async (attrs) => {
        if (failure === "create") return { error: { status: 503 } };
        await db.query(
          "insert into auth.users(id,email,email_confirmed_at,is_anonymous)values($1,$2,now(),false)",
          [attrs.id, attrs.email],
        );
        created++;
        return { data: { user: { id: attrs.id } } };
      },
      updateUserById: async () => ({ error: null }),
    },
  },
  sendInstructions: async () => {
    sent++;
    throw Error("SMTP must not be called");
  },
});
try {
  for (const enterprise of [false, true])
    for (const stage of ["lookup", "create", "finalize"]) {
      await test(`${enterprise ? "Empresa" : "Pessoa sem vínculo"}: falha ${stage}, retomada, reemissão, código anterior e uso único`, async () => {
        const username = (enterprise ? "empresa." : "pessoa.") + stage;
        const operator = enterprise ? "adminA" : "root";
        const body = {
          organization_id: enterprise ? orgs.A : null,
          name: enterprise ? "Pessoa" : "Pessoa Fictícia",
          surname: "Fictícia",
          username,
          email: username + "@example.invalid",
          role: enterprise ? "colaborador_empresa" : "person",
          request_key: randomUUID(),
        };
        const before = await counts();
        failure = stage;
        let partial;
        await assert.rejects(
          () =>
            run(enterprise ? "/access/provision" : "/access/person", body, {
              token: operator,
            }),
          (e) => {
            partial = e;
            assert(!e.temporary_code);
            assert.equal(
              e.stage,
              stage === "finalize" ? "finalize" : "auth_identity",
              e.message,
            );
            return true;
          },
        );
        const reserved = (
          await db.query(
            "select * from private.enterprise_accounts where id=$1",
            [partial.account_id],
          )
        ).rows[0];
        assert.equal(reserved.state, "reserved");
        assert.equal(reserved.code_hash, null);
        failure = "";
        const issued = await run(
          "/access/resume",
          { id: partial.account_id },
          { token: operator },
        );
        assert.equal(issued.delivery, "manual");
        assert.equal(issued.name, "Pessoa Fictícia");
        assert.equal(issued.company_code === "SYZIA", !enterprise);
        assert.equal(issued.organization_id, enterprise ? orgs.A : null);
        assert.equal(sent, 0);
        const after = await counts();
        assert.equal(after.auth, before.auth + 1);
        assert.equal(after.accounts, before.accounts + 1);
        assert.equal(after.links, before.links + (enterprise ? 1 : 0));
        assert.equal(after.organizations, before.organizations);
        assert.equal(after.roles, before.roles);
        assert.equal(after.trials, before.trials);
        assert.equal(after.subscriptions, before.subscriptions);
        await assert.rejects(
          () =>
            run(
              "/access/resume",
              { id: partial.account_id },
              { token: operator },
            ),
          /access_change_unavailable/,
        );
        const next = await run(
          "/access/reset",
          {
            id: partial.account_id,
            organization_id: enterprise ? orgs.A : null,
          },
          { token: operator },
        );
        assert.notEqual(next.temporary_code, issued.temporary_code);
        assert(next.reissued);
        assert.deepEqual(await counts(), after);
        const verify = (code) =>
          run("/access/verify", {
            activation_link: next.activation_link,
            code,
          });
        await assert.rejects(
          () => verify(issued.temporary_code),
          /activation_invalid/,
        );
        const proof = await verify(next.temporary_code);
        assert(proof.proof);
        await run("/access/activate", {
          proof: proof.proof,
          password: "Fictitious034Password!",
          confirmation: "Fictitious034Password!",
        });
        await assert.rejects(
          () => verify(next.temporary_code),
          /activation_invalid/,
        );
        assert.deepEqual(await counts(), after);
        const row = (
          await db.query(
            "select code_hash,proof_hash,state from private.enterprise_accounts where id=$1",
            [partial.account_id],
          )
        ).rows[0];
        assert.equal(row.state, "active");
        assert.equal(row.code_hash, null);
        assert.equal(row.proof_hash, null);
      });
    }
  await test("Código expirado recusado; reemissão não altera identidade ou vínculos", async () => {
    const a = (
      await db.query(
        "select * from private.enterprise_accounts where username='pessoa.lookup'",
      )
    ).rows[0];
    const r = await run("/access/reset", { id: a.id }, { token: "root" });
    await db.query(
      "update private.enterprise_accounts set code_expires=now()-interval '1 second' where id=$1",
      [a.id],
    );
    await assert.rejects(
      () =>
        run("/access/verify", {
          activation_link: r.activation_link,
          code: r.temporary_code,
        }),
      /activation_invalid/,
    );
    const before = await counts();
    const next = await run("/access/reset", { id: a.id }, { token: "root" });
    assert(
      (
        await run("/access/verify", {
          activation_link: next.activation_link,
          code: next.temporary_code,
        })
      ).proof,
    );
    assert.deepEqual(await counts(), before);
  });
  await test("Admin de outra empresa não pode reemitir ou provisionar fora do vínculo", async () => {
    const a = (
      await db.query(
        "select * from private.enterprise_accounts where username='empresa.lookup'",
      )
    ).rows[0];
    const before = await counts();
    await assert.rejects(
      () =>
        run(
          "/access/reset",
          { id: a.id, organization_id: orgs.B },
          { token: "adminB" },
        ),
      /access_denied/,
    );
    await assert.rejects(() =>
      run(
        "/access/provision",
        {
          organization_id: orgs.A,
          name: "Intruso",
          surname: "Fictício",
          username: "intruso.teste",
          role: "colaborador_empresa",
          request_key: randomUUID(),
        },
        { token: "adminB" },
      ),
    );
    await assert.rejects(() =>
      run(
        "/access/person",
        {
          name: "Intruso Fictício",
          username: "intruso.pessoal",
          role: "person",
          request_key: randomUUID(),
        },
        { token: "adminB" },
      ),
    );
    assert.deepEqual(await counts(), before);
  });
  await writeFile(
    process.env.ACCESS_REPORT_DIR
      ? process.env.ACCESS_REPORT_DIR + "/sql-regression034.json"
      : "reports/syzia-034/sql.json",
    JSON.stringify(
      {
        environment: "LOCAL PGlite + Auth stub; no external homologation",
        created,
        smtp_calls: sent,
        tests: results,
      },
      null,
      2,
    ),
  );
} finally {
  await db.close();
}

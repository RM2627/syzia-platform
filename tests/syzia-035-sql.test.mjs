import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
import { enterpriseAccess } from "../server/enterprise-access.mjs";
const c = await consumerDB(),
  { db } = c,
  results = [];
let session = randomUUID(),
  failure = true,
  creates = 0;
async function invoke(name, args, actor) {
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
    const result = await c.rpc(name, args);
    await db.exec("commit;reset role");
    return result;
  } catch (e) {
    await db.exec("rollback;reset role");
    throw e;
  }
}
const register = () =>
  invoke("access_register_session", {
    p_user: users.root,
    p_session: session,
    p_account: null,
    p_generation: null,
  });
const counts = async () =>
  (
    await db.query(
      "select (select count(*) from auth.users)::int auth,(select count(*) from private.enterprise_accounts)::int accounts,(select count(*) from organization_members)::int links,(select count(*) from organizations)::int organizations,(select count(*) from private.trial_grants)::int trials",
    )
  ).rows[0];
const run = enterpriseAccess({
  asUser: (token, name, args) => invoke(name, args, token),
  service: (name, args) => invoke(name, args),
  auth: {
    getUser: async (token) => ({
      data: { user: { id: users[token], is_anonymous: false } },
    }),
    admin: {
      getUserById: async (id) => ({
        data: {
          user:
            (await db.query("select * from auth.users where id=$1", [id]))
              .rows[0] || null,
        },
      }),
      createUser: async (attrs) => {
        assert(Buffer.byteLength(attrs.password) <= 72);
        if (failure)
          return { error: { code: "validation_failed", status: 400 } };
        await db.query(
          "insert into auth.users(id,email,email_confirmed_at,is_anonymous)values($1,$2,now(),false)",
          [attrs.id, attrs.email],
        );
        creates++;
        return { data: { user: { id: attrs.id } } };
      },
      updateUserById: async () => ({}),
    },
  },
});
async function check(name, fn) {
  await fn();
  results.push({ name, status: "PASS" });
  console.log("PASS", name);
}
try {
  assert(await register());
  let partial,
    before = await counts();
  await check(
    "Validação Auth preserva reserva sem código e sem novo vínculo",
    async () => {
      await assert.rejects(
        run(
          "/access/person",
          {
            name: "Pessoa Reserva",
            username: "pessoa.reserva035",
            role: "person",
            request_key: randomUUID(),
          },
          { token: "root" },
        ),
        (e) => {
          partial = e;
          return (
            e.code === "provisioning_incomplete" &&
            e.diagnostic.code === "validation_failed"
          );
        },
      );
      const row = (
        await db.query(
          "select * from private.enterprise_accounts where id=$1",
          [partial.account_id],
        )
      ).rows[0];
      assert.equal(row.state, "reserved");
      assert.equal(row.code_hash, null);
      assert.deepEqual(await counts(), {
        ...before,
        accounts: before.accounts + 1,
      });
    },
  );
  const reservation = (
    await db.query("select * from private.enterprise_accounts where id=$1", [
      partial.account_id,
    ])
  ).rows[0];
  await check(
    "Sessão inativa bloqueia retomada antes de Auth sem alterar a reserva",
    async () => {
      await db.query(
        "update private.enterprise_sessions set last_activity=now()-interval '2 days' where session_id=$1",
        [session],
      );
      const snapshot = await counts();
      await assert.rejects(
        run("/access/resume", { id: reservation.id }, { token: "root" }),
        /session_expired/,
      );
      assert.equal(creates, 0);
      assert.deepEqual(await counts(), snapshot);
      const row = (
        await db.query(
          "select * from private.enterprise_accounts where id=$1",
          [reservation.id],
        )
      ).rows[0];
      assert.equal(row.user_id, reservation.user_id);
      assert.equal(row.username, reservation.username);
      assert.equal(row.state, "reserved");
    },
  );
  await check(
    "Sessão revogada bloqueia mesmo após renovar last_activity",
    async () => {
      await db.query(
        "update private.enterprise_sessions set last_activity=now(),revoked=true where session_id=$1",
        [session],
      );
      await assert.rejects(
        run("/access/resume", { id: reservation.id }, { token: "root" }),
        /session_expired/,
      );
      assert.equal(creates, 0);
    },
  );
  await check(
    "Nova autenticação retoma identidade, username e reserva; repetição não duplica",
    async () => {
      session = randomUUID();
      assert(await register());
      failure = false;
      const issued = await run(
        "/access/resume",
        { id: reservation.id },
        { token: "root" },
      );
      assert.equal(issued.username, reservation.username);
      assert(issued.temporary_code);
      assert.equal(creates, 1);
      const row = (
        await db.query(
          "select * from private.enterprise_accounts where id=$1",
          [reservation.id],
        )
      ).rows[0];
      assert.equal(row.user_id, reservation.user_id);
      assert.equal(row.state, "pending");
      assert(row.code_hash);
      assert.deepEqual(await counts(), {
        ...before,
        accounts: before.accounts + 1,
        auth: before.auth + 1,
      });
      await assert.rejects(
        run("/access/resume", { id: reservation.id }, { token: "root" }),
        /access_change_unavailable/,
      );
      assert.equal(creates, 1);
    },
  );
  await writeFile(
    (process.env.ACCESS_REPORT_DIR || "reports/syzia-035") +
      "/sql-session.json",
    JSON.stringify(
      {
        environment: "PGlite local, RPCs reais e adaptador Auth simulado",
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await db.close();
}

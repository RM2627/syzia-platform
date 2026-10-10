import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { consumerDB, users } from "./support/consumer-db.mjs";
import {
  enterpriseAccess,
  digest,
  safeAccessError,
} from "../server/enterprise-access.mjs";
const c = await consumerDB({
    through: "202609240033_acquisition_selfservice_finance.sql",
  }),
  { db, orgs } = c,
  results = [];
const sessions = new Map([[users.root, randomUUID()]]),
  passwords = new Map(),
  operations = new Map();
let failCreate = false,
  created = 0;
const token = (id, sid = sessions.get(id)) =>
  "x." +
  Buffer.from(JSON.stringify({ sub: id, session_id: sid })).toString(
    "base64url",
  ) +
  ".x";
const identity = (t) => {
  try {
    return JSON.parse(Buffer.from(t.split(".")[1], "base64url")).sub;
  } catch {
    return null;
  }
};
async function invoke(
  name,
  args = {},
  actor = null,
  sid = sessions.get(actor),
) {
  await db.exec("begin");
  try {
    if (actor) {
      await db.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: actor, session_id: sid, is_anonymous: false }),
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
  asUser: (t, n, a) => invoke(n, a, identity(t)),
  auth: {
    getUser: async (t) => {
      const id = identity(t);
      return {
        data: {
          user: id
            ? {
                id,
                is_anonymous: false,
                app_metadata: {
                  vireloq_password_operation: operations.get(id),
                },
              }
            : null,
        },
      };
    },
    admin: {
      getUserById: async (id) => ({
        data: {
          user: (await db.query("select * from auth.users where id=$1", [id]))
            .rows[0],
        },
      }),
      createUser: async (a) => {
        if (failCreate)
          return { error: { code: "unexpected_failure", status: 503 } };
        await db.query(
          "insert into auth.users(id,email,email_confirmed_at,is_anonymous)values($1,$2,now(),false)",
          [a.id, a.email],
        );
        created++;
        return { data: { user: { id: a.id } } };
      },
      updateUserById: async (id, a) => {
        passwords.set(id, a.password);
        operations.set(id, a.app_metadata?.vireloq_password_operation);
        return {};
      },
    },
  },
  signIn: async (a) => {
    const u = (
      await db.query("select id from auth.users where email=$1", [a.email])
    ).rows[0];
    if (!u || passwords.get(u.id) !== a.password)
      return { error: { code: "invalid_credentials" } };
    const sid = randomUUID();
    sessions.set(u.id, sid);
    return {
      data: {
        session: { access_token: token(u.id, sid), refresh_token: "fixture" },
        user: { id: u.id },
      },
    };
  },
});
const root = () => ({ token: token(users.root) });
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
const account = async (id) =>
  (
    await db.query("select * from private.enterprise_accounts where id=$1", [
      id,
    ])
  ).rows[0];
const count = async () =>
  (
    await db.query(
      "select (select count(*) from auth.users)::int users,(select count(*) from private.enterprise_accounts)::int accounts,(select count(*) from organization_members)::int memberships",
    )
  ).rows[0];
const codeHash = (code) => digest(code.replaceAll("-", "").toUpperCase());
const verify = (issued) =>
  run("/access/verify", {
    activation_link: issued.activation_link,
    code: issued.temporary_code,
  });
const invalid = async (issued, reason) =>
  assert.rejects(
    verify(issued),
    (e) =>
      e.code === "activation_invalid" &&
      safeAccessError(e).diagnostic.reason === reason,
  );
const newPerson = async (username, role = "person") =>
  run(
    "/access/person",
    {
      name: "Pessoa Fictícia",
      username,
      email: username + "@example.invalid",
      role,
      request_key: randomUUID(),
    },
    root(),
  );
const activate = async (issued) => {
  const grant = await verify(issued);
  await run("/access/activate", {
    proof: grant.proof,
    password: "Fictitious036Password!",
    confirmation: "Fictitious036Password!",
  });
  return grant;
};
const login = (identifier, password = "Fictitious036Password!") =>
  run("/access/identity-login", { identifier, password });
async function legacyPrepare(username, finish = true) {
  const a = await invoke(
    "people_reserve",
    {
      p_display: "Pessoa Histórica",
      p_username: username,
      p_email: username + "@example.invalid",
      p_phone: "",
      p_role: "person",
      p_key: randomUUID(),
    },
    users.root,
  );
  if (finish) {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at)values($1,$2,now())",
      [a.user_id, username + "@auth.invalid"],
    );
    await invoke("access_finish_provision", {
      p_id: a.id,
      p_actor: users.root,
      p_hash: digest("LEGACY"),
    });
  }
  return a;
}
try {
  await invoke("access_register_session", {
    p_user: users.root,
    p_session: sessions.get(users.root),
    p_account: null,
    p_generation: null,
  });
  const legacy = await legacyPrepare("legacy.pending"),
    reserved = await legacyPrepare("legacy.reserved", false),
    oldActive = await legacyPrepare("legacy.active");
  await db.query(
    "update private.enterprise_accounts set state='active',code_hash=null,activated_at=now() where id=$1",
    [oldActive.id],
  );
  const before = (
    await db.query(
      "select to_jsonb(a) row from private.enterprise_accounts a order by id",
    )
  ).rows;
  await check(
    "Upgrade 035→036 preserva todas as colunas anteriores das preparações pendente, reservada e ativa",
    async () => {
      const counts = await count();
      await db.exec(
        await readFile(
          "supabase/migrations/202609250036_activation_links.sql",
          "utf8",
        ),
      );
      const after = (
        await db.query(
          "select to_jsonb(a)-'activation_link_hash'-'activation_link_generation' row from private.enterprise_accounts a order by id",
        )
      ).rows;
      assert.deepEqual(after, before);
      assert.deepEqual(await count(), counts);
    },
  );
  await check(
    "Link 035 continua validando contexto/usuário ocultos sem reemitir a preparação",
    async () => {
      const r = await run("/access/verify", {
        company_code: "SYZIA",
        username: "legacy.pending",
        code: "LEGACY",
      });
      assert(r.proof);
    },
  );
  let issued;
  await check(
    "Retomar preparação 035 conclui a mesma identidade e emite link opaco + código",
    async () => {
      issued = await run("/access/resume", { id: reserved.id }, root());
      const a = await account(reserved.id);
      assert.equal(a.user_id, reserved.user_id);
      assert.equal(a.state, "pending");
      assert.match(issued.activation_link, /^[\w-]{43}$/);
      assert.equal(a.activation_link_hash, digest(issued.activation_link));
      assert.equal(a.code_hash, codeHash(issued.temporary_code));
      assert.equal(a.activation_link_generation, a.generation);
      assert(!JSON.stringify(a).includes(issued.activation_link));
      assert(!JSON.stringify(a).includes(issued.temporary_code));
    },
  );
  await check(
    "Link sozinho e código errado não ativam; tentativa é contabilizada",
    async () => {
      await invalid(
        { ...issued, temporary_code: "" },
        "activation_code_invalid",
      );
      await invalid(
        { ...issued, temporary_code: "INCORRETO" },
        "activation_code_invalid",
      );
      assert.equal((await account(reserved.id)).attempts, 2);
    },
  );
  await check(
    "Código sozinho e link desconhecido são recusados sem expor conta",
    async () => {
      await invalid(
        { ...issued, activation_link: "" },
        "activation_link_invalid",
      );
      await invalid(
        { ...issued, activation_link: "a".repeat(43) },
        "activation_link_invalid",
      );
    },
  );
  await check(
    "Emissões 036 exigem o link novo mesmo no protocolo legado",
    async () => {
      await assert.rejects(
        run("/access/verify", {
          company_code: "SYZIA",
          username: issued.username,
          code: issued.temporary_code,
        }),
        (e) => e.activation_reason === "activation_link_required",
      );
      await assert.rejects(
        run("/access/login", {
          company_code: "SYZIA",
          username: issued.username,
          password: issued.temporary_code,
        }),
        /access_denied/,
      );
    },
  );
  let grant;
  await check(
    "Código recém-emitido ativa; prova concorrente/substituída é recusada",
    async () => {
      const old = await verify(issued);
      grant = await verify(issued);
      await assert.rejects(
        run("/access/activate", {
          proof: old.proof,
          password: "Fictitious036Password!",
          confirmation: "Fictitious036Password!",
        }),
        (e) => e.activation_reason === "activation_proof_invalid",
      );
      await run("/access/activate", {
        proof: grant.proof,
        password: "Fictitious036Password!",
        confirmation: "Fictitious036Password!",
      });
      assert.equal((await account(reserved.id)).state, "active");
      assert.equal((await account(reserved.id)).code_hash, null);
    },
  );
  await check("Código e prova usados não podem ativar novamente", async () => {
    await invalid(issued, "activation_already_used");
    await assert.rejects(
      run("/access/activate", {
        proof: grant.proof,
        password: "Fictitious036Password!",
        confirmation: "Fictitious036Password!",
      }),
      (e) => e.activation_reason === "activation_proof_invalid",
    );
  });
  await check(
    "Login por username e e-mail resolve a mesma identidade Auth",
    async () => {
      for (const id of ["legacy.reserved", "legacy.reserved@example.invalid"]) {
        const r = await login(id);
        assert.equal(identity(r.session.access_token), reserved.user_id);
        assert(r.contexts.personal);
      }
    },
  );
  const exp = await newPerson("expired.code"),
    expId = (
      await db.query(
        "select id from private.enterprise_accounts where username='expired.code'",
      )
    ).rows[0].id;
  await check(
    "Código expirado mantém recusa com diagnóstico sanitizado",
    async () => {
      await db.query(
        "update private.enterprise_accounts set code_expires=now()-interval '1 second' where id=$1",
        [expId],
      );
      await invalid(exp, "activation_code_expired");
    },
  );
  let renewed;
  await check(
    "Reemissão atômica troca link e código, invalida anteriores e preserva pessoa",
    async () => {
      const snap = await count();
      renewed = await run("/access/reset", { id: expId }, root());
      assert.notEqual(renewed.activation_link, exp.activation_link);
      assert.notEqual(renewed.temporary_code, exp.temporary_code);
      assert.deepEqual(await count(), snap);
      await invalid(exp, "activation_link_invalid");
      await invalid(
        { ...renewed, temporary_code: exp.temporary_code },
        "activation_code_invalid",
      );
      assert((await verify(renewed)).proof);
    },
  );
  await check(
    "Reset legado também invalida a geração do link 036",
    async () => {
      await invoke("access_reset", {
        p_id: expId,
        p_actor: users.root,
        p_hash: digest("RESET"),
      });
      await invalid(renewed, "activation_link_replaced");
    },
  );
  await check(
    "Reemissão converte preparação 035 sem apagar pessoa nem permitir link antigo",
    async () => {
      const snap = await count();
      const next = await run("/access/reset", { id: legacy.id }, root());
      assert.deepEqual(await count(), snap);
      await assert.rejects(
        run("/access/verify", {
          company_code: "SYZIA",
          username: "legacy.pending",
          code: next.temporary_code,
        }),
        (e) => e.activation_reason === "activation_link_required",
      );
      assert((await verify(next)).proof);
    },
  );
  const blocked = await newPerson("blocked.code"),
    blockedId = (
      await db.query(
        "select id from private.enterprise_accounts where username='blocked.code'",
      )
    ).rows[0].id;
  await check(
    "Limite de tentativas impede força bruta mesmo com código correto depois",
    async () => {
      for (let i = 0; i < 5; i++)
        await invalid(
          { ...blocked, temporary_code: "ERRADO" },
          "activation_code_invalid",
        );
      await invalid(blocked, "activation_attempts_exhausted");
    },
  );
  await check(
    "Preparação incompatível e identidade Auth bloqueada não ativam",
    async () => {
      const a = await account(blockedId);
      await db.query(
        "update private.enterprise_accounts set attempts=0,state='disabled' where id=$1",
        [a.id],
      );
      await invalid(blocked, "activation_preparation_incompatible");
      await db.query(
        "update private.enterprise_accounts set state='pending' where id=$1",
        [a.id],
      );
      await db.query(
        "update auth.users set banned_until=now()+interval '1 day' where id=$1",
        [a.user_id],
      );
      await invalid(blocked, "activation_preparation_incompatible");
    },
  );
  await check("Link/code de contas diferentes não se combinam", async () => {
    const first = await newPerson("binding.first"),
      second = await newPerson("binding.second");
    await invalid(
      { ...first, temporary_code: second.temporary_code },
      "activation_code_invalid",
    );
    assert((await verify(first)).proof);
    assert((await verify(second)).proof);
  });
  let partial;
  await check(
    "Falha Auth conserva reserva; retomada não duplica e conclui ativação",
    async () => {
      failCreate = true;
      await assert.rejects(newPerson("resume.failure"), (e) => {
        partial = e;
        return e.code === "provisioning_incomplete";
      });
      failCreate = false;
      const a = await account(partial.account_id),
        snap = await count();
      const next = await run("/access/resume", { id: a.id }, root());
      assert.equal((await account(a.id)).user_id, a.user_id);
      assert.deepEqual(await count(), { ...snap, users: snap.users + 1 });
      await activate(next);
      await assert.rejects(
        run("/access/resume", { id: a.id }, root()),
        /access_change_unavailable/,
      );
    },
  );
  const fixture = async (user, org, username, role = "colaborador_empresa") => {
    const id = randomUUID();
    await db.query(
      "insert into private.enterprise_accounts(id,user_id,organization_id,username,display_name,contact_email,role,state,requested_by,request_key,activated_at)values($1,$2,$3,$4,'Pessoa Fictícia',$5,$6,'active',$7,$8,now())",
      [
        id,
        user,
        org,
        username,
        user + "@example.invalid",
        role,
        users.root,
        randomUUID(),
      ],
    );
    return id;
  };
  const a = await fixture(users.adminA, orgs.A, "joao.silva", "admin_empresa"),
    b = await fixture(users.adminB, orgs.B, "joao.silva", "admin_empresa");
  for (const id of [users.adminA, users.adminB, users.worker, users.root]) {
    await db.query("update auth.users set email=$1 where id=$2", [
      id + "@example.invalid",
      id,
    ]);
    passwords.set(id, "Fictitious036Password!");
  }
  const wa = await fixture(users.worker, orgs.A, "multi.pessoa"),
    wb = await fixture(users.worker, orgs.B, "multi.pessoa");
  let one, multi;
  await check(
    "Username repetido em identidades diferentes não enumera empresas; e-mail resolve A/B",
    async () => {
      await assert.rejects(login("joao.silva"), /identity_context_required/);
      await assert.rejects(login("inexistente"), /identity_context_required/);
      one = await login(users.adminA + "@example.invalid");
      assert.equal(one.organization_id, orgs.A);
      assert.equal(one.contexts.companies.length, 1);
      const other = await login(users.adminB + "@example.invalid");
      assert.equal(other.organization_id, orgs.B);
    },
  );
  await check(
    "Mesma identidade em duas empresas usa username globalmente resolvido e seleção posterior",
    async () => {
      multi = await login("multi.pessoa");
      assert.equal(multi.organization_id, null);
      assert.equal(multi.contexts.companies.length, 2);
      for (const id of [wa, wb])
        assert(
          (
            await run(
              "/access/context",
              { account_id: id },
              { token: multi.session.access_token },
            )
          ).organization_id,
        );
    },
  );
  await check(
    "Contexto A não seleciona conta B nem lê gestão B; RLS mantém B fora da consulta",
    async () => {
      await assert.rejects(
        run(
          "/access/context",
          { account_id: b },
          { token: one.session.access_token },
        ),
        /access_denied/,
      );
      await assert.rejects(
        invoke("access_team", { p_org: orgs.B }, users.adminA),
        /access_denied|permission|scope/,
      );
      await db.exec("begin");
      await db.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({
          sub: users.adminA,
          session_id: sessions.get(users.adminA),
          is_anonymous: false,
        }),
      ]);
      await db.exec("set local role authenticated");
      assert.equal(
        (await db.query("select id from organizations where id=$1", [orgs.B]))
          .rows.length,
        0,
      );
      await db.exec("commit;reset role");
    },
  );
  await check(
    "Super Admin permanece no contexto global sem membership artificial",
    async () => {
      const snap = await count();
      const r = await login(users.root + "@example.invalid");
      assert(r.contexts.super_admin);
      assert(r.contexts.global);
      assert.equal(r.organization_id, null);
      assert.deepEqual(await count(), snap);
    },
  );
  await check(
    "Equipe SYZIA autenticada possui contexto global permitido",
    async () => {
      const staff = await newPerson("equipe.syzia", "syzia_staff");
      await activate(staff);
      const r = await login("equipe.syzia");
      assert(r.contexts.global);
      assert(!r.contexts.super_admin);
      assert(r.contexts.personal);
    },
  );
  await check(
    "Funções novas não têm EXECUTE para anon/authenticated e privado não é legível",
    async () => {
      for (const role of ["anon", "authenticated"]) {
        const rows = (
          await db.query(
            "select p.oid::regprocedure fn from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('access_verify_link','access_verify_legacy','access_finish_provision_link','access_reset_link','access_delivery_prepare_link') and has_function_privilege($1,p.oid,'execute')",
            [role],
          )
        ).rows;
        assert.equal(rows.length, 0);
        assert.equal(
          await c.scalar(
            "select has_table_privilege($1,'private.enterprise_accounts','select')",
            [role],
          ),
          false,
        );
      }
    },
  );
  await check(
    "Falha ao vincular hash faz rollback da reemissão inteira",
    async () => {
      const snapshot = await account(expId);
      await assert.rejects(
        invoke("access_reset_link", {
          p_id: expId,
          p_actor: users.root,
          p_hash: digest("NEW"),
          p_link_hash: "invalid",
        }),
        /access_invalid/,
      );
      assert.deepEqual(await account(expId), snapshot);
    },
  );
  await check(
    "Prova expirada exige nova validação do código ainda válido",
    async () => {
      const i = await newPerson("expired.proof"),
        g = await verify(i);
      await db.query(
        "update private.enterprise_accounts set proof_expires=now()-interval '1 second' where username='expired.proof'",
      );
      await assert.rejects(
        run("/access/activate", {
          proof: g.proof,
          password: "Fictitious036Password!",
          confirmation: "Fictitious036Password!",
        }),
        (e) => e.activation_reason === "activation_proof_invalid",
      );
      await activate(i);
    },
  );
  await check(
    "Reenvio opcional sem SMTP preserva entrega manual e rotaciona link/código atomicamente",
    async () => {
      const i = await run(
        "/access/provision",
        {
          company_name: "Empresa SMTP Fictícia",
          slug: "smtp-ficticia036",
          name: "Pessoa",
          surname: "Fictícia",
          username: "smtp.ficticia",
          email: "smtp036@example.invalid",
          request_key: randomUUID(),
        },
        root(),
      );
      const row = (
        await db.query(
          "select id from private.enterprise_accounts where username='smtp.ficticia'",
        )
      ).rows[0];
      const next = await run(
        "/access/resend",
        { id: row.id, organization_id: i.organization_id },
        root(),
      );
      assert.equal(next.delivery, "email_not_configured");
      assert(next.temporary_code);
      assert(next.activation_link);
      assert.notEqual(next.activation_link, i.activation_link);
      await invalid(i, "activation_link_invalid");
      assert((await verify(next)).proof);
      const snap = await account(row.id);
      await assert.rejects(
        run(
          "/access/resend",
          { id: row.id, organization_id: i.organization_id },
          root(),
        ),
        /delivery_cooldown/,
      );
      assert.deepEqual(await account(row.id), snap);
    },
  );
  await check(
    "Provas e eventos continuam no ciclo/auditoria existente",
    async () => {
      assert(
        (
          await db.query(
            "select count(*)::int n from audit_logs where action in('person_reserved','access_activated','access_reset','context_selected')",
          )
        ).rows[0].n > 0,
      );
    },
  );
} finally {
  await writeFile(
    "reports/syzia-036/sql.json",
    JSON.stringify(
      {
        environment:
          "PGlite local; RPCs reais, Auth simulado; não comprova concorrência PostgreSQL nativa",
        results,
      },
      null,
      2,
    ),
  );
  await db.close();
}

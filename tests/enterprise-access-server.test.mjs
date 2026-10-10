import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enterpriseAccess,
  digest,
  safeAccessError,
} from "../server/enterprise-access.mjs";
import { createPlatformServer } from "../server/platform.mjs";
const actor = "10000000-0000-0000-0000-000000000001",
  session = "20000000-0000-0000-0000-000000000001";
const jwt =
  "header." +
  Buffer.from(JSON.stringify({ sub: actor, session_id: session })).toString(
    "base64url",
  ) +
  ".signature";
function setup() {
  const calls = [],
    state = {
      lookup: {
        id: "account",
        user_id: actor,
        email: "internal@access.vireloq.invalid",
        generation: 2,
      },
      valid: true,
      register: true,
      proof: true,
      updateError: false,
    };
  const auth = {
    getUser: async () => ({
      data: { user: { id: actor, is_anonymous: false } },
    }),
    admin: {
      updateUserById: async (...args) => {
        calls.push(["password-update", ...args]);
        return state.updateError
          ? { error: { message: "private provider secret" } }
          : {};
      },
      getUserById: async () => ({ data: { user: null } }),
      createUser: async (attrs) => {
        calls.push(["create", attrs]);
        return {};
      },
    },
  };
  const service = async (name, args) => {
    calls.push([name, args]);
    if (name === "access_rate") return true;
    if (name === "access_lookup") return state.lookup;
    if (name === "access_register_session") return state.register;
    if (name === "access_verify_legacy")
      return state.proof ? { valid: true, reset: true } : null;
    if (name === "access_begin_activation")
      return state.proof
        ? { id: "account", user_id: actor, operation: "operation" }
        : null;
    if (name === "access_finish_activation") return args.p_success;
    if (name === "access_finish_provision_link" || name === "access_reset_link")
      return {
        company_code: "COMPANY",
        username: "pessoa.teste",
        expires_at: "2026-09-20",
      };
  };
  const asUser = async (token, name, args) => {
    calls.push([name, args, token]);
    if (name === "access_team") return { accounts: [{ id: "account" }] };
    return { id: "account", user_id: actor, state: "reserved" };
  };
  const signIn = async (c) => {
    calls.push(["signIn", c]);
    return state.valid
      ? {
          data: {
            user: { id: actor },
            session: { access_token: jwt, refresh_token: "refresh" },
          },
        }
      : { error: { message: "raw secret" } };
  };
  return {
    state,
    calls,
    auth,
    service,
    asUser,
    signIn,
    run: enterpriseAccess({ service, asUser, auth, signIn }),
  };
}
for (const field of ["company", "username", "password"])
  test("Falha de " + field + " usa o mesmo código público", async () => {
    const f = setup();
    if (field === "password") f.state.valid = false;
    else {
      f.state.lookup = null;
      f.state.proof = false;
    }
    await assert.rejects(
      () =>
        f.run("/access/login", {
          company_code: "A",
          username: "nome.sobrenome",
          password: "invalid",
        }),
      (e) => e.code === "access_denied",
    );
    assert(f.calls.some((c) => c[0] === "signIn"));
  });
test("Login só registra Auth verificado e devolve tokens próprios", async () => {
  const f = setup();
  const r = await f.run("/access/login", {
    company_code: "A",
    username: "nome.sobrenome",
    password: "secret",
    role: "super_admin",
  });
  assert.deepEqual(Object.keys(r.session).sort(), [
    "access_token",
    "refresh_token",
  ]);
  const p = f.calls.find((c) => c[0] === "access_register_session")[1];
  assert.equal(p.p_user, actor);
  assert.equal(p.p_account, "account");
  assert.equal(p.p_generation, 2);
});
test("Falha de registro pós-Auth nega sessão", async () => {
  const f = setup();
  f.state.register = false;
  await assert.rejects(
    () =>
      f.run("/access/login", {
        company_code: "A",
        username: "nome.sobrenome",
        password: "secret",
      }),
    (e) => e.code === "access_denied",
  );
});
test("Código e prova persistem somente em hash", async () => {
  const f = setup();
  const r = await f.run("/access/verify", {
    company_code: "A",
    username: "nome.sobrenome",
    code: "ABCD-1234",
  });
  const args = f.calls.find((c) => c[0] === "access_verify_legacy")[1];
  assert.equal(args.p_hash, digest("ABCD1234"));
  assert.equal(args.p_proof, digest(r.proof));
  assert.equal(r.reset, true);
  assert(r.proof.length >= 40);
});
test("Código inválido não fornece prova", async () => {
  const f = setup();
  f.state.proof = false;
  await assert.rejects(
    () => f.run("/access/verify", { code: "wrong" }),
    (e) => e.code === "activation_invalid",
  );
});
test("Senha divergente não consome prova", async () => {
  const f = setup();
  await assert.rejects(() =>
    f.run("/access/activate", {
      proof: "secret",
      password: "123456789012",
      confirmation: "other",
    }),
  );
  assert(!f.calls.some((c) => c[0] === "access_begin_activation"));
});
test("Ativação usa ID do banco e nunca papel/org do navegador", async () => {
  const f = setup();
  assert(
    (
      await f.run("/access/activate", {
        proof: "secret",
        password: "123456789012",
        confirmation: "123456789012",
        user_id: "victim",
        role: "super_admin",
      })
    ).activated,
  );
  assert.equal(f.calls.find((c) => c[0] === "password-update")[1], actor);
});
test("Falha incerta de Auth não declara ativação", async () => {
  const f = setup();
  f.state.updateError = true;
  await assert.rejects(
    () =>
      f.run("/access/activate", {
        proof: "secret",
        password: "123456789012",
        confirmation: "123456789012",
      }),
    (e) => e.code === "activation_uncertain",
  );
  assert.equal(
    f.calls.find((c) => c[0] === "access_finish_activation")[1].p_success,
    false,
  );
});
test("Provisionamento usa alias imprevisível e não depende de SMTP", async () => {
  const f = setup();
  await f.run(
    "/access/provision",
    {
      organization_id: "org",
      role: "colaborador_empresa",
      name: "Pessoa",
      surname: "Teste",
      username: "pessoa.teste",
      request_key: "key",
    },
    { token: "actor" },
  );
  const a = f.calls.find((c) => c[0] === "create")[1];
  assert.match(a.email, /^[a-f0-9]{64}@access\.vireloq\.invalid$/);
  assert.equal(a.id, actor);
  assert(a.password.length > 64);
  assert(!f.calls.some((c) => /invite|recovery/i.test(c[0])));
});
test("Reset exige token e lista autorizada da empresa", async () => {
  const f = setup();
  await assert.rejects(
    () => f.run("/access/reset", { id: "account", organization_id: "org" }),
    (e) => e.code === "access_denied",
  );
  await assert.rejects(
    () =>
      f.run(
        "/access/reset",
        { id: "foreign", organization_id: "org" },
        { token: "actor" },
      ),
    (e) => e.code === "access_denied",
  );
});
test("Reset devolve código forte uma vez e só grava seu hash", async () => {
  const f = setup();
  const a = await f.run(
    "/access/reset",
    { id: "account", organization_id: "org" },
    { token: "actor" },
  );
  assert.match(a.temporary_code, /^([A-F0-9]{4}-){7}[A-F0-9]{4}$/);
  assert.equal(
    f.calls.find((c) => c[0] === "access_reset_link")[1].p_hash,
    digest(a.temporary_code.replaceAll("-", "")),
  );
});
test("Erros desconhecidos não expõem mensagem do provedor", () => {
  assert.deepEqual(
    safeAccessError({ message: "service_role secret", code: "unexpected" }),
    { code: "access_unavailable", status: 503 },
  );
});
test("Limite persistente encerra operação antes de Auth", async () => {
  const f = setup();
  const run = enterpriseAccess({ ...f, service: async () => false });
  await assert.rejects(
    () => run("/access/login", {}),
    (e) => e.code === "access_rate_limited",
  );
  assert(!f.calls.some((c) => c[0] === "signIn"));
});
test("HTTP protege origem, desativa convite antigo e sanitiza erro/log", async () => {
  const logs = [],
    s = createPlatformServer({
      origin: "http://127.0.0.1:5173",
      access: async () => {
        throw Error("secret-provider");
      },
      log: (x) => logs.push(x),
    });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  try {
    const url = "http://127.0.0.1:" + s.address().port;
    assert.equal(
      (
        await fetch(url + "/access/login", {
          method: "POST",
          headers: { origin: "https://evil.invalid" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(url + "/invitations/send", {
          method: "POST",
          headers: { origin: "http://127.0.0.1:5173" },
        })
      ).status,
      404,
    );
    const r = await fetch(url + "/access/login", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:5173",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal((await r.json()).error, "access_unavailable");
    assert(!JSON.stringify(logs).includes("secret-provider"));
  } finally {
    await new Promise((r) => s.close(r));
  }
});
test("Alteração Auth tardia de operação anterior não autentica senha obsoleta", async () => {
  const f = setup();
  f.state.lookup.operation = "new-operation";
  f.auth.getUser = async () => ({
    data: {
      user: {
        id: actor,
        app_metadata: { vireloq_password_operation: "old-operation" },
      },
    },
  });
  await assert.rejects(
    () =>
      f.run("/access/login", {
        company_code: "A",
        username: "nome.sobrenome",
        password: "old-but-auth-accepted",
      }),
    (e) => e.code === "access_denied",
  );
  assert(!f.calls.some((c) => c[0] === "access_register_session"));
});

test("Retomar preparação reutiliza Auth existente e não envia email", async () => {
  const f = setup();
  f.auth.admin.getUserById = async () => ({
    data: { user: { id: actor, email_confirmed_at: "2026-09-19T00:00:00Z" } },
  });
  const result = await f.run(
    "/access/resume",
    { id: "account" },
    { token: "actor" },
  );
  assert(result.temporary_code);
  assert(f.calls.some((c) => c[0] === "access_resume"));
  assert(!f.calls.some((c) => c[0] === "create"));
  assert.equal(
    f.calls.find((c) => c[0] === "access_finish_provision_link")[1].p_id,
    "account",
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  enterpriseAccess,
  authDiagnostic,
} from "../server/enterprise-access.mjs";
import { createPlatformServer } from "../server/platform.mjs";
const user = randomUUID(),
  session = randomUUID(),
  personal = { id: randomUUID(), generation: 1 };
const token =
  "x." +
  Buffer.from(JSON.stringify({ sub: user, session_id: session })).toString(
    "base64url",
  ) +
  ".x";
function fixture(contexts) {
  const calls = [],
    state = {
      exists: false,
      operation: null,
      verifiedOperation: null,
      lookup: true,
    };
  const service = async (name, args) => {
    calls.push([name, args]);
    if (name === "access_rate") return true;
    if (name === "access_identity_lookup")
      return state.lookup
        ? {
            user_id: user,
            email: "fixture@example.invalid",
            operation: state.operation,
          }
        : null;
    if (name === "access_identity_contexts") return contexts;
    if (name === "access_register_session") return true;
    if (name === "access_identity_exists") return state.exists;
    if (name === "access_select_context")
      return { organization_id: "authorized" };
    if (name === "selfservice_payment_bind") return { simulation: true };
    if (name === "acquisition_lead_submit") return { received: true };
    throw Error("Unexpected " + name);
  };
  const auth = {
    getUser: async () => ({
      data: {
        user: {
          id: user,
          is_anonymous: false,
          app_metadata: { vireloq_password_operation: state.verifiedOperation },
        },
      },
    }),
  };
  const signIn = async (args) => {
    calls.push(["signIn", args]);
    return {
      data: {
        session: { access_token: token, refresh_token: "fixture-refresh" },
        user: { id: user },
      },
    };
  };
  const signUp = async (args) => {
    calls.push(["signUp", args]);
    return { data: { session: null } };
  };
  const asUser = async (t, name) => {
    calls.push([name, t]);
    return name === "selfservice_context"
      ? { id: "own-draft", revision: 1 }
      : {};
  };
  return {
    calls,
    state,
    service,
    auth,
    signIn,
    signUp,
    asUser,
    run: enterpriseAccess({ service, auth, signIn, signUp, asUser }),
  };
}
for (const [name, ctx, expected] of [
  [
    "one company",
    {
      global: false,
      companies: [{ id: "one", organization_id: "org-one", generation: 2 }],
    },
    "one",
  ],
  [
    "multiple companies",
    { global: false, companies: [{ id: "one" }, { id: "two" }] },
    null,
  ],
  ["SYZIA staff", { global: true, personal, companies: [] }, personal.id],
  ["Super Admin", { global: true, super_admin: true, companies: [] }, null],
])
  test(
    "Identity login chooses authorized initial context: " + name,
    async () => {
      const f = fixture(ctx),
        r = await f.run("/access/identity-login", {
          identifier: "person@example.invalid",
          password: "FictitiousPassword123!",
          account_id: "forged",
        });
      assert.equal(
        f.calls.find((x) => x[0] === "access_register_session")[1].p_account,
        expected,
      );
      assert.equal(r.contexts, ctx);
      assert.equal(r.session.access_token, token);
    },
  );
test("Ambiguous username requires company context and still performs dummy authentication", async () => {
  const f = fixture({});
  f.state.lookup = false;
  await assert.rejects(
    f.run("/access/identity-login", {
      identifier: "same.username",
      password: "fictional",
    }),
    (e) => e.code === "identity_context_required",
  );
  assert.ok(f.calls.some((x) => x[0] === "signIn"));
  assert.ok(!f.calls.some((x) => x[0] === "access_register_session"));
});
test("Login preserves password-operation verification and rejects stale Auth metadata", async () => {
  const f = fixture({ global: false, personal, companies: [] });
  f.state.operation = randomUUID();
  await assert.rejects(
    f.run("/access/identity-login", {
      identifier: "person@example.invalid",
      password: "fictional",
    }),
    (e) => e.code === "access_denied",
  );
  f.state.verifiedOperation = f.state.operation;
  await f.run("/access/identity-login", {
    identifier: "person@example.invalid",
    password: "fictional",
  });
});
test("Existing e-mail never creates another Auth identity; signup uses the owner password and captcha", async () => {
  const f = fixture({}),
    b = {
      email: "own@example.invalid",
      name: "Pessoa Fictícia",
      username: "pessoa.ficticia",
      password: "FictitiousPassword033!",
      confirmation: "FictitiousPassword033!",
      captcha: "test-captcha",
    };
  f.state.exists = true;
  await assert.rejects(
    f.run("/access/signup", b),
    (e) => e.code === "existing_identity_requires_login",
  );
  assert.ok(!f.calls.some((x) => x[0] === "signUp"));
  f.state.exists = false;
  assert.deepEqual(await f.run("/access/signup", b), {
    confirmation_required: true,
  });
  const a = f.calls.find((x) => x[0] === "signUp")[1];
  assert.equal(a.password, b.password);
  assert.equal(a.options.captchaToken, b.captcha);
});
test("Browser-supplied payment claims cannot activate or bind a payment method", async () => {
  const f = fixture({});
  await assert.rejects(
    f.run(
      "/access/selfservice-payment",
      {
        id: "own-draft",
        revision: 1,
        valid: true,
        provider: "mock",
        reference: "untrusted",
      },
      { token },
    ),
    (e) => e.code === "billing_provider_not_configured",
  );
  assert.ok(!f.calls.some((x) => x[0] === "selfservice_payment_bind"));
  const run = enterpriseAccess({
    ...f,
    paymentAdapter: {
      mode: "test",
      name: "mock",
      validateMethod: async () => ({
        valid: true,
        reference: "server-only-reference",
      }),
    },
  });
  assert.equal(
    (
      await run(
        "/access/selfservice-payment",
        { id: "own-draft", revision: 1 },
        { token },
      )
    ).simulation,
    true,
  );
  assert.equal(
    f.calls.find((x) => x[0] === "selfservice_payment_bind")[1].p_reference,
    "server-only-reference",
  );
});
test("Contact sends only a lead command, without creating identities, organizations or trial", async () => {
  const f = fixture({});
  await f.run("/access/contact", {
    request_key: randomUUID(),
    name: "Pessoa Teste",
    company: "Empresa Teste",
    email: "lead@example.invalid",
    phone: "11999999999",
    interest: "Teste",
  });
  assert.deepEqual(
    f.calls.map((x) => x[0]),
    ["access_rate", "access_rate", "acquisition_lead_submit"],
  );
});
test("Auth diagnostics and request correlation expose safe stage/status/reason only; health is origin-bound", async () => {
  const logs = [],
    app = createPlatformServer({
      origin: "http://localhost:5173",
      access: async () => {
        throw Object.assign(Error("raw secret password"), {
          code: "provisioning_incomplete",
          stage: "auth_identity",
          diagnostic: {
            code: "not_admin",
            status: 403,
            message: "service_role private",
          },
        });
      },
      log: (x) => logs.push(x),
    });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.address().port;
  try {
    const response = await fetch(base + "/access/resume", {
        method: "POST",
        headers: {
          Origin: "http://localhost:5173",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
      body = await response.json();
    assert.equal(body.stage, "auth_identity");
    assert.equal(logs[0].request_id, body.request_id);
    assert.equal(logs[0].category, "auth_credentials");
    assert.equal(logs[0].reason, "not_admin");
    assert.equal(logs[0].status, 403);
    assert.doesNotMatch(
      JSON.stringify({ body, logs }),
      /service_role|private|password/,
    );
    assert.equal(
      (
        await fetch(base + "/health", {
          headers: { Origin: "http://localhost:5173" },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(base + "/health", {
          headers: { Origin: "https://wrong.invalid" },
        })
      ).status,
      403,
    );
    assert.equal(
      authDiagnostic({ code: "secret-code", message: "secret" }).reason,
      "auth_provider_unclassified",
    );
  } finally {
    await new Promise((r) => app.close(r));
  }
});

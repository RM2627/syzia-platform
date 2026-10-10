import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  enterpriseAccess,
  authDiagnostic,
  safeAccessError,
} from "../server/enterprise-access.mjs";
import { createPlatformServer } from "../server/platform.mjs";

const listen = async (server) => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return "http://127.0.0.1:" + server.address().port;
};
const close = (server) => new Promise((resolve) => server.close(resolve));
// Actual Supabase JS SDK over loopback HTTP. This fixture models the provider's
// documented bcrypt boundary; it is NOT a live Supabase/Auth homologation.
async function fixture(t) {
  const actor = randomUUID(),
    id = randomUUID(),
    userId = randomUUID();
  const state = {
    phase: "reserved",
    users: new Map(),
    password: "",
    created: 0,
    finished: 0,
    expired: false,
    authExpired: false,
    failure: null,
    calls: [],
    hash: null,
  };
  const provider = http.createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    const body = raw ? JSON.parse(raw) : {};
    const send = (status, payload) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "X-Supabase-Api-Version": "2024-01-01",
      });
      res.end(JSON.stringify(payload));
    };
    const requested = req.url.split("/").at(-1);
    if (req.method === "GET") {
      const user = state.users.get(requested);
      send(
        user ? 200 : 404,
        user || { code: "user_not_found", msg: "User not found" },
      );
    } else if (req.method === "POST") {
      state.password = body.password;
      if (state.failure)
        return send(state.failure.status, {
          code: state.failure.code,
          msg: "PRIVATE_PASSWORD_TOKEN_EMAIL",
        });
      if (Buffer.byteLength(body.password) > 72)
        return send(400, {
          code: "validation_failed",
          msg: "Password cannot be longer than 72 characters",
        });
      if (
        !/[a-z]/.test(body.password) ||
        !/[A-Z]/.test(body.password) ||
        !/[0-9]/.test(body.password) ||
        !/[^a-zA-Z0-9]/.test(body.password)
      )
        return send(422, { code: "weak_password", msg: "Password policy" });
      if (state.users.has(body.id))
        return send(422, { code: "user_already_exists", msg: "Existing user" });
      const user = {
        id: body.id,
        email: body.email,
        email_confirmed_at: new Date().toISOString(),
        app_metadata: body.app_metadata,
      };
      state.users.set(body.id, user);
      state.created++;
      send(200, user);
    } else if (req.method === "PUT") {
      const user = state.users.get(requested);
      if (state.failure)
        return send(state.failure.status, {
          code: state.failure.code,
          msg: "PRIVATE_PASSWORD_TOKEN_EMAIL",
        });
      assert(user);
      Object.assign(user, body, {
        email_confirmed_at: new Date().toISOString(),
      });
      send(200, user);
    } else send(404, {});
  });
  const url = await listen(provider);
  t.after(() => close(provider));
  const client = createClient(url, "fictional-service-key", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const auth = {
    admin: client.auth.admin,
    getUser: async () =>
      state.authExpired
        ? { error: { code: "session_expired", status: 401 } }
        : { data: { user: { id: actor, is_anonymous: false } } },
  };
  const asUser = async (token, name) => {
    state.calls.push(name);
    if (state.expired)
      throw Object.assign(Error("session_expired"), { code: "42501" });
    if (name === "people_directory")
      return [{ account_id: id, name: "Pessoa Exemplo" }];
    if (name === "access_team")
      return { accounts: [{ id, name: "Pessoa Exemplo" }] };
    if (state.phase !== "reserved") throw Error("access_change_unavailable");
    return { id, user_id: userId, state: state.phase, organization_id: null };
  };
  const service = async (name, args) => {
    if (name === "access_rate") return true;
    state.calls.push(name);
    if (
      ["access_finish_provision", "access_finish_provision_link"].includes(name)
    ) {
      // The actual SQL uses transaction locks plus a reserved-state guard.
      if (state.phase !== "reserved") throw Error("access_denied");
      assert(state.users.has(userId));
      state.finished++;
      state.phase = "pending";
      state.hash = args.p_hash;
      return {
        company_code: "SYZIA",
        username: "pessoa.exemplo",
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      };
    }
    throw Error("Unexpected service: " + name);
  };
  return {
    state,
    id,
    userId,
    auth,
    service,
    asUser,
    run: enterpriseAccess({ auth, service, asUser }),
  };
}

test("035: regra real documentada rejeita a credencial legada de 86 bytes via SDK/HTTP", async (t) => {
  const f = await fixture(t);
  const password =
    randomBytes(32).toString("base64url") +
    randomBytes(32).toString("base64url");
  assert.equal(Buffer.byteLength(password), 86);
  const r = await f.auth.admin.createUser({
    id: f.userId,
    email: "internal@example.invalid",
    password,
    email_confirm: true,
  });
  assert.equal(r.error.status, 400);
  assert.equal(r.error.code, "validation_failed");
  assert.equal(f.state.created, 0);
});
for (const path of ["/access/person", "/access/resume", "/access/provision"])
  test(
    "035: credencial interna compatível, retorno manual preservado: " + path,
    async (t) => {
      const f = await fixture(t);
      const r = await f.run(
        path,
        {
          id: f.id,
          organization_id: randomUUID(),
          role: "colaborador_empresa",
        },
        { token: "authorized" },
      );
      assert.equal(Buffer.byteLength(f.state.password), 68);
      assert.equal(f.state.created, 1);
      assert.equal(f.state.finished, 1);
      assert.equal(r.username, "pessoa.exemplo");
      assert.equal(r.delivery, "manual");
      assert(r.temporary_code);
      assert(!JSON.stringify(r).includes(f.state.password));
      assert.equal(f.state.users.size, 1);
    },
  );

for (const [status, code] of [
  [400, "validation_failed"],
  [422, "weak_password"],
  [422, "email_exists"],
  [401, "bad_jwt"],
  [403, "not_admin"],
  [429, "over_request_rate_limit"],
  [500, "unexpected_failure"],
])
  test(`035: provider ${status}/${code}, log seguro e retomada da mesma reserva`, async (t) => {
    const f = await fixture(t),
      logs = [];
    f.state.failure = { status, code };
    const platform = createPlatformServer({
      origin: "http://127.0.0.1:5173",
      access: f.run,
      log: (e) => logs.push(e),
    });
    const base = await listen(platform);
    t.after(() => close(platform));
    const response = await fetch(base + "/access/resume", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:5173",
        Authorization: "Bearer authorized",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: f.id }),
    });
    const body = await response.json();
    assert.equal(body.error, "provisioning_incomplete");
    assert.equal(body.stage, "auth_identity");
    assert.equal(body.account_id, f.id);
    assert.equal(body.temporary_code, undefined);
    // The SDK intentionally discards structured codes for retryable HTTP 5xx.
    assert.equal(
      logs[0].reason,
      status >= 500 ? "auth_provider_unclassified" : code,
    );
    assert.equal(logs[0].status, status);
    assert.equal(logs[0].request_id, body.request_id);
    const output = JSON.stringify({ body, logs });
    for (const secret of [
      "PRIVATE_PASSWORD_TOKEN_EMAIL",
      "fictional-service-key",
      f.state.password,
      "internal@example.invalid",
    ])
      assert(!output.includes(secret));
    assert.equal(f.state.phase, "reserved");
    assert.equal(f.state.hash, null);
    f.state.failure = null;
    const r = await f.run(
      "/access/resume",
      { id: f.id },
      { token: "authorized" },
    );
    assert(r.temporary_code);
    assert.equal(f.state.created, 1);
    assert(f.state.users.has(f.userId));
  });
test("035: código desconhecido nunca expõe texto ou resposta bruta", () => {
  assert.equal(
    authDiagnostic({ code: "PRIVATE_SECRET", status: 400, message: "secret" })
      .reason,
    "auth_provider_unclassified",
  );
  assert(
    !JSON.stringify(
      safeAccessError({
        code: "provisioning_incomplete",
        diagnostic: { code: "PRIVATE_SECRET", status: 400, message: "secret" },
      }),
    ).includes("PRIVATE_SECRET"),
  );
});
for (const confirmed of [true, false])
  test(
    "035: reutiliza Auth existente " +
      (confirmed ? "confirmado" : "pendente de confirmação"),
    async (t) => {
      const f = await fixture(t);
      f.state.users.set(f.userId, {
        id: f.userId,
        email: "reserved@example.invalid",
        email_confirmed_at: confirmed ? "2026-09-24T00:00:00Z" : null,
      });
      const r = await f.run(
        "/access/resume",
        { id: f.id },
        { token: "authorized" },
      );
      assert(r.temporary_code);
      assert.equal(f.state.created, 0);
      assert.equal(f.state.users.size, 1);
    },
  );
for (const layer of ["expired", "authExpired"])
  test(
    "035: sessão expirada em " +
      layer +
      " bloqueia e permite retomar após autenticação",
    async (t) => {
      const f = await fixture(t);
      f.state[layer] = true;
      await assert.rejects(
        f.run("/access/resume", { id: f.id }, { token: "expired" }),
        /session_expired/,
      );
      assert.equal(f.state.created, 0);
      assert.equal(f.state.finished, 0);
      assert.equal(f.state.phase, "reserved");
      f.state[layer] = false;
      assert(
        (
          await f.run(
            "/access/resume",
            { id: f.id },
            { token: "reauthenticated" },
          )
        ).temporary_code,
      );
      assert.equal(f.state.created, 1);
      assert.equal(f.state.users.size, 1);
    },
  );
test("035: retomadas concorrentes, uma identidade e uma credencial válida", async (t) => {
  const f = await fixture(t);
  const results = await Promise.allSettled(
    Array.from({ length: 4 }, () =>
      f.run("/access/resume", { id: f.id }, { token: "authorized" }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(f.state.created, 1);
  assert.equal(f.state.finished, 1);
  assert.equal(f.state.users.size, 1);
  await assert.rejects(
    f.run("/access/resume", { id: f.id }, { token: "authorized" }),
    /access_change_unavailable/,
  );
});

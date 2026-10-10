import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import {
  enterpriseAccess,
  safeAccessError,
  digest,
} from "../server/enterprise-access.mjs";
import {
  createAccessMailer,
  instructionMessage,
} from "../server/access-mail.mjs";
const actor = randomUUID(),
  org = randomUUID(),
  id = randomUUID(),
  userId = randomUUID();
function setup() {
  const state = {
      reserved: 0,
      created: 0,
      finished: 0,
      sent: 0,
      code: null,
      user: null,
      phase: "reserved",
      failure: null,
      proof: false,
    },
    calls = [];
  const details = {
    company_name: "Empresa Fictícia",
    company_code: "ABCDEF123456",
    username: "ana.silva",
    expires_at: "2026-09-25T12:00:00Z",
    organization_id: org,
    administrator_name: "Ana Silva",
  };
  const auth = {
    getUser: async () => ({ data: { user: { id: actor } } }),
    admin: {
      getUserById: async () =>
        state.failure === "lookup"
          ? { error: { status: 503, message: "provider secret" } }
          : {
              data: { user: state.user },
              error: state.user
                ? null
                : { status: 404, code: "user_not_found" },
            },
      createUser: async (attrs) => {
        state.created++;
        if (state.failure === "create")
          return { error: { message: "private detail" } };
        state.user = {
          id: attrs.id,
          email_confirmed_at: "2026-09-20T00:00:00Z",
        };
        return { data: { user: state.user } };
      },
      updateUserById: async () => ({}),
    },
  };
  const service = async (name, args) => {
    calls.push([name, args]);
    if (name === "access_rate") return true;
    if (name === "access_lookup") return null;
    if (name === "access_verify_legacy")
      return state.proof ? { valid: true, reset: false } : null;
    if (name === "access_finish_provision_link") {
      if (state.failure === "finalize") throw Error("database private detail");
      state.finished++;
      state.phase = "pending";
      state.code = args.p_hash;
      return details;
    }
    if (name === "access_delivery_prepare_link") {
      if (state.failure === "cooldown") throw Error("delivery_cooldown");
      if (state.failure === "rate") throw Error("delivery_rate_limited");
      state.code = args.p_hash;
      return {
        ...details,
        email: "ana@example.invalid",
        attempt_id: randomUUID(),
      };
    }
    if (name === "access_delivery_finish") {
      if (state.failure === "record") throw Error("db timeout");
      return true;
    }
  };
  const asUser = async (token, name, args) => {
    calls.push([name, args]);
    if (token !== "valid") throw Error("access_denied");
    if (name === "access_team")
      return {
        accounts: [
          { id, role: "admin_empresa", state: state.phase, name: "Ana Silva" },
        ],
      };
    state.reserved++;
    return { id, user_id: userId, organization_id: org, state: state.phase };
  };
  const sendInstructions = async (payload) => {
    state.sent++;
    if (state.failure === "smtp")
      throw Object.assign(Error("server credentials"), { code: "EAUTH" });
    if (state.failure === "smtp_rate") throw { responseCode: 451 };
    if (state.failure === "smtp_timeout") throw { code: "ETIMEDOUT" };
    state.envelope = payload;
  };
  const signIn = async () => ({ error: { message: "invalid" } });
  const run = enterpriseAccess({
    auth,
    service,
    asUser,
    signIn,
    sendInstructions,
  });
  const body = {
    company_name: "Empresa Fictícia",
    slug: "empresa-ficticia",
    name: "Ana",
    surname: "Silva",
    username: "ana.silva",
    email: "ana@example.invalid",
    request_key: randomUUID(),
  };
  return {
    state,
    calls,
    run,
    body,
    auth,
    service,
    asUser,
    signIn,
    sendInstructions,
  };
}
test("Complete provisioning returns manual instructions after Auth and membership preparation", async () => {
  const f = setup(),
    r = await f.run("/access/provision", f.body, { token: "valid" });
  assert.equal(r.delivery, "manual");
  assert.equal(f.state.created, 1);
  assert.equal(f.state.finished, 1);
  assert.equal(f.state.sent, 0);
  assert.equal(r.organization_id, org);
  assert.equal(f.state.envelope, undefined);
  assert.equal(f.state.code, digest(r.temporary_code.replaceAll("-", "")));
  assert(!("email" in r));
  assert(!("attempt_id" in r));
});
for (const failure of ["create", "lookup", "finalize"])
  test(
    "Recover partial failure " +
      failure +
      " without duplicating reserved identity",
    async () => {
      const f = setup();
      f.state.failure = failure;
      let err;
      try {
        await f.run("/access/provision", f.body, { token: "valid" });
      } catch (e) {
        err = e;
      }
      assert(err);
      assert.equal(err.organization_id, org);
      assert.equal(err.account_id, id);
      assert.equal(
        safeAccessError(err).stage,
        failure === "finalize" ? "finalize" : "auth_identity",
      );
      if (failure === "lookup") assert.equal(f.state.created, 0);
      const previous = f.state.user;
      f.state.failure = null;
      const result = await f.run("/access/resume", { id }, { token: "valid" });
      assert(result.temporary_code);
      assert.equal(f.state.user.id, userId);
      if (previous) assert.equal(f.state.user, previous);
    },
  );
for (const [failure, result] of [
  ["smtp", "email_delivery_failed"],
  ["smtp_rate", "email_rate_limited"],
  ["smtp_timeout", "email_temporary_failure"],
  ["record", "delivery_status_unknown"],
])
  test(
    "Delivery " +
      failure +
      " preserves complete account and copyable instructions",
    async () => {
      const f = setup();
      await f.run("/access/provision", f.body, { token: "valid" });
      f.state.failure = failure;
      const r = await f.run(
        "/access/resend",
        { id, organization_id: org },
        { token: "valid" },
      );
      assert.equal(r.delivery, result);
      assert(r.temporary_code);
      assert.equal(f.state.phase, "pending");
      assert.equal(f.state.user.id, userId);
    },
  );
test("Already completed request identifies existing company instead of provisioning again", async () => {
  const f = setup();
  await f.run("/access/provision", f.body, { token: "valid" });
  await assert.rejects(
    () => f.run("/access/provision", f.body, { token: "valid" }),
    (e) => e.code === "access_already_provisioned" && e.organization_id === org,
  );
  assert.equal(f.state.created, 1);
  assert.equal(f.state.finished, 1);
});
test("Resend rotates code and uses only server-authorized recipient", async () => {
  const f = setup();
  const a = await f.run("/access/provision", f.body, { token: "valid" });
  const b = await f.run(
    "/access/resend",
    { organization_id: org, id, email: "attacker@example.invalid" },
    { token: "valid" },
  );
  assert.notEqual(a.temporary_code, b.temporary_code);
  assert.equal(f.state.envelope.email, "ana@example.invalid");
  assert.equal(f.state.code, digest(b.temporary_code.replaceAll("-", "")));
  assert.equal(f.state.created, 1);
});
for (const [failure, code] of [
  ["cooldown", "delivery_cooldown"],
  ["rate", "delivery_rate_limited"],
])
  test("Resend " + failure + " keeps last issued code", async () => {
    const f = setup();
    await f.run("/access/provision", f.body, { token: "valid" });
    const hash = f.state.code;
    f.state.failure = failure;
    await assert.rejects(
      () =>
        f.run(
          "/access/resend",
          { id, organization_id: org },
          { token: "valid" },
        ),
      (e) => e.message === code,
    );
    assert.equal(f.state.code, hash);
    assert.equal(f.state.sent, 0);
  });
test("Unified login opens password step only after valid temporary secret", async () => {
  const f = setup();
  await assert.rejects(
    () =>
      f.run("/access/login", {
        company_code: "CODE",
        username: "unknown",
        password: "invalid",
      }),
    (e) => e.code === "access_denied",
  );
  f.state.proof = true;
  const result = await f.run("/access/login", {
    company_code: "CODE",
    activation_link: "a".repeat(43),
    username: "ana.silva",
    password: "temporary",
  });
  assert(result.activation.proof);
  assert(!result.session);
  assert.equal(f.state.created, 0);
});
test("Unknown Auth provider error is safely classified without raw messages", () => {
  assert.deepEqual(safeAccessError({ message: "private SMTP credentials" }), {
    code: "access_unavailable",
    status: 503,
  });
  assert.equal(
    safeAccessError({ code: "23505", message: "unique organizations_slug_key" })
      .code,
    "slug_conflict",
  );
});
test("SMTP is disabled by default, does not open connections, and cannot make provisioning fail", async () => {
  let n = 0;
  const mail = createAccessMailer({}, () => {
    n++;
  });
  await assert.rejects(
    () => mail({}),
    (e) => e.code === "email_not_configured",
  );
  assert.equal(n, 0);
});
test("SMTP configuration enforces TLS, validates certificates and never logs message contents", async () => {
  let options, payload;
  const mail = createAccessMailer(
    {
      ACCESS_MAIL_ENABLED: "true",
      ACCESS_SMTP_HOST: "smtp.example.invalid",
      ACCESS_SMTP_USER: "fictional",
      ACCESS_SMTP_PASSWORD: "fictional",
      ACCESS_MAIL_FROM: "platform@example.invalid",
      PLATFORM_APP_ORIGIN: "http://127.0.0.1:5173",
    },
    (o) => {
      options = o;
      return {
        sendMail: async (p) => {
          payload = p;
          return { accepted: ["ana@example.invalid"], rejected: [] };
        },
      };
    },
  );
  await mail({
    email: "ana@example.invalid",
    company_name: "Empresa Fictícia",
    company_code: "CODE",
    activation_link: "a".repeat(43),
    username: "ana.silva",
    temporary_code: "FAKE-TEST",
    expires_at: "2026-09-25T12:00:00Z",
  });
  assert(options.requireTLS);
  assert(options.tls.rejectUnauthorized);
  assert.equal(options.logger, false);
  assert.equal(options.debug, false);
  assert(options.disableFileAccess && options.disableUrlAccess);
  assert(payload.text.includes("/ativar-acesso#access="));
  assert(!payload.text.includes("?token="));
  assert.equal(payload.subject, "SYZIA — suas instruções de primeiro acesso");
});
test("Nodemailer serializes the actual instructions locally without SMTP or external delivery", async () => {
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
  });
  const msg = instructionMessage(
    {
      email: "ana@example.invalid",
      company_name: "Empresa Fictícia",
      company_code: "CODE",
      activation_link: "a".repeat(43),
      username: "ana.silva",
      temporary_code: "FAKE-TEST",
      expires_at: "2026-09-25T12:00:00Z",
    },
    "https://app.example.invalid",
  );
  const result = await transport.sendMail({
    ...msg,
    from: "platform@example.invalid",
  });
  assert(Buffer.isBuffer(result.message));
  assert(result.message.toString().includes("ana@example.invalid"));
});
test("Recipient cannot inject additional addresses or message headers", () => {
  for (const email of [
    "a@example.invalid,b@example.invalid",
    "a@example.invalid\r\nBcc: b@example.invalid",
    "Name <a@example.invalid>",
  ])
    assert.throws(() =>
      instructionMessage({ email }, "https://app.example.invalid"),
    );
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { academyMailer, message } from "../../server/academy/mail.mjs";
import { safeDiagnostic } from "../../server/academy/mail-diagnostics.mjs";
import { academyMailReady } from "../../server/academy/mail-config.mjs";
import { env, messageValue, fakeHttps, acceptedId } from "./fake-https.mjs";
const noSMTP = () => {
  throw Error("Unexpected SMTP");
};
test("068 HTTPS accepted, CID/base64 identity, UTF-8, exact content and stable idempotency", async () => {
  const f = fakeHttps();
  const send = academyMailer(env, noSMTP, f.options);
  const r = await send(messageValue);
  await send(messageValue);
  assert.equal(r.accepted, true);
  assert.equal(r.diagnostic.transport, "https_resend");
  assert.equal(r.diagnostic.provider_id, acceptedId);
  assert.equal(r.diagnostic.http_status, 200);
  for (const call of f.calls) {
    assert.equal(call.url, "https://api.resend.com/emails");
    assert.equal(call.options.port, 443);
    assert.equal(call.options.method, "POST");
    assert.equal(call.options.rejectUnauthorized, true);
    assert.equal(call.options.minVersion, "TLSv1.2");
    assert.equal(call.options.agent, false);
    assert.equal(
      call.options.headers.Authorization,
      "Bearer " + env.ACADEMY_RESEND_API_KEY,
    );
    assert.equal(
      call.options.headers["Idempotency-Key"],
      "commercial/" + messageValue.delivery_id,
    );
    assert.equal(call.writes.length, 1);
    const payload = JSON.parse(call.writes[0]),
      source = message(messageValue);
    assert.equal(payload.from, env.ACCESS_MAIL_FROM);
    assert.deepEqual(payload.to, [messageValue.email]);
    for (const field of ["subject", "text", "html"])
      assert.equal(payload[field], source[field]);
    assert.equal(payload.attachments[0].content_id, "syzia-academy");
    assert.equal(payload.attachments[0].content_type, "image/png");
    assert.deepEqual(
      Buffer.from(payload.attachments[0].content, "base64"),
      source.attachments[0].content,
    );
    assert.ok(!payload.attachments[0].path);
    assert.doesNotMatch(call.writes[0], /re_local_simulation_only/);
  }
  assert.equal(f.calls[0].writes[0], f.calls[1].writes[0]);
  for (const kind of ["login", "launch", "test"]) {
    const v = {
      ...messageValue,
      kind,
      subject: "Organização e gestão — ação",
      body: "Bem-vindo! Orientações e preferências.",
    };
    await send(v);
    const p = JSON.parse(f.calls.at(-1).writes[0]);
    assert.equal(p.html, message(v).html);
    assert.equal(p.text, message(v).text);
  }
});
for (const [label, plan, category, stage] of [
  [
    "401 authentication",
    {
      status: 401,
      body: {
        name: "validation_error",
        message: "secret email@example.invalid",
      },
    },
    "definitive",
    "authentication",
  ],
  [
    "403 permissions",
    { status: 403, body: { name: "restricted_api_key" } },
    "definitive",
    "authorization",
  ],
  [
    "403 sender/recipient restriction",
    { status: 403, body: { name: "validation_error" } },
    "definitive",
    "authorization",
  ],
  [
    "400 validation",
    { status: 400, body: { name: "validation_error" } },
    "definitive",
    "validation",
  ],
  [
    "422 attachment",
    { status: 422, body: { name: "invalid_attachment" } },
    "definitive",
    "validation",
  ],
  [
    "429 rate limit",
    { status: 429, body: { name: "rate_limit_exceeded" } },
    "temporary",
    "rate_limit",
  ],
  [
    "429 daily quota",
    { status: 429, body: { name: "daily_quota_exceeded" } },
    "temporary",
    "rate_limit",
  ],
  [
    "500 possible processing",
    { status: 500, body: { name: "application_error" } },
    "uncertain",
    "provider",
  ],
  [
    "503 possible processing",
    { status: 503, body: { name: "service_unavailable" } },
    "uncertain",
    "provider",
  ],
  [
    "409 concurrent request",
    { status: 409, body: { name: "concurrent_idempotent_requests" } },
    "uncertain",
    "idempotency",
  ],
  [
    "409 different payload",
    { status: 409, body: { name: "invalid_idempotent_request" } },
    "uncertain",
    "idempotency",
  ],
  [
    "408 uncertain",
    { status: 408, body: { name: "unknown_private_name" } },
    "uncertain",
    "response",
  ],
  [
    "Redirect refused",
    { status: 307, raw: "redirect to private.invalid" },
    "uncertain",
    "response",
  ],
  [
    "Invalid JSON success",
    { status: 200, raw: "private invalid json" },
    "uncertain",
    "response",
  ],
  [
    "Success missing ID",
    { status: 200, body: { accepted: true } },
    "uncertain",
    "response",
  ],
  [
    "Invalid provider ID",
    { status: 200, body: { id: "recipient@example.invalid" } },
    "uncertain",
    "response",
  ],
  ["Oversized response", { raw: "x".repeat(65537) }, "uncertain", "response"],
  [
    "DNS before send",
    { kind: "before_error", code: "ENOTFOUND" },
    "temporary",
    "dns",
  ],
  [
    "Connect refused before send",
    { kind: "before_error", code: "ECONNREFUSED" },
    "temporary",
    "connection",
  ],
  [
    "Connection timeout before send",
    { kind: "connection_timeout" },
    "temporary",
    "connection",
  ],
  [
    "TLS certificate rejected",
    { kind: "before_error", code: "ERR_TLS_CERT_ALTNAME_INVALID" },
    "definitive",
    "tls",
  ],
  [
    "TLS unauthorized socket",
    { kind: "tls_unauthorized" },
    "definitive",
    "tls",
  ],
  [
    "Timeout after submission",
    { kind: "response_timeout" },
    "uncertain",
    "request",
  ],
  [
    "Reset after submission",
    { kind: "after_error", code: "ECONNRESET" },
    "uncertain",
    "request",
  ],
])
  test("068 " + label, async () => {
    const f = fakeHttps([plan]);
    const send = academyMailer(env, noSMTP, f.options);
    let caught;
    try {
      await send(messageValue);
    } catch (e) {
      caught = e;
    }
    assert.ok(caught);
    const d = safeDiagnostic(caught);
    assert.equal(d.category, category);
    assert.equal(d.stage, stage);
    assert.equal(d.transport, "https_resend");
    assert.equal(d.status, category === "uncertain" ? "uncertain" : "failed");
    assert.equal(f.calls.length, 1);
    if (["connection", "dns", "tls"].includes(stage))
      assert.equal(f.calls[0].writes.length, 0);
    assert.doesNotMatch(
      JSON.stringify(caught),
      /secret|email@example|private|re_local/,
    );
  });
test("068 explicit selection, master flags and no implicit reuse or fallback", async () => {
  for (const changes of [
    { ACADEMY_MAIL_TRANSPORT: "" },
    { ACADEMY_MAIL_TRANSPORT: "other" },
    { ACADEMY_RESEND_API_KEY: "" },
    { ACADEMY_RESEND_API_KEY: "bad\r\nkey" },
    { ACADEMY_MAIL_ENABLED: "false" },
    { ACCESS_MAIL_ENABLED: "false" },
    { ACCESS_MAIL_FROM: "bad\r\nfrom" },
  ]) {
    const config = {
      ...env,
      ACCESS_SMTP_HOST: "smtp.resend.com",
      ACCESS_SMTP_USER: "resend",
      ACCESS_SMTP_PASSWORD: "valid-old-smtp-secret",
      ...changes,
    };
    const f = fakeHttps();
    assert.equal(academyMailReady(config), false);
    await assert.rejects(
      academyMailer(config, noSMTP, f.options)(messageValue),
    );
    assert.equal(f.calls.length, 0);
  }
  assert.equal(academyMailReady(env), true);
  const f = fakeHttps();
  await assert.rejects(
    academyMailer(env, noSMTP, f.options)({ ...messageValue, delivery_id: "" }),
    (e) =>
      safeDiagnostic(e).category === "definitive" &&
      safeDiagnostic(e).stage === "prepare",
  );
  assert.equal(f.calls.length, 0);
});
test("068 shared mailer, Demo and public themes unchanged at Git base (protected hashes)", async () => {
  const inventory = JSON.parse(
    await readFile(new URL("./protected.json", import.meta.url), "utf8"),
  );
  const { createHash } = await import("node:crypto");
  for (const [file, sha] of Object.entries(inventory)) {
    const b = await readFile(new URL("../../" + file, import.meta.url));
    assert.equal(createHash("sha256").update(b).digest("hex"), sha, file);
  }
});

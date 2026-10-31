import test from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { academyMailer, message } from "../../server/academy/mail.mjs";
import { createCommercialMailer } from "../../server/commercial/mail.mjs";
import {
  mailDiagnostic,
  safeDiagnostic,
} from "../../server/academy/mail-diagnostics.mjs";
const env = {
  ACADEMY_MAIL_ENABLED: "true",
      ACADEMY_MAIL_TRANSPORT: "smtp",
  COMMERCIAL_MAIL_ENABLED: "true",
  ACCESS_MAIL_ENABLED: "true",
  ACCESS_SMTP_HOST: "smtp.resend.com",
  ACCESS_SMTP_PORT: "587",
  ACCESS_SMTP_USER: "resend",
  ACCESS_SMTP_PASSWORD: "local-simulated-secret",
  ACCESS_MAIL_FROM: "SYZIA <sender@example.invalid>",
};
const value = {
  kind: "confirm",
  email: "learner@example.invalid",
  delivery_id: "ba9cfeaa-8ef1-40c0-9fa3-14725ff2d777",
  link: "https://academy.example.invalid/confirmar#token=simulated",
  preferences: "https://academy.example.invalid/preferencias#token=simulated",
  contact: "privacy@example.invalid",
};
const error = (
  code,
  responseCode,
  command,
  message = "private recipient@example.invalid secret",
) =>
  Object.assign(Error(message), {
    code,
    responseCode,
    command,
    response: "private recipient@example.invalid",
  });
for (const [name, e, status, category, stage] of [
  [
    "auth",
    error("EAUTH", 535, "AUTH PLAIN secret"),
    "failed",
    "definitive",
    "authentication",
  ],
  ["DNS", error("EDNS"), "failed", "temporary", "dns"],
  [
    "connection timeout",
    error("ETIMEDOUT", null, "CONN", "Connection timeout"),
    "failed",
    "temporary",
    "connection",
  ],
  [
    "greeting timeout",
    error("ETIMEDOUT", null, "CONN", "Greeting never received"),
    "failed",
    "temporary",
    "greeting",
  ],
  [
    "timeout after possible DATA",
    error("ETIMEDOUT", null, "CONN", "Timeout"),
    "uncertain",
    "uncertain",
    "connection_or_socket",
  ],
  [
    "recipient rejection",
    error("EENVELOPE", 550, "RCPT TO:<private@example.invalid>"),
    "failed",
    "definitive",
    "recipient",
  ],
  [
    "temporary SMTP rejection",
    error("EMESSAGE", 421, "DATA"),
    "failed",
    "temporary",
    "message",
  ],
  [
    "reset",
    error("ECONNRESET", null, "CONN"),
    "uncertain",
    "uncertain",
    "connection_or_socket",
  ],
  [
    "TLS certificate",
    error("CERT_HAS_EXPIRED", null, "STARTTLS"),
    "failed",
    "definitive",
    "tls",
  ],
  [
    "unknown response",
    error("secret-code"),
    "uncertain",
    "uncertain",
    "unknown",
  ],
])
  test("067-M " + name, async () => {
    const send = academyMailer(env, () => ({
      sendMail: async () => {
        throw e;
      },
    }));
    let caught;
    try {
      await send(value);
    } catch (x) {
      caught = x;
    }
    const d = safeDiagnostic(caught);
    assert.equal(d.status, status);
    assert.equal(d.category, category);
    assert.equal(d.stage, stage);
    assert.doesNotMatch(
      JSON.stringify({ error: caught, diagnostic: d }),
      /private|recipient@|secret|PLAIN/,
    );
  });
test("067-M missing/disabled configuration never creates transport", async () => {
  for (const override of [
    { ACADEMY_MAIL_ENABLED: "false" },
    { ACCESS_SMTP_PASSWORD: "" },
    { ACCESS_SMTP_PORT: "2587" },
  ]) {
    const send = academyMailer({ ...env, ...override }, () => {
      throw Error("must not create");
    });
    await assert.rejects(
      send(value),
      (e) => mailDiagnostic(e).stage === "configuration",
    );
  }
});
test("067-M valid MIME + shared Demo configuration, CID image and stable idempotency", async () => {
  const captured = [];
  const options = [];
  const factory = (o) => {
    options.push(o);
    const transport = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
    });
    return {
      sendMail: async (m) => {
        captured.push({
          m,
          raw: (await transport.sendMail(m)).message.toString(),
        });
        return { accepted: [m.to], rejected: [] };
      },
    };
  };
  const academy = academyMailer(env, factory),
    demo = createCommercialMailer(env, factory);
  await academy(value);
  await academy(value);
  await demo({
    ...value,
    purpose: "demonstration",
    name: "Marina",
    company: "Ateliê Aurora",
    link: "https://demo.example.invalid/aurora",
    unsubscribe: "https://demo.example.invalid/preferences",
    expires_at: "2026-12-01T10:00:00Z",
  });
  assert.deepEqual(options[0], options[1]);
  assert.equal(options[0].requireTLS, true);
  assert.equal(options[0].tls.rejectUnauthorized, true);
  assert.equal(options[0].logger, false);
  assert.equal(options[0].disableFileAccess, true);
  assert.equal(
    captured[0].m.headers["Resend-Idempotency-Key"],
    captured[1].m.headers["Resend-Idempotency-Key"],
  );
  assert.deepEqual(
    captured[0].m.attachments[0].content,
    captured[2].m.attachments[0].content,
  );
  for (const c of captured) {
    assert.match(c.raw, /Content-Type: image\/png/);
    assert.match(c.raw, /Content-Type: text\/plain/);
    assert.match(c.raw, /Content-Type: text\/html/);
    assert.match(c.raw, /Resend-Idempotency-Key:/);
    assert.doesNotMatch(c.raw, /local-simulated-secret/);
  }
});
test("067-M fixed administrative message and resolved rejection do not invent SMTP reply", async () => {
  const m = message({ kind: "test", email: value.email });
  assert.doesNotMatch(m.html, /href=|token=|confirmar/);
  assert.ok(m.attachments[0].content.length);
  const send = academyMailer(env, () => ({
    sendMail: async () => ({ accepted: [], rejected: [value.email] }),
  }));
  await assert.rejects(send(value), (e) => {
    const d = safeDiagnostic(e);
    assert.equal(d.status, "failed");
    assert.equal(d.response_code, null);
    return true;
  });
});

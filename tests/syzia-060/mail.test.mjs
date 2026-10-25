import test from "node:test";
import assert from "node:assert/strict";
import {
  createCommercialMailer,
  invitationMessage,
  deliveryError,
} from "../../server/commercial/mail.mjs";
const env = {
  ACCESS_MAIL_ENABLED: "true",
  COMMERCIAL_MAIL_ENABLED: "true",
  ACCESS_SMTP_HOST: "smtp.resend.com",
  ACCESS_SMTP_PORT: "587",
  ACCESS_SMTP_USER: "resend",
  ACCESS_SMTP_PASSWORD: "not-real-fixture-secret",
  ACCESS_MAIL_FROM: "SYZIA <convites@example.invalid>",
  PLATFORM_APP_ORIGIN: "https://app.example.invalid",
};
const input = {
  email: "interessado@example.invalid",
  name: "Pessoa convidada",
  company: "Aurora Cuidados",
  purpose: "demonstration",
  link: "https://demo.example.invalid/aurora#convite=opaque-fixture",
  unsubscribe:
    "https://app.example.invalid/convites/descadastrar#convite=opaque-fixture",
  contact: "suporte@example.invalid",
  expires_at: "2026-12-01T12:00:00Z",
  delivery_id: "12345678-1234-1234-1234-123456789012",
};
test("060 SMTP acceptance with verified transport settings and stable Resend key", async () => {
  let received, opts;
  const send = createCommercialMailer(env, (o) => {
    opts = o;
    return {
      sendMail: async (m) => {
        received = m;
        return { accepted: [m.to], rejected: [] };
      },
    };
  });
  assert.deepEqual(await send(input), { accepted: true });
  assert.equal(opts.secure, false);
  assert.equal(opts.requireTLS, true);
  assert.equal(opts.logger, false);
  assert.equal(
    received.headers["Resend-Idempotency-Key"],
    "commercial/" + input.delivery_id,
  );
  assert.equal(received.to, input.email);
  assert.ok(!received.cc && !received.bcc);
});
for (const [name, e, code] of [
  ["auth", { code: "EAUTH", responseCode: 535 }, "email_authentication_failed"],
  [
    "sender/recipient",
    { responseCode: 550 },
    "email_recipient_or_sender_rejected",
  ],
  ["network", { code: "ECONNRESET" }, "email_temporary_failure"],
  ["timeout", { code: "ETIMEDOUT" }, "email_temporary_failure"],
  ["rate", { responseCode: 451 }, "email_rate_limited"],
  ["provider", { responseCode: 500 }, "email_delivery_failed"],
])
  test("060 SMTP " + name + " sanitized", async () => {
    const send = createCommercialMailer(env, () => ({
      sendMail: async () => {
        throw Object.assign(Error("raw response contains secret and email"), e);
      },
    }));
    try {
      await send(input);
      assert.fail();
    } catch (err) {
      assert.equal(deliveryError(err), code);
      assert.ok(!deliveryError(err).includes("secret"));
    }
  });
test("060 missing key, disabled mail and invalid recipient never send", async () => {
  let sent = 0;
  const transport = () => ({
    sendMail: async () => {
      sent++;
      return { accepted: ["x"] };
    },
  });
  for (const override of [
    { ACCESS_SMTP_PASSWORD: "" },
    { ACCESS_MAIL_ENABLED: "false" },
    { COMMERCIAL_MAIL_ENABLED: "false" },
    { ACCESS_MAIL_FROM: "x\r\nBcc: private" },
  ])
    await assert.rejects(
      createCommercialMailer({ ...env, ...override }, transport)(input),
      /not_configured/,
    );
  await assert.rejects(
    createCommercialMailer(env, transport)({ ...input, email: "invalid" }),
    /delivery_failed/,
  );
  assert.equal(sent, 0);
});
test("060 rejected recipients do not count as accepted and activation text uses approved journey", async () => {
  await assert.rejects(
    createCommercialMailer(env, () => ({
      sendMail: async () => ({ accepted: [], rejected: ["fixture"] }),
    }))(input),
    /delivery_failed/,
  );
  const message = invitationMessage({ ...input, purpose: "activation" });
  assert.ok(message.text.includes("identidade autorizada"));
  assert.ok(!message.text.includes("Após aprovação"));
});

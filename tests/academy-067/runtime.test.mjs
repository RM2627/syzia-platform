import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { academyRuntime } from "../../server/academy/runtime.mjs";
import { cryptoBox } from "../../server/academy/validation.mjs";
test("067-R real HTTP/runtime routing, active root authorization, SMTP stub and isolated dispatch", async (t) => {
  const calls = [],
    logs = [],
    sent = [];
  let queued = false,
    finished = false,
    payload;
  const id = "5df173ab-e1c7-44c9-9d6c-02442af547b3";
  const box = cryptoBox("ab".repeat(32));
  const runtime = academyRuntime(
    {
      ACADEMY_ENABLED: "true",
      ACADEMY_MAIL_ENABLED: "true",
      ACCESS_MAIL_ENABLED: "true",
      ACADEMY_SECRET: "ab".repeat(32),
      ACADEMY_PUBLIC_ORIGIN: "http://127.0.0.1:5197",
      PLATFORM_APP_ORIGIN: "http://127.0.0.1:5197",
      SUPABASE_URL: "https://local.example.invalid",
      SUPABASE_PUBLISHABLE_KEY: "local-public",
      SUPABASE_SERVICE_ROLE_KEY: "local-service",
      ACCESS_SMTP_HOST: "smtp.resend.com",
      ACCESS_SMTP_USER: "resend",
      ACCESS_SMTP_PASSWORD: "local-smtp",
      ACCESS_MAIL_FROM: "sender@example.invalid",
    },
    {
      log: (r) => logs.push(r),
      transport: () => ({
        sendMail: async (m) => {
          sent.push(m);
          return { accepted: [m.to], rejected: [] };
        },
      }),
      createClientImpl: (url, key, opts) => ({
        storage: { from: () => ({}) },
        rpc: async (name, { p_action: a, p_data: d }) => {
          calls.push({ name, a, key });
          if (a === "access")
            return {
              data: {
                allowed: opts.global?.headers.Authorization === "Bearer root",
              },
            };
          if (a === "mail_test_preview") {
            assert.equal(name, "academy_mail_admin");
            assert.equal(key, "local-public");
            payload = d.encrypted;
            assert.equal(box.open(payload).kind, "test");
            return { data: { id, expires_at: "2099-01-01T00:00:00Z" } };
          }
          if (a === "mail_test_confirm") {
            queued = true;
            return { data: { id, status: "pending", mail_test_id: id } };
          }
          if (a === "mail_test_claim") {
            assert.equal(name, "academy_mail_service");
            assert.equal(key, "local-service");
            const data = queued ? { id, payload } : null;
            queued = false;
            return { data };
          }
          if (a === "mail_test_finish") {
            assert.equal(d.diagnostic.category, "accepted");
            finished = true;
            return { data: { ok: true } };
          }
          throw Error("unexpected action " + a);
        },
      }),
    },
  );
  const server = http.createServer(runtime.handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await runtime.close();
    await new Promise((r) => server.close(r));
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const post = (token, path, action, data, origin = "http://127.0.0.1:5197") =>
    fetch(base + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        ...(token ? { authorization: "Bearer " + token } : {}),
      },
      body: JSON.stringify({ action, data }),
    });
  assert.equal(
    (await post("", "/academy/admin", "mail_test_preview", {})).status,
    403,
  );
  assert.equal(
    (await post("ordinary", "/academy/admin", "mail_test_preview", {})).status,
    403,
  );
  assert.equal(
    (
      await post(
        "root",
        "/academy/admin",
        "mail_test_preview",
        {},
        "https://evil.invalid",
      )
    ).status,
    403,
  );
  assert.equal(
    (await post("root", "/academy/mail_test_preview", "mail_test_preview", {}))
      .status,
    400,
  );
  const preview = await post("root", "/academy/admin", "mail_test_preview", {
    email: "authorized@example.invalid",
    authorized: true,
  });
  assert.equal(preview.status, 200);
  assert.equal((await preview.json()).recipient, "authorized@example.invalid");
  assert.equal(sent.length, 0);
  const result = await post("root", "/academy/admin", "mail_test_confirm", {
    id,
    confirmed: true,
  });
  assert.equal(result.status, 200);
  for (let i = 0; i < 30 && !finished; i++)
    await new Promise((r) => setTimeout(r, 100));
  assert.equal(finished, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].headers["Resend-Idempotency-Key"], "commercial/" + id);
  assert.ok(
    calls.every(
      (x) =>
        !["subscribe", "delivery_claim", "campaign", "queue_launch"].includes(
          x.a,
        ),
    ),
  );
  assert.doesNotMatch(
    JSON.stringify(logs),
    /authorized@example|local-smtp|local-service|Bearer|token=/,
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { academyRuntime } from "../../server/academy/runtime.mjs";
import { env, fakeHttps } from "./fake-https.mjs";
test("068 runtime selects HTTPS without SMTP credentials, admin API uses independent test dispatch", async (t) => {
  const f = fakeHttps(),
    calls = [],
    logs = [];
  let payload,
    pending = false,
    finished;
  const id = "5df173ab-e1c7-44c9-9d6c-02442af547b3";
  const runtime = academyRuntime(
    {
      ...env,
      ACADEMY_ENABLED: "true",
      ACADEMY_SECRET: "ab".repeat(32),
      ACADEMY_PUBLIC_ORIGIN: "http://127.0.0.1:5197",
      PLATFORM_APP_ORIGIN: "http://127.0.0.1:5197",
      SUPABASE_URL: "https://local.example.invalid",
      SUPABASE_PUBLISHABLE_KEY: "local-public",
      SUPABASE_SERVICE_ROLE_KEY: "local-service",
    },
    {
      httpsOptions: f.options,
      transport: () => {
        throw Error("SMTP must not initialize");
      },
      log: (r) => logs.push(r),
      createClientImpl: (url, key, opts) => ({
        storage: { from: () => ({}) },
        rpc: async (name, { p_action: a, p_data: d }) => {
          calls.push(a);
          if (a === "access")
            return {
              data: {
                allowed: opts.global?.headers.Authorization === "Bearer root",
              },
            };
          if (a === "mail_test_preview") {
            payload = d.encrypted;
            return { data: { id, expires_at: "2099-01-01T00:00:00Z" } };
          }
          if (a === "mail_test_confirm") {
            pending = true;
            return { data: { id, status: "pending", mail_test_id: id } };
          }
          if (a === "mail_test_claim") {
            assert.equal(name, "academy_mail_service");
            const data = pending ? { id, payload } : null;
            pending = false;
            return { data };
          }
          if (a === "mail_test_finish") {
            finished = d;
            return { data: { ok: true } };
          }
          throw Error("Unexpected action");
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
  const post = (action, data) =>
    fetch("http://127.0.0.1:" + server.address().port + "/academy/admin", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:5197",
        authorization: "Bearer root",
        "content-type": "application/json",
      },
      body: JSON.stringify({ action, data }),
    });
  const p = await post("mail_test_preview", {
    email: "authorized@example.invalid",
    authorized: true,
  });
  assert.equal(p.status, 200);
  assert.equal(f.calls.length, 0);
  const r = await post("mail_test_confirm", { id, confirmed: true });
  assert.equal(r.status, 200);
  for (let i = 0; i < 30 && !finished; i++)
    await new Promise((r) => setTimeout(r, 100));
  assert.equal(finished.status, "accepted");
  assert.equal(finished.diagnostic.transport, "https_resend");
  assert.equal(finished.diagnostic.http_status, 200);
  assert.equal(f.calls.length, 1);
  assert.ok(
    calls.every(
      (a) =>
        !["subscribe", "delivery_claim", "queue_launch", "campaign"].includes(
          a,
        ),
    ),
  );
  assert.doesNotMatch(
    JSON.stringify(logs),
    /authorized@example|re_local_simulation_only|local-service|token=/,
  );
});

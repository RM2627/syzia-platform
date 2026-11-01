import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MercadoPagoSubscriptions } from "../../server/billing/mercado-pago.mjs";
import { safeDiagnostic } from "../../server/billing/diagnostics.mjs";
import { createBillingServer } from "../../server/billing/http.mjs";
import { fixture } from "../billing-047/fixture.mjs";

const options = {
  accessToken: "SYNTHETIC_ACCESS_SECRET", publicKey: "SYNTHETIC_PUBLIC_KEY",
  collectorId: 101, applicationId: 202, appOrigin: "https://app.example.invalid",
  notificationUrl: "https://api.example.invalid/billing/notifications",
};
const privateData = "person@example.invalid SYNTHETIC_CARD_SECRET SYNTHETIC_ACCESS_SECRET 12345678900";
const response = (body, status = 400) => Response.json(body, { status });
async function refused(reply, { status = 400, path = "/preapproval", method = "POST", timeoutMs = 1000 } = {}) {
  const gateway = new MercadoPagoSubscriptions({ ...options, timeoutMs, fetchImpl: async () =>
    typeof reply === "function" ? reply() : reply });
  let error;
  try { await gateway.request(path, method, { simulated: true }, "synthetic-key"); }
  catch (e) { error = e; }
  assert.ok(error, "must remain a refusal");
  assert.equal(error.providerStatus, status);
  assert.equal(error.status, 502);
  return error;
}

for (const [body, status, reason] of [
  [{ message: "Invalid card token", status: 400 }, 400, "card_token_invalid"],
  [{ message: "payer_email is required", status: 422 }, 422, "payer_email_required"],
  [{ error: "bad_request", cause: [{ code: 99999, description: "Invalid preapproval_plan_id" }] }, 400, "plan_invalid"],
  [{ message: "Both payer and collector must be real or test users" }, 400, "environment_mismatch"],
  [{ message: "The payer and collector must be different users" }, 400, "payer_collector_conflict"],
  [{ message: "Card token service not found." }, 400, "card_token_lookup_failed"],
]) {
  test("create diagnostic recognizes a complete signature: " + reason, async () => {
    const error = await refused(response(body, status), { status });
    assert.equal(error.code, "billing_provider_invalid_request");
    assert.equal(error.definitiveRejection, true);
    assert.deepEqual(safeDiagnostic(error), {
      provider_status: status, provider_stage: "create",
      provider_diagnostic: "recognized", provider_reason: reason,
    });
    assert.equal(error.message, "billing_provider_invalid_request");
    assert.equal(Object.hasOwn(error, "body"), false);
  });
}
test("conflicting recognized details produce a fixed multiple-validations label", async () => {
  const e = await refused(response({ message: "Invalid card token",
    cause: [{ code: "unknown", description: "payer_email is required" }] }));
  assert.equal(e.providerReason, "multiple_validations");
});
test("arbitrary messages, code values and embedded recognizable fragments are never echoed", async () => {
  for (const body of [
    { message: "Invalid card token: " + privateData },
    { message: privateData, error: privateData },
    { cause: [{ code: 2006, description: privateData }] }, // Not a Payments-code mapping.
    { cause: [{ code: "invalid_card_token " + privateData }] },
    { message: "Notification_url is not accepted: " + privateData },
  ]) {
    const e = await refused(response(body));
    assert.equal(e.providerDiagnostic, "unrecognized");
    assert.equal(e.providerReason, undefined);
    assert.doesNotMatch(JSON.stringify(e) + JSON.stringify(safeDiagnostic(e)),
      /person@|SYNTHETIC|12345678900|2006|Notification_url/);
  }
});
test("strict schema rejects extra fields, wrong status, wrong types and excessive causes", async () => {
  for (const body of [
    [], null, "Invalid card token",
    { message: "Invalid card token", status: "400" },
    { message: "Invalid card token", status: 422 },
    { message: "Invalid card token", payload: privateData },
    { message: { secret: privateData } },
    { message: "x".repeat(513) },
    { cause: null },
    { cause: Array.from({ length: 9 }, () => ({ code: "bad_request" })) },
    { cause: [{ code: { token: privateData } }] },
    { cause: [{ code: 123, description: "Invalid card token", data: privateData }] },
    JSON.parse('{"message":"Invalid card token","__proto__":{"polluted":true}}'),
  ]) {
    const e = await refused(response(body));
    assert.equal(e.providerDiagnostic, "invalid_schema");
    assert.equal(e.providerReason, undefined);
    assert.equal(e.definitiveRejection, true);
    assert.doesNotMatch(JSON.stringify(e), /person@|SYNTHETIC|polluted/);
  }
  assert.equal({}.polluted, undefined);
});
test("invalid JSON, truncated JSON and invalid UTF-8 remain definitive and carry no content", async () => {
  for (const body of ['{"message":', "<html>" + privateData, new Uint8Array([0xff, 0xfe])]) {
    const e = await refused(new Response(body, { status: 400, headers: { "content-type": "application/json" } }));
    assert.equal(e.providerDiagnostic, "invalid_json");
    assert.equal(e.definitiveRejection, true);
  }
});
test("untrusted content length cannot bypass the byte cap; exact 8 KiB is permitted", async () => {
  const json = JSON.stringify({ message: "Invalid card token" });
  const e = await refused(new Response(json.padEnd(8192, " "), {
    status: 400, headers: { "content-type": "application/json" },
  }));
  assert.equal(e.providerReason, "card_token_invalid");
  for (const body of [json.padEnd(8193, " "), JSON.stringify({ message: "é".repeat(5000) })]) {
    const e = await refused(new Response(body, { status: 400,
      headers: { "content-type": "application/json", "content-length": "1" } }));
    assert.equal(e.providerDiagnostic, "too_large");
    assert.equal(e.definitiveRejection, true);
  }
});
test("large declared body and unsupported media type are canceled without reading", async () => {
  for (const [headers, expected] of [
    [{ "content-type": "application/json", "content-length": "8193" }, "too_large"],
    [{ "content-type": "text/html" }, "unsupported_content_type"],
    [{}, "unsupported_content_type"],
  ]) {
    let cancelled = 0;
    const e = await refused({ ok: false, status: 400, headers: new Headers(headers),
      body: { getReader() { throw Error("must not read"); }, cancel() { cancelled++; } } });
    assert.equal(e.providerDiagnostic, expected);
    assert.equal(cancelled, 1);
  }
});
test("more than 128 chunks cannot keep diagnostic parsing alive", async () => {
  let pulls = 0;
  const body = new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new Uint8Array()); } });
  const e = await refused(new Response(body, { status: 400, headers: { "content-type": "application/json" } }));
  assert.equal(e.providerDiagnostic, "too_large");
  assert.ok(pulls <= 130);
});
test("an unreadable stream never replaces HTTP 400 with an uncertain transport outcome", async () => {
  const body = new ReadableStream({ start(controller) { controller.error(Error(privateData)); } });
  const e = await refused(new Response(body, { status: 400, headers: { "content-type": "application/json" } }));
  assert.equal(e.providerDiagnostic, "unavailable");
  assert.equal(e.definitiveRejection, true);
  assert.doesNotMatch(JSON.stringify(e), /person@|SYNTHETIC/);
});
for (const timeoutMs of [25, 1500]) {
  test("a stalled read/cancellation is bounded without weakening definitive refusal: " + timeoutMs, async () => {
    let cancelled = 0;
    const begin = performance.now();
    const e = await refused({ ok: false, status: 400, headers: new Headers({ "content-type": "application/json" }),
      body: { getReader: () => ({
        read: () => new Promise(() => {}),
        cancel: () => { cancelled++; return new Promise(() => {}); },
        releaseLock() {},
      }) } }, { timeoutMs });
    assert.equal(e.providerDiagnostic, "read_timeout");
    assert.equal(e.definitiveRejection, true);
    assert.equal(e.code, "billing_provider_invalid_request");
    assert.equal(cancelled, 1);
    assert.ok(performance.now() - begin < 1200);
  });
}
test("other endpoints and statuses never opt into reading provider bodies", async () => {
  for (const [status, path, method] of [
    [400, "/preapproval/existing", "PUT"], [422, "/preapproval/search", "GET"],
    [400, "/preapproval_plan/id", "GET"],
    ...[401, 403, 409, 429, 500].map(s => [s, "/preapproval", "POST"]),
  ]) {
    let cancelled = 0;
    const e = await refused({ ok: false, status, headers: new Headers({ "content-type": "application/json" }),
      body: { getReader() { throw Error("must not read"); }, cancel() { cancelled++; return Promise.resolve(); } } },
    { status, path, method });
    assert.equal(e.providerDiagnostic, undefined);
    assert.equal(e.providerReason, undefined);
    assert.equal(cancelled, 1);
  }
});
test("log projection rejects forged labels, wrong endpoint and unrelated HTTP status", () => {
  for (const error of [
    { providerStage: "create", providerStatus: 400, providerDiagnostic: privateData, providerReason: privateData },
    { providerStage: "lookup", providerStatus: 400, providerDiagnostic: "recognized", providerReason: "card_token_invalid" },
    { providerStage: "create", providerStatus: 500, providerDiagnostic: "recognized", providerReason: "card_token_invalid" },
    { providerStage: "create", providerStatus: 400, providerDiagnostic: "recognized", providerReason: privateData },
  ]) {
    const d = safeDiagnostic(error);
    assert.equal(d.provider_reason, undefined);
    assert.doesNotMatch(JSON.stringify(d), /person@|SYNTHETIC/);
  }
});
test("diagnostic survives subscription wrapping into HTTP audit; financial contract and payer are preserved", async () => {
  const c = await fixture(), logs = [], posts = [];
  const original = c.gateway.fetchImpl;
  c.gateway.fetchImpl = async (url, init) => {
    if (new URL(url).pathname === "/preapproval" && init.method === "POST") {
      posts.push(JSON.parse(init.body));
      return response({ message: "Both payer and collector must be real or test users", status: 400 });
    }
    return original(url, init);
  };
  const server = createBillingServer({ origin: "http://127.0.0.1", billing: c.engine, log: e => logs.push(e) });
  await new Promise(ok => server.listen(0, "127.0.0.1", ok));
  try {
    const res = await fetch("http://127.0.0.1:" + server.address().port + "/billing/command", {
      method: "POST", headers: { Origin: "http://127.0.0.1", Authorization: "Bearer adminA" },
      body: JSON.stringify({ organization_id: c.orgs.A, action: "checkout", request_key: randomUUID(),
        trial_expected: true, plan_version_id: c.versions.profissional,
        card_token: "SYNTHETIC_CARD_SECRET", payer_email: "different-buyer@example.invalid" }),
    });
    const body = await res.json();
    assert.equal(res.status, 502);
    assert.deepEqual(Object.keys(body).sort(), ["error", "request_id"]);
    assert.equal(body.error, "billing_provider_invalid_request");
    assert.equal(logs[0].request_id, body.request_id);
    assert.equal(logs[0].provider_reason, "environment_mismatch");
    assert.equal(logs[0].provider_diagnostic, "recognized");
    assert.doesNotMatch(JSON.stringify({ body, logs }), /different-buyer|@|SYNTHETIC|Both payer/);
    const sub = (await c.view()).subscription;
    const binding = await c.service("billing047_service", { p_action: "get", p_id: sub.id, p_data: {} });
    assert.equal(binding.create_started, false);
    assert.equal(binding.operation_state, "done");
    assert.equal(binding.provider_id, null);
    assert.equal(binding.trial_reserved, true);
    assert.equal(binding.state, "payment_pending");
    assert.equal((await c.asUser("adminA", "billing_capabilities", { p_org: c.orgs.A })).software, false);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].payer_email, "different-buyer@example.invalid");
    assert.equal(Object.hasOwn(posts[0], 'notification_url'), false);
    await c.engine.reconcile();
    assert.equal(posts.length, 1);
  } finally {
    await new Promise(ok => server.close(ok));
    await c.db.close();
  }
});

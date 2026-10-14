// Additional evidence for the HTTP 400 investigation; all provider responses are synthetic.
// Run from the project root: node --test --test-concurrency=1 tests/mp400-051/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fixture } from "../billing-047/fixture.mjs";
import { fakeMercadoPago } from "../billing-047/fake-provider.mjs";
import { MercadoPagoSubscriptions } from "../../server/billing/mercado-pago.mjs";
import { createBillingServer } from "../../server/billing/http.mjs";
import { compareBytes, verifyReference } from "../../scripts/mp400-051/verify-reference.mjs";

const options = { accessToken: "SYNTHETIC_ACCESS_SECRET", publicKey: "SYNTHETIC_PUBLIC_KEY",
  collectorId: 101, applicationId: 202, appOrigin: "https://app.example.invalid",
  notificationUrl: "https://api.example.invalid/billing/notifications" };
const binding = code => ({ id: randomUUID(), organization_id: randomUUID(), code,
  provider_plan_id: code + "-trial", trial_reserved: true, currency: "BRL", interval_months: 1,
  amount_cents: { essencial: 4990, profissional: 8990, equipe: 14990 }[code] });
const cardToken = "SYNTHETIC_CARD_TOKEN_NEVER_REAL";

for (const code of ["essencial", "profissional", "equipe"]) {
  test(`MP400-01 ${code}: capture actual associated-plan payload through offline transport`, async () => {
    const fake = fakeMercadoPago(), b = binding(code), requests = [];
    const gateway = new MercadoPagoSubscriptions({ ...options, fetchImpl: async (url, init) => {
      requests.push({ url, init }); return fake.fetchImpl(url, init);
    } });
    const result = await gateway.create(b, cardToken, "test-buyer@example.invalid");
    assert.equal(requests.length, 2);
    assert.equal(requests[0].init.method, "GET");
    assert.equal(new URL(requests[0].url).pathname, "/preapproval_plan/" + code + "-trial");
    const create = requests[1];
    assert.equal(create.url, "https://api.mercadopago.com/preapproval");
    assert.equal(create.init.headers["X-Idempotency-Key"], b.id);
    assert.deepEqual(JSON.parse(create.init.body), {
      preapproval_plan_id: b.provider_plan_id, external_reference: b.id,
      payer_email: "test-buyer@example.invalid", card_token_id: cardToken, status: "authorized",
      reason: "SYZIA " + code, back_url: options.appOrigin + "/painel/" + b.organization_id + "/assinatura?retorno=1",
      notification_url: options.notificationUrl,
    });
    assert.equal(result.auto_recurring.transaction_amount * 100, b.amount_cents);
    assert.deepEqual(result.auto_recurring.free_trial, { frequency: 7, frequency_type: "days" });
  });
}

// These labels are intentionally NOT claimed to be Mercado Pago error codes.
for (const scenario of ["invalid_payload", "incompatible_data", "invalid_token", "expired_token"]) {
  test(`MP400-02 ${scenario}: HTTP 400 alone cannot distinguish the cause; no body parsing`, async () => {
    let canceled = 0;
    const gateway = new MercadoPagoSubscriptions({ ...options, fetchImpl: async () => ({
      ok: false, status: 400, body: { cancel: async () => { canceled++; } },
      text: async () => { throw Error("sensitive response was read"); },
      json: async () => { throw Error("sensitive response was read"); },
      // Arbitrary provider strings/codes must not become trusted diagnostics.
      message: scenario + ":SYNTHETIC_PRIVATE_DATA", code: scenario,
    }) });
    await assert.rejects(gateway.create(binding("profissional"), cardToken, "test-buyer@example.invalid", true), e => {
      assert.equal(e.code, "billing_provider_invalid_request");
      assert.equal(e.providerStatus, 400); assert.equal(e.providerStage, "create");
      assert.equal(e.definitiveRejection, true);
      assert.doesNotMatch(String(e) + JSON.stringify(e), /SYNTHETIC|test-buyer|invalid_token|expired_token/);
      return true;
    });
    assert.equal(canceled, 1);
  });
}

for (const field of ["collector_id", "application_id", "id"]) {
  test(`MP400-03 plan ${field} mismatch prevents any create`, async () => {
    const fake = fakeMercadoPago(); let posts = 0;
    const gateway = new MercadoPagoSubscriptions({ ...options, fetchImpl: async (url, init) => {
      if (init.method === "POST") posts++;
      const response = await fake.fetchImpl(url, init), data = await response.json();
      data[field] = "different-synthetic-value";
      return Response.json(data);
    } });
    await assert.rejects(gateway.create(binding("profissional"), cardToken, "buyer@example.invalid"), /billing_plan_mismatch/);
    assert.equal(posts, 0);
  });
}

test("MP400-04 discarded provider body cannot leak through HTTP; local correlation retained", async () => {
  const logs = [], secret = "SYNTHETIC_PRIVATE_DATA";
  const gateway = new MercadoPagoSubscriptions({ ...options, fetchImpl: async () => Response.json({
    code: secret, message: "test-buyer@example.invalid " + cardToken, cause: [{ code: secret }],
  }, { status: 400 }) });
  const server = createBillingServer({ origin: "http://127.0.0.1", log: e => logs.push(e),
    billing: { user: () => gateway.create(binding("profissional"), cardToken, "buyer@example.invalid", true) } });
  await new Promise(ok => server.listen(0, "127.0.0.1", ok));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/billing/command`, {
      method: "POST", headers: { Origin: "http://127.0.0.1", Authorization: "Bearer SYNTHETIC_SESSION" },
      body: JSON.stringify({ card_token: cardToken }),
    });
    const body = await response.json();
    assert.equal(response.status, 502); // Provider 400 is not the local HTTP status.
    assert.equal(body.error, "billing_provider_invalid_request");
    assert.equal(logs[0].request_id, body.request_id);
    assert.match(body.request_id, /^[a-f0-9-]{36}$/);
    assert.equal(logs[0].provider_status, 400);
    assert.equal(logs[0].provider_stage, "create");
    assert.doesNotMatch(JSON.stringify({ logs, body }), /SYNTHETIC|@|payer|card_token|cause|message|public_key/);
  } finally { await new Promise(ok => server.close(ok)); }
});

test("MP400-05 definitive refusal, no-op reconciliation and two-tab retry preserve one trial/contract", async () => {
  const c = await fixture();
  try {
    const original = c.gateway.fetchImpl; let reject = true, posts = [], entered, release;
    let waitForRelease;
    c.gateway.fetchImpl = async (url, init) => {
      if (new URL(url).pathname === "/preapproval" && init.method === "POST") {
        posts.push({ body: JSON.parse(init.body), key: init.headers["X-Idempotency-Key"] });
        if (reject) return Response.json({ code: "SYNTHETIC_ONLY" }, { status: 400 });
        if (waitForRelease) { entered(); await waitForRelease; }
      }
      return original(url, init);
    };
    await assert.rejects(c.command("checkout", "profissional"), /billing_provider_invalid_request/);
    const s = (await c.view()).subscription, id = s.id;
    assert.equal(posts[0].body.payer_email, "adminA@example.invalid");
    assert.equal(s.state, "payment_pending"); assert.equal(s.checkout_retryable, true);
    const get = () => c.service("billing047_service", { p_action: "get", p_id: id, p_data: {} });
    const b = await get();
    assert.equal(b.create_started, false); assert.equal(b.provider_id, null);
    assert.equal(b.operation_state, "done"); assert.equal(b.trial_reserved, true);
    const reservations = (await c.rawSQL("select * from private.billing047_trial_reservations where contract_id=$1", [id])).rows;
    assert.ok(reservations.length);
    assert.equal((await c.asUser("adminA", "billing_capabilities", { p_org: c.orgs.A })).software, false);
    const reconciled = await c.engine.reconcile();
    await c.engine.user("status", { organization_id: c.orgs.A }, "adminA");
    assert.equal(posts.length, 1); assert.equal((await get()).provider_id, null);
    assert.equal((await c.view()).subscription.state, "payment_pending");
    assert.ok(reconciled.inspected >= reconciled.succeeded); // Counters do not assert approval.
    await assert.rejects(c.command("checkout", "profissional", "A", { payer_email: "invalid" }), /billing_payer_email_invalid/);
    await assert.rejects(c.engine.user("status", { organization_id: c.orgs.A }, "adminB"), /denied|scope/);
    reject = false;
    const waiting = new Promise(ok => { entered = ok; });
    waitForRelease = new Promise(ok => { release = ok; });
    const first = c.command("checkout", "profissional", "A", { card_token: "SYNTHETIC_FRESH_TOKEN_FIRST", payer_email: "other@example.invalid" });
    await waiting;
    try { await c.command("checkout", "profissional", "A", { card_token: "SYNTHETIC_FRESH_TOKEN_SECOND" }); }
    finally { release(); }
    await first;
    assert.equal(posts.length, 2); // One rejected POST + one successful offline POST.
    assert.equal(posts[1].body.payer_email, "other@example.invalid");
    assert.equal(posts[0].key, posts[1].key); // Observed behavior, not proof of provider key semantics.
    assert.notEqual(posts[0].body.card_token_id, posts[1].body.card_token_id);
    assert.equal((await c.view()).subscription.id, id);
    assert.equal((await c.view()).subscription.state, "trialing");
    assert.equal(c.fake.subscriptions.size, 1);
    assert.equal((await c.rawSQL("select count(*)::int n from private.trial_grants where organization_id=$1", [c.orgs.A])).rows[0].n, 1);
    assert.deepEqual((await c.rawSQL("select * from private.billing047_trial_reservations where contract_id=$1", [id])).rows, reservations);
  } finally { await c.db.close(); }
});

test("MP400-06 transport timeout after creation must search, never create again, including empty search", async () => {
  const c = await fixture();
  try {
    const original = c.gateway.fetchImpl; let created = false, posts = 0;
    c.gateway.timeoutMs = 20;
    c.gateway.fetchImpl = async (url, init) => {
      const response = await original(url, init);
      if (new URL(url).pathname === "/preapproval" && init.method === "POST") {
        posts++; created = true;
        return new Promise((_, reject) => {
          if (init.signal.aborted) reject(Error("synthetic timeout"));
          else init.signal.addEventListener("abort", () => reject(Error("synthetic timeout")), { once: true });
        });
      }
      return response;
    };
    await assert.rejects(c.command("checkout", "equipe"), /billing_timeout/);
    assert.equal(created, true);
    const s = (await c.view()).subscription;
    assert.equal(s.checkout_retryable, false); assert.equal(s.state, "reconciliation");
    const find = c.gateway.find; c.gateway.find = async () => [];
    await assert.rejects(c.command("checkout", "equipe"), /billing_reconciliation_required/);
    assert.equal(posts, 1);
    assert.equal((await c.asUser("adminA", "billing_capabilities", { p_org: c.orgs.A })).software, false);
    c.gateway.find = find; c.gateway.fetchImpl = original; c.gateway.timeoutMs = 10000;
    await c.engine.reconcile();
    assert.equal(c.fake.calls.filter(x => x.method === "POST").length, 1);
    assert.equal((await c.view()).subscription.state, "trialing");
    assert.equal(c.fake.subscriptions.size, 1);
  } finally { await c.db.close(); }
});

test("MP400-07 diagnostic comparison accepts only proven LF/CRLF text, never binary or content edits", () => {
  const sha = b => createHash("sha256").update(b).digest("hex");
  const original = Buffer.from("TRIAL_DAYS=7\n");
  const expected = { sha256: sha(original), lf_sha256: sha(original) };
  assert.equal(compareBytes(original, expected).comparison, "byte_exact");
  assert.equal(compareBytes(Buffer.from("TRIAL_DAYS=7\r\n"), expected).comparison, "lf_crlf_only");
  for (const s of ["TRIAL_DAYS=8\r\n", "TRIAL_DAYS=7", "TRIAL_DAYS=7 \n", "TRIAL_DAYS=7\r", "\ufeffTRIAL_DAYS=7\n", "TRIAL_DAYS=7\n\0"])
    assert.equal(compareBytes(Buffer.from(s), expected).comparison, "different");
  assert.equal(compareBytes(Buffer.from("TRIAL_DAYS=7\r\n"), { sha256: sha(original) }).comparison, "different");
  assert.equal(compareBytes(Buffer.from([0xff, 0x0a]), expected).comparison, "different");
});

test("MP400-08 local source comparison cannot claim proof of official Git compatibility", () => {
  const report = verifyReference(process.cwd(), "local");
  assert.ok(["local_match_only", "review_required"].includes(report.status));
  assert.equal(report.compatibility_proven, false);
  assert.equal(report.git_commit, null);
  assert.equal(report.results.length, 924);
});

test("MP400-09 diagnostic manifest survives CRLF checkout; altered reference remains rejected", async () => {
  const dir = await mkdtemp(join(tmpdir(), "syzia-mp400-reference-"));
  try {
    await mkdir(join(dir, "scripts/mp400-051"), { recursive: true });
    await mkdir(join(dir, "docs/mp400-051"), { recursive: true });
    const script = join(dir, "scripts/mp400-051/verify-reference.mjs");
    const manifest = join(dir, "docs/mp400-051/available-base-sha256.json");
    await writeFile(script, await readFile("scripts/mp400-051/verify-reference.mjs"));
    const text = await readFile("docs/mp400-051/available-base-sha256.json", "utf8");
    await writeFile(manifest, text.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n"));
    let child = spawnSync(process.execPath, [script, "--local"], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
    assert.ok([0, 1].includes(child.status)); // Generated reports may differ; reference must still load.
    assert.equal(JSON.parse(child.stdout).results.length, 924);
    await writeFile(manifest, text.replace('"sha256": "', '"sha256": "0'));
    child = spawnSync(process.execPath, [script, "--local"], { encoding: "utf8" });
    assert.equal(child.status, 2);
    assert.equal(JSON.parse(child.stdout).status, "diagnostic_unavailable");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

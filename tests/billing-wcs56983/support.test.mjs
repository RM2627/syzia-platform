// WCS-56983: all provider responses, identities and credentials are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MercadoPagoSubscriptions, BillingError } from '../../server/billing/mercado-pago.mjs';
import { safeDiagnostic } from '../../server/billing/diagnostics.mjs';
import { capturePreapprovalSupport, copyPreapprovalSupport, safePreapprovalSupport } from '../../server/billing/support-wcs56983.mjs';
import { billingRuntime } from '../../server/billing/runtime.mjs';
import { createBillingServer } from '../../server/billing/http.mjs';
import { fixture } from '../billing-047/fixture.mjs';

const providerId = 'b4e4a9cc-6284-4d59-8af4-0a58d0b921cb';
const hexId = providerId.replaceAll('-', '');
const privateData = 'person@example.invalid SYNTHETIC_CARD_TOKEN SYNTHETIC_ACCESS_TOKEN 52998224725 NomePrivado';
const options = { accessToken: 'SYNTHETIC_ACCESS_TOKEN', publicKey: 'SYNTHETIC_PUBLIC_KEY',
  collectorId: '101', applicationId: '202', appOrigin: 'https://app.example.invalid',
  notificationUrl: 'https://api.example.invalid/billing/notifications' };
const binding = { id: '11111111-1111-4111-8111-111111111111', organization_id: '22222222-2222-4222-8222-222222222222',
  provider_plan_id: 'profissional-trial', code: 'profissional', amount_cents: 8990, currency: 'BRL', interval_months: 1, trial_reserved: true };
const body = { preapproval_plan_id: binding.provider_plan_id, external_reference: binding.id,
  payer_email: 'person@example.invalid', card_token_id: 'SYNTHETIC_CARD_TOKEN', status: 'authorized',
  reason: 'SYZIA profissional', back_url: options.appOrigin + '/painel/' + binding.organization_id + '/assinatura?retorno=1' };
const closedFields = [...Object.keys(body), 'notification_url'];
function refusal(status = 400) {
  const error = new BillingError('billing_provider_invalid_request', 502);
  Object.assign(error, { providerStage: 'create', providerStatus: status });
  return error;
}
const reply = (data = { message: 'Invalid card token' }, status = 400, requestId = providerId) => Response.json(data, {
  status, headers: requestId == null ? {} : { 'X-Request-Id': requestId },
});
async function rejected(response, { enabled = true, path = '/preapproval', method = 'POST', request = body } = {}) {
  const gateway = new MercadoPagoSubscriptions({ ...options, supportCase56983: enabled, fetchImpl: async () => response });
  let error;
  try { await gateway.request(path, method, request, binding.id); } catch (e) { error = e; }
  assert.ok(error);
  return error;
}

test('WCS-01 strict provider IDs; invalid, personal, oversized and combined values never leave memory', () => {
  assert.equal(hexId.length, 32);
  for (const value of [providerId, providerId.toUpperCase(), hexId]) {
    const e = refusal();capturePreapprovalSupport(e, { headers: { get: () => value } }, body);
    assert.equal(safePreapprovalSupport(e).provider_request_id, value);
    assert.equal(JSON.stringify(e).includes(value), false);
  }
  for (const value of ['', ' ', 'x'.repeat(37), providerId + '\n', hexId + '\n', 'person@example.invalid',
    '52998224725', '4111111111111111', 'SYNTHETIC_ACCESS_TOKEN', 'NomePrivado', '../' + hexId,
    providerId + ', ' + providerId, providerId.replace('b', 'g'), { value: providerId }, ['unsafe']]) {
    const e = refusal();capturePreapprovalSupport(e, { headers: { get: () => value } }, body);
    assert.equal(safePreapprovalSupport(e).provider_request_id, undefined);
    assert.equal(safePreapprovalSupport(e).provider_request_id_status, 'invalid');
  }
  const e = refusal();capturePreapprovalSupport(e, { headers: { get: () => hexId } }, { ...body, card_token_id: hexId });
  assert.equal(safePreapprovalSupport(e).provider_request_id_status, 'invalid');
});

test('WCS-02 missing or broken headers cannot replace the financial failure', () => {
  for (const [headers, state] of [[new Headers(), 'missing'], [{ get() { throw Error(privateData); } }, 'unavailable']]) {
    const e = refusal();capturePreapprovalSupport(e, { headers }, body);
    assert.equal(safePreapprovalSupport(e).provider_request_id_status, state);
    assert.equal(e.code, 'billing_provider_invalid_request');
    assert.doesNotMatch(JSON.stringify(safePreapprovalSupport(e)), /person@|SYNTHETIC|NomePrivado|52998224725/);
  }
});

test('WCS-03 fixed property names and boolean presence only; unknown property names and values are not logged', () => {
  const e = refusal(), request = { ...body, [privateData]: privateData, cpf: '52998224725', authorization: 'SYNTHETIC_ACCESS_TOKEN' };
  capturePreapprovalSupport(e, { headers: new Headers({ 'x-request-id': providerId }) }, request);
  const m = safePreapprovalSupport(e);
  assert.deepEqual(Object.keys(m.provider_request_fields), closedFields);
  assert.deepEqual(m.provider_request_fields.payer_email, { present: true, non_empty_string: true });
  assert.deepEqual(m.provider_request_fields.notification_url, { present: false, non_empty_string: false });
  assert.equal(m.provider_request_has_unexpected_fields, true);
  for (const state of Object.values(m.provider_request_fields)) assert.ok(Object.values(state).every(v => typeof v === 'boolean'));
  assert.doesNotMatch(JSON.stringify(m), /person@|SYNTHETIC|NomePrivado|52998224725|authorization|cpf/);
  assert.equal(Object.isFrozen(m), true);
  assert.equal(Object.isFrozen(m.provider_request_fields), true);
});

test('WCS-04 forged error metadata is ignored; copies stay out of serializations and safeDiagnostic', () => {
  const e = refusal();Object.assign(e, { provider_request_id: providerId, support_case: 'WCS-56983', provider_request_fields: { secret: privateData } });
  assert.deepEqual(safePreapprovalSupport(e), {});
  const source = refusal(), target = refusal();capturePreapprovalSupport(source, reply(), body);copyPreapprovalSupport(source, target);
  assert.equal(safePreapprovalSupport(target).provider_request_id, providerId);
  assert.equal(JSON.stringify(target).includes(providerId), false);
  assert.equal(Object.hasOwn(safeDiagnostic(target), 'provider_request_id'), false);
  const outside = refusal(500);copyPreapprovalSupport(source, outside);assert.deepEqual(safePreapprovalSupport(outside), {});
});

test('WCS-05 disabled by default; literal opt-in only; runtime config stays server-side', () => {
  const env = { SUPABASE_URL: 'https://synthetic.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'SYNTHETIC_SERVICE_KEY',
    PLATFORM_APP_ORIGIN: options.appOrigin, MERCADO_PAGO_ENABLED: 'true', MERCADO_PAGO_ACCESS_TOKEN: options.accessToken,
    MERCADO_PAGO_PUBLIC_KEY: options.publicKey, MERCADO_PAGO_COLLECTOR_ID: options.collectorId,
    MERCADO_PAGO_APPLICATION_ID: options.applicationId, MERCADO_PAGO_NOTIFICATION_URL: options.notificationUrl };
  for (const value of [undefined, '', 'false', 'TRUE', '1', 'true']) {
    const runtime = billingRuntime({ ...env, MERCADO_PAGO_WCS_56983_ENABLED: value }, { createClientImpl: () => ({}), fetchImpl: () => { throw Error('network forbidden'); } });
    assert.equal(runtime.gateway.supportCase56983, value === 'true');
  }
  assert.equal(new MercadoPagoSubscriptions(options).supportCase56983, false);
  assert.equal(new MercadoPagoSubscriptions({ ...options, supportCase56983: 'true' }).supportCase56983, false);
});

test('WCS-06 exact financial payload and idempotency are identical with instrumentation on/off', async () => {
  const requests = [], errors = [];
  for (const enabled of [false, true]) {
    const gateway = new MercadoPagoSubscriptions({ ...options, supportCase56983: enabled, fetchImpl: async (url, init) => {
      requests.push({ url, method: init.method, headers: init.headers, body: init.body });return reply();
    } });
    try { await gateway.create(binding, body.card_token_id, body.payer_email, true); } catch (e) { errors.push(e); }
  }
  assert.deepEqual(requests[0], requests[1]);
  assert.deepEqual(JSON.parse(requests[0].body), body);
  assert.equal(requests[0].headers['X-Idempotency-Key'], binding.id);
  assert.equal(Object.hasOwn(JSON.parse(requests[0].body), 'notification_url'), false);
  assert.deepEqual(safePreapprovalSupport(errors[0]), {});
  assert.equal(safePreapprovalSupport(errors[1]).provider_request_id, providerId);
  assert.deepEqual(safeDiagnostic(errors[0]), safeDiagnostic(errors[1]));
});

test('WCS-07 capture is restricted to POST /preapproval 400/422; no GET/PUT/other refusal capture', async () => {
  for (const status of [400, 422]) {
    const e = await rejected(reply(undefined, status));assert.equal(safePreapprovalSupport(e).provider_request_id, providerId);
    assert.equal(e.definitiveRejection, true);assert.equal(e.providerStatus, status);assert.equal(e.status, 502);
  }
  for (const [path, method, status] of [['/preapproval_plan/plan', 'GET', 400], ['/preapproval/id', 'PUT', 400],
    ['/preapproval/id', 'GET', 400], ['/preapproval', 'POST', 401], ['/preapproval', 'POST', 409], ['/preapproval', 'POST', 500]]) {
    const e = await rejected(reply(undefined, status), { path, method });assert.deepEqual(safePreapprovalSupport(e), {});
  }
});

test('WCS-08 closed classification retained; arbitrary messages and invalid schema cannot enter metadata', async () => {
  for (const [data, outcome, reason] of [
    [{ message: 'Invalid card token' }, 'recognized', 'card_token_invalid'],
    [{ message: 'payer_email is required' }, 'recognized', 'payer_email_required'],
    [{ message: privateData }, 'unrecognized', undefined],
    [{ error: privateData, cause: [{ code: privateData, description: privateData }] }, 'unrecognized', undefined],
    [{ message: privateData, extra: privateData }, 'invalid_schema', undefined],
  ]) {
    const e = await rejected(reply(data));assert.equal(e.providerDiagnostic, outcome);assert.equal(e.providerReason, reason);
    assert.equal(e.definitiveRejection, true);assert.equal(safePreapprovalSupport(e).provider_request_id, providerId);
    assert.doesNotMatch(JSON.stringify({ error: e, diagnostic: safeDiagnostic(e), support: safePreapprovalSupport(e) }), /person@|SYNTHETIC|NomePrivado|52998224725/);
  }
});

test('WCS-09 oversized, malformed and slow responses retain limits and definitive HTTP refusal', async () => {
  const headers = { 'content-type': 'application/json', 'x-request-id': providerId };
  const oversized = new Response(' '.repeat(8193), { status: 400, headers });
  const malformed = new Response('{"message":', { status: 400, headers });
  const slow = new Response(new ReadableStream({ pull: () => new Promise(() => {}) }), { status: 400, headers });
  for (const [response, expected] of [[oversized, 'too_large'], [malformed, 'invalid_json'], [slow, 'read_timeout']]) {
    const start = performance.now(), e = await rejected(response);
    assert.equal(e.providerDiagnostic, expected);assert.equal(e.definitiveRejection, true);
    assert.equal(e.code, 'billing_provider_invalid_request');assert.equal(safePreapprovalSupport(e).provider_request_id, providerId);
    assert.ok(performance.now() - start < 2000);
  }
});

test('WCS-10 real local HTTP/engine boundary logs safe metadata, returns no support data, retains trial and no duplicate POST', async () => {
  const c = await fixture(), logs = [], original = c.gateway.fetchImpl;
  c.gateway.supportCase56983 = true;
  let posts = 0;
  c.gateway.fetchImpl = async (url, init) => {
    if (new URL(url).pathname === '/preapproval' && init.method === 'POST') { posts++;return reply({ message: privateData }); }
    return original(url, init);
  };
  const server = createBillingServer({ origin: 'http://127.0.0.1', billing: c.engine, log: x => logs.push(x) });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  try {
    const result = await fetch(`http://127.0.0.1:${server.address().port}/billing/command`, { method: 'POST',
      headers: { Origin: 'http://127.0.0.1', Authorization: 'Bearer adminA', 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: c.orgs.A, action: 'checkout', request_key: randomUUID(),
        plan_version_id: c.versions.profissional, trial_expected: true, payer_email: body.payer_email, card_token: body.card_token_id }),
    });
    const browser = await result.json();assert.equal(result.status, 502);
    assert.deepEqual(Object.keys(browser).sort(), ['error', 'request_id']);assert.equal(browser.error, 'billing_provider_invalid_request');
    assert.equal(logs.length, 1);assert.equal(logs[0].request_id, browser.request_id);
    assert.equal(logs[0].provider_request_id, providerId);assert.notEqual(browser.request_id, providerId);
    assert.equal(logs[0].provider_diagnostic, 'unrecognized');assert.equal(logs[0].provider_status, 400);
    assert.equal(logs[0].support_case, 'WCS-56983');
    assert.equal(logs[0].provider_request_fields.card_token_id.non_empty_string, true);
    assert.equal(logs[0].provider_request_fields.notification_url.present, false);
    assert.doesNotMatch(JSON.stringify(logs), /person@|SYNTHETIC|NomePrivado|52998224725|Authorization|Bearer/);
    assert.equal(JSON.stringify(browser).includes(providerId), false);
    const row = (await c.rawSQL('select to_jsonb(c) c from private.billing047_contracts c where organization_id=$1', [c.orgs.A])).rows[0].c;
    assert.equal(row.state, 'payment_pending');assert.equal(row.operation_state, 'done');assert.equal(row.create_started, false);
    assert.equal(row.provider_id, null);assert.equal(row.trial_reserved, true);assert.equal(row.trial_recorded, false);
    assert.equal((await c.asUser('adminA', 'billing_capabilities', { p_org: c.orgs.A })).software, false);
    const serialized = JSON.stringify(row) + JSON.stringify((await c.rawSQL('select to_jsonb(a) a from private.billing047_audit a')).rows);
    assert.equal(serialized.includes(providerId), false);assert.doesNotMatch(serialized, /person@|SYNTHETIC_CARD_TOKEN|NomePrivado/);
    await c.engine.reconcile();assert.equal(posts, 1);
  } finally { await new Promise(ok => server.close(ok));await c.db.close(); }
});

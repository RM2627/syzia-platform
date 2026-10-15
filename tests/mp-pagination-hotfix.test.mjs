import test from 'node:test';
import assert from 'node:assert/strict';
import { MercadoPagoSubscriptions } from '../server/billing/mercado-pago.mjs';

const cfg = {
  accessToken: 'fictitious-test-token', collectorId: '101', applicationId: '202',
  notificationUrl: 'https://api.example.invalid/notifications',
  appOrigin: 'https://app.example.invalid', publicKey: 'fake-public-key',
};
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });

test('invoice search uses limit=10, paginates 12 results and never POSTs', async () => {
  const seen = [];
  const gateway = new MercadoPagoSubscriptions({ ...cfg, fetchImpl: async (url, options) => {
    const u = new URL(url), offset = Number(u.searchParams.get('offset'));
    seen.push({ path: u.pathname, limit: u.searchParams.get('limit'), offset, method: options.method });
    assert.equal(u.pathname, '/authorized_payments/search');
    assert.equal(u.searchParams.get('preapproval_id'), 'fake-subscription');
    if (u.searchParams.get('limit') !== '10') return response({ message: 'invalid limit' }, 400);
    return response({ paging: { total: 12 }, results: Array.from({ length: Math.min(10, 12 - offset) }, (_, i) => ({ id: `fake-${offset + i}` })) });
  }});
  assert.equal((await gateway.invoices('fake-subscription')).length, 12);
  assert.deepEqual(seen.map(x => x.offset), [0, 10]);
  assert.ok(seen.every(x => x.limit === '10' && x.method === 'GET'));
});

test('subscription search preserves limit=50', async () => {
  const gateway = new MercadoPagoSubscriptions({ ...cfg, fetchImpl: async (url, options) => {
    const u = new URL(url);
    assert.equal(u.pathname, '/preapproval/search');
    assert.equal(u.searchParams.get('limit'), '50');
    assert.equal(u.searchParams.get('external_reference'), 'fake-contract');
    assert.equal(options.method, 'GET');
    return response({ paging: { total: 1 }, results: [{ id: 'fake-subscription' }] });
  }});
  assert.equal((await gateway.find('fake-contract')).length, 1);
});

test('empty invoice search returns empty array', async () => {
  const gateway = new MercadoPagoSubscriptions({ ...cfg, fetchImpl: async () => response({ paging: { total: 0 }, results: [] }) });
  assert.deepEqual(await gateway.invoices('fake-subscription'), []);
});

test('truncated invoice pagination fails closed', async () => {
  let page = 0;
  const gateway = new MercadoPagoSubscriptions({ ...cfg, fetchImpl: async () => {
    page++;
    return response(page === 1
      ? { paging: { total: 11 }, results: Array.from({ length: 10 }, (_, i) => ({ id: `fake-${i}` })) }
      : { paging: { total: 11 }, results: [] });
  }});
  await assert.rejects(gateway.invoices('fake-subscription'), e => e.code === 'billing_reconciliation_required');
  assert.equal(page, 2);
});

import { createHmac, timingSafeEqual } from 'node:crypto';
import { API_VERSION, DAY, OFFERS, Fault, ensure, ref, idOK } from './policy.mjs';

function form(value, prefix = '', out = new URLSearchParams()) {
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) form(v, prefix ? `${prefix}[${k}]` : k, out);
  else if (value !== undefined && value !== null) out.append(prefix, String(value));
  return out;
}
export async function boundedJSON(response, max = 262144) {
  ensure(!response.headers.get('content-length') || Number(response.headers.get('content-length')) <= max, 'provider_response_invalid');
  const reader = response.body?.getReader(); ensure(reader, 'provider_response_invalid');
  const chunks = []; let size = 0;
  try {
    while (true) { const r = await reader.read(); if (r.done) break; size += r.value.length; ensure(size <= max, 'provider_response_invalid'); chunks.push(r.value); }
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    ensure(value && !Array.isArray(value) && typeof value === 'object', 'provider_response_invalid'); return value;
  } catch { await reader.cancel().catch(() => {}); throw new Fault('provider_response_invalid', 502, true); }
}
export function verifyWebhook(raw, signature, secret, now = Math.floor(Date.now() / 1000), livemode = false) {
  ensure(Buffer.isBuffer(raw) && raw.length <= 65536 && typeof signature === 'string' && signature.length <= 4096 && typeof secret === 'string' && secret.length >= 16, 'webhook_invalid', 400);
  const parts = signature.split(',').map(x => x.split('='));
  const times = parts.filter(([k]) => k === 't');
  const hashes = parts.filter(([k,v]) => k === 'v1' && /^[a-f0-9]{64}$/.test(v || ''));
  ensure(times.length === 1 && /^\d{10}$/.test(times[0][1]) && Math.abs(now - Number(times[0][1])) <= 300 && hashes.length > 0, 'webhook_signature_invalid', 400);
  const computed = createHmac('sha256', secret).update(`${times[0][1]}.`).update(raw).digest();
  ensure(hashes.some(([,h]) => timingSafeEqual(computed, Buffer.from(h, 'hex'))), 'webhook_signature_invalid', 400);
  let event; try { event = JSON.parse(raw); } catch { throw new Fault('webhook_invalid', 400); }
  ensure(event && idOK(event.id) && event.livemode === livemode && typeof event.type === 'string' && event.type.length < 100 && idOK(event.data?.object?.id), 'webhook_invalid', 400);
  return event;
}
export class StripeGateway {
  constructor(config, fetchImpl = fetch, timeout = 8000) { ensure(config.transport!=='simulated'||fetchImpl!==fetch,'simulated_transport_required');this.cfg = config; this.fetch = fetchImpl; this.timeout = timeout; }
  async request(method, path, body, key) {
    ensure((this.cfg.environment !== 'production' && this.cfg.livemode !== true) || this.cfg.productionAuthorized === true, 'production_not_authorized');
    ensure(method !== 'POST' || this.cfg.operationsEnabled === true, 'operations_disabled');
    ensure(['GET','POST'].includes(method) && (method!=='POST'||typeof key==='string'&&/^[A-Za-z0-9:_-]{1,240}$/.test(key)), 'provider_request_identity_invalid');
    ensure(/^\/[a-z_]+(?:\/[A-Za-z0-9_-]+)*(?:\?[A-Za-z0-9_%=&\[\]-]+)?$/.test(path), 'provider_path_invalid');
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), this.timeout);
    try {
      const response = await this.fetch(`https://api.stripe.com/v1${path}`, { method, redirect: 'error', signal: abort.signal,
        headers: { Authorization: `Bearer ${this.cfg.key}`, 'Stripe-Version': this.cfg.apiVersion || API_VERSION, ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': key } : {}) },
        ...(method === 'POST' ? { body: form(body) } : {}) });
      const version = response.headers.get('stripe-version');
      this.lastResponse = { requestedVersion: this.cfg.apiVersion || API_VERSION, responseVersion: /^[0-9]{4}-[0-9]{2}-[0-9]{2}(?:\.[a-z]+)?$/.test(version || '') ? version : null };
      if (!response.ok) {
        // Nunca interpolar message/body/headers do fornecedor em erro ou log.
        await response.body?.cancel().catch(() => {});
        const code = response.status === 401 || response.status === 403 ? 'provider_auth_rejected' : response.status === 429 ? 'provider_rate_limited' : response.status >= 500 ? 'provider_unavailable' : 'provider_request_rejected';
        throw new Fault(code, 502, response.status >= 500 || response.status === 409 || response.status === 429);
      }
      if(version && version !== (this.cfg.apiVersion || API_VERSION)) {
        await response.body?.cancel().catch(()=>{});
        throw new Fault('provider_api_version_mismatch',502,method==='POST');
      }
      try { return await boundedJSON(response); } catch { await response.body?.cancel().catch(()=>{}); throw new Fault('provider_response_invalid', 502, method === 'POST'); }
    } catch (error) { if (error instanceof Fault) throw error; throw new Fault('provider_network_uncertain', 502, true); }
    finally { clearTimeout(timer); }
  }
  async catalog() {
    const account = await this.request('GET', '/account'); ensure(account.id === this.cfg.account, 'provider_account_mismatch');
    const product = await this.request('GET', `/products/${this.cfg.product}`);
    ensure(product.id === this.cfg.product && product.livemode === (this.cfg.livemode === true) && product.active === true, 'provider_product_mismatch');
    for (const [code, offer] of Object.entries(OFFERS)) {
      const p = await this.request('GET', `/prices/${this.cfg.prices[code]}`);
      this.price(p, offer); ensure(p.active === true, 'provider_price_inactive');
    }
  }
  price(p, offer) {
    ensure(p && p.id === this.cfg.prices[offer.code] && p.livemode === (this.cfg.livemode === true) && ref(p.product) === this.cfg.product && p.currency === 'brl' && p.unit_amount === offer.amount && p.type === 'recurring' && ((p.recurring?.interval === 'month' && p.recurring?.interval_count === offer.months) || (offer.code === 'annual' && p.recurring?.interval === 'year' && p.recurring?.interval_count === 1)) && p.recurring?.usage_type === 'licensed' && p.billing_scheme === 'per_unit', 'provider_price_mismatch');
  }
  metadata(c) { return { syzia_contract: c.id, syzia_organization: c.org, syzia_environment: c.binding?.environment || this.cfg.environment || 'test', syzia_offer: c.offer.code, syzia_integration: 'supabase069' }; }
  customer(c) { return this.request('POST', '/customers', { metadata: this.metadata(c) }, `${c.id}:customer`); }
  getCustomer(id) { ensure(idOK(id)); return this.request('GET', `/customers/${id}`); }
  checkout(c) {
    ensure(c.binding?.apiVersion === API_VERSION, 'legacy_checkout_reconciliation_required');
    return this.request('POST', '/checkout/sessions', {
      mode: 'subscription', ui_mode: 'hosted_page', customer: c.customer, client_reference_id: c.id, metadata: this.metadata(c),
      line_items: [{ price: this.cfg.prices[c.offer.code], quantity: 1 }], allowed_payment_method_types: ['card'], payment_method_collection: 'always',
      subscription_data: { billing_mode: { type: 'classic' }, metadata: this.metadata(c), ...(c.trial ? { trial_period_days: 7, trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } } : {}) },
      allow_promotion_codes: false, automatic_tax: { enabled: false },
      success_url: `${this.cfg.origin}/painel/${c.org}/assinatura?retorno=stripe`, cancel_url: `${this.cfg.origin}/painel/${c.org}/assinatura?retorno=stripe-cancelado`,
      expires_at: (c.attemptCreated||c.created) + 3600, locale: 'pt-BR',
    }, `${c.id}:checkout:${c.generation||0}`);
  }
  session(id) { ensure(idOK(id)); return this.request('GET', `/checkout/sessions/${id}`); }
  subscription(id) { ensure(idOK(id)); return this.request('GET', `/subscriptions/${id}?expand%5B%5D=default_payment_method`); }
  getPrice(id) { ensure(idOK(id)); return this.request('GET', `/prices/${id}`); }
  invoice(id) { ensure(idOK(id)); return this.request('GET', `/invoices/${id}`); }
  async invoices(id) {
    ensure(idOK(id)); const all = []; let cursor = '';
    for (let page = 0; page < 20; page++) {
      const list = await this.request('GET', `/invoices?subscription=${id}&limit=100${cursor ? `&starting_after=${cursor}` : ''}`);
      ensure(Array.isArray(list.data) && typeof list.has_more === 'boolean', 'provider_response_invalid'); all.push(...list.data);
      if (!list.has_more) return all;
      cursor = list.data.at(-1)?.id; ensure(idOK(cursor), 'provider_response_invalid');
    }
    throw new Fault('reconciliation_page_limit', 503);
  }
  cancellation(id, value, key) { ensure(idOK(id)); return this.request('POST', `/subscriptions/${id}`, { cancel_at_period_end: value }, key); }
  schedule(id, key) { ensure(idOK(id)); return this.request('POST', '/subscription_schedules', { from_subscription: id }, key); }
  getSchedule(id) { ensure(idOK(id)); return this.request('GET', `/subscription_schedules/${id}`); }
  change(c, schedule, key) {
    ensure(idOK(schedule)); const target = OFFERS[c.change.target];
    return this.request('POST', `/subscription_schedules/${schedule}`, { end_behavior: 'release', proration_behavior: 'none',
      phases: [{ start_date: c.periodStart, end_date: c.periodEnd, items: [{ price: this.cfg.prices[c.currentOffer], quantity: 1 }], proration_behavior: 'none' },
        { items: [{ price: this.cfg.prices[target.code], quantity: 1 }], duration: { interval: 'month', interval_count: target.months }, billing_cycle_anchor: 'phase_start', proration_behavior: 'none' }],
    }, key);
  }
  release(schedule, key) { ensure(idOK(schedule)); return this.request('POST', `/subscription_schedules/${schedule}/release`, {}, key); }
}

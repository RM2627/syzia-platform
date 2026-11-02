import { BillingError } from '../mercado-pago.mjs';
export const DAY = 86400;
export const API_VERSION = '2026-09-30.endive';
export const OFFERS = Object.freeze({
  monthly: Object.freeze({ code: 'monthly', name: 'Mensal', amount: 5990, months: 1 }),
  semiannual: Object.freeze({ code: 'semiannual', name: 'Semestral', amount: 29940, months: 6 }),
  annual: Object.freeze({ code: 'annual', name: 'Anual', amount: 47880, months: 12 }),
});
export class Fault extends BillingError {
  constructor(code, status = 409, uncertain = false) { super(`billing_stripe_${code}`, status); this.uncertain = uncertain; }
}
export function ensure(ok, code = 'provider_binding_invalid', status = 409) { if (!ok) throw new Fault(code, status); }
export const ref = value => typeof value === 'string' ? value : value?.id;
export const idOK = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{3,160}$/.test(value);
export function addMonths(seconds, months, anchor = seconds) {
  const date = new Date(seconds * 1000), a = new Date(anchor * 1000);
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(a.getUTCDate(), last));
  return Math.floor(date.getTime() / 1000);
}

// Reusable environment contract. Parsing production configuration does not activate it.
// The local POC runtime above deliberately accepts simulated / stripe_test only.
export function stripeEnvironment(env, environment, { requireWebhook = true } = {}) {
  ensure(['test', 'production'].includes(environment), 'stripe_environment_invalid');
  const prefix = environment === 'test' ? 'STRIPE_TEST_' : 'STRIPE_PRODUCTION_';
  const other = environment === 'test' ? 'STRIPE_PRODUCTION_' : 'STRIPE_TEST_';
  const live = environment === 'production', key = env[prefix + 'SECRET_KEY'];
  ensure(new RegExp(`^(sk|rk)_${live ? 'live' : 'test'}_[A-Za-z0-9]{16,}$`).test(key || ''), 'stripe_environment_credential_invalid');
  const account = env[prefix + 'ACCOUNT_ID'], product = env[prefix + 'PRODUCT_ID'];
  const prices = Object.fromEntries(Object.keys(OFFERS).map(k => [k, env[prefix + 'PRICE_' + k.toUpperCase()]]));
  ensure(/^acct_[A-Za-z0-9]+$/.test(account || '') && /^prod_[A-Za-z0-9]+$/.test(product || '') && Object.values(prices).every(p => /^price_[A-Za-z0-9]+$/.test(p || '')) && new Set(Object.values(prices)).size === 3, 'stripe_mapping_invalid');
  // A Stripe account can be shared by test/live. Resource IDs and webhook secrets cannot.
  const opposite = ['PRODUCT_ID', 'PRICE_MONTHLY', 'PRICE_SEMIANNUAL', 'PRICE_ANNUAL'].map(k => env[other + k]).filter(Boolean);
  ensure(![product, ...Object.values(prices)].some(id => opposite.includes(id)), 'stripe_environment_mapping_overlap');
  const webhookSecret = env[prefix + 'WEBHOOK_SECRET'];
  if (requireWebhook) ensure(/^whsec_[A-Za-z0-9]{16,}$/.test(webhookSecret || ''), 'webhook_secret_required');
  ensure(!webhookSecret || webhookSecret !== env[other + 'WEBHOOK_SECRET'], 'stripe_environment_webhook_overlap');
  return { environment, livemode: live, productionAuthorized: false, apiVersion: API_VERSION, key, account, product, prices, webhookSecret };
}

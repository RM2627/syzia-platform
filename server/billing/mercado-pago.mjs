// SaaS subscriptions only. Raw card fields never enter this adapter.
import { createHmac, timingSafeEqual } from "node:crypto";
import { providerFailure } from "./diagnostics.mjs";
const ID = /^[a-zA-Z0-9_-]{1,160}$/;
export const commercialPrices = Object.freeze({ essencial: 4990, profissional: 8990, equipe: 14990 });
export class BillingError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
export const fail = (code, status) => { throw new BillingError(code, status); };
export function identifier(value) {
  if (!ID.test(String(value ?? ""))) fail("billing_response_invalid", 502);
  return String(value);
}
export function cents(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) fail("billing_response_invalid", 502);
  const n = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(n)) fail("billing_response_invalid", 502);
  return n;
}
export function iso(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail("billing_response_invalid", 502);
  return new Date(value).toISOString();
}
export function monthAfter(value) {
  const d = new Date(iso(value)), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last)); return d.toISOString();
}
export function validateOffer(offer) {
  if (!offer || commercialPrices[offer.code] !== offer.amount_cents || offer.currency !== "BRL" || offer.interval_months !== 1)
    fail("billing_plan_unavailable");
}
export class MercadoPagoSubscriptions {
  constructor({ accessToken, collectorId, applicationId, notificationUrl, appOrigin, publicKey,
    webhookSecret = "", notificationAuth = "resource_lookup", fetchImpl = globalThis.fetch, timeoutMs = 10000 }) {
    if (!accessToken || !collectorId || !applicationId || !notificationUrl || !appOrigin || !publicKey)
      fail("billing_credentials_missing", 503);
    const callback = new URL(notificationUrl), app = new URL(appOrigin);
    if (callback.protocol !== "https:" || callback.username || callback.password || callback.search || callback.hash ||
      app.protocol !== "https:" || app.username || app.password) fail("billing_configuration_invalid", 503);
    if (!["resource_lookup", "hmac"].includes(notificationAuth) || (notificationAuth === "hmac" && !webhookSecret))
      fail("billing_configuration_invalid", 503);
    Object.assign(this, { accessToken, collectorId: String(collectorId), applicationId: String(applicationId),
      notificationUrl: callback.href, appOrigin: app.origin, publicKey, webhookSecret, notificationAuth, fetchImpl, timeoutMs });
  }
  async request(path, method = "GET", body, key) {
    // Fixed origin, no redirects, no provider message/body in exceptions or logs.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const r = await this.fetchImpl("https://api.mercadopago.com" + path, {
        method, redirect: "error", signal: controller.signal,
        headers: { Authorization: "Bearer " + this.accessToken, "Content-Type": "application/json", ...(key ? { "X-Idempotency-Key": key } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!r.ok) {
        const diagnostic = providerFailure(r.status, path, method);
        const error = new BillingError(diagnostic.code, 502);
        Object.assign(error, diagnostic);
        // Never parse or retain an error body: /preapproval only documents broad
        // HTTP categories. Payment/Orders error codes are not this API's contract.
        await r.body?.cancel().catch(() => {});
        throw error;
      }
      const raw = await r.text();
      if (raw.length > 1048576) fail("billing_response_invalid", 502);
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || Array.isArray(data)) fail("billing_response_invalid", 502);
      return data;
    } catch (e) {
      if (e instanceof BillingError) throw e;
      fail(controller.signal.aborted ? "billing_timeout" : e instanceof SyntaxError ? "billing_response_invalid" : "billing_provider_unavailable", 502);
    } finally { clearTimeout(timeout); }
  }
  async plan(id, offer, trial) {
    validateOffer(offer);
    const p = await this.request("/preapproval_plan/" + identifier(id));
    const a = p.auto_recurring;
    if (String(p.id) !== id || String(p.collector_id) !== this.collectorId || String(p.application_id) !== this.applicationId ||
      p.status !== "active" || !a || a.frequency !== 1 || a.frequency_type !== "months" || a.currency_id !== "BRL" ||
      cents(a.transaction_amount) !== offer.amount_cents ||
      (trial ? a.free_trial?.frequency !== 7 || a.free_trial?.frequency_type !== "days" : Number(a.free_trial?.frequency || 0) !== 0) ||
      a.billing_day_proportional === true || a.repetitions || a.end_date) fail("billing_plan_mismatch", 503);
    return p;
  }
  async create(binding, cardToken, email, planValidated = false) {
    if (!/^[a-zA-Z0-9_-]{16,200}$/.test(cardToken || "") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "")) fail("billing_payment_method_required", 400);
    if (!planValidated) await this.plan(binding.provider_plan_id, binding, binding.trial_reserved);
    // Associated subscriptions require authorized + an official card token.
    return this.request("/preapproval", "POST", {
      preapproval_plan_id: binding.provider_plan_id, external_reference: binding.id,
      payer_email: email, card_token_id: cardToken, status: "authorized",
      reason: "SYZIA " + binding.code,
      back_url: this.appOrigin + "/painel/" + binding.organization_id + "/assinatura?retorno=1",
      // MP-01 remains unverified: the published preapproval contract does not
      // establish delivery through this field. See docs/billing-mp01/README.md.
      notification_url: this.notificationUrl,
    }, binding.id);
  }
  read(id) { return this.request("/preapproval/" + identifier(id)); }
  invoice(id) { return this.request("/authorized_payments/" + identifier(id)); }
  payment(id) { return this.request("/v1/payments/" + identifier(id)); }
  update(id, body, key) { return this.request("/preapproval/" + identifier(id), "PUT", body, key); }
  async search(path, query) {
    let offset = 0, all = [];
    do {
      const r = await this.request(path + "?" + new URLSearchParams({ ...query, offset: String(offset), limit: path === "/authorized_payments/search" ? "10" : "50" }));
      if (!Array.isArray(r.results) || !Number.isSafeInteger(r.paging?.total) || r.paging.total < 0) fail("billing_response_invalid", 502);
      all.push(...r.results); offset += r.results.length;
      if (offset >= r.paging.total) return all;
      if (!r.results.length || offset > 5000) fail("billing_reconciliation_required", 503);
    } while (true);
  }
  find(reference) { return this.search("/preapproval/search", { external_reference: reference }); }
  invoices(id) { return this.search("/authorized_payments/search", { preapproval_id: identifier(id) }); }
  notification(raw, headers, query) {
    if (!Buffer.isBuffer(raw) || raw.length > 16384) fail("billing_webhook_invalid", 400);
    let p; try { p = JSON.parse(raw.toString("utf8")); } catch { fail("billing_webhook_invalid", 400); }
    const type = p?.type;
    if (!["subscription_preapproval", "subscription_authorized_payment", "payment"].includes(type)) return null;
    const id = identifier(p?.data?.id);
    if (query.get("data.id") && query.get("data.id") !== id) fail("billing_webhook_invalid", 400);
    if (p.user_id != null && String(p.user_id) !== this.collectorId) fail("billing_binding_mismatch", 400);
    // A configured secret must never be bypassed by stripping x-signature.
    if (this.notificationAuth === "hmac" || this.webhookSecret) {
      if (!this.webhookSecret) fail("billing_webhook_invalid", 401);
      const parts = Object.fromEntries(String(headers["x-signature"] || "").split(",").map(x => x.trim().split("=")));
      const requestId = headers["x-request-id"];
      if (!/^\d{10,13}$/.test(parts.ts || "") || !/^[a-f0-9]{64}$/i.test(parts.v1 || "") || !/^[a-zA-Z0-9-]{1,160}$/.test(requestId || "")) fail("billing_webhook_invalid", 401);
      const manifest = `id:${id.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
      const expected = createHmac("sha256", this.webhookSecret).update(manifest).digest();
      if (!timingSafeEqual(expected, Buffer.from(parts.v1, "hex"))) fail("billing_webhook_invalid", 401);
    }
    // resource_lookup without a secret does NOT authenticate the POST's origin.
    // Subscription resource notifications are hints, including validly signed hints.
    // Neither this payload nor the browser redirect can grant access.
    return { type, id };
  }
}

// Static check names only: never include compared values or provider bodies.
export function bindingCheck(condition, check, code = "billing_binding_mismatch") {
  if (!condition) { const e = new BillingError(code, 502); e.validationCheck = check; throw e; }
}
export function verifyBinding(gateway, binding, p, linked = true) {
  if (linked) bindingCheck(String(p.id) === binding.provider_id, "provider_id");
  bindingCheck(String(p.external_reference) === binding.id, "external_reference");
  bindingCheck(String(p.collector_id) === gateway.collectorId, "collector_id");
  bindingCheck(String(p.application_id) === gateway.applicationId, "application_id");
  bindingCheck(p.preapproval_plan_id === binding.provider_plan_id, "plan_id");
  if (binding.provider_payer_id != null)
    bindingCheck(String(p.payer_id) === binding.provider_payer_id, "payer_id");
}

// Some official preapproval responses omit this counter. Absence is distinct
// from an explicitly invalid value; never synthesize a provider version.
export function providerVersion(p) {
  if (!Object.hasOwn(p, "version")) return undefined;
  bindingCheck(Number.isSafeInteger(p.version) && p.version >= 0, "version");
  return p.version;
}

export async function verifiedSnapshot(gateway, binding, preapproval) {
  const p = preapproval || await gateway.read(binding.provider_id);
  const a = p.auto_recurring;
  const allowedAmount = [binding.amount_cents, binding.target_amount].filter(x => x != null);
  verifyBinding(gateway, binding, p);
  bindingCheck(Boolean(a) && a.frequency === 1 && a.frequency_type === "months", "recurrence");
  bindingCheck(a.currency_id === "BRL", "currency");
  bindingCheck(allowedAmount.includes(cents(a.transaction_amount)), "amount");
  const version = providerVersion(p);
  bindingCheck(["authorized", "pending", "paused", "cancelled", "canceled"].includes(p.status), "status");
  bindingCheck(p.payer_id != null && /^[a-zA-Z0-9_-]{1,160}$/.test(String(p.payer_id)), "payer_id");
  const invoices = await gateway.invoices(p.id);
  const payments = [];
  let lastFour = null;
  for (const f of invoices) {
    bindingCheck(String(f.preapproval_id) === p.id, "invoice_subscription");
    bindingCheck(String(f.external_reference) === binding.id, "invoice_reference");
    bindingCheck(f.currency_id === "BRL", "invoice_currency");
    if (!f.payment?.id) continue; // A scheduled invoice is not payment confirmation.
    const payment = await gateway.payment(f.payment.id);
    bindingCheck(String(payment.id) === String(f.payment.id), "payment_id");
    bindingCheck(String(payment.collector_id) === gateway.collectorId, "payment_collector");
    bindingCheck(payment.currency_id === "BRL", "payment_currency");
    bindingCheck(cents(payment.transaction_amount) === cents(f.transaction_amount), "payment_amount");
    bindingCheck(payment.external_reference == null || String(payment.external_reference) === binding.id, "payment_reference");
    bindingCheck(payment.payer?.id == null || String(payment.payer.id) === String(p.payer_id), "payment_payer");
    // Only the official payment's card explicitly matching the current subscription.
    // The subscription API does not promise PAN suffixes; absence remains null.
    if (p.card_id && String(payment.card?.id) === String(p.card_id) && /^\d{4}$/.test(payment.card?.last_four_digits || ""))
      lastFour = payment.card.last_four_digits;
    const status = ({ approved: "paid", rejected: "failed", cancelled: "failed", pending: "pending", in_process: "pending", authorized: "pending", refunded: "reversed", charged_back: "reversed" })[payment.status];
    if (!status) fail("billing_response_invalid", 502);
    payments.push({ id: identifier(f.id), payment_id: identifier(payment.id), status,
      amount_cents: cents(f.transaction_amount), debit_at: iso(f.debit_date), modified_at: iso(payment.date_last_updated || f.last_modified),
      paid_at: status === "paid" ? iso(payment.date_approved) : null,
      period_end: monthAfter(f.debit_date) });
  }
  const created = iso(p.date_created), trialEnd = binding.trial_reserved ? new Date(Date.parse(created) + 7 * 86400000).toISOString() : null;
  bindingCheck(!binding.trial_reserved || (a.free_trial?.frequency === 7 && a.free_trial?.frequency_type === "days"), "trial_duration", "billing_trial_mismatch");
  bindingCheck(binding.trial_reserved || Number(a.free_trial?.frequency || 0) === 0, "trial_duration", "billing_trial_mismatch");
  if (binding.trial_recorded) bindingCheck(iso(binding.trial_start) === created && iso(binding.trial_end) === trialEnd, "trial_dates", "billing_trial_mismatch");
  if (binding.trial_reserved && !payments.some(x => x.status === "paid") && p.next_payment_date && Date.parse(iso(p.next_payment_date)) < Date.parse(trialEnd) - 60000)
    bindingCheck(false, "first_charge", "billing_trial_mismatch");
  const state = ({ authorized: "authorized", pending: "pending", paused: "paused", canceled: "canceled", cancelled: "canceled" })[p.status];
  payments.sort((a, b) => a.id.localeCompare(b.id));
  return { provider_id: p.id, payer_reference: identifier(p.payer_id), method_last_four: lastFour, ...(version === undefined ? {} : { version }), modified_at: iso(p.last_modified), state,
    card_reference: p.card_id ? identifier(p.card_id) : null,
    method_linked: Boolean(p.card_id && p.payment_method_id), method_label: /^[a-z0-9_ -]{1,40}$/i.test(p.payment_method_id || "") ? p.payment_method_id : null,
    trial_start: binding.trial_reserved ? created : null, trial_end: trialEnd,
    next_charge: p.next_payment_date ? iso(p.next_payment_date) : null,
    amount_cents: cents(a.transaction_amount), payments };
}

import { normalizeSubscription, internalBillingEvent } from "./contract.mjs";
/** Provider-neutral server-only contract. Not a vendor implementation or live gateway.
 * A production adapter + durable transactional store must be supplied and homologated
 * together. There is intentionally no automatic fallback from real to mock billing.
 */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function exact(value, keys) {
  if (
    !value ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== keys.sort().join(",")
  )
    throw Error("billing_payload_invalid");
}
export function assertProvider(adapter) {
  if (
    !adapter ||
    !/^[a-z][a-z0-9_-]{2,39}$/.test(adapter.name || "") ||
    !["test", "live"].includes(adapter.mode) ||
    ![
      "createCheckout",
      "verifyWebhook",
      "readSubscription",
      "cancelAtPeriodEnd",
      "resume",
    ].every((k) => typeof adapter[k] === "function")
  )
    throw Error("billing_provider_not_configured");
}
export async function hostedCheckout({
  body,
  token,
  auth,
  store,
  adapter,
  appOrigin,
}) {
  assertProvider(adapter);
  exact(body, ["organization_id", "plan_id", "request_key"]);
  if (!Object.values(body).every((x) => typeof x === "string" && uuid.test(x)))
    throw Error("billing_payload_invalid");
  const actor = await auth(token);
  if (!actor?.id || actor.is_anonymous) throw Error("access_denied");
  const app = new URL(appOrigin);
  if (
    app.protocol !== "https:" &&
    !(
      adapter.mode === "test" &&
      ["localhost", "127.0.0.1"].includes(app.hostname)
    )
  )
    throw Error("billing_origin_invalid");
  // Store MUST revalidate current role/suspension + read immutable price/version from SQL,
  // atomically reserve idempotency key & org, and return existing checkout on retry.
  const reserved = await store.reserve({
    actor: actor.id,
    ...body,
    provider: adapter.name,
    mode: adapter.mode,
  });
  if (reserved.checkout_url)
    return { url: reserved.checkout_url, simulation: adapter.mode === "test" };
  const result = await adapter.createCheckout({
    reference: reserved.id,
    idempotencyKey: reserved.id,
    organization: reserved.organization_id,
    planVersion: reserved.plan_version_id,
    amount: reserved.amount_cents,
    currency: reserved.currency,
    intervalMonths: reserved.interval_months,
    returnUrl:
      app.origin + "/painel/" + reserved.organization_id + "/assinatura",
  });
  const checkout = new URL(result.url);
  if (
    checkout.protocol !== "https:" ||
    !adapter.checkoutOrigins?.includes(checkout.origin) ||
    !result.id
  )
    throw Error("billing_checkout_invalid");
  // Persist provider reference before exposing checkout. A crash retries same provider key.
  await store.bind(reserved.id, {
    providerCheckoutId: result.id,
    url: checkout.href,
  });
  return { url: checkout.href, simulation: adapter.mode === "test" };
}
export async function synchronizeWebhook({ raw, headers, adapter, store }) {
  assertProvider(adapter);
  if (!Buffer.isBuffer(raw) || raw.length > 262144)
    throw Error("billing_webhook_invalid");
  // Vendor-specific authenticity/timestamp check over exact bytes, before any DB operation.
  const event = await adapter.verifyWebhook(raw, headers);
  if (!event?.id || !event.subscriptionId)
    throw Error("billing_webhook_invalid");
  const binding = await store.lookup(adapter.name, event.subscriptionId);
  if (!binding) throw Error("billing_binding_missing");
  // Retrieve current contractual truth through authenticated provider API. Never trust
  // organization, price or access dates from browser / redirect / unchecked event metadata.
  const state = normalizeSubscription(
    await adapter.readSubscription(event.subscriptionId),
  );
  if (
    state.id !== binding.providerSubscriptionId ||
    state.checkoutId !== binding.providerCheckoutId ||
    state.currency !== binding.currency ||
    state.amount !== binding.amount_cents ||
    state.planVersion !== binding.plan_version_id
  )
    throw Error("billing_binding_mismatch");
  if (
    ![
      "pending",
      "active",
      "past_due",
      "cancelled",
      "suspended",
      "refunded",
      "chargeback",
    ].includes(state.status) ||
    !Number.isSafeInteger(state.sequence) ||
    state.sequence < 0 ||
    !Number.isFinite(Date.parse(state.periodStart)) ||
    !(Date.parse(state.periodEnd) > Date.parse(state.periodStart))
  )
    throw Error("billing_contract_invalid");
  // Durable implementation must lock organization, reject conflicting event replay,
  // ignore older sequence, atomically update existing subscriptions/invoices/history
  // and preserve administrative suspension, data and immutable trial history.
  return store.apply({
    binding,
    eventId: event.id,
    sequence: state.sequence,
    type: internalBillingEvent(state),
    state,
    simulation: adapter.mode === "test",
  });
}
export async function manageHostedSubscription({
  token,
  organization,
  action,
  auth,
  store,
  adapter,
}) {
  assertProvider(adapter);
  if (!uuid.test(organization) || !["cancel", "resume"].includes(action))
    throw Error("billing_payload_invalid");
  const actor = await auth(token);
  if (!actor?.id || actor.is_anonymous) throw Error("access_denied");
  const binding = await store.authorizeManagement(actor.id, organization);
  return action === "cancel"
    ? adapter.cancelAtPeriodEnd(binding.providerSubscriptionId)
    : adapter.resume(binding.providerSubscriptionId);
  // Response alone never activates/deactivates local access. Verified webhook synchronizes.
}

/** Explicit upgrade/downgrade preparation. The store authorizes and reserves an
 * immutable target version using the same contracts as checkout. Provider acknowledgement
 * never updates entitlements; synchronization requires the validated confirmation path.
 */
export async function changeHostedPlan({ body, token, auth, store, adapter }) {
  assertProvider(adapter);
  exact(body, ["organization_id", "plan_id", "request_key"]);
  if (!Object.values(body).every((x) => typeof x === "string" && uuid.test(x)))
    throw Error("billing_payload_invalid");
  if (
    typeof adapter.changePlan !== "function" ||
    typeof store.reservePlanChange !== "function"
  )
    throw Error("billing_plan_change_unavailable");
  const actor = await auth(token);
  if (!actor?.id || actor.is_anonymous) throw Error("access_denied");
  const target = await store.reservePlanChange({
    actor: actor.id,
    ...body,
    provider: adapter.name,
    mode: adapter.mode,
  });
  if (
    !target.id ||
    !uuid.test(target.plan_version_id) ||
    !Number.isSafeInteger(target.amount_cents) ||
    target.amount_cents < 0 ||
    target.currency !== "BRL" ||
    !["immediate_after_confirmation", "period_end"].includes(target.effective)
  )
    throw Error("billing_contract_invalid");
  await adapter.changePlan({
    subscriptionId: target.providerSubscriptionId,
    idempotencyKey: target.id,
    planVersion: target.plan_version_id,
    amount: target.amount_cents,
    currency: target.currency,
    intervalMonths: target.interval_months,
    effective: target.effective,
  });
  return {
    pendingConfirmation: true,
    effective: target.effective,
    simulation: adapter.mode === "test",
  };
}

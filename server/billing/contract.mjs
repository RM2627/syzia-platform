/** Single provider-neutral vocabulary for the hosted SaaS billing boundary.
 * Provider adapters normalize their responses into this contract. No vendor,
 * account, checkout endpoint or live webhook is configured by this module.
 */
const statuses = new Set([
  "pending",
  "active",
  "past_due",
  "cancelled",
  "suspended",
  "refunded",
  "chargeback",
]);
export function normalizeSubscription(state) {
  if (
    !state ||
    !statuses.has(state.status) ||
    !Number.isSafeInteger(state.sequence) ||
    state.sequence < 0 ||
    !Number.isSafeInteger(state.amount) ||
    state.amount < 0 ||
    state.currency !== "BRL" ||
    !Number.isFinite(Date.parse(state.periodStart)) ||
    !(Date.parse(state.periodEnd) > Date.parse(state.periodStart))
  )
    throw Error("billing_contract_invalid");
  return {
    id: state.id,
    checkoutId: state.checkoutId,
    planVersion: state.planVersion,
    amount: state.amount,
    currency: state.currency,
    status: state.status,
    sequence: state.sequence,
    periodStart: new Date(state.periodStart).toISOString(),
    periodEnd: new Date(state.periodEnd).toISOString(),
    cancelAtPeriodEnd: state.cancelAtPeriodEnd === true,
  };
}
export function internalBillingEvent(state) {
  return {
    pending: "billing.pending",
    active: "billing.confirmed",
    past_due: "billing.payment_failed",
    cancelled: "billing.cancelled",
    suspended: "billing.suspended",
    refunded: "billing.refunded",
    chargeback: "billing.disputed",
  }[state.status];
}
export const billingAdapterContract = Object.freeze({
  methods: [
    "createCheckout",
    "verifyWebhook",
    "readSubscription",
    "cancelAtPeriodEnd",
    "resume",
    "changePlan",
  ],
  states: [...statuses],
  // Renewal/recovery/reactivation are confirmed current contractual snapshots,
  // not a browser command to grant access. Sequence and immutable version bind them.
  confirmation: "verified_webhook_then_authenticated_subscription_read",
  persistence: "existing_syzia_subscriptions_versions_entitlements",
});

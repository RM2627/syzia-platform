// Explicit homologation only: authenticated hints and official reads, no writes.
import { fail, identifier, verifiedSnapshot } from "./mercado-pago.mjs";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function notificationObserver({ gateway, service }) {
  // Do not reuse subscriptions.process: it can finish previously authorized
  // operations, apply trial/capabilities and update the provider.
  const get = async id => {
    if (!UUID.test(String(id))) fail("billing_binding_mismatch", 400);
    try { return await service("billing047_service", { p_action: "get", p_id: id, p_data: {} }); }
    catch (e) {
      if (e?.message === "billing_binding_missing") fail("billing_binding_missing", 409);
      fail("billing_observation_unavailable", 503);
    }
  };
  return async (raw, headers, query) => {
    const hint = gateway.notification(raw, headers, query);
    if (!hint) fail("billing_notification_unsupported", 400);
    let providerId = hint.id, payment, invoice;
    if (hint.type === "payment") {
      payment = await gateway.payment(hint.id);
      if (String(payment.id) !== hint.id || String(payment.collector_id) !== gateway.collectorId)
        fail("billing_binding_mismatch", 400);
      const binding = await get(payment.external_reference);
      providerId = identifier(binding?.provider_id);
    } else if (hint.type === "subscription_authorized_payment") {
      invoice = await gateway.invoice(hint.id);
      if (String(invoice.id) !== hint.id) fail("billing_binding_mismatch", 400);
      providerId = identifier(invoice.preapproval_id);
    }
    // A fictitious ID normally fails here with billing_resource_missing (502).
    // Never acknowledge it as a confirmed subscription/payment.
    const preapproval = await gateway.read(providerId);
    if (String(preapproval.id) !== providerId || String(preapproval.collector_id) !== gateway.collectorId ||
      String(preapproval.application_id) !== gateway.applicationId)
      fail("billing_binding_mismatch", 400);
    const binding = await get(preapproval.external_reference);
    if (!binding?.provider_id || binding.provider_id !== providerId || !UUID.test(binding.organization_id))
      fail("billing_binding_mismatch", 400);
    if (invoice && String(invoice.external_reference) !== binding.id) fail("billing_binding_mismatch", 400);
    const snapshot = await verifiedSnapshot(gateway, binding, preapproval);
    if (payment && !snapshot.payments.some(p => p.payment_id === hint.id)) fail("billing_binding_mismatch", 400);
    // No snapshot, resource ID, tenant or personal/payment data in the response.
    // Replays and out-of-order hints cause fresh reads and zero financial effects.
    return { accepted: true, mode: "observe", applied: false };
  };
}

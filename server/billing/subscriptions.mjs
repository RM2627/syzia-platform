import { BillingError, fail, identifier, verifiedSnapshot, verifyBinding } from "./mercado-pago.mjs";
import { normalizePayerEmail } from "../../shared/billing-payer-email.mjs";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function exactBody(body, required, optional = []) {
  if (!body || typeof body !== "object" || Array.isArray(body) || required.some(k => !(k in body)) || Object.keys(body).some(k => ![...required, ...optional].includes(k))) fail("billing_payload_invalid", 400);
}
export function subscriptions({ gateway, service, asUser, auth }) {
  const sql = (action, id, data = {}) => service("billing047_service", { p_action: action, p_id: id, p_data: data });
  const ready = () => { if (!gateway) fail("billing_credentials_missing", 503); };
  async function process(id, { token, email, source = "reconciliation" } = {}) {
    ready();
    let b = await sql("lease", id);
    if (!b) return { pending: true };
    const lease = b.lease;
    try {
      if (!b.provider_id) {
        if (b.create_started) {
          const found = (await gateway.find(b.id)).filter(p => String(p.external_reference) === b.id);
          if (found.length !== 1) fail("billing_reconciliation_required", 503);
          const p = found[0];
          verifyBinding(gateway, b, p, false);
          b.provider_id = identifier(p.id);
          b.provider_payer_id = identifier(p.payer_id);
          await sql("bind", id, { lease, provider_id: b.provider_id, payer_reference: b.provider_payer_id });
        } else if (b.operation === "checkout" && token) {
          // Validate remotely before claiming a potentially nonrepeatable create.
          await sql("trial_check", id, { lease });
          await gateway.plan(b.provider_plan_id, b, b.trial_reserved);
          await sql("start", id, { lease });
          let p;
          try { p = await gateway.create(b, token, email, true); }
          catch (e) {
            if (e.definitiveRejection) await sql("rejected", id, { lease });
            throw e;
          }
          verifyBinding(gateway, b, p, false);
          b.provider_id = identifier(p.id);
          b.provider_payer_id = identifier(p.payer_id);
          await sql("bind", id, { lease, provider_id: b.provider_id, payer_reference: b.provider_payer_id });
        } else {
          await sql("release", id, { lease });
          return { pending: true };
        }
      }
      let p = await gateway.read(b.provider_id);
      // Validate the tenant / merchant / immutable reference before ANY provider mutation.
      verifyBinding(gateway, b, p);
      let snapshot = await verifiedSnapshot(gateway, b, p);
      const checkedResource = p;
      let operationDone = b.operation_state === "done" || b.operation === "checkout";
      const end = Math.max(Date.parse(b.paid_until) || 0, Date.parse(b.trial_end) || 0);
      const cancelDue = b.cancel_requested && end > 0 && end <= Date.now();
      if (cancelDue && !["canceled", "cancelled"].includes(p.status)) {
        await gateway.update(b.provider_id, { status: "canceled" }, b.id + "-end");
        p = await gateway.read(b.provider_id);
      } else if (b.operation_state !== "done" && b.operation !== "checkout") {
        const bodies = {
          cancel: { status: "paused" },
          resume: { status: "authorized" },
          change: { auto_recurring: { transaction_amount: b.target_amount / 100, currency_id: "BRL" } },
          method: token && !b.method_started && !["sending", "uncertain"].includes(b.operation_state) ? { card_token_id: token } : null,
        };
        const confirmed = b.operation === "cancel" ? ["paused", "canceled", "cancelled"].includes(p.status)
          : b.operation === "resume" ? p.status === "authorized"
          : b.operation === "change" ? Math.round(Number(p.auto_recurring?.transaction_amount) * 100) === b.target_amount : b.operation === "method" && (b.method_started || ["sending", "uncertain"].includes(b.operation_state)) ? Boolean(p.card_id && (b.method_before_card || b.provider_card_id) && String(p.card_id) !== (b.method_before_card || b.provider_card_id)) : false;
        let methodAcknowledged = false;
        if (!confirmed && bodies[b.operation]) {
          await sql("start", id, { lease });
          let updated;
          try { updated = await gateway.update(b.provider_id, bodies[b.operation], b.operation_id); }
          catch (e) {
            if (b.operation === "method" && e.definitiveRejection) await sql("method_rejected", id, { lease });
            throw e;
          }
          if (b.operation === "method") {
            verifyBinding(gateway, b, updated);
            if (!updated.card_id || !Number.isSafeInteger(updated.version)) fail("billing_response_invalid", 502);
          }
          p = await gateway.read(b.provider_id);
          methodAcknowledged = b.operation === "method" && Boolean(p.card_id && String(p.card_id) === String(updated.card_id) && p.version >= updated.version);

        }
        operationDone = b.operation === "method" ? Boolean(confirmed || methodAcknowledged) : b.operation === "cancel" ? ["paused", "canceled", "cancelled"].includes(p.status)
          : b.operation === "resume" ? p.status === "authorized" : b.operation === "change" ? Math.round(Number(p.auto_recurring?.transaction_amount) * 100) === b.target_amount : true;
      }
      if (p !== checkedResource) snapshot = await verifiedSnapshot(gateway, b, p);
      return await sql("apply", id, { ...snapshot, lease, operation_done: operationDone, source });
    } catch (e) {
      const code = e instanceof BillingError ? e.code : /^billing_[a-z_]{1,70}$/.test(e?.message || "") ? e.message : "billing_reconciliation_required";
      await sql("failure", id, { lease, code,
        http_status: e instanceof BillingError ? e.providerStatus ?? null : null,
        stage: e instanceof BillingError ? e.providerStage ?? null : null,
        check: e instanceof BillingError ? e.validationCheck ?? null : code === "billing_binding_mismatch" ? "local_history" : null,
      }).catch(() => {});
      const safe = new BillingError(code, e instanceof BillingError ? e.status : 503);
      if (e instanceof BillingError) {
        safe.providerStatus = e.providerStatus;
        safe.providerStage = e.providerStage;
        safe.validationCheck = e.validationCheck;
      }
      throw safe;
    }
  }
  async function user(path, body, token) {
    ready();
    const actor = await auth(token);
    if (!actor?.id || actor.is_anonymous) fail("access_denied", 403);
    await asUser(token, "access_session", { p_activity: false, p_logout: false });
    if (path === "config") {
      exactBody(body, []);
      const suggestion = normalizePayerEmail(actor.email);
      return { public_key: gateway.publicKey, payer_email_suggestion: suggestion && !suggestion.endsWith("@access.vireloq.invalid") ? suggestion : "" };
    }
    exactBody(body, ["organization_id"], path === "status" ? [] : ["action", "plan_version_id", "request_key", "card_token", "trial_expected", "payer_email"]);
    if (!UUID.test(body.organization_id)) fail("billing_payload_invalid", 400);
    if (path === "status") {
      const view = await asUser(token, "billing047_context", { p_org: body.organization_id });
      if (view.subscription?.id) {
        await process(view.subscription.id, { source: "return" }).catch(() => {});
        return asUser(token, "billing047_context", { p_org: body.organization_id });
      }
      return view;
    }
    if (path !== "command" || !UUID.test(body.request_key || "") || !["checkout", "cancel", "resume", "change", "method"].includes(body.action)) fail("billing_payload_invalid", 400);
    if (["checkout", "change"].includes(body.action) !== Boolean(body.plan_version_id) || (body.plan_version_id && !UUID.test(body.plan_version_id))) fail("billing_payload_invalid", 400);
    if (["checkout", "method"].includes(body.action) && !/^[a-zA-Z0-9_-]{16,200}$/.test(body.card_token || "")) fail("billing_payment_method_required", 400);
    if (!["checkout", "method"].includes(body.action) && body.card_token != null) fail("billing_payload_invalid", 400);
    if (body.action === "checkout" && typeof body.trial_expected !== "boolean") fail("billing_payload_invalid", 400);
    const payerEmail = body.action === "checkout" ? normalizePayerEmail(body.payer_email) : null;
    if (body.action === "checkout" && !payerEmail) fail("billing_payer_email_invalid", 400);
    if (body.action !== "checkout" && Object.hasOwn(body, "payer_email")) fail("billing_payload_invalid", 400);
    const id = await asUser(token, "billing047_prepare", { p_org: body.organization_id, p_action: body.action, p_version: body.plan_version_id || null, p_key: body.request_key, p_trial: body.action === "checkout" ? body.trial_expected : null });
    // Only the leased, never-started checkout can consume this transient email.
    // Existing/uncertain subscriptions follow the original binding/reconciliation
    // path above; a submitted email never selects, transfers or modifies one.
    await process(id, { token: body.card_token, email: payerEmail, source: "command" });
    return asUser(token, "billing047_context", { p_org: body.organization_id });
  }
  async function webhook(raw, headers, query) {
    ready();
    const hint = gateway.notification(raw, headers, query);
    if (!hint) return { accepted: true };
    if (hint.type === "payment") {
      const payment = await gateway.payment(hint.id);
      if (String(payment.collector_id) !== gateway.collectorId) fail("billing_binding_mismatch", 400);
      // Other products may share this endpoint. Only a locally bound reference is relevant.
      if (!UUID.test(String(payment.external_reference))) return { accepted: true };
      let bound;
      try { bound = await sql("get", payment.external_reference); } catch (e) {
        if (e.message === "billing_binding_missing") return { accepted: true };
        throw e;
      }
      await process(bound.id, { source: "webhook" });
      return { accepted: true };
    }
    let providerId = hint.id;
    if (hint.type === "subscription_authorized_payment") {
      const invoice = await gateway.invoice(hint.id);
      providerId = identifier(invoice.preapproval_id);
    }
    let binding = await sql("lookup", null, { provider_id: providerId });
    if (!binding) {
      const p = await gateway.read(providerId);
      if (!UUID.test(String(p.external_reference)) || String(p.collector_id) !== gateway.collectorId || String(p.application_id) !== gateway.applicationId) fail("billing_binding_mismatch", 400);
      binding = await sql("get", p.external_reference);
      if (binding.provider_id && binding.provider_id !== providerId) fail("billing_binding_mismatch", 400);
    }
    await process(binding.id, { source: "webhook" });
    return { accepted: true };
  }
  async function reconcile() {
    ready(); const ids = await sql("list", null); let succeeded = 0, pending = 0, confirmed = 0;
    for (const id of ids) { try { const result = await process(id); if (result.pending || result.operation_pending) pending++; else { succeeded++; if (["trialing", "active"].includes(result.state)) confirmed++; } } catch { pending++; } }
    return { inspected: ids.length, succeeded, pending, confirmed };
  }
  return { user, webhook, reconcile, process };
}

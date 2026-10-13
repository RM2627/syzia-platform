import { BillingError, fail, identifier, verifiedSnapshot } from "./mercado-pago.mjs";
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
          if (String(p.collector_id) !== gateway.collectorId || String(p.application_id) !== gateway.applicationId || p.preapproval_plan_id !== b.provider_plan_id) fail("billing_binding_mismatch", 502);
          b.provider_id = identifier(p.id);
          await sql("bind", id, { lease, provider_id: b.provider_id });
        } else if (b.operation === "checkout" && token) {
          // Validate remotely before claiming a potentially nonrepeatable create.
          await gateway.plan(b.provider_plan_id, b, b.trial_reserved);
          await sql("start", id, { lease });
          let p;
          try { p = await gateway.create(b, token, email, true); }
          catch (e) {
            if (e.definitiveRejection) await sql("rejected", id, { lease });
            throw e;
          }
          if (String(p.external_reference) !== b.id || String(p.collector_id) !== gateway.collectorId || String(p.application_id) !== gateway.applicationId || p.preapproval_plan_id !== b.provider_plan_id) fail("billing_binding_mismatch", 502);
          b.provider_id = identifier(p.id);
          await sql("bind", id, { lease, provider_id: b.provider_id });
        } else {
          await sql("release", id, { lease });
          return { pending: true };
        }
      }
      let p = await gateway.read(b.provider_id);
      // Validate the tenant / merchant / immutable reference before ANY provider mutation.
      if (String(p.external_reference) !== b.id || String(p.collector_id) !== gateway.collectorId || String(p.application_id) !== gateway.applicationId || p.preapproval_plan_id !== b.provider_plan_id) fail("billing_binding_mismatch", 502);
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
          method: token ? { card_token_id: token } : null,
        };
        const confirmed = b.operation === "cancel" ? ["paused", "canceled", "cancelled"].includes(p.status)
          : b.operation === "resume" ? p.status === "authorized"
          : b.operation === "change" ? Math.round(Number(p.auto_recurring?.transaction_amount) * 100) === b.target_amount : b.operation === "method" && b.operation_state === "uncertain" ? Boolean(p.card_id && String(p.card_id) !== b.provider_card_id) : false;
        if (!confirmed && bodies[b.operation]) {
          await sql("start", id, { lease });
          await gateway.update(b.provider_id, bodies[b.operation], b.operation_id);
          p = await gateway.read(b.provider_id);
        }
        operationDone = b.operation === "method" ? Boolean(confirmed || (token && p.card_id)) : b.operation === "cancel" ? ["paused", "canceled", "cancelled"].includes(p.status)
          : b.operation === "resume" ? p.status === "authorized" : b.operation === "change" ? Math.round(Number(p.auto_recurring?.transaction_amount) * 100) === b.target_amount : true;
      }
      const snapshot = await verifiedSnapshot(gateway, b, p);
      return await sql("apply", id, { ...snapshot, lease, operation_done: operationDone, source });
    } catch (e) {
      const code = e instanceof BillingError ? e.code : /^billing_[a-z_]{1,70}$/.test(e?.message || "") ? e.message : "billing_reconciliation_required";
      await service("billing051_failure", { p_id: id, p_lease: lease, p_code: code,
        p_http_status: e instanceof BillingError ? e.providerStatus ?? null : null,
        p_stage: e instanceof BillingError ? e.providerStage ?? null : null }).catch(() => {});
      const safe = new BillingError(code, e instanceof BillingError ? e.status : 503);
      if (e instanceof BillingError) {
        safe.providerStatus = e.providerStatus;
        safe.providerStage = e.providerStage;
      }
      throw safe;
    }
  }
  async function user(path, body, token) {
    ready();
    const actor = await auth(token);
    if (!actor?.id || actor.is_anonymous) fail("access_denied", 403);
    await asUser(token, "access_session", { p_activity: false, p_logout: false });
    if (path === "config") { exactBody(body, []); return { public_key: gateway.publicKey }; }
    exactBody(body, ["organization_id"], path === "status" ? [] : ["action", "plan_version_id", "request_key", "card_token", "trial_expected"]);
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
    const id = await asUser(token, "billing047_prepare", { p_org: body.organization_id, p_action: body.action, p_version: body.plan_version_id || null, p_key: body.request_key, p_trial: body.action === "checkout" ? body.trial_expected : null });
    await process(id, { token: body.card_token, email: actor.email, source: "command" });
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
    ready(); const ids = await sql("list", null); let succeeded = 0, pending = 0;
    for (const id of ids) { try { await process(id); succeeded++; } catch { pending++; } }
    return { inspected: ids.length, succeeded, pending };
  }
  return { user, webhook, reconcile, process };
}

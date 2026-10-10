// Deliberately offline transport. No real credentials, card numbers or external calls.
export function fakeMercadoPago() {
  const subscriptions = new Map(), invoices = new Map(), payments = new Map(), calls = [];
  let sequence = 1, failure = null;
  const offers = { essencial: 4990, profissional: 8990, equipe: 14990 };
  const merchant = { collector_id: 101, application_id: 202 };
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  async function fetchImpl(url, options = {}) {
    const u = new URL(url), method = options.method || "GET", body = options.body ? JSON.parse(options.body) : {};
    calls.push({ method, path: u.pathname });
    if (failure) { const f = failure; failure = null; return f(url, options); }
    if (u.pathname.startsWith("/preapproval_plan/")) {
      const id = u.pathname.split("/").at(-1), [code, variant] = id.split("-");
      return response({ id, ...merchant, status: "active", auto_recurring: { frequency: 1, frequency_type: "months", currency_id: "BRL", transaction_amount: offers[code] / 100, ...(variant === "trial" ? { free_trial: { frequency: 7, frequency_type: "days" } } : {}) } });
    }
    if (u.pathname === "/preapproval" && method === "POST") {
      const id = "subscription-" + sequence++, [code, variant] = body.preapproval_plan_id.split("-");
      const created = new Date().toISOString(), next = new Date(Date.now() + (variant === "trial" ? 7 : 0) * 86400000).toISOString();
      const p = { id, ...merchant, version: 0, external_reference: body.external_reference, preapproval_plan_id: body.preapproval_plan_id,
        payer_id: 303, card_id: "card-reference", payment_method_id: "visa", status: "authorized", date_created: created, last_modified: created, next_payment_date: next,
        auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: offers[code] / 100, currency_id: "BRL", ...(variant === "trial" ? { free_trial: { frequency: 7, frequency_type: "days" } } : {}) } };
      subscriptions.set(id, p); return response(p);
    }
    if (u.pathname === "/preapproval/search") { const results = [...subscriptions.values()].filter(x => x.external_reference === u.searchParams.get("external_reference")); return response({ results, paging: { total: results.length } }); }
    if (u.pathname.startsWith("/preapproval/")) {
      const p = subscriptions.get(u.pathname.split("/").at(-1)); if (!p) return response({}, 404);
      if (method === "PUT") { if (body.status) p.status = body.status; if (body.auto_recurring) Object.assign(p.auto_recurring, body.auto_recurring); if (body.card_token_id) p.card_id = "updated-card-reference"; p.version++; p.last_modified = new Date().toISOString(); }
      return response(p);
    }
    if (u.pathname === "/authorized_payments/search") { const results = [...invoices.values()].filter(x => x.preapproval_id === u.searchParams.get("preapproval_id")); return response({ results, paging: { total: results.length } }); }
    if (u.pathname.startsWith("/authorized_payments/")) return response(invoices.get(u.pathname.split("/").at(-1)) || {}, invoices.has(u.pathname.split("/").at(-1)) ? 200 : 404);
    if (u.pathname.startsWith("/v1/payments/")) return response(payments.get(u.pathname.split("/").at(-1)) || {});
    return response({}, 404);
  }
  function charge(id, status = "approved", { debitAt = new Date().toISOString(), amount, invoiceId } = {}) {
    const p = subscriptions.get(id), iid = invoiceId || "invoice-" + sequence++, paymentId = "payment-" + iid;
    const modified = new Date(Date.now() + sequence++ * 1000).toISOString();
    invoices.set(iid, { id: iid, preapproval_id: id, external_reference: p.external_reference, transaction_amount: amount ?? p.auto_recurring.transaction_amount, currency_id: "BRL", debit_date: debitAt, last_modified: modified, payment: { id: paymentId, status } });
    payments.set(paymentId, { id: paymentId, collector_id: 101, payer: { id: 303 }, external_reference: p.external_reference, transaction_amount: amount ?? p.auto_recurring.transaction_amount, currency_id: "BRL", status, date_last_updated: modified, date_approved: status === "approved" ? modified : null });
    return iid;
  }
  return { fetchImpl, subscriptions, invoices, payments, calls, charge, failNext: fn => { failure = fn; } };
}

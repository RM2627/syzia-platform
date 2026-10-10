// SaaS billing only. No consumer payment handling, live gateway or real credentials.
import { createHmac, timingSafeEqual } from "node:crypto";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class MockBillingProvider {
  constructor({ secret, clock = () => Date.now() }) {
    if (typeof secret !== "string" || Buffer.byteLength(secret) < 32)
      throw Error("billing_webhook_secret_required");
    this.secret = secret;
    this.clock = clock;
  }
  sign(raw, timestamp = String(Math.floor(this.clock() / 1000))) {
    return {
      timestamp,
      signature: createHmac("sha256", this.secret)
        .update(timestamp + ".")
        .update(raw)
        .digest("hex"),
    };
  }
  verify(raw, { timestamp, signature }) {
    if (
      !Buffer.isBuffer(raw) ||
      raw.length > 16384 ||
      !/^\d{10}$/.test(timestamp || "") ||
      Math.abs(this.clock() / 1000 - Number(timestamp)) > 300 ||
      !/^[a-f0-9]{64}$/.test(signature || "")
    )
      throw Error("billing_webhook_invalid");
    const expected = this.sign(raw, timestamp).signature;
    if (
      !timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(signature, "hex"),
      )
    )
      throw Error("billing_webhook_invalid");
    let p;
    try {
      p = JSON.parse(raw.toString("utf8"));
    } catch {
      throw Error("billing_webhook_invalid");
    }
    if (
      !p ||
      Array.isArray(p) ||
      Object.keys(p).sort().join(",") !==
        "amount_cents,event_id,invoice_id,provider,state" ||
      p.provider !== "mock" ||
      typeof p.event_id !== "string" ||
      p.event_id.length < 8 ||
      p.event_id.length > 160 ||
      !UUID.test(p.invoice_id) ||
      !["paid", "failed", "overdue", "cancelled", "refunded"].includes(
        p.state,
      ) ||
      !Number.isSafeInteger(p.amount_cents) ||
      p.amount_cents < 0 ||
      p.amount_cents > 100000000
    )
      throw Error("billing_webhook_invalid");
    return {
      p_event: p.event_id,
      p_invoice: p.invoice_id,
      p_state: p.state,
      p_amount: p.amount_cents,
    };
  }
}
export function billingProvider(name, options) {
  if (name !== "mock") throw Error("real_billing_provider_not_implemented");
  return new MockBillingProvider(options);
}
export async function handleBillingWebhook({ raw, headers, provider, apply }) {
  // Verify exact raw bytes BEFORE touching the database. apply must use a server-only service role.
  const event = provider.verify(raw, {
    timestamp: headers["x-billing-timestamp"],
    signature: headers["x-billing-signature"],
  });
  return apply(event); // Database owns transaction, replay comparison and subscription revision checks.
}

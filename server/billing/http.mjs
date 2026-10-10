import http from "node:http";
import { randomUUID } from "node:crypto";
import { BillingError } from "./mercado-pago.mjs";
export function createBillingHandler({ origin, billing, log = entry => console.warn(JSON.stringify(entry)) }) {
  const limits = new Map();
  return async (req, res) => {
    const requestId = randomUUID();
    const send = (status, value) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); res.end(JSON.stringify(value)); };
    const url = new URL(req.url, "http://loopback.invalid");
    const hook = url.pathname === "/billing/notifications";
    if (!hook && req.headers.origin !== origin) return send(403, { error: "origin_denied" });
    if (!hook) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type"); res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS"); }
    if (req.method === "OPTIONS" && !hook) return send(204, {});
    if (req.method !== "POST" || !/^\/billing\/(config|command|status|notifications)$/.test(url.pathname)) return send(404, { error: "not_found" });
    const now = Date.now(), key = req.socket.remoteAddress;
    for (const [k, v] of limits) if (v.until <= now) limits.delete(k);
    const rate = limits.get(key) || { count: 0, until: now + 60000 }; rate.count++; limits.set(key, rate);
    if (rate.count > (hook ? 240 : 60)) return send(429, { error: "billing_rate_limited" });
    try {
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 16384) return send(413, { error: "billing_payload_invalid" }); chunks.push(chunk); }
      const raw = Buffer.concat(chunks);
      const result = hook ? await billing.webhook(raw, req.headers, url.searchParams)
        : await billing.user(url.pathname.split("/").at(-1), JSON.parse(raw.toString("utf8")), (req.headers.authorization || "").match(/^Bearer ([^\s]+)$/)?.[1]);
      send(200, result);
    } catch (e) {
      const safeSQL = /^billing_[a-z_]{1,70}$|^trial_review_required$|^access_denied$/;
      const code = e instanceof BillingError ? e.code : safeSQL.test(e?.message || "") ? e.message : "billing_request_failed";
      const status = e instanceof BillingError ? e.status : code === "access_denied" ? 403 : 409;
      // No body, auth header, card token, provider exception, URL query or personal data.
      log({ event: "billing_failed", code, request_id: requestId });
      send(status, { error: code, request_id: requestId });
    }
  };
}
export function createBillingServer(options) { return http.createServer(createBillingHandler(options)); }

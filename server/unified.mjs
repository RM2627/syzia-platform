// One HTTP listener; existing handlers own their authentication, CORS and bodies.
import http from "node:http";
import { createCommercialHandler } from "./commercial/http.mjs";
import { commercialRuntime } from "./commercial/runtime.mjs";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createPlatformHandler, platformRuntime } from "./platform.mjs";
import { createAttachmentHandler, attachmentRuntime } from "./attachments.mjs";
import { createBillingHandler } from "./billing/http.mjs";
import { billingRuntime } from "./billing/runtime.mjs";

const safeLog = record => console.log(JSON.stringify(record));
export function createUnifiedServer({ platform, attachments, billing, commercial, log = safeLog }) {
  const handlers = {
    platform: createPlatformHandler({ ...platform, log }),
    attachments: createAttachmentHandler({ ...attachments, log }),
    billing: createBillingHandler({ ...billing, log }),
    commercial: commercial ? createCommercialHandler({ ...commercial, log }) : null,
  };
  let stopping = false;
  const server = http.createServer({ requestTimeout: 60000, headersTimeout: 15000, keepAliveTimeout: 5000, maxHeaderSize: 16384 }, async (req, res) => {
    const reply = (status, value) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      res.end(JSON.stringify(value));
    };
    if (stopping) return reply(503, { ready: false });
    // Health checks intentionally need neither browser Origin nor credentials.
    if (req.url === "/health" && ["GET", "HEAD"].includes(req.method)) return reply(200, { ready: true, service: "syzia-api", modules: ["platform", "attachments", "billing"] });
    try {
      // Never rewrite a path/body/token or proxy a request to another listener.
      const path = new URL(req.url, "http://local.invalid").pathname;
      const handler = path.startsWith("/demonstration-media/") ? commercial?.media : /^\/(commercial|demonstrations)\//.test(path) ? handlers.commercial : path.startsWith("/billing/") ? handlers.billing
        : /^\/(attachments|company-media|media)(\/|$)/.test(path) ? handlers.attachments
        : /^\/(access|invitations)(\/|$)/.test(path) ? handlers.platform : null;
      if (!handler) return reply(404, { error: "not_found" });
      await handler(req, res);
    } catch {
      const requestId = randomUUID();
      log({ event: "api_request_failed", code: "request_failed", request_id: requestId });
      if (!res.headersSent && !res.destroyed) reply(500, { error: "request_failed", request_id: requestId });
      else res.destroy();
    }
  });
  // Bound inactive sockets, including upstream failures; never log URLs or bodies.
  server.setTimeout(90000, socket => socket.destroy());
  server.beginShutdown = () => { stopping = true; };
  return server;
}

function exactOrigin(value, production) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || (production && url.protocol !== 'https:')) throw Error("api_origin_invalid");
  return url.origin;
}
export function unifiedRuntime(env = process.env) {
  const production = env.NODE_ENV === "production";
  const origin = exactOrigin(env.PLATFORM_APP_ORIGIN, production);
  const consumerOrigin = exactOrigin(env.CONSUMER_ORIGIN || origin, production);
  const runtime = billingRuntime({ ...env, PLATFORM_APP_ORIGIN: origin });
  return {
    platform: platformRuntime({ ...env, PLATFORM_APP_ORIGIN: origin }),
    attachments: attachmentRuntime({ ...env, CONSUMER_ORIGIN: consumerOrigin }),
    billing: { origin, billing: runtime.billing },
    reconcile: env.MERCADO_PAGO_ENABLED === "true" ? () => runtime.billing.reconcile() : null,
  };
}

// Same reconciler as the 047 CLI, serialized inside this process. No new charge API.
export function scheduleReconciliation(reconcile, { intervalMs = 300000, log = safeLog } = {}) {
  let timer, running, stopped = false;
  function schedule() { if (!stopped) { timer = setTimeout(run, intervalMs); timer.unref(); } }
  async function run() {
    if (stopped || running) return;
    running = (async () => {
      try {
        const r = await reconcile();
        log({ event: "billing_reconciliation", inspected: r.inspected, succeeded: r.succeeded, pending: r.pending });
      } catch { log({ event: "billing_reconciliation_failed", code: "reconciliation_unavailable" }); }
    })();
    await running; running = null; schedule();
  }
  schedule();
  return { run, stop: async () => { stopped = true; clearTimeout(timer); await running; } };
}

export async function startUnified({ env = process.env, runtime, log = safeLog, signals = true, shutdownMs = 25000 } = {}) {
  const port = Number(env.PORT || 10000);
  if (!Number.isInteger(port) || port < 0 || port > 65535 || (env.NODE_ENV === "production" && port === 0)) throw Error("api_port_invalid");
  const interval = Number(env.BILLING_RECONCILE_INTERVAL_SECONDS || 300);
  if (!Number.isInteger(interval) || interval < 60 || interval > 86400) throw Error("api_reconcile_interval_invalid");
  const deps = runtime || unifiedRuntime(env);
  const commercial = deps.commercial || (!runtime ? await commercialRuntime(env) : null);
  const server = createUnifiedServer({ ...deps, commercial, log });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, env.HOST || "0.0.0.0", () => { server.off("error", reject); resolve(); });
  });
  const job = deps.reconcile ? scheduleReconciliation(deps.reconcile, { intervalMs: interval * 1000, log }) : null;
  let closing;
  const stop = () => closing ||= (async () => {
    server.beginShutdown();
    log({ event: "api_stopping" });
    const drain = Promise.all([new Promise(resolve => server.close(resolve)), job?.stop()]);
    server.closeIdleConnections();
    let deadline;
    const forced = await Promise.race([
      drain.then(() => false),
      new Promise(resolve => { deadline = setTimeout(() => resolve(true), shutdownMs); }),
    ]);
    clearTimeout(deadline);
    if (forced) server.closeAllConnections();
    await commercial?.close?.();
    if (signals) { process.off("SIGTERM", signal); process.off("SIGINT", signal); }
    log({ event: "api_stopped", forced });
    return { forced };
  })();
  const signal = () => { void stop().then(({ forced }) => { if (forced) process.exit(1); }); };
  if (signals) { process.on("SIGTERM", signal); process.on("SIGINT", signal); }
  log({ event: "api_ready", port: server.address().port, modules: 3 });
  return { server, stop };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startUnified().catch(() => { safeLog({ event: "api_start_failed", code: "configuration_or_listener_failed" }); process.exitCode = 1; });
}

import { randomUUID } from "node:crypto";
export function createCommercialHandler({
  controller,
  origins,
  log = () => {},
  now = Date.now,
}) {
  const rate = new Map();
  return async (req, res) => {
    const id = randomUUID();
    const send = (status, value) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "X-Request-ID": id,
      });
      res.end(JSON.stringify(value));
    };
    const match = /^\/(commercial|demonstrations)\/([a-z-]+)$/.exec(
      req.url || "",
    );
    if (!match) return send(404, { error: "commercial_not_found" });
    const operator = match[1] === "commercial",
      path = match[2],
      appVisitor = ["invite", "unsubscribe"].includes(path);
    const origin =
      operator || appVisitor ? origins.appOrigin : origins.publicOrigin;
    if (req.headers.origin !== origin)
      return send(403, { error: "origin_denied", request_id: id });
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (
      req.method !== "POST" ||
      !/^application\/json(?:;|$)/i.test(req.headers["content-type"] || "")
    )
      return send(415, { error: "commercial_invalid" });
    try {
      for (const [k, v] of rate) if (v.until < now()) rate.delete(k);
      if (rate.size > 10000) throw Error("commercial_rate_limited");
      const k =
        (req.socket.remoteAddress || "unknown") +
        ":" +
        (operator ? "operator" : path === "start" ? "start" : "visitor");
      const bucket = rate.get(k) || { n: 0, until: now() + 60000 };
      bucket.n++;
      rate.set(k, bucket);
      if (bucket.n > (path === "start" ? 12 : 180))
        throw Error("commercial_rate_limited");
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) {
          send(413, { error: "commercial_payload_too_large" });
          req.resume();
          return;
        }
        chunks.push(chunk);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw Error("commercial_invalid");
      }
      const token = (req.headers.authorization || "").match(
        /^Bearer ([^\s]+)$/,
      )?.[1];
      const data = await controller[operator ? "operator" : "visitor"](
        path,
        body,
        token,
      );
      send(200, data);
    } catch (e) {
      const known =
        /^(commercial|demo)_[a-z_]+$/.test(e.message) ||
        [
          "access_denied",
          "session_required",
          "email_not_configured",
          "page_draft_changed",
          "permission_denied",
          "billing_limit_reached",
        ].includes(e.message);
      const code = known ? e.message : "commercial_operation_failed";
      const status = /denied|session|permission/.test(code)
        ? 403
        : /rate|capacity/.test(code)
          ? 429
          : /unavailable|configured|required/.test(code)
            ? 503
            : 400;
      log({ event: "commercial_request_failed", code, request_id: id, status });
      send(status, { error: code, request_id: id });
    }
  };
}

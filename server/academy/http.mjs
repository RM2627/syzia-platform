import { randomUUID } from "node:crypto";
const known = new Set([
  "access_denied",
  "academy_invalid",
  "academy_consent_required",
  "academy_video_invalid",
  "academy_material_invalid",
  "academy_course_invalid",
  "academy_lesson_invalid",
  "academy_course_incomplete",
  "academy_revision_conflict",
  "academy_legal_required",
  "academy_confirmation_required",
  "academy_return_waitlist",
  "academy_closed",
  "academy_preview_expired",
  "academy_session_required",
  "academy_link_invalid",
  "academy_rate_limited",
  "academy_challenge_expired",
  "academy_notice_changed",
  "academy_mail_unavailable",
  "academy_not_found",
]);
export function createAcademyHandler({
  controller,
  origin,
  adminOrigin,
  production = false,
  trustProxy = false,
  log = () => {},
}) {
  const cookieName = production
    ? "__Host-syzia-academy"
    : "syzia-academy-local";
  return async (req, res) => {
    const url = new URL(req.url, "http://local.invalid"),
      path = url.pathname.slice("/academy/".length),
      admin = path === "admin" || path === "admin-file",
      expected = admin ? adminOrigin : origin;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Vary", "Origin");
    const reply = (status, v) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(v));
    };
    const originHeader = req.headers.origin;
    const publicCover = req.method === "GET" && path.startsWith("cover/");
    if (originHeader !== expected && !(publicCover && !originHeader))
      return reply(403, { error: "access_denied" });
    if (originHeader) {
      res.setHeader("Access-Control-Allow-Origin", expected);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
      res.writeHead(204);
      return res.end();
    }
    const session =
      (req.headers.cookie || "")
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith(cookieName + "="))
        ?.slice(cookieName.length + 1) || "";
    const jwt =
      req.headers.authorization?.match(/^Bearer ([^\s]+)$/)?.[1] || "";
    const setSession = (value) =>
      res.setHeader(
        "Set-Cookie",
        `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${value ? 604800 : 0}${production ? "; Secure" : ""}`,
      );
    const ip = trustProxy
      ? String(req.headers["x-forwarded-for"] || req.socket.remoteAddress)
          .split(",")
          .at(-1)
          .trim()
      : req.socket.remoteAddress;
    try {
      if (publicCover) {
        const f = await controller.file(path.slice(6), { cover: true });
        res.setHeader("Content-Type", f.mime);
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        res.end(f.bytes);
        return;
      }
      if (req.method === "GET" && path === "config")
        return reply(200, await controller.publicAction("config"));
      if (req.method !== "POST")
        return reply(405, { error: "academy_not_found" });
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return reply(415, { error: "academy_invalid" });
      const limit = admin ? 7_200_000 : 12_000;
      let count = 0,
        chunks = [];
      for await (const chunk of req) {
        count += chunk.length;
        if (count > limit) return reply(413, { error: "academy_invalid" });
        chunks.push(chunk);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return reply(400, { error: "academy_invalid" });
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        return reply(400, { error: "academy_invalid" });
      if (path === "admin-file" || path === "file") {
        const f = await controller.file(body.id, {
          ...(admin ? { jwt } : { session }),
        });
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Disposition":
            "attachment; filename*=UTF-8''" +
            encodeURIComponent(f.name).replaceAll("'", "%27"),
        });
        res.end(f.bytes);
        return;
      }
      const r = admin
        ? await controller.admin(body.action, body.data || {}, jwt)
        : await controller.publicAction(path, body, session, ip);
      if (r?.session) {
        setSession(r.session);
        delete r.session;
      }
      if (path === "logout" || path === "delete_student") setSession("");
      reply(200, r);
      if (admin && r?.mail_test_id)
        setImmediate(() =>
          controller
            .processTest(r.mail_test_id)
            .catch(() =>
              log({
                event: "academy_mail_test_pending",
                code: "academy_unavailable",
              }),
            ),
        );
      if (
        path === "subscribe" ||
        path === "login" ||
        r?.campaign_id ||
        r?.process_mail
      )
        setImmediate(() =>
          controller.drain(r?.campaign_id).catch(() =>
            log({
              event: "academy_mail_pending",
              code: "academy_unavailable",
            }),
          ),
        );
    } catch (e) {
      const code = known.has(e?.message) ? e.message : "academy_unavailable",
        request_id = randomUUID();
      log({ event: "academy_request_failed", code, request_id });
      return reply(
        code === "access_denied" || code === "academy_session_required"
          ? 403
          : code === "academy_unavailable"
            ? 503
            : code === "academy_rate_limited"
              ? 429
              : 400,
        { error: code, request_id },
      );
    }
  };
}

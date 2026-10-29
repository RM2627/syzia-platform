import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { renderBlog, escapeHTML } from "./render.mjs";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
async function body(req, limit) {
  let bytes = 0,
    chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > limit) throw Error("payload_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function createInsightsHandler({
  service,
  asUser,
  origin,
  adminOrigin,
  secret,
  resolveIdentity,
  authStorageKey,
  now = Date.now,
}) {
  if (!secret || secret.length < 32) throw Error("insights_secret_required");
  origin = new URL(origin).origin;
  adminOrigin = new URL(adminOrigin || origin).origin;
  const sign = (v) => createHmac("sha256", secret).update(v).digest("hex"),
    rates = new Map();
  return async (req, res) => {
    const u = new URL(req.url, origin),
      path = u.pathname;
    const reply = (status, data, type = "application/json", extra = {}) => {
      res.writeHead(status, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        ...extra,
      });
      res.end(type === "application/json" ? JSON.stringify(data) : data);
    };
    try {
      if (path === "/blog/api/media" && req.method === "OPTIONS") {
        if (req.headers.origin !== adminOrigin)
          return reply(403, { error: "access_denied" });
        return reply(204, "", "text/plain", {
          "Access-Control-Allow-Origin": adminOrigin,
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Allow-Methods": "POST",
        });
      }
      if (req.method === "GET" || req.method === "HEAD") {
        const assets = {
          "/blog/assets/insights.css": ["./insights.css", "text/css"],
          "/blog/assets/client.js": ["./client.js", "text/javascript"],
          "/blog/assets/logo.png": [
            "../../public/brand/syzia/syzia-horizontal-light.png",
            "image/png",
          ],
        };
        if (assets[path]) {
          const [file, mime] = assets[path];
          return reply(
            200,
            await readFile(new URL(file, import.meta.url)),
            mime,
            { "Cache-Control": "public,max-age=3600" },
          );
        }
        if (path.startsWith("/blog/media/")) {
          const id = path.split("/").at(-1);
          if (!uuid.test(id)) return reply(404, { error: "not_found" });
          const m = await service("media", { id });
          if (!m) return reply(404, { error: "not_found" });
          return reply(200, Buffer.from(m.body, "base64"), "image/webp", {
            "Cache-Control": "public,max-age=3600",
          });
        }
        if (path === "/blog/robots.txt")
          return reply(
            200,
            `User-agent: *\nAllow: /blog\nDisallow: /blog/api/\nSitemap: ${origin}/blog/sitemap.xml\n`,
            "text/plain",
          );
        const catalog = await service("catalog", {});
        if (path === "/blog/sitemap.xml")
          return reply(
            200,
            `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeHTML(origin)}/blog</loc></url>${catalog.posts.map((p) => `<url><loc>${escapeHTML(origin)}/blog/${escapeHTML(p.document.slug)}</loc><lastmod>${new Date(p.updated_at).toISOString()}</lastmod></url>`).join("")}</urlset>`,
            "application/xml",
          );
        const page = renderBlog({ catalog, url: u, origin });
        if (page.html && authStorageKey)
          page.html = page.html.replace(
            "<head>",
            `<head><meta name="syzia-auth-storage-key" content="${escapeHTML(authStorageKey)}">`,
          );
        return reply(
          page.status,
          page.html || "",
          "text/html; charset=utf-8",
          page.location ? { Location: page.location } : {},
        );
      }
      if (req.method !== "POST")
        return reply(405, { error: "method_not_allowed" });
      if (path === "/blog/api/media") {
        if (req.headers.origin !== adminOrigin)
          return reply(403, { error: "access_denied" });
        const token = /^Bearer (\S+)$/.exec(
          req.headers.authorization || "",
        )?.[1];
        if (!token) return reply(401, { error: "session_required" });
        const access = await asUser(token, "access", {});
        if (!access?.allowed) return reply(403, { error: "access_denied" });
        const d = await body(req, 2900000);
        if (
          typeof d.body !== "string" ||
          d.body.length > 2800000 ||
          typeof d.alt !== "string" ||
          d.alt.trim().length < 2 ||
          d.alt.length > 240
        )
          return reply(400, { error: "insights_media_invalid" });
        const image = sharp(Buffer.from(d.body, "base64"), {
          limitInputPixels: 16000000,
          animated: false,
        });
        let metadata;
        try {
          metadata = await image.metadata();
        } catch {
          return reply(400, { error: "insights_media_invalid" });
        }
        if (!["jpeg", "png", "webp"].includes(metadata.format))
          return reply(400, { error: "insights_media_invalid" });
        const { data, info } = await image
          .rotate()
          .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 78 })
          .toBuffer({ resolveWithObject: true });
        if (data.length > 400000)
          return reply(400, { error: "insights_media_too_large" });
        const result = await asUser(token, "media_add", {
          body: data.toString("base64"),
          alt: d.alt.trim(),
          width: info.width,
          height: info.height,
        });
        return reply(200, result, "application/json", {
          "Access-Control-Allow-Origin": adminOrigin,
          Vary: "Origin",
        });
      }
      if (req.headers.origin !== origin)
        return reply(403, { error: "origin_denied" });
      const key = sign(
        String(req.socket.remoteAddress || "unknown") +
          Math.floor(now() / 60000),
      );
      const rate = rates.get(key) || 0;
      if (rate >= 60) return reply(429, { error: "rate_limited" });
      rates.set(key, rate + 1);
      if (rates.size > 10000) rates.clear();
      const action = path.split("/").at(-1);
      if (!["likes", "like", "event", "lead"].includes(action))
        return reply(404, { error: "not_found" });
      const d = await body(req, 12000);
      if (!uuid.test(d.id || ""))
        return reply(400, { error: "invalid_request" });
      let cookie = /(?:^|;\s*)syzia_insights=([^;]+)/.exec(
          req.headers.cookie || "",
        )?.[1],
        visitor;
      if (cookie && /^[a-f0-9]{48}\.[a-f0-9]{64}$/.test(cookie)) {
        const [value, mac] = cookie.split(".");
        if (timingSafeEqual(Buffer.from(mac), Buffer.from(sign(value))))
          visitor = value;
      }
      if (!visitor) {
        visitor = randomBytes(24).toString("hex");
        res.setHeader(
          "Set-Cookie",
          `syzia_insights=${visitor}.${sign(visitor)}; Path=/blog; HttpOnly; SameSite=Lax; Max-Age=31536000${origin.startsWith("https:") ? "; Secure" : ""}`,
        );
      }
      let identity;
      const bearer = /^Bearer (\S+)$/.exec(
        req.headers.authorization || "",
      )?.[1];
      if (bearer) {
        identity = await resolveIdentity?.(bearer);
        if (!identity) return reply(401, { error: "session_required" });
      }
      const payload = {
        id: d.id,
        visitor: sign(identity ? "account:" + identity : "browser:" + visitor),
      };
      if (action === "like") {
        if (typeof d.liked !== "boolean")
          return reply(400, { error: "invalid_request" });
        payload.liked = d.liked;
      }
      if (action === "event") {
        if (
          !["view", "share_intent", "cta"].includes(d.event) ||
          /bot|crawler|spider|headless/i.test(req.headers["user-agent"] || "")
        )
          return reply(200, { ignored: true });
        payload.event = d.event;
      }
      if (action === "lead") {
        if (
          d.website ||
          !Number.isFinite(d.elapsed) ||
          d.elapsed < 2000 ||
          d.consent !== true ||
          !uuid.test(d.key || "")
        )
          return reply(400, { error: "invalid_request" });
        Object.assign(payload, {
          name: d.name,
          email: d.email,
          segment: d.segment,
          need: d.need,
          key: d.key,
          consent: true,
          utm: {},
        });
        for (const k of ["utm_source", "utm_medium", "utm_campaign"])
          if (
            typeof d.utm?.[k] === "string" &&
            /^[\w .-]{1,80}$/.test(d.utm[k])
          )
            payload.utm[k] = d.utm[k];
      }
      return reply(200, await service(action, payload));
    } catch (error) {
      const code = String(error?.message || "");
      const status = /access_denied|permission denied/.test(code)
        ? 403
        : /not_found/.test(code)
          ? 404
          : /conflict/.test(code)
            ? 409
            : /rate_limited/.test(code)
              ? 429
              : /invalid|too_large|required|missing/.test(code)
                ? 400
                : 503;
      return reply(status, {
        error:
          status === 503 ? "insights_unavailable" : "insights_request_rejected",
      });
    }
  };
}

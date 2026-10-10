// Private Node gateway. Loopback only; no deployment or provisioning.
import http from "node:http";
import { pathToFileURL } from "node:url";
import { safeDiagnostic } from "./diagnostics.mjs";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { sanitizeImage, MAX_IMAGE_BYTES } from "./images.mjs";
export function createAttachmentHandler({
  server,
  verifier,
  origin,
  log = (record) => console.warn(JSON.stringify(record)),
}) {
  const CONSUMER_ORIGIN = new URL(origin).origin,
    rate = new Map();
  function limited(key, limit = 30) {
    for (const [k, v] of rate) if (v.until < Date.now()) rate.delete(k);
    let r = rate.get(key);
    if (!r || r.until < Date.now()) r = { n: 0, until: Date.now() + 60000 };
    r.n++;
    rate.set(key, r);
    return r.n > limit;
  }
  async function rpc(name, args) {
    const { data, error } = await server.rpc(name, args);
    if (error) {
      log(
        safeDiagnostic(
          error,
          args?.p_operation || name,
          error.code === "42501" ? 403 : 400,
          args?.p_org,
        ),
      );
      throw Error(
        error.code === "42501" ? "access_denied" : "operation_rejected",
      );
    }

    return data;
  }
  async function stream(res, bucket, item) {
    const { data, error } = await server.storage
      .from(bucket)
      .download(item.path);
    if (error) {
      log(
        safeDiagnostic(
          Error("storage_unavailable"),
          "storage_download",
          error.statusCode,
        ),
      );
      throw Error("storage_unavailable");
    }
    res.writeHead(200, {
      "Content-Type": item.mime,
      "Content-Disposition": 'inline; filename="imagem"',
      "Content-Security-Policy": "default-src 'none'",
    });
    res.end(Buffer.from(await data.arrayBuffer()));
  }
  return async (req, res) => {
    const trace = randomUUID();
    res.setHeader("X-Request-ID", trace);
    res.setHeader("Access-Control-Expose-Headers", "X-Request-ID");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Vary", "Origin");
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ...body, reference: trace }));
    };
    const publicMedia = /^\/media\/(m_[a-f0-9]{24})$/.exec(req.url || ""),
      privateMedia =
        /^\/(attachments|company-media)\/([fm]_[a-f0-9]{24})$/.exec(
          req.url || "",
        );
    if (
      req.headers.origin !== CONSUMER_ORIGIN &&
      !(publicMedia && req.method === "GET" && !req.headers.origin)
    ) {
      log({
        ...safeDiagnostic(Error("origin_denied"), "media_origin", 403),
        reference: trace,
      });
      send(403, { error: "origin_denied" });
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", CONSUMER_ORIGIN);
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization,Content-Type,X-Download-Ticket",
    );
    res.setHeader("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    try {
      if (req.method === "GET" && req.url === "/health") {
        send(200, { ready: true, service: "media" });
        return;
      }
      if (publicMedia && req.method === "GET") {
        if (limited("public:" + req.socket.remoteAddress, 120)) {
          send(429, { error: "rate_limit" });
          return;
        }
        const item = await rpc("consumer_gateway_public_media", {
          p_code: publicMedia[1],
        });
        await stream(res, "company-media", item);
        return;
      }
      if (!privateMedia || !["POST", "GET"].includes(req.method)) {
        send(404, { error: "not_found" });
        return;
      }
      const company = privateMedia[1] === "company-media",
        code = privateMedia[2];
      if (!code.startsWith(company ? "m_" : "f_")) {
        send(404, { error: "not_found" });
        return;
      }
      const jwt = /^Bearer (.+)$/.exec(req.headers.authorization || "")?.[1];
      if (!jwt) {
        send(401, { error: "session_required" });
        return;
      }
      const { data, error } = await verifier.auth.getUser(jwt);
      if (error || !data.user) {
        send(401, { error: "session_expired" });
        return;
      }
      const user = data.user.id;
      if (limited(user)) {
        send(429, { error: "rate_limit" });
        return;
      }
      // session_id is read only after Auth verified this JWT; clients cannot supply a different one.
      const claims = JSON.parse(
        Buffer.from(jwt.split(".")[1], "base64url").toString(),
      );
      const mediaRPC = (name, args) =>
        rpc("access_media", {
          p_user: user,
          p_session: claims.session_id,
          p_operation: name,
          p_args: args,
        });
      const bucket = company ? "company-media" : "consumer-private";
      if (req.method === "GET") {
        const item = await mediaRPC(
          company
            ? "consumer_gateway_company_media"
            : "consumer_gateway_download",
          company
            ? { p_code: code, p_user: user, p_write: false }
            : {
                p_code: code,
                p_user: user,
                p_ticket: req.headers["x-download-ticket"] || "",
              },
        );
        await stream(res, bucket, item);
        return;
      }
      const item = await mediaRPC(
        company
          ? "consumer_gateway_company_media"
          : "consumer_gateway_attachment",
        { p_code: code, p_user: user, p_write: true },
      );
      if (item.state === "ready") {
        send(200, { code });
        return;
      }
      const chunks = [];
      let size = 0;
      for await (const part of req) {
        size += part.length;
        if (size > MAX_IMAGE_BYTES) {
          send(413, { error: "invalid_image_size" });
          req.resume();
          return;
        }
        chunks.push(part);
      }
      const bytes = Buffer.concat(chunks);
      if (
        bytes.length !== item.size ||
        req.headers["content-type"] !== item.mime
      )
        throw Error("invalid_image_metadata");
      const clean = await sanitizeImage(bytes, item.mime);
      const { error: uploadError } = await server.storage
        .from(bucket)
        .upload(item.path, clean.data, {
          contentType: clean.mime,
          upsert: false,
        });
      if (uploadError) {
        if (String(uploadError.statusCode) !== "409") {
          log({
            ...safeDiagnostic(
              Error("storage_unavailable"),
              "storage_upload",
              uploadError.statusCode,
            ),
            reference: trace,
          });
          throw Error("storage_unavailable");
        }
        const { data: existing, error: readError } = await server.storage
          .from(bucket)
          .download(item.path);
        if (
          readError ||
          createHash("sha256")
            .update(Buffer.from(await existing.arrayBuffer()))
            .digest("hex") !== clean.sha256
        )
          throw Error("operation_rejected");
      }
      await mediaRPC(
        company
          ? "consumer_finalize_company_media"
          : "consumer_finalize_attachment",
        {
          p_code: code,
          p_user: user,
          p_sha256: clean.sha256,
          p_size: clean.size,
          p_width: clean.width,
          p_height: clean.height,
        },
      );
      send(200, { code });
    } catch (e) {
      const allowed = [
        "access_denied",
        "operation_rejected",
        "storage_unavailable",
        "invalid_image_metadata",
        "invalid_image_size",
        "invalid_image_type",
        "invalid_image_content",
      ];
      log({
        ...safeDiagnostic(
          e,
          "media_request",
          e.message === "access_denied" ? 403 : 400,
        ),
        reference: trace,
      });
      send(
        e.message === "access_denied"
          ? 403
          : e.message === "storage_unavailable"
            ? 503
            : 400,
        {
          error: allowed.includes(e.message) ? e.message : "request_failed",
        },
      );
    }
  };
}
export function createAttachmentServer(options) { return http.createServer(createAttachmentHandler(options)); }
export function attachmentRuntime(env = process.env) {

  const {
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    CONSUMER_ORIGIN = "http://127.0.0.1:5173",
    ATTACHMENT_PORT = "8787",
  } = env;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY)
    throw Error("Configure server-only Supabase variables.");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return {
    server: createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, options),
    verifier: createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, options),
    origin: CONSUMER_ORIGIN,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createAttachmentServer(attachmentRuntime()).listen(Number(process.env.ATTACHMENT_PORT || 8787), "127.0.0.1", () =>
    console.log(
      "Private media gateway on loopback. External homologation pending.",
    ),
  );
}

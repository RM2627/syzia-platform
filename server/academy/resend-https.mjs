import { request as httpsRequest } from "node:https";
import { academyMailReady } from "./mail-config.mjs";
import {
  httpsDiagnostic,
  httpsFailure,
  httpOutcome,
  networkOutcome,
  uuid,
} from "./resend-diagnostics.mjs";
const endpoint = "https://api.resend.com/emails";
// No SDK dependency, redirects, automatic retries, SMTP fallback or configurable destination.
export function createResendHttpsMailer(
  env,
  renderMessage,
  {
    request = httpsRequest,
    connectionTimeoutMs = 10000,
    responseTimeoutMs = 15000,
  } = {},
) {
  return async (value) => {
    if (env.ACADEMY_MAIL_TRANSPORT !== "https_resend" || !academyMailReady(env))
      throw httpsFailure(
        httpsDiagnostic({
          stage: "configuration",
          category: "definitive",
          error_code: "email_not_configured",
        }),
      );
    let body;
    try {
      if (!uuid(value.delivery_id)) throw Error("delivery_id_required");
      const m = renderMessage(value);
      if (
        typeof m.to !== "string" ||
        typeof m.subject !== "string" ||
        !m.subject ||
        /[\r\n]/.test(m.subject) ||
        typeof m.text !== "string" ||
        typeof m.html !== "string"
      )
        throw Error("message_invalid");
      body = JSON.stringify({
        from: env.ACCESS_MAIL_FROM,
        to: [m.to],
        subject: m.subject,
        text: m.text,
        html: m.html,
        attachments: (m.attachments || []).map((a) => {
          if (
            !Buffer.isBuffer(a.content) ||
            a.content.length > 1048576 ||
            a.path ||
            typeof a.filename !== "string" ||
            typeof a.cid !== "string" ||
            !/^[A-Za-z0-9_-]{1,127}$/.test(a.cid) ||
            a.contentType !== "image/png"
          )
            throw Error("attachment_invalid");
          return {
            filename: a.filename,
            content: a.content.toString("base64"),
            content_id: a.cid,
            content_type: a.contentType,
          };
        }),
      });
      if (Buffer.byteLength(body) > 2097152) throw Error("message_too_large");
    } catch {
      throw httpsFailure(
        httpsDiagnostic({
          stage: "prepare",
          category: "definitive",
          error_code: "email_delivery_failed",
        }),
      );
    }
    return new Promise((resolve, reject) => {
      let req,
        timer,
        settled = false,
        submitted = false;
      const finish = (diagnostic) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (diagnostic.status === "accepted")
          resolve({ accepted: true, diagnostic });
        else reject(httpsFailure(diagnostic));
      };
      const timeout = () => {
        finish(networkOutcome({ code: "ETIMEDOUT" }, submitted));
        req?.destroy();
      };
      timer = setTimeout(timeout, connectionTimeoutMs);
      try {
        req = request(
          endpoint,
          {
            method: "POST",
            port: 443,
            agent: false,
            rejectUnauthorized: true,
            minVersion: "TLSv1.2",
            headers: {
              Authorization: "Bearer " + env.ACADEMY_RESEND_API_KEY,
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
              "Idempotency-Key": "commercial/" + value.delivery_id,
            },
          },
          (res) => {
            if (settled) {
              res.destroy();
              return;
            }
            const chunks = [];
            let bytes = 0;
            res.on("data", (chunk) => {
              if (settled) return;
              bytes += chunk.length;
              if (bytes > 65536) {
                finish(
                  httpsDiagnostic({ http_status: res.statusCode || null }),
                );
                res.destroy();
                req.destroy();
              } else chunks.push(chunk);
            });
            res.on("end", () => {
              if (settled) return;
              let json;
              try {
                json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
              } catch {}
              finish(httpOutcome(res.statusCode, json));
            });
            res.on("aborted", () =>
              finish(httpsDiagnostic({ http_status: res.statusCode || null })),
            );
            res.on("error", () =>
              finish(httpsDiagnostic({ http_status: res.statusCode || null })),
            );
          },
        );
        req.on("error", (e) => finish(networkOutcome(e, submitted)));
        req.on("socket", (socket) => {
          socket.once("secureConnect", () => {
            if (settled) return;
            if (socket.authorized !== true) {
              finish(
                networkOutcome(
                  { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" },
                  false,
                ),
              );
              req.destroy();
              return;
            }
            clearTimeout(timer);
            timer = setTimeout(timeout, responseTimeoutMs);
            // Body is written only after TLS validation. Before this point, no email request was submitted.
            submitted = true;
            try {
              req.end(body);
            } catch (e) {
              finish(networkOutcome(e, true));
              req.destroy();
            }
          });
        });
      } catch (e) {
        finish(networkOutcome(e, submitted));
        req?.destroy();
      }
    });
  };
}

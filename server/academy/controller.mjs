import { randomUUID } from "node:crypto";
import {
  fail,
  email,
  signup,
  hash,
  token,
  cryptoBox,
  validToken,
} from "./validation.mjs";
import { message } from "./mail.mjs";
import {
  acceptedDiagnostic,
  diagnosed,
  safeDiagnostic,
} from "./mail-diagnostics.mjs";
import sharp from "sharp";
import { PDFDocument, PDFDict, PDFName, PDFArray } from "pdf-lib";
const generic = {
  accepted: true,
  message:
    "Se os dados estiverem aptos, você receberá um e-mail com as próximas orientações. Confira também a caixa de spam.",
};
export function academyController({
  service,
  asUser,
  send,
  storage,
  origin,
  secret,
  mailEnabled = false,
  dailyLimit = 80,
  monthlyLimit = 2400,
  now = () => Date.now(),
  mailIntervalMs = 0,
  log = () => {},
}) {
  const box = cryptoBox(secret);
  let active;
  const testTasks = new Set();
  const report = (value) => {
    try {
      log(value);
    } catch {}
  };
  const link = (path, value) => new URL(path, origin).href + "#token=" + value;
  async function rate(key, limit = 10, seconds = 3600) {
    const r = await service("rate", { key: box.key(key), limit, seconds });
    if (!r.allowed) fail("academy_rate_limited", 429);
  }
  async function drain(campaign) {
    if (!mailEnabled) return { processed: 0, disabled: true };
    // No automatic retry after a possible SMTP acceptance. The DB claims enforce limits across processes.
    const task = Promise.resolve(active)
      .catch(() => {})
      .then(async () => {
        let n = 0;
        while (n < 25) {
          const d = await service("delivery_claim", {
            campaign_id: campaign || null,
            daily_limit: dailyLimit,
            monthly_limit: monthlyLimit,
          });
          if (!d) break;
          await deliver(d, "delivery_finish");
          n++;
        }
        return { processed: n };
      });
    active = task;
    try {
      return await task;
    } finally {
      if (active === task) active = null;
    }
  }
  async function deliver(d, finishAction) {
    const started = Date.now();
    let diagnostic = acceptedDiagnostic();
    try {
      if (mailIntervalMs)
        await new Promise((r) => setTimeout(r, mailIntervalMs));
      let value;
      try {
        value = box.open(d.payload);
      } catch (e) {
        throw diagnosed(e, "prepare");
      }
      await send({ ...value, delivery_id: d.id });
    } catch (e) {
      diagnostic = safeDiagnostic(e);
    }
    report({
      event: "academy_mail_result",
      delivery_id: d.id,
      kind: finishAction === "mail_test_finish" ? "test" : "subscription_mail",
      ...diagnostic,
      elapsed_ms: Math.min(3600000, Date.now() - started),
    });
    try {
      await service(finishAction, {
        id: d.id,
        status: diagnostic.status,
        error_code: diagnostic.error_code,
        diagnostic,
      });
    } catch {
      // Do not resend. Keep the claimed row for uncertain recovery; continue with independent messages.
      report({
        event: "academy_mail_persistence_pending",
        delivery_id: d.id,
        code: "academy_unavailable",
      });
    }
  }
  function processTest(id) {
    const task = (async () => {
      if (!mailEnabled) return { disabled: true };
      const d = await service("mail_test_claim", { id });
      if (d) await deliver(d, "mail_test_finish");
    })();
    testTasks.add(task);
    task.then(
      () => testTasks.delete(task),
      () => testTasks.delete(task),
    );
    return task;
  }
  async function publicAction(action, data = {}, session = "", ip = "local") {
    if (action === "config")
      return {
        ...(await service("config", {})),
        challenge: box.challenge(now()),
        mail_ready: mailEnabled,
      };
    if (action === "subscribe" || action === "login") {
      if (!mailEnabled) fail("academy_mail_unavailable", 503);
      await rate("ip:" + ip, 20);
      if (data.website) return generic;
      if (!box.verify(data.challenge, now())) fail("academy_challenge_expired");
      await rate("challenge:" + data.challenge, 1, 3600);
      const input =
        action === "subscribe" ? signup(data) : { email: email(data.email) };
      // Equal public response for duplicates, unknown students and queued mail; no delivery result leaks.
      const allowed = await service("rate", {
        key: box.key("email:" + input.email),
        limit: 4,
        seconds: 3600,
      });
      if (!allowed.allowed) return generic;
      const settings = await service("config", {});
      if (action === "subscribe" && data.notice_id !== settings.notice?.id)
        fail("academy_notice_changed");
      const raw = token(),
        pref = token(),
        id = randomUUID();
      const value = {
        kind: action === "subscribe" ? "confirm" : "login",
        email: input.email,
        link: link("/confirmar", raw),
        preferences: link("/preferencias", pref),
        contact: settings.contact_email,
      };
      await service(action === "subscribe" ? "subscribe" : "login_request", {
        ...input,
        notice_id: data.notice_id,
        token_hash: hash(raw),
        preferences_hash: hash(pref),
        delivery_id: id,
        encrypted: box.seal(value),
      });
      return generic;
    }
    if (action === "consume") {
      await rate("consume:" + ip, 30);
      if (!validToken(data.token)) fail("academy_link_invalid");
      const raw = token();
      return {
        ...(await service("consume", {
          hash: hash(data.token),
          session_hash: hash(raw),
        })),
        session: raw,
      };
    }
    if (
      action === "preferences" ||
      action === "unsubscribe" ||
      action === "delete_student"
    ) {
      await rate("preference:" + ip, 60);
      if (data.token && !validToken(data.token)) fail("academy_link_invalid");
      return service(action, {
        token_hash: data.token ? hash(data.token) : "",
        session_hash: session ? hash(session) : "",
        confirmed: data.confirmed === true,
      });
    }
    if (action === "logout")
      return service("logout", { session_hash: hash(session) });
    if (action === "student" || action === "progress") {
      if (!validToken(session)) fail("academy_session_required", 401);
      await rate("session:" + hash(session), 120, 60);
      return service(action, { ...data, session_hash: hash(session) });
    }
    if (action === "metric") {
      if (!["visit", "syzia_interest", "course_access"].includes(data.event))
        fail("academy_invalid");
      const key = box.key(
        "metric:" +
          ip +
          ":" +
          data.event +
          ":" +
          new Date(now()).toISOString().slice(0, 10),
      );
      const r = await service("rate", { key, limit: 1, seconds: 86400 });
      if (r.allowed) {
        if (data.event === "course_access") {
          if (!validToken(session)) return { ok: true };
          await service("student", { session_hash: hash(session) });
        }
        await service("metric", {
          event: data.event,
          source:
            typeof data.source === "string" ? data.source.slice(0, 80) : "",
        });
      }
      return { ok: true };
    }
    fail("academy_not_found", 404);
  }
  async function admin(action, data, jwt) {
    if (!jwt) fail("access_denied", 401);
    const access = await asUser(jwt, "access", {});
    if (!access.allowed) fail("access_denied", 403);
    if (action === "mail_test_preview") {
      if (!mailEnabled) fail("academy_mail_unavailable", 503);
      if (data.authorized !== true) fail("academy_confirmation_required");
      const recipient = email(data.email),
        value = { kind: "test", email: recipient };
      const preview = await asUser(jwt, action, {
        recipient_key: box.key("test:" + recipient),
        encrypted: box.seal(value),
        authorized: true,
      });
      const rendered = message(value);
      return {
        ...preview,
        recipient,
        subject: rendered.subject,
        text: rendered.text,
      };
    }
    if (action === "mail_test_confirm") {
      if (!mailEnabled) fail("academy_mail_unavailable", 503);
      if (data.confirmed !== true) fail("academy_confirmation_required");
      return asUser(jwt, action, { id: data.id, confirmed: true });
    }
    if (action === "launch_preview") {
      if (!mailEnabled) fail("academy_mail_unavailable", 503);
      const p = await asUser(jwt, action, data);
      return {
        ...p,
        mail_preview: message({
          kind: "launch",
          subject: p.subject,
          body: p.body,
          email: "preview@example.invalid",
          link: new URL("/aulas", origin).href,
          preferences: new URL("/preferencias", origin).href,
          contact: (await service("config", {})).contact_email,
        }).html,
      };
    }
    if (action === "launch_confirm") {
      if (!mailEnabled) fail("academy_mail_unavailable", 503);
      await asUser(jwt, action, data);
      const { campaign, recipients } = await service("campaign", {
          id: data.id,
        }),
        settings = await service("config", {});
      for (const p of recipients) {
        const pref = token();
        await service("queue_launch", {
          id: randomUUID(),
          campaign_id: campaign.id,
          student_id: p.id,
          preferences_hash: hash(pref),
          encrypted: box.seal({
            kind: "launch",
            subject: campaign.subject,
            body: campaign.body,
            email: p.email,
            link: new URL("/aulas", origin).href,
            preferences: link("/preferencias", pref),
            contact: settings.contact_email,
          }),
        });
      }
      return { ok: true, campaign_id: campaign.id };
    }
    if (action === "delivery_resume") {
      if (data.confirmed !== true) fail("academy_confirmation_required");
      await asUser(jwt, "launch_confirm", { id: data.id, confirmed: true });
      return { ok: true, campaign_id: data.id };
    }
    if (action === "mail_process") {
      if (data.confirmed !== true) fail("academy_confirmation_required");
      return { ok: true, process_mail: true };
    }
    if (action === "upload") return upload(data, jwt);
    return asUser(jwt, action, data);
  }
  async function upload(data, jwt) {
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (
      !name ||
      name.length > 160 ||
      /[\x00-\x1f/\\]/.test(name) ||
      typeof data.base64 !== "string" ||
      data.base64.length > 7_000_000 ||
      !/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        data.base64,
      )
    )
      fail("academy_material_invalid");
    let bytes = Buffer.from(data.base64, "base64"),
      mime,
      kind = data.kind;
    if (bytes.length === 0 || bytes.length > 5242880)
      fail("academy_material_invalid");
    if (kind === "image") {
      try {
        const img = sharp(bytes, {
          limitInputPixels: 20000000,
          failOn: "warning",
        });
        const meta = await img.metadata();
        if (!["jpeg", "png", "webp"].includes(meta.format))
          fail("academy_material_invalid");
        bytes = await img
          .rotate()
          .resize(1600, 1000, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();
        mime = "image/webp";
      } catch {
        fail("academy_material_invalid");
      }
    } else if (kind === "material") {
      if (/\.pdf$/i.test(name) && bytes.subarray(0, 5).toString() === "%PDF-") {
        try {
          const pdf = await PDFDocument.load(bytes, {
            ignoreEncryption: false,
          });
          if (pdf.isEncrypted || pdf.getPageCount() > 300)
            fail("academy_material_invalid");
          const scan = (obj, depth = 0) => {
            if (depth > 30) fail("academy_material_invalid");
            if (obj instanceof PDFDict) {
              for (const [k, v] of obj.entries()) {
                if (
                  [
                    "/JavaScript",
                    "/JS",
                    "/OpenAction",
                    "/AA",
                    "/Launch",
                    "/EmbeddedFiles",
                    "/EmbeddedFile",
                    "/RichMedia",
                    "/AcroForm",
                    "/XFA",
                    "/URI",
                  ].includes(k.toString())
                )
                  fail("academy_material_invalid");
                scan(v, depth + 1);
              }
            } else if (obj instanceof PDFArray)
              for (const v of obj.asArray()) scan(v, depth + 1);
            else if (
              obj instanceof PDFName &&
              ["/JavaScript", "/Launch", "/EmbeddedFile"].includes(
                obj.toString(),
              )
            )
              fail("academy_material_invalid");
          };
          for (const [, obj] of pdf.context.enumerateIndirectObjects())
            scan(obj);
          mime = "application/pdf";
        } catch {
          fail("academy_material_invalid");
        }
      } else if (/\.(txt|csv)$/i.test(name)) {
        try {
          new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
          fail("academy_material_invalid");
        }
        if (bytes.includes(0) || bytes.subarray(0, 2).toString() === "MZ")
          fail("academy_material_invalid");
        if (
          /\.csv$/i.test(name) &&
          /(?:^|[\r\n,;])\s*"?[=+@\-]/m.test(bytes.toString("utf8"))
        )
          fail("academy_material_invalid");
        mime = /\.csv$/i.test(name) ? "text/csv" : "text/plain";
      } else fail("academy_material_invalid");
    } else fail("academy_material_invalid");
    if (bytes.length > 5242880) fail("academy_material_invalid");
    const id = randomUUID(),
      path = "assets/" + id;
    await storage.put(path, bytes, mime);
    try {
      return await asUser(jwt, "material_commit", {
        id,
        kind,
        name,
        mime,
        bytes: bytes.length,
        storage_path: path,
      });
    } catch (e) {
      await storage.remove(path).catch(() => {});
      throw e;
    }
  }
  async function file(id, { session, jwt, cover = false } = {}) {
    if (!/^[a-f0-9-]{36}$/.test(id)) fail("academy_not_found", 404);
    const value = jwt
      ? await asUser(jwt, "material_get", { id })
      : await service(cover ? "cover" : "material", {
          id,
          session_hash: session ? hash(session) : "",
        });
    if (!value) fail("academy_not_found", 404);
    return { ...value, bytes: await storage.get(value.storage_path) };
  }
  return {
    publicAction,
    admin,
    file,
    drain,
    processTest,
    close: async () => {
      await Promise.allSettled([active, ...testTasks]);
    },
  };
}

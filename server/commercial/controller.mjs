import { randomUUID, randomBytes } from "node:crypto";
import { digest } from "./crypto.mjs";
import { demoLink } from "./links.mjs";
import { deliveryError } from "./mail.mjs";
const exact = (body, keys) => {
  if (
    !body ||
    Array.isArray(body) ||
    typeof body !== "object" ||
    Object.keys(body).some((k) => !keys.includes(k))
  )
    throw Error("commercial_invalid");
};
export function commercialController({
  asUser,
  service,
  auth,
  store,
  sendMail,
  box,
  origins,
  contact,
  maxBatch = 25,
  inviteDays = 7,
  promoteAssets = async (c) => c,
}) {
  const pending = new Set();
  let closing = false;
  const svc = (action, data = {}) =>
    service("commercial_service", { p_action: action, p_data: data });
  const user = async (token) => {
    const actor = await auth(token);
    if (!actor?.id) throw Error("session_required");
    return actor;
  };
  async function invitation(token, demoId, purpose) {
    const d = await asUser(token, "commercial_demo_edit_context", {
      p_id: demoId,
    });
    const secret = randomBytes(32).toString("base64url"),
      id = randomUUID(),
      expires = new Date(
        Math.min(
          Date.now() + inviteDays * 86400000,
          new Date(d.expires_at).getTime(),
        ),
      ).toISOString();
    const i = await asUser(token, "commercial_invite_prepare", {
      p_demo: demoId,
      p_purpose: purpose,
      p_id: id,
      p_hash: digest(secret),
      p_expires: expires,
    });
    if (box)
      await svc("invite_store", {
        id,
        sealed: box.seal({ token: secret, id }),
      });
    const link = new URL(
      purpose === "activation" ? "/ativar-empresa" : "/" + i.slug,
      purpose === "activation" ? origins.appOrigin : origins.publicOrigin,
    );
    link.hash = new URLSearchParams({ convite: secret }).toString();
    return { ...i, lead_id: d.lead_id, url: link.href, secret };
  }
  async function demoDefinition(token) {
    const s = await store.session(token);
    if (!s) throw Error("demo_session_expired");
    return s.kind === "editor"
      ? {
          s,
          d: await service("commercial_editor_service", {
            p_demo: s.source_id,
            p_actor: s.actor_id,
          }),
        }
      : { s, d: await svc("demo", { id: s.source_id }) };
  }
  return {
    async drain() {
      await Promise.allSettled([...pending]);
    },
    async close() {
      closing = true;
      await Promise.allSettled([...pending]);
    },
    async operator(path, body, token) {
      await user(token);
      if (path === "activate") {
        exact(body, [
          "p_id",
          "p_snapshot",
          "p_draft",
          "p_revision",
          "p_consent",
          "p_conditions",
          "p_reviewed",
        ]);
        const q = await asUser(token, "commercial_claim_context", {
          p_id: body.p_id,
        });
        if (q.state !== "materialized") {
          if (
            q.state !== "approved" ||
            q.stale ||
            body.p_snapshot !== q.snapshot_hash ||
            body.p_reviewed !== true ||
            body.p_consent !== true
          )
            throw Error("commercial_review_required");
          await promoteAssets(q.configuration, { id: q.demo_id });
          await svc("assets_ready", {
            claim_id: q.id,
            snapshot: q.snapshot_hash,
          });
        }
        return asUser(token, "commercial_claim_complete", body);
      }
      if (path === "editor") {
        exact(body, ["id"]);
        const d = await asUser(token, "commercial_demo_edit_context", {
          p_id: body.id,
        });
        const a = await user(token);
        const s = await store.begin(d, "editor", a.id);
        const link = new URL("/" + d.slug, origins.publicOrigin);
        link.hash = new URLSearchParams({ editor: s.token }).toString();
        return { url: link.href, expires_at: s.expires_at };
      }
      if (path === "publish") {
        exact(body, ["id", "revision", "session"]);
        const d = await asUser(token, "commercial_demo_edit_context", {
          p_id: body.id,
        });
        const s = await store.session(body.session);
        const a = await user(token);
        if (
          !s ||
          s.source_id !== d.id ||
          s.actor_id !== a.id ||
          s.kind !== "editor"
        )
          throw Error("access_denied");
        const cfg = await store.export(body.session, d);
        return asUser(token, "commercial_demo_publish", {
          p_id: d.id,
          p_revision: body.revision,
          p_config: cfg,
        });
      }
      if (path === "invite") {
        exact(body, ["id", "purpose"]);
        const { secret, ...i } = await invitation(token, body.id, body.purpose);
        return i;
      }
      if (path === "preview") {
        exact(body, ["demo_ids", "purpose"]);
        if (!box) throw Error("commercial_encryption_required");
        if (
          !Array.isArray(body.demo_ids) ||
          body.demo_ids.length < 1 ||
          body.demo_ids.length > maxBatch ||
          new Set(body.demo_ids).size !== body.demo_ids.length
        )
          throw Error("commercial_batch_invalid");
        const context = await asUser(token, "commercial_management", {});
        if (!context.can_send) throw Error("access_denied");
        const items = [],
          recipients = [];
        for (const id of body.demo_ids) {
          const i = await invitation(token, id, body.purpose);
          const lead = context.contacts.find((l) => l.id === i.lead_id);
          if (!lead) throw Error("access_denied");
          if (
            items.some((x) => x.lead_id === i.lead_id) ||
            recipients.some(
              (x) => x.email.toLowerCase() === lead.email.toLowerCase(),
            )
          )
            throw Error("commercial_duplicate_recipient");
          items.push({ lead_id: i.lead_id, invite_id: i.id });
          recipients.push({
            lead_id: i.lead_id,
            demo_id: id,
            name: lead.name,
            company: i.company,
            email: lead.email,
          });
        }
        const confirmation = await asUser(token, "commercial_batch_confirm", {
          p_id: randomUUID(),
          p_items: items,
        });
        return { ...confirmation, items, recipients, count: items.length };
      }
      if (path === "recover") {
        exact(body, []);
        await asUser(token, "commercial_management", {});
        await svc("recover_deliveries");
        return { reviewed: true };
      }
      if (path === "send") {
        exact(body, ["id", "hash", "items", "confirmed"]);
        if (body.confirmed !== true || !box)
          throw Error("commercial_confirmation_required");
        const queued = await asUser(token, "commercial_batch_queue", {
          p_id: body.id,
          p_hash: body.hash,
          p_items: body.items,
          p_limit: maxBatch,
        });
        if (queued.reused) return queued;
        const job = (async () => {
          const results = [];
          for (const delivery of queued.deliveries) {
            let state = "uncertain",
              code = "email_temporary_failure";
            try {
              if (closing) throw Error("commercial_worker_stopped");
              const sealed = await svc("mail_envelope", { id: delivery.id });
              const secret = box.open(sealed.sealed);
              if (secret.id !== delivery.invite_id)
                throw Error("commercial_delivery_unavailable");
              const e = await svc("mail_begin", { id: delivery.id });
              if (e.cancelled) {
                results.push({ id: delivery.id, state: "cancelled" });
                continue;
              }
              const url = new URL(
                e.purpose === "activation" ? "/ativar-empresa" : "/" + e.slug,
                e.purpose === "activation"
                  ? origins.appOrigin
                  : origins.publicOrigin,
              );
              url.hash = new URLSearchParams({
                convite: secret.token,
              }).toString();
              const unsubscribe = new URL(
                "/convites/descadastrar",
                origins.appOrigin,
              );
              unsubscribe.hash = new URLSearchParams({
                convite: secret.token,
              }).toString();
              await sendMail({
                ...e,
                link: url.href,
                unsubscribe: unsubscribe.href,
                contact,
              });
              state = "accepted";
              code = "";
            } catch (error) {
              code = deliveryError(error);
              state = ["email_not_configured", "email_rate_limited"].includes(
                code,
              )
                ? "failed"
                : "uncertain";
            }
            await svc("mail_finish", { id: delivery.id, state, error: code });
            results.push({ id: delivery.id, state, error: code || null });
          }
          return results;
        })();
        pending.add(job);
        void job.catch(() => {}).finally(() => pending.delete(job));
        return queued;
      }
      throw Error("commercial_not_found");
    },
    async visitor(path, body, token) {
      if (path === "start") {
        exact(body, ["slug", "invitation"]);
        const d = await svc("demo", { slug: body.slug });
        if (body.invitation) {
          const i = await svc("invite", { hash: digest(body.invitation) });
          if (i.demo_id !== d.id || i.purpose !== "demonstration")
            throw Error("commercial_invite_invalid");
          await svc("demo_accessed", { hash: digest(body.invitation) });
        }
        return store.begin(d);
      }
      if (path === "invite") {
        exact(body, ["invitation"]);
        return svc("invite", { hash: digest(body.invitation || "") });
      }
      if (path === "unsubscribe") {
        exact(body, ["invitation", "confirmed"]);
        if (body.confirmed !== true)
          throw Error("commercial_confirmation_required");
        await svc("unsubscribe", { hash: digest(body.invitation || "") });
        return { done: true };
      }
      const { s, d } = await demoDefinition(token);
      if (path === "restore") {
        return store.restore(token, d);
      }
      if (path === "rpc") {
        exact(body, ["perspective", "name", "args"]);
        if (!["consumer", "company"].includes(body.perspective))
          throw Error("commercial_invalid");
        return store.rpc(
          token,
          d,
          body.perspective,
          body.name,
          body.args || {},
        );
      }
      if (path === "team") {
        exact(body, ["person"]);
        return store.team(token, d, body.person);
      }
      if (path === "publish") {
        exact(body, []);
        if (s.kind !== "editor") throw Error("access_denied");
        const config = await store.export(token, d);
        return service("commercial_editor_publish", {
          p_demo: d.id,
          p_actor: s.actor_id,
          p_generation: d.generation,
          p_revision: d.revision,
          p_config: config,
        });
      }
      if (path === "end") {
        await store.end(token);
        return { ended: true };
      }
      throw Error("commercial_not_found");
    },
    demoDefinition,
  };
}

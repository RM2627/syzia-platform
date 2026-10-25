import { randomUUID } from "node:crypto";
import { sanitizeImage } from "../images.mjs";
export function studioController({ asUser, service, storage, store }) {
  const call = (token, action, data) =>
    asUser(token, "commercial_studio", { p_action: action, p_data: data });
  return async (path, body, token, actor) => {
    if (path === "studio-upload") {
      if (
        typeof body.bytes !== "string" ||
        body.bytes.length > 7 * 1024 * 1024 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(body.bytes)
      )
        throw Error("commercial_media_invalid");
      // Authorize before decoding/processing untrusted images.
      await call(token, "get", { id: body.id });
      const image = await sanitizeImage(
        Buffer.from(body.bytes, "base64"),
        body.mime,
      );
      const a = await call(token, "asset-reserve", {
        id: body.id,
        asset_id: randomUUID(),
      });
      const r = await storage
        .from("company-media")
        .upload(a.object_path, image.data, {
          contentType: image.mime,
          upsert: false,
        });
      if (r.error) throw Error("commercial_storage_unavailable");
      return service("commercial_studio_asset_finish", {
        p_id: a.id,
        p_metadata: {
          id: a.id,
          public_code: "m_" + a.id.replaceAll("-", "").slice(0, 24),
          object_path: a.object_path,
          mime: image.mime,
          size_bytes: image.size,
          width: image.width,
          height: image.height,
          sha256: image.sha256,
          state: "ready",
        },
      });
    }
    if (path === "studio-image") {
      const a = await call(token, "asset-read", {
        id: body.id,
        asset_id: body.asset_id,
      });
      const r = await storage.from("company-media").download(a.object_path);
      if (r.error) throw Error("commercial_storage_unavailable");
      return {
        mime: a.metadata.mime,
        bytes: Buffer.from(await r.data.arrayBuffer()).toString("base64"),
      };
    }
    if (path === "studio-approve") {
      const current = await call(token, "get", { id: body.id });
      // A completed command is reused, even when the first response was lost.
      if (current.state === "converted") return current;
      const d =
        current.state === "converting"
          ? current
          : await call(token, "approve", body);
      const assets = [];
      for (const m of d.configuration.tables.company_media || []) {
        const a = await call(token, "asset-read", { id: d.id, asset_id: m.id });
        const r = await storage.from("company-media").download(a.object_path);
        if (r.error) throw Error("commercial_storage_unavailable");
        assets.push({
          metadata: m,
          bytes: Buffer.from(await r.data.arrayBuffer()),
        });
      }
      await store.stageStudioAssets(d.demo_id, assets);
      const definition = await asUser(token, "commercial_demo_edit_context", {
        p_id: d.demo_id,
      });
      if (!actor?.id) throw Error("session_required");
      await store.begin(definition, "editor", actor.id);
      return service("commercial_studio_complete", { p_id: d.id });
    }
    if (path === "studio-cleanup") {
      const pending = await call(token, "cleanup", {});
      let deleted = 0;
      for (const a of pending) {
        const result = await storage
          .from("company-media")
          .remove([a.object_path]);
        if (result.error) continue;
        await service("commercial_studio_asset_deleted", { p_id: a.id });
        deleted++;
      }
      return { deleted, pending: pending.length - deleted };
    }
    if (path === "studio") {
      if (
        ![
          "list",
          "get",
          "create",
          "save",
          "duplicate",
          "delete",
          "segment-save",
        ].includes(body.action)
      )
        throw Error("commercial_invalid");
      return call(token, body.action, body.data || {});
    }
    throw Error("commercial_not_found");
  };
}

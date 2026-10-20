import { digest } from "./crypto.mjs";
export function assetPromoter({ store, storage }) {
  return async (configuration, definition) => {
    const result = structuredClone(configuration);
    for (const media of result.tables.company_media || []) {
      const object = await store.preparedMedia(definition.id, media);
      const bytes = Buffer.from(object.bytes);
      if (
        media.state !== "ready" ||
        digest(bytes) !== media.sha256 ||
        object.mime !== media.mime
      )
        throw Error("commercial_media_invalid");
      const ext = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
      }[media.mime];
      if (!ext) throw Error("commercial_media_invalid");
      if(!/^[a-f0-9-]{36}$/.test(definition.organization_id || '') ||
        !/^[a-f0-9-]{36}$/.test(definition.claim_id || '')) throw Error('commercial_media_invalid');
      const path = definition.organization_id + '/commercial/' + definition.claim_id + '/' + media.sha256 + '.' + ext;
      const bucket = storage.from("company-media");
      const r = await bucket.upload(path, bytes, {
        contentType: media.mime,
        upsert: false,
      });
      if (r.error) {
        if (String(r.error.statusCode) !== "409")
          throw Error("commercial_media_unavailable");
        const prior = await bucket.download(path);
        if (
          prior.error ||
          digest(Buffer.from(await prior.data.arrayBuffer())) !== media.sha256
        )
          throw Error("commercial_media_invalid");
      }
      media.object_path = path;
    }
    return result;
  };
}

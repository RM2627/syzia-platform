import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export function secretBox(encoded) {
  const key = Buffer.from(encoded || "", "base64");
  if (key.length !== 32) throw Error("commercial_encryption_required");
  return {
    seal(value) {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv),
        data = Buffer.concat([
          cipher.update(JSON.stringify(value), "utf8"),
          cipher.final(),
        ]);
      return [iv, cipher.getAuthTag(), data]
        .map((v) => v.toString("base64url"))
        .join(".");
    },
    open(value) {
      try {
        const [iv, tag, data] = value
            .split(".")
            .map((v) => Buffer.from(v, "base64url")),
          cipher = createDecipheriv("aes-256-gcm", key, iv);
        cipher.setAuthTag(tag);
        return JSON.parse(
          Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8"),
        );
      } catch {
        throw Error("commercial_delivery_unavailable");
      }
    },
  };
}

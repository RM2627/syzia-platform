import {
  createHash,
  createHmac,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";
export const fail = (code, status = 400) => {
  throw Object.assign(Error(code), { code, status });
};
export const token = () => randomBytes(32).toString("base64url");
export const hash = (v) => createHash("sha256").update(v).digest("hex");
export const validToken = (v) =>
  typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v);
export function text(v, min, max) {
  if (
    typeof v !== "string" ||
    v.trim().length < min ||
    v.trim().length > max ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v)
  )
    fail("academy_invalid");
  return v.trim();
}
export function email(v) {
  v = text(v, 5, 254).toLowerCase();
  if (!/^[^\s@<>,;:()\[\]\\"]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(v))
    fail("academy_invalid");
  return v;
}
export function youtube(v) {
  if (!v) return "";
  let u;
  try {
    u = new URL(v);
  } catch {
    fail("academy_video_invalid");
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port)
    fail("academy_video_invalid");
  let id =
    u.hostname === "youtu.be"
      ? u.pathname.slice(1)
      : ["www.youtube.com", "youtube.com", "m.youtube.com"].includes(u.hostname)
        ? u.searchParams.get("v") ||
          u.pathname.match(/^\/(embed|shorts)\/([^/]+)$/)?.[2]
        : null;
  if (!/^[\w-]{11}$/.test(id || "")) fail("academy_video_invalid");
  return id;
}
export function signup(v) {
  if (!v || typeof v !== "object" || Array.isArray(v) || v.consent !== true)
    fail("academy_consent_required");
  return {
    name: text(v.name, 2, 100),
    email: email(v.email),
    segment: text(v.segment, 2, 80),
    difficulty: text(v.difficulty, 5, 600),
    consent: true,
    utm: Object.fromEntries(
      ["utm_source", "utm_medium", "utm_campaign", "utm_content"]
        .filter((k) => v.utm?.[k])
        .map((k) => [k, text(v.utm[k], 1, 80)]),
    ),
  };
}
export function cryptoBox(secret) {
  if (!/^[a-f0-9]{64}$/i.test(secret || "")) fail("academy_configuration", 503);
  const key = Buffer.from(secret, "hex");
  return {
    seal(value) {
      const iv = randomBytes(12),
        c = createCipheriv("aes-256-gcm", key, iv);
      return Buffer.concat([
        iv,
        Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]),
        c.getAuthTag(),
      ]).toString("base64url");
    },
    open(value) {
      const b = Buffer.from(value, "base64url"),
        c = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
      c.setAuthTag(b.subarray(-16));
      return JSON.parse(
        Buffer.concat([c.update(b.subarray(12, -16)), c.final()]).toString(
          "utf8",
        ),
      );
    },
    key(value) {
      return createHmac("sha256", key).update(value).digest("hex");
    },
    challenge(now = Date.now()) {
      const p = String(now) + "." + token();
      return p + "." + createHmac("sha256", key).update(p).digest("hex");
    },
    verify(challenge, now = Date.now()) {
      if (typeof challenge !== "string") return false;
      const parts = challenge.split(".");
      if (parts.length !== 3 || !/^[a-f0-9]{64}$/.test(parts[2])) return false;
      const age = now - Number(parts[0]),
        sig = createHmac("sha256", key)
          .update(parts.slice(0, 2).join("."))
          .digest();
      return (
        age >= 2000 &&
        age < 3600000 &&
        timingSafeEqual(sig, Buffer.from(parts[2], "hex"))
      );
    },
  };
}
export function csv(rows) {
  const cell = (v) =>
    '"' +
    String(v ?? "")
      .replace(/^(?:[\s]*[=+@\-]|[\t\r])/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const cols = [
    "name",
    "email",
    "segment",
    "difficulty",
    "status",
    "created_at",
    "confirmed_at",
    "utm",
  ];
  return (
    "\ufeff" +
    [
      cols,
      ...rows.map((r) =>
        cols.map((c) => (c === "utm" ? JSON.stringify(r.utm) : r[c])),
      ),
    ]
      .map((r) => r.map(cell).join(","))
      .join("\r\n")
  );
}

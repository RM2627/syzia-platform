// Safe local configuration check. No secrets, document values, claims or tokens are printed.
// Reads example/local files only; probes loopback health endpoints, never Supabase.
import { readFile } from "node:fs/promises";
const env = { ...process.env };
for (const file of [".env", ".env.local", ".env.server"]) {
  try {
    for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
      const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
      if (m && !Object.hasOwn(env, m[1]))
        env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {}
}
const url = (k) => {
  try {
    return new URL(env[k]);
  } catch {
    return null;
  }
};
const frontend = url("VITE_SUPABASE_URL"),
  server = url("SUPABASE_URL"),
  origin = url("PLATFORM_APP_ORIGIN"),
  mediaOrigin = url("CONSUMER_ORIGIN");
const publicKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
let publicKeySafe = Boolean(publicKey?.startsWith("sb_publishable_"));
try {
  if (publicKey?.split(".").length === 3)
    publicKeySafe =
      JSON.parse(Buffer.from(publicKey.split(".")[1], "base64url").toString())
        .role === "anon";
} catch {}
const checks = {
  supabase_urls_present: Boolean(frontend && server),
  same_supabase_project: Boolean(
    frontend && server && frontend.origin === server.origin,
  ),
  server_privileged_key_present: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
  server_publishable_key_present: Boolean(env.SUPABASE_PUBLISHABLE_KEY),
  public_key_not_secret: publicKeySafe,
  platform_origin_configured: Boolean(origin),
  media_origin_configured: Boolean(mediaOrigin),
  origins_match: Boolean(
    origin && mediaOrigin && origin.origin === mediaOrigin.origin,
  ),
};
console.log(JSON.stringify({ event: "local_configuration", checks }));
if (process.argv.includes("--probe"))
  for (const [key, expectedOrigin] of [
    ["VITE_PLATFORM_API_URL", origin],
    ["VITE_ATTACHMENT_GATEWAY_URL", mediaOrigin],
  ]) {
    const u = url(key);
    if (
      !u ||
      !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) ||
      !expectedOrigin
    ) {
      console.log(
        JSON.stringify({ service: key, result: "local_probe_not_available" }),
      );
      continue;
    }
    try {
      const response = await fetch(new URL("/health", u), {
        headers: { Origin: expectedOrigin.origin },
        signal: AbortSignal.timeout(5000),
      });
      console.log(
        JSON.stringify({
          service: key,
          status: response.status,
          ready: response.ok,
        }),
      );
    } catch {
      console.log(
        JSON.stringify({ service: key, result: "gateway_unreachable" }),
      );
    }
  }
console.log(
  "Supabase Auth/Storage, buckets and policies require separate authorized external homologation.",
);

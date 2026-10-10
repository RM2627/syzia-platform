export type EmailCallback = { kind: "invalid" | "none" }
  | { kind: "pkce"; code: string; flowId?: string }
  | { kind: "hash"; token: string; type: "invite" | "recovery" }
  | { kind: "implicit"; access: string; refresh: string };
export function readEmailCallback(href: string): EmailCallback {
  const url = new URL(href), hash = new URLSearchParams(url.hash.slice(1));
  if ([url.searchParams, hash].some(p => p.has("error") || p.has("error_code") || p.has("error_description"))) return { kind: "invalid" };
  const token = hash.get("token_hash"), type = hash.get("type");
  if (token) return type === "invite" || type === "recovery" ? { kind: "hash", token, type } : { kind: "invalid" };
  const access = hash.get("access_token"), refresh = hash.get("refresh_token");
  if (access || refresh) return access && refresh && (type === "invite" || type === "recovery") ? { kind: "implicit", access, refresh } : { kind: "invalid" };
  const code = url.searchParams.get("code");
  if (code) return { kind: "pkce", code, flowId: url.searchParams.get("sb_flow_id") || undefined };
  return { kind: "none" };
}
export function clearEmailCallbackUrl() {
  const url = new URL(window.location.href);
  for (const key of ["error", "error_code", "error_description", "code", "sb_flow_id", "token_hash", "access_token", "refresh_token", "type"]) url.searchParams.delete(key);
  url.hash = "";
  window.history.replaceState(window.history.state, "", url.pathname + url.search);
}

/** Pure contracts; no DNS, network, authentication or session side effects. */
export const PLANNED_DEMO_ORIGIN = "https://demo.usesyzia.com.br";
const reserved = new Set([
  "admin",
  "api",
  "app",
  "assets",
  "health",
  "login",
  "entrar",
  "cadastrar",
  "ativar",
  "billing",
]);
export function demoOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw Error("commercial_origin_invalid");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !(url.protocol === "https:" || (url.protocol === "http:" && local))
  )
    throw Error("commercial_origin_invalid");
  return url.origin;
}
export function demoLink(origin, slug) {
  if (
    typeof slug !== "string" ||
    !/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(slug) ||
    reserved.has(slug)
  )
    throw Error("commercial_slug_invalid");
  return new URL("/" + slug, demoOrigin(origin)).href;
}
export function demoOrigins(env) {
  // Configuration is explicit. The future public hostname is never a test fallback.
  const publicOrigin = demoOrigin(env.COMMERCIAL_DEMO_ORIGIN);
  const appOrigin = demoOrigin(env.PLATFORM_APP_ORIGIN);
  if (publicOrigin === appOrigin)
    throw Error("commercial_separate_origin_required");
  return Object.freeze({ publicOrigin, appOrigin });
}
export function allowedDemoOrigin(requestOrigin, configuredOrigin) {
  return (
    typeof requestOrigin === "string" &&
    requestOrigin === demoOrigin(configuredOrigin)
  );
}

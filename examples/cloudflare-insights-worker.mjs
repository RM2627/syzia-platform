// Optional path proxy for an EXISTING institutional hostname. Not deployed here.
// Configure ONLY the route usesyzia.com.br/blog* after owner review.
// This file never replaces the institutional landing or the application build.
export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    if (
      incoming.pathname !== "/blog" &&
      !incoming.pathname.startsWith("/blog/")
    )
      return new Response("Not found", { status: 404 });
    const api = new URL(env.SYZIA_API_ORIGIN);
    if (
      api.protocol !== "https:" ||
      api.pathname !== "/" ||
      api.username ||
      api.password ||
      api.search ||
      api.hash
    )
      return new Response("Configuration unavailable", { status: 503 });
    const target = new URL(incoming.pathname + incoming.search, api.origin);
    const headers = new Headers(request.headers);
    headers.delete("host");
    // No HTML cache: unpublish/scheduled publications become visible immediately.
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    });
    // Keep the Node backend unchanged. Only extend its audited public HTML CSP.
    // An unexpected/multiple policy is preserved, never replaced permissively.
    const auditedCSP =
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
    if (
      incoming.hostname !== "usesyzia.com.br" ||
      !["GET", "HEAD"].includes(request.method) ||
      incoming.pathname.startsWith("/blog/api/") ||
      upstream.status !== 200 ||
      !/^text\/html(?:;|$)/i.test(upstream.headers.get("Content-Type") || "") ||
      upstream.headers.get("Content-Security-Policy") !== auditedCSP
    )
      return upstream;
    const response = new Response(upstream.body, upstream);
    response.headers.set(
      "Content-Security-Policy",
      auditedCSP
        .replace("script-src 'self'", "script-src 'self' https://static.cloudflareinsights.com")
        .replace("connect-src 'self'", "connect-src 'self' https://cloudflareinsights.com"),
    );
    // Cloudflare already injects the beacon. Do not inject another script.
    return response;
  },
};

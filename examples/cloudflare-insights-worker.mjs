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
    return fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    });
  },
};

export async function probeLocalGateway(address, origin, service) {
  let url;
  try {
    url = new URL(address);
  } catch {
    return { ready: false, result: "address_missing_or_invalid" };
  }
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !["http:", "https:"].includes(url.protocol)
  )
    return { ready: false, result: "loopback_only" };
  if (!origin) return { ready: false, result: "frontend_origin_missing" };
  try {
    const response = await fetch(new URL("/health", url), {
      headers: { Origin: new URL(origin).origin },
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.json().catch(() => ({}));
    const ready =
      response.ok && body.ready === true && body.service === service;
    return {
      ready,
      status: response.status,
      result: ready
        ? "process_ready"
        : response.status === 403
          ? "frontend_origin_denied"
          : "unexpected_health_response",
    };
  } catch {
    return { ready: false, result: "gateway_unreachable" };
  }
}

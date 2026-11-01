import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker from "../../examples/cloudflare-insights-worker.mjs";

const baselineBlog = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
const extended = (csp) => csp.replace("script-src 'self'", "script-src 'self' https://static.cloudflareinsights.com").replace("connect-src 'self'", "connect-src 'self' https://cloudflareinsights.com");
const env = { SYZIA_API_ORIGIN: "https://api.example.invalid" };
const expectedAcademy = (api) => `default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' ${api} blob:; connect-src 'self' ${api} https://cloudflareinsights.com; frame-src https://www.youtube-nocookie.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;
function upstream(csp = baselineBlog, type = "text/html; charset=utf-8", status = 200) {
  return new Response("<!doctype html><title>Fixture</title><script src='/blog/assets/client.js'></script>", { status, headers: {
    "Content-Security-Policy": csp, "Content-Type": type, "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin",
  } });
}

test("Academy: build permits only the two Analytics origins and preserves every other directive", async () => {
  const headers = await readFile(new URL("../../dist-academy/_headers", import.meta.url), "utf8");
  const csps = headers.split("\n").filter((l) => l.trim().startsWith("Content-Security-Policy:"));
  assert.equal(csps.length, 1);
  const csp = csps[0].trim().slice("Content-Security-Policy: ".length);
  const api = /img-src 'self' (\S+) blob:/.exec(csp)?.[1];
  assert.ok(api);
  assert.equal(csp, expectedAcademy(api));
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /Referrer-Policy: no-referrer/);
  assert.match(headers, /Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\)/);
  const script = csp.split(";").find((d) => d.trim().startsWith("script-src"));
  assert.doesNotMatch(script, /unsafe-inline|unsafe-eval|\*/);
});

test("Academy: no manual beacon is added to the built HTML; existing theme/application scripts remain", async () => {
  const html = await readFile(new URL("../../dist-academy/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /cloudflareinsights|data-cf-beacon/);
  assert.match(html, /academy-theme\.js/);
  assert.match(html, /type="module"[^>]*src="[^"]+\.js"/);
});

for (const path of ["/blog", "/blog/organizar-agendamentos-pequeno-negocio"]) {
  test(`Blog: ${path} extends only the audited HTML policy, preserving body and headers`, async (t) => {
    const source = upstream(); const originalBody = await source.clone().text();
    let call;
    t.mock.method(globalThis, "fetch", async (url, options) => { call = {url: String(url), options}; return source; });
    const response = await worker.fetch(new Request("https://usesyzia.com.br" + path), env);
    assert.equal(response.headers.get("Content-Security-Policy"), extended(baselineBlog));
    assert.equal(await response.text(), originalBody);
    assert.equal(call.url, env.SYZIA_API_ORIGIN + path);
    assert.equal(call.options.redirect, "manual");
    for (const header of ["Content-Type", "Cache-Control", "X-Frame-Options", "Referrer-Policy"])
      assert.equal(response.headers.get(header), source.headers.get(header));
  });
}

test("Blog: unknown, missing, already extended or multiple CSPs are not weakened", async (t) => {
  for (const policy of ["", "default-src 'none'", baselineBlog + "; script-src-elem 'none'", baselineBlog + ", default-src 'none'", extended(baselineBlog)]) {
    const source = upstream(policy);
    const mock = t.mock.method(globalThis, "fetch", async () => source);
    const response = await worker.fetch(new Request("https://usesyzia.com.br/blog"), env);
    assert.equal(response, source); assert.equal(response.headers.get("Content-Security-Policy"), policy);
    mock.mock.restore();
  }
});

test("Blog: APIs, assets, error responses and other hosts remain untouched", async (t) => {
  for (const [url, type, status] of [
    ["https://usesyzia.com.br/blog/api/likes", "text/html", 200],
    ["https://usesyzia.com.br/blog/assets/client.js", "text/javascript", 200],
    ["https://usesyzia.com.br/blog", "application/json", 200],
    ["https://usesyzia.com.br/blog", "text/html", 503],
    ["https://another.example.invalid/blog", "text/html", 200],
  ]) {
    const source = upstream(baselineBlog, type, status);
    const mock = t.mock.method(globalThis, "fetch", async () => source);
    assert.equal(await worker.fetch(new Request(url), env), source);
    mock.mock.restore();
  }
});

test("Blog: POST payload, session headers, query and upstream response are preserved", async (t) => {
  const request = new Request("https://usesyzia.com.br/blog/api/like?example=1", { method: "POST", body: '{"fixture":true}', headers: { "Content-Type": "application/json", Cookie: "fixture=local-only", Authorization: "Bearer fake-local", Origin: "https://usesyzia.com.br" } });
  const source = upstream(baselineBlog, "application/json");
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(String(url), env.SYZIA_API_ORIGIN + "/blog/api/like?example=1");
    assert.equal(options.method, "POST"); assert.equal(options.body, request.body);
    for (const key of ["Cookie", "Authorization", "Origin", "Content-Type"]) assert.equal(options.headers.get(key), request.headers.get(key));
    return source;
  });
  assert.equal(await worker.fetch(request, env), source);
});

test("Blog: HEAD preserves the empty body and applies the same HTML policy", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, {headers: {"Content-Type":"text/html", "Content-Security-Policy":baselineBlog}}));
  const response = await worker.fetch(new Request("https://usesyzia.com.br/blog", {method:"HEAD"}), env);
  assert.equal(response.headers.get("Content-Security-Policy"), extended(baselineBlog));
  assert.equal(await response.text(), "");
});

test("Blog: routes outside the blog and invalid origins never reach upstream", async (t) => {
  t.mock.method(globalThis, "fetch", () => { assert.fail("Unexpected external call"); });
  for (const path of ["/", "/admin/insights", "/blogger"])
    assert.equal((await worker.fetch(new Request("https://usesyzia.com.br" + path), env)).status, 404);
  assert.equal((await worker.fetch(new Request("https://usesyzia.com.br/blog"), {SYZIA_API_ORIGIN:"http://api.example.invalid"})).status, 503);
});

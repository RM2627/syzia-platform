// Manual, local-only CSP probe. Downloads the public beacon WITHOUT a site token.
// Does not send Analytics events, use production APIs or modify the application.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import worker from "../../examples/cloudflare-insights-worker.mjs";

const headers = await readFile(new URL("../../dist-academy/_headers", import.meta.url), "utf8");
const academyAfter = headers.split("\n").find((l) => l.trim().startsWith("Content-Security-Policy:")).trim().slice("Content-Security-Policy: ".length);
const academyBefore = academyAfter.replace(" https://static.cloudflareinsights.com", "").replace(" https://cloudflareinsights.com", "");
const blogBefore = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
const actualFetch = globalThis.fetch;
let blogAfter;
try {
  globalThis.fetch = async () => new Response("", {headers: {"Content-Type":"text/html", "Content-Security-Policy":blogBefore}});
  blogAfter = (await worker.fetch(new Request("https://usesyzia.com.br/blog"), {SYZIA_API_ORIGIN:"https://api.example.invalid"})).headers.get("Content-Security-Policy");
} finally { globalThis.fetch = actualFetch; }
const policies = {"/academy-before":academyBefore, "/academy-after":academyAfter, "/blog-before":blogBefore, "/blog-after":blogAfter};
const client = `
document.addEventListener('securitypolicyviolation', e => {
  if (e.blockedURI.includes('cloudflareinsights.com')) document.querySelector('#csp').textContent = 'BLOQUEIO CSP: '+e.effectiveDirective;
});
const beacon = document.createElement('script');
beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
beacon.defer = true;
beacon.onload = () => { document.querySelector('#download').textContent = 'CARREGADO'; };
beacon.onerror = () => { document.querySelector('#download').textContent = 'BLOQUEADO OU FALHA DE REDE'; };
document.head.append(beacon);
`;
const server = createServer((req, res) => {
  if (req.url === "/probe.js") {res.writeHead(200, {"Content-Type":"text/javascript"}); return res.end(client);}
  if (req.method !== "GET") {res.writeHead(405); return res.end();}
  const policy = policies[req.url];
  if (!policy) {res.writeHead(404); return res.end("Use /academy-before, /academy-after, /blog-before or /blog-after");}
  res.writeHead(200, {"Content-Type":"text/html; charset=utf-8", "Content-Security-Policy":policy, "Cache-Control":"no-store"});
  res.end(`<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>CSP — teste local</title><script defer src="/probe.js"></script></head><body><h1>${req.url}</h1><p>Download do script: <strong id="download">AGUARDANDO</strong></p><p id="csp">Nenhuma violação observada</p><p>Coleta: NÃO TESTADA. Sem token de Analytics e sem envio de eventos.</p><nav>${Object.keys(policies).map(p=>`<p><a href="${p}">${p}</a></p>`).join("")}</nav></body></html>`);
});
server.listen(4177, "0.0.0.0", () => console.log("Local CSP probe: http://127.0.0.1:4177/academy-before"));
for (const event of ["SIGINT", "SIGTERM"]) process.on(event, () => server.close());

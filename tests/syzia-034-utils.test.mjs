import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { framingRect } from "../src/consumer/image-framing.ts";
import {
  accessInstructions,
  firstAccessLink,
} from "../src/access/access-instructions.ts";
import { probeLocalGateway } from "../scripts/syzia-034/readiness.mjs";
for (const ratio of [4 / 3, 3 / 2])
  test(`Enquadramento ${ratio}: bordas válidas em paisagem, retrato e quadrado, zoom e posições`, () => {
    for (const [w, h] of [
      [1600, 1200],
      [1200, 1600],
      [900, 900],
      [2400, 500],
    ])
      for (const zoom of [1, 1.73, 3])
        for (const [x, y] of [
          [0, 0],
          [1, 1],
          [0.3, 0.7],
        ]) {
          const r = framingRect(w, h, ratio, zoom, x, y);
          assert(r.x >= 0 && r.y >= 0);
          assert(r.x + r.width <= w + 0.001 && r.y + r.height <= h + 0.001);
          assert(Math.abs(r.width / r.height - ratio) < 0.00001);
        }
  });
test("Mensagem pessoal não inventa empresa; link não contém o segredo e preserva contexto", () => {
  const v = {
    username: "pessoa.ficticia",
    company_code: "SYZIA",
    activation_link: "a".repeat(43),
    temporary_code: "TEMPORARY-FAKE",
    expires_at: "2026-10-01T12:00:00Z",
  };
  const s = accessInstructions(v, "http://localhost:5173");
  assert(!s.includes("Empresa:"));
  assert(!s.includes("undefined"));
  assert(s.includes(v.temporary_code));
  const url = new URL(firstAccessLink(v, "http://localhost:5173"));
  assert.equal(url.pathname, "/ativar-acesso");
  assert.equal(url.search, "");
  assert(!url.href.includes(v.temporary_code));
  assert.equal(
    new URLSearchParams(url.hash.slice(1)).get("access"),
    v.activation_link,
  );
  assert(
    accessInstructions(
      {
        ...v,
        company_code: "FAKECOMPANY",
        company_name: "Empresa Fictícia",
        organization_id: "fictional",
      },
      url.origin,
    ).includes("Empresa: Empresa Fictícia"),
  );
});
test("Readiness diferencia gateway parado, processo correto, origem negada e resposta inesperada", async () => {
  let mode = "ready";
  const s = http.createServer((req, res) => {
    res.writeHead(mode === "denied" ? 403 : 200, {
      "Content-Type": "application/json",
    });
    res.end(
      JSON.stringify(mode === "ready" ? { ready: true, service: "media" } : {}),
    );
  });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const address = "http://127.0.0.1:" + s.address().port;
  assert.equal(
    (await probeLocalGateway(address, "http://localhost:5173", "media")).result,
    "process_ready",
  );
  mode = "denied";
  assert.equal(
    (await probeLocalGateway(address, "http://localhost:5173", "media")).result,
    "frontend_origin_denied",
  );
  mode = "wrong";
  assert.equal(
    (await probeLocalGateway(address, "http://localhost:5173", "media")).result,
    "unexpected_health_response",
  );
  await new Promise((r) => s.close(r));
  assert.equal(
    (await probeLocalGateway(address, "http://localhost:5173", "media")).result,
    "gateway_unreachable",
  );
  assert.equal(
    (
      await probeLocalGateway(
        "https://example.invalid",
        "http://localhost:5173",
        "media",
      )
    ).result,
    "loopback_only",
  );
});

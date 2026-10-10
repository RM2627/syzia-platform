import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  enterpriseAccess,
  digest,
  safeAccessError,
} from "../server/enterprise-access.mjs";
import { createPlatformServer } from "../server/platform.mjs";
import {
  accessInstructions,
  firstAccessLink,
} from "../src/access/access-instructions.ts";
import { instructionMessage } from "../server/access-mail.mjs";
const reasons = [
  "activation_context_invalid",
  "activation_already_used",
  "activation_preparation_incompatible",
  "activation_code_expired",
  "activation_attempts_exhausted",
  "activation_code_invalid",
  "activation_link_invalid",
  "activation_link_replaced",
  "activation_link_required",
];
test("036: HTTP distingue causas apenas no log sanitizado e usa a mesma resposta pública", async () => {
  let reason = "",
    args,
    rpc;
  const selector = randomBytes(32).toString("base64url"),
    code = "FAKE-CODE-036",
    logs = [];
  const access = enterpriseAccess({
    service: async (n, a) => {
      if (n === "access_rate") return true;
      rpc = n;
      args = a;
      return { valid: false, reason };
    },
    auth: {},
  });
  const server = createPlatformServer({
    origin: "http://127.0.0.1:5173",
    access,
    log: (e) => logs.push(e),
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    for (reason of reasons) {
      const r = await fetch(
        "http://127.0.0.1:" + server.address().port + "/access/verify",
        {
          method: "POST",
          headers: {
            Origin: "http://127.0.0.1:5173",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ activation_link: selector, code }),
        },
      );
      const body = await r.json();
      assert.equal(r.status, 400);
      assert.equal(body.error, "activation_invalid");
      assert.equal(body.reason, undefined);
      assert.equal(body.diagnostic, undefined);
      assert.equal(body.account_id, undefined);
      const log = logs.at(-1);
      assert.equal(log.reason, reason);
      assert.equal(log.category, "activation");
      assert.equal(log.request_id, body.request_id);
      assert.equal(rpc, "access_verify_link");
      assert.equal(args.p_link_hash, digest(selector));
      assert.equal(args.p_hash, digest(code.replaceAll("-", "")));
      assert.match(args.p_proof, /^[a-f0-9]{64}$/);
      const publicData = JSON.stringify({ body, logs });
      for (const secret of [
        selector,
        code,
        args.p_link_hash,
        args.p_hash,
        args.p_proof,
      ])
        assert(!publicData.includes(secret));
    }
  } finally {
    await new Promise((r) => server.close(r));
  }
});
test("036: diagnóstico desconhecido não injeta segredo em logs", () => {
  const r = safeAccessError({
    code: "activation_invalid",
    activation_reason: "secret@example.invalid",
  });
  assert.equal(r.diagnostic, undefined);
});
test("036: instruções manuais e SMTP usam o mesmo link opaco; nenhum código empresarial/ID/hash no link", () => {
  const value = {
    email: "pessoa@example.invalid",
    company_name: "Empresa Fictícia",
    organization_id: "fictional-id",
    company_code: "COMPANY",
    username: "pessoa.ficticia",
    activation_link: randomBytes(32).toString("base64url"),
    temporary_code: "FAKE-TEMPORARY",
    expires_at: "2026-10-01T00:00:00Z",
  };
  const link = firstAccessLink(value, "https://app.example.invalid"),
    manual = accessInstructions(value, "https://app.example.invalid"),
    email = instructionMessage(value, "https://app.example.invalid").text;
  for (const text of [manual, email]) {
    assert(text.includes(link));
    assert(text.includes(value.temporary_code));
    assert(!text.includes("Código da empresa"));
    assert(!text.includes(value.company_code));
  }
  const u = new URL(link);
  assert.equal(u.search, "");
  assert.equal(
    new URLSearchParams(u.hash.slice(1)).get("access"),
    value.activation_link,
  );
  for (const x of [
    value.username,
    value.organization_id,
    value.temporary_code,
    digest(value.activation_link),
  ])
    assert(!link.includes(x));
  assert.throws(() =>
    firstAccessLink({ ...value, activation_link: "" }, u.origin),
  );
});

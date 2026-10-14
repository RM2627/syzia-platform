import { assertHotfix051File } from "../support/hotfix051-integrity.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
test("050-I01 all 46 migrations, finance policies, HMAC adapter, lockfile and other product modules unchanged", async () => {
  const files = JSON.parse(await readFile("docs/hotfix-050/preserved-sha256.json", "utf8"));
  assert.equal(Object.keys(files).filter(x => x.startsWith("supabase/migrations/")).length, 46);
  assert.equal((await readdir("supabase/migrations")).filter(x => x.endsWith(".sql") && x !== "202610130051_checkout_diagnostics.sql").length, 46);
  for (const [path, hash] of Object.entries(files)) assertHotfix051File(path, await readFile(path), hash);
});
test("050-I02 existing HMAC correction, legal persistence and acceptance stay authoritative", async () => {
  const runtime = await readFile("server/billing/runtime.mjs", "utf8");
  const legal = await readFile("src/access/Legal.tsx", "utf8");
  assert.match(runtime, /notificationMode = env.MERCADO_PAGO_NOTIFICATION_MODE \|\| "disabled"/);
  assert.match(legal, /\.from\("legal_documents"\)/);
  assert.match(legal, /rpc\("access_legal_accept"/);
  assert.ok(!legal.includes("docs/hotfix-050"), "do not replace a recorded contract by an unversioned frontend overlay");
  const example = await readFile(".env.server.example", "utf8");
  assert.match(example, /^MERCADO_PAGO_ENABLED=false$/m);
  assert.match(example, /^MERCADO_PAGO_NOTIFICATION_MODE=disabled$/m);
});
test("050-I03 reviewed legal copy contains user information, no development report or invented contact", async () => {
  const terms = await readFile("docs/hotfix-050/TERMOS-DE-USO-REVISADOS.md", "utf8");
  const privacy = await readFile("docs/hotfix-050/POLITICA-DE-PRIVACIDADE-REVISADA.md", "utf8");
  for (const text of [terms, privacy]) {
    assert.doesNotMatch(text, /homologa|MP-01|webhook|Render|Supabase|migration|backend|fixture|hotfix|\[A (PREENCHER|DEFINIR)|@usesyzia/i);
    assert.match(text, /SYZIA/);
  }
  assert.match(terms, /não estão disponíveis neste momento/);
  assert.match(terms, /três dias/); assert.match(terms, /Manual da empresa é opcional/);
  assert.match(terms, /arrependimento/); assert.match(terms, /Mercado Pago/);
  for (const word of ["finalidade", "consentimento", "fornecedores", "Mercado Pago", "titular", "fora do Brasil", "Conservação", "Contato"])
    assert.ok(privacy.includes(word), word);
});

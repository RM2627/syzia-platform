// Offline verification only. No network, SQL, writes or current-file hash acceptance.
import { readFile, readdir } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { referenceFileBytes } from "../../tests/support/portable-integrity.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const project = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const [baseArgument, zipArgument] = process.argv.slice(2);
if (!baseArgument || !zipArgument) {
  console.error("Uso: node scripts/syzia-051/verify-reconciliation.mjs <pasta-050-oficial> <ZIP-050-oficial>");
  process.exit(2);
}
const base = resolve(baseArgument);
if (base === project) throw Error("Use a extração original da 050, sem sobrepor a 051.");
const data = JSON.parse(await readFile(resolve(project, "docs/syzia-051/reconciliation-b30c991.json"), "utf8"));
const baseline = JSON.parse(await readFile(resolve(project, "docs/syzia-051/base-050-sha256.json"), "utf8"));
const changes = JSON.parse(await readFile(resolve(project, "docs/syzia-051/authorized-hashes.json"), "utf8"));
const { hotfix051ExpectedHash, assertHotfix051File } = await import(pathToFileURL(resolve(project, "tests/support/hotfix051-integrity.mjs")).href);
const errors = [];
const check = (ok, message) => { if (!ok) errors.push(message); };
const commit = "b30c9910ca939289a14af8ae8729768f8766f03c";
const archiveSha = "2a3a307acaf221252ed09bcec34cec9009382124a214056c886b2a3f8f5db1cf";
check(data.commit === commit, "commit_divergente");
check(data.zip_sha256 === archiveSha, "referencia_zip_divergente");
check(sha(await readFile(resolve(zipArgument))) === archiveSha, "zip_oficial_divergente");
check(data.rows.length === 890 && new Set(data.rows.map(r => r.path)).size === 890, "contagem_890_divergente");
check(Object.keys(baseline).length === 890, "manifesto_890_divergente");
check(Object.keys(changes).length === 26, "transicoes_051_divergentes");
const counts = {};
for (const row of data.rows) {
  const path = row.path;
  counts[row.classification] = (counts[row.classification] || 0) + 1;
  check(baseline[path] === row.official_sha256, "manifesto_vs_auditoria: " + path);
  try {
    const bytes = referenceFileBytes(path, await readFile(resolve(base, path)), row.official_sha256);
    check(sha(bytes) === row.official_sha256, "base_oficial: " + path);
    // Reconstruct only the two reviewed edits, or the exact Windows line-ending conversion.
    let predecessor = bytes;
    if (row.classification === "eol_only") predecessor = Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n"));
    if (row.classification === "content_changed") {
      let text = bytes.toString("utf8").replaceAll("\r\n", "\n");
      if (path === ".gitignore") {
        check(text.endsWith("\n/syzia-plan-mapping.local.json\n"), "protecao_mapping_ausente");
        check(text.includes("/legal-private/\n") && text.includes("*.legal-private.json\n"), "protecoes_juridicas_ausentes");
        text = text.replace(/\n\/syzia-plan-mapping\.local\.json\n$/, "");
      } else if (path === ".env.server.example") {
        check(text.startsWith("\ufeff"), "BOM_oficial_divergente");
        check(/^SUPABASE_SERVICE_ROLE_KEY=$/m.test(text), "placeholder_nao_removido");
        text = text.replace(/^\ufeff/, "").replace(/^SUPABASE_SERVICE_ROLE_KEY=$/m, "SUPABASE_SERVICE_ROLE_KEY=REPLACE_ME_SERVER_ONLY");
      } else check(false, "mudanca_conteudo_nao_autorizada: " + path);
      predecessor = Buffer.from(text);
    }
    check(sha(predecessor) === row.old_sha256, "prova_predecessor: " + path);
    const expected = hotfix051ExpectedHash(path, row.official_sha256);
    check(hotfix051ExpectedHash(path, row.old_sha256) === expected, "cadeia_historica: " + path);
    assertHotfix051File(path, await readFile(resolve(project, path)), row.official_sha256);
  } catch (error) { errors.push("arquivo: " + path + ": " + error.message); }
}
check(counts.byte_identical === 40 && counts.eol_only === 848 && counts.content_changed === 2, "categorias_divergentes");
const files = [];
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (entry.isFile()) files.push(relative(base, path).replaceAll("\\", "/"));
    else errors.push("tipo_arquivo_nao_suportado: " + path);
  }
}
await scan(base);
const expectedExtra = data.extra_files.slice().sort();
check(files.length === 893, "contagem_893_divergente");
check(JSON.stringify(files.filter(p => !Object.hasOwn(baseline, p)).sort()) === JSON.stringify(expectedExtra), "arquivos_adicionais_divergentes");
console.log(JSON.stringify({ status: errors.length ? "FAIL" : "PASS", commit, archiveSha, compared: data.rows.length, counts, extra_files: expectedExtra, errors }, null, 2));
if (errors.length) process.exitCode = 1;

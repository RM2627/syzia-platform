// Offline owner tool. Never sends data, connects to a database or loads environment secrets.
import { readFile, writeFile, mkdir, realpath } from "node:fs/promises";
import { resolve, relative, dirname, sep, isAbsolute } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { inspectSQL, publicationSQL, rollbackSQL } from "./sql.mjs";
export const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const root = fileURLToPath(new URL("../../", import.meta.url));
const hashPattern = /^[a-f0-9]{64}$/;
const internal =
  /homologa|MP-01|webhook|\bRender\b|Supabase|migration|\bbackend\b|fixture|hotfix|\[A (?:PREENCHER|DEFINIR)\]/i;
const blocked =
  /(?:^|\D)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?:\D|$)|\bCPF\b|residencial|residência|<[^>]*>|\$legal050\$/i;
function fail(code) {
  throw Error(code);
}
function text(value, field, optional = false) {
  if (optional && value === "") return "";
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 300 ||
    /[\r\n\x00-\x1f]/.test(value) ||
    blocked.test(value) ||
    internal.test(value) ||
    /a definir|preencher|placeholder|fict[ií]ci|exemplo|teste/i.test(value)
  )
    fail("legal_config_invalid_" + field);
  return value.trim();
}
function keys(value, allowed, field) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !allowed.includes(k))
  )
    fail("legal_config_fields_" + field);
}
export async function prepare(config, snapshot) {
  keys(
    config,
    ["version", "acceptance_version", "public_identity", "publication_review"],
    "root",
  );
  keys(
    config.public_identity,
    [
      "operator_name",
      "support_email",
      "privacy_email",
      "professional_address",
      "professional_address_approved",
    ],
    "identity",
  );
  for (const key of ["version", "acceptance_version"])
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{3,70}$/.test(config[key] || ""))
      fail("legal_identifier_invalid");
  if (
    !snapshot ||
    !hashPattern.test(snapshot.contract_sha256 || "") ||
    !Array.isArray(snapshot.current) ||
    snapshot.current.length !== 2 ||
    new Set(snapshot.current.map((x) => x.kind)).size !== 2
  )
    fail("legal_snapshot_invalid");
  for (const d of snapshot.current)
    if (
      !["terms", "privacy"].includes(d.kind) ||
      !d.version ||
      !d.acceptance_version ||
      !hashPattern.test(d.row_sha256 || "") ||
      d.version === config.version ||
      d.acceptance_version === config.acceptance_version
    )
      fail("legal_snapshot_or_version_invalid");
  const p = config.public_identity;
  const name = text(p.operator_name, "operator_name");
  const email = (key) => {
    const v = text(p[key], key);
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ||
      /\.(invalid|example|test|localhost)$/i.test(v)
    )
      fail("legal_email_invalid");
    return v;
  };
  const support = email("support_email"),
    privacy = email("privacy_email");
  const address = text(p.professional_address, "professional_address", true);
  if (address && p.professional_address_approved !== true)
    fail("legal_professional_address_not_approved");
  const identity =
    `A SYZIA é operada por ${name}, pessoa física responsável pela prestação da plataforma.\n\nAtendimento ao usuário: ${support}.\nCanal de privacidade e exercício de direitos: ${privacy}.` +
    (address ? `\nEndereço profissional para contato: ${address}.` : "");
  const documents = [];
  for (const [kind, file, title] of [
    ["terms", "TERMOS-DE-USO-REVISADOS.md", "Termos de Uso"],
    [
      "privacy",
      "POLITICA-DE-PRIVACIDADE-REVISADA.md",
      "Política de Privacidade",
    ],
  ]) {
    let body = (await readFile(resolve(root, "docs/hotfix-050", file), "utf8"))
      .replace(/^# .*\n+/, "")
      .replace(/^## /gm, "")
      .trim();
    if (kind === "terms")
      body = body.replace(
        "Dúvidas sobre o uso da plataforma podem ser encaminhadas pelo canal “Falar com a SYZIA”, disponível na página de contato.",
        `Dúvidas sobre o uso da plataforma podem ser encaminhadas para ${support}.`,
      );
    else
      body = body.replace(
        "O canal “Falar com a SYZIA”, disponível na página de contato, permite encaminhar dúvidas sobre a plataforma e esta política.",
        `Dúvidas sobre esta política e pedidos relacionados a dados pessoais podem ser encaminhados para ${privacy}.`,
      );
    body = `Identificação e contato\n\n${identity}\n\n${body}`;
    if (internal.test(body)) fail("legal_public_copy_internal");
    documents.push({
      kind,
      version: config.version,
      acceptance_version: config.acceptance_version,
      title,
      body,
    });
  }
  const review = {
    documents,
    expected: snapshot.current,
    contract_sha256: snapshot.contract_sha256,
  };
  const reviewHash = sha256(JSON.stringify(review));
  return { documents, reviewHash, review, inspect: inspectSQL };
}
export function compile(config, snapshot, prepared, approvalHash) {
  if (approvalHash !== prepared.reviewHash) fail("legal_review_hash_mismatch");
  const r = config.publication_review;
  keys(
    r,
    [
      "owner_approved",
      "identification_review_resolved",
      "required_information_complete",
      "no_personal_data_disclosure_pending",
      "facts_confirmed",
      "review_reference",
    ],
    "review",
  );
  for (const key of [
    "owner_approved",
    "identification_review_resolved",
    "required_information_complete",
    "no_personal_data_disclosure_pending",
    "facts_confirmed",
  ])
    if (r[key] !== true) fail("legal_publication_review_pending");
  text(r.review_reference, "review_reference");
  return {
    apply: publicationSQL(snapshot, prepared.documents, prepared.reviewHash),
    rollback: rollbackSQL(snapshot, prepared.documents, prepared.reviewHash),
  };
}
async function main() {
  const [mode, configPath, snapshotPath, outPath, approvalHash] =
    process.argv.slice(2);
  if (
    !["preview", "compile"].includes(mode) ||
    !configPath ||
    !snapshotPath ||
    !outPath
  )
    fail("usage: preview|compile CONFIG SNAPSHOT OUTPUT [REVIEW_SHA256]");
  // Owner inputs and outputs must stay outside this source checkout.
  const canonicalRoot = await realpath(root);
  for (const path of [
    await realpath(configPath),
    await realpath(snapshotPath),
    resolve(
      await realpath(dirname(resolve(outPath))),
      ".",
      resolve(outPath).split("/").at(-1),
    ),
  ]) {
    const rel = relative(canonicalRoot, path);
    if (!(rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)))
      fail("legal_private_files_must_be_outside_project");
  }
  const config = JSON.parse(await readFile(configPath, "utf8")),
    snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const p = await prepare(config, snapshot);
  const compiled =
    mode === "compile" ? compile(config, snapshot, p, approvalHash) : null;
  // Exclusive creation prevents reusing an old approved file accidentally.
  await mkdir(outPath, { mode: 0o700 });
  await writeFile(
    resolve(outPath, "REVISAO-PARA-APROVACAO.json"),
    JSON.stringify({ ...p.review, review_sha256: p.reviewHash }, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  for (const d of p.documents)
    await writeFile(
      resolve(outPath, d.kind === "terms" ? "TERMOS.md" : "PRIVACIDADE.md"),
      `# ${d.title}\n\nVersão ${d.version}\n\n${d.body}\n`,
      { flag: "wx", mode: 0o600 },
    );
  if (compiled) {
    await writeFile(resolve(outPath, "APLICAR.sql"), compiled.apply, {
      flag: "wx",
      mode: 0o600,
    });
    await writeFile(resolve(outPath, "ROLLBACK.sql"), compiled.rollback, {
      flag: "wx",
      mode: 0o600,
    });
  }
  console.log(
    JSON.stringify({
      status: compiled ? "PREPARED_NOT_EXECUTED" : "PREVIEW_NOT_PUBLISHED",
      review_sha256: p.reviewHash,
    }),
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((e) => {
    console.error(
      e.message.startsWith("legal_") || e.message.startsWith("usage:")
        ? e.message
        : "legal_prepare_failed",
    );
    process.exitCode = 1;
  });

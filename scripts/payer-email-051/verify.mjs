// Read-only preflight. Reads only named source/fixture files; never private folders,
// runtime .env files, network endpoints, Git mutations or SQL.
import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const [phase, directory, ...rest] = process.argv.slice(2);
if (!["before", "after"].includes(phase) || !directory || rest.length) {
  console.error("Usage: node verify.mjs before|after PATH_TO_PROJECT"); process.exit(2);
}
const sha = b => createHash("sha256").update(b).digest("hex");
const lfBytes = b => {
  const s = b.toString("utf8"), lf = s.replaceAll("\r\n", "\n");
  return Buffer.from(s).equals(b) && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\r]/.test(lf) ? Buffer.from(lf) : null;
};
const bytes = await readFile(new URL("../../docs/payer-email-051/integrity.json", import.meta.url));
const manifestLF = lfBytes(bytes);
if (!manifestLF || sha(manifestLF) !== "3fc4f257e75e85ab23e8f5bfc5281d3f7eae844c4dfe4e17297e674a1307081d")
  throw Error("Integrity manifest changed; do not replace its hashes to bypass a mismatch");
const manifest = JSON.parse(bytes.toString("utf8"));
const root = resolve(directory), differences = [];
let exact = 0, lineEndings = 0, absent = 0;
for (const [name, versions] of Object.entries(manifest.files)) {
  if (name.startsWith("/") || name.includes("..") || name.includes("\\")) throw Error("Invalid manifest path");
  let expected = versions[phase];
  const path = resolve(root, name);
  if (!expected) {
    try {
      await access(path);
      // The prior diagnostic pack was optional. If present, require its proven
      // original bytes; never overwrite a different local diagnostic silently.
      if (phase === "before" && versions.optional_before) expected = versions.optional_before;
      else differences.push({ path: name, reason: "expected_absent" });
    }
    catch (e) { if (e.code === "ENOENT") absent++; else differences.push({ path: name, reason: "unreadable" }); }
    if (!expected) continue;
  }
  try {
    const value = await readFile(path);
    if (sha(value) === expected.sha256) { exact++; continue; }
    // Only these explicitly inventoried UTF-8 text files have a proven LF digest.
    const lf = expected.sha256_lf && lfBytes(value);
    if (lf && sha(lf) === expected.sha256_lf) { lineEndings++; continue; }
    differences.push({ path: name, reason: "content_mismatch" });
  } catch { differences.push({ path: name, reason: "missing_or_unreadable" }); }
}
console.log(JSON.stringify({ phase, status: differences.length ? "FAIL" : "PASS", exact, lineEndings, absent,
  git_f316db5_proven: false, differences }, null, 2));
process.exitCode = differences.length ? 1 : 0;

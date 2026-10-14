// Read-only comparison. No network, credentials, environment files or Git writes.
// This diagnostic does not replace or authorize any existing integrity gate.
import { readFileSync, lstatSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const manifestHash = "fa68863bf8f8a2553987c84a76ed6ca4d8830315a27c11cec345406be33aba99";
export function compareBytes(bytes, expected) {
  const actual = hash(bytes);
  if (actual === expected.sha256) return { comparison: "byte_exact", sha256: actual };
  if (expected.lf_sha256) {
    try {
      // Preserve BOM, whitespace and final newline; reject invalid UTF-8/NUL/lone CR.
      const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      const lf = text.replaceAll("\r\n", "\n");
      if (!lf.includes("\r") && !lf.includes("\0") && hash(Buffer.from(lf)) === expected.lf_sha256)
        return { comparison: "lf_crlf_only", sha256: actual };
    } catch { /* mismatch, never emit file contents */ }
  }
  return { comparison: "different", sha256: actual };
}

export function verifyReference(root, mode) {
  const manifestBytes = readFileSync(new URL("../../docs/mp400-051/available-base-sha256.json", import.meta.url));
  if (compareBytes(manifestBytes, { sha256: manifestHash, lf_sha256: manifestHash }).comparison === "different")
    throw Error("diagnostic_reference_changed");
  const manifest = JSON.parse(manifestBytes);
  const report = { purpose: "compare_with_available_source_only", reference: "f316db5", mode,
    scope: "924 explicit delivered files; no private or untracked files",
    compatibility_proven: false, git_commit: null, results: [] };
  root = realpathSync(root);
  const git = args => execFileSync("git", ["-C", root, ...args], { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 });
  let entries;
  if (mode === "git") {
    try {
      const commit = git(["rev-parse", "--verify", "f316db5^{commit}"]).toString().trim();
      if (!/^f316db5[0-9a-f]{33}$/.test(commit)) throw Error();
      report.git_commit = commit;
      entries = new Map(git(["ls-tree", "-r", "-z", commit]).toString("utf8").split("\0").filter(Boolean).map(line => {
        const i = line.indexOf("\t"), [fileMode, type, oid] = line.slice(0, i).split(" ");
        return [line.slice(i + 1), { fileMode, type, oid }];
      }));
    } catch {
      return { ...report, status: "git_object_unavailable", exit_code: 2 };
    }
  } else if (mode !== "local") throw Error("invalid_mode");
  for (const expected of manifest.files) {
    const path = expected.path;
    if (isAbsolute(path) || path.split("/").some(p => p === ".." || p === "")) throw Error("invalid_reference_path");
    let bytes, comparison = "missing_or_nonregular";
    try {
      if (mode === "git") {
        const e = entries.get(path);
        if (e?.type !== "blob" || !["100644", "100755"].includes(e.fileMode)) throw Error();
        bytes = git(["cat-file", "blob", e.oid]);
      } else {
        const full = resolve(root, path), rel = relative(root, realpathSync(full));
        if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel) || !lstatSync(full).isFile()) throw Error();
        bytes = readFileSync(full);
      }
    } catch { /* only a fixed classification is emitted */ }
    report.results.push({ path, expected_sha256: expected.sha256, ...(bytes ? compareBytes(bytes, expected) : { comparison }) });
  }
  report.counts = Object.fromEntries(["byte_exact", "lf_crlf_only", "different", "missing_or_nonregular"].map(k => [k, report.results.filter(r => r.comparison === k).length]));
  report.additional_tracked_files = entries ? [...entries.keys()].filter(p => !manifest.files.some(f => f.path === p)).length : null;
  const matched = !report.counts.different && !report.counts.missing_or_nonregular;
  report.compatibility_proven = mode === "git" && matched && report.additional_tracked_files === 0;
  report.status = !matched ? "review_required" : mode === "local" ? "local_match_only" : report.compatibility_proven ? "reference_content_matches" : "additional_git_files_require_review";
  report.exit_code = mode === "local" ? matched ? 0 : 1 : report.compatibility_proven ? 0 : 1;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3 || !["--git", "--local"].includes(process.argv[2])) throw Error("usage: node scripts/mp400-051/verify-reference.mjs --git|--local");
    const report = verifyReference(process.cwd(), process.argv[2].slice(2));
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.exit_code;
  } catch {
    console.log(JSON.stringify({ status: "diagnostic_unavailable", compatibility_proven: false }));
    process.exitCode = 2;
  }
}

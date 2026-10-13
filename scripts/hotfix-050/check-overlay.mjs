// Read-only compatibility check. Run from the extracted hotfix before overlaying.
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
const target = process.argv[2];
if (!target) throw Error("Usage: node scripts/hotfix-050/check-overlay.mjs /path/to/foundation");
const manifest = JSON.parse(await readFile(new URL("../../docs/hotfix-050/overlay-manifest.json", import.meta.url), "utf8"));
let failed = 0;
for (const row of manifest.files) {
  const path = join(resolve(target), row.path);
  try {
    const actual = createHash("sha256").update(await readFile(path)).digest("hex");
    if (actual !== row.before && actual !== row.after) { console.error("DIVERGED", row.path); failed++; }
  } catch (e) {
    if (e.code !== "ENOENT" || row.before) { console.error("MISSING", row.path); failed++; }
  }
}
for (const [path, expected] of Object.entries(manifest.required)) {
  try {
    const actual = createHash("sha256").update(await readFile(join(resolve(target), path))).digest("hex");
    if (actual !== expected) { console.error("DIVERGED prerequisite", path); failed++; }
  } catch { console.error("MISSING prerequisite", path); failed++; }
}
console.log(failed ? "STOP: compare diverging files; do not force overlay." : "PASS: compatible overlay. No file or database was modified.");
process.exitCode = failed ? 1 : 0;

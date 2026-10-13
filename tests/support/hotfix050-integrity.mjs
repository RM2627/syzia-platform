// Exact authorized runtime/HTTP edits. Historical manifests stay immutable.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const edits = JSON.parse(readFileSync(new URL("../../docs/hotfix-050/authorized-hashes.json", import.meta.url), "utf8"));
export function hotfix050ExpectedHash(path, historical) {
  const edit = edits[path];
  if (!edit) return historical;
  assert.equal(historical, edit.before, "unexpected historical input: " + path);
  return edit.after;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
for (const args of [[], ["--read-only"]])
  test(
    "Billing external tools fail closed before connection " + args.join(" "),
    () => {
      const r = spawnSync(
        process.execPath,
        ["scripts/homologation/billing-http.mjs", ...args],
        { encoding: "utf8" },
      );
      assert.equal(r.status, 2);
      assert.match(r.stderr, /No connection opened/);
    },
  );

test("Billing independent concurrency requires explicit mutations and configuration", () => {
  const r = spawnSync(
    process.execPath,
    ["scripts/homologation/billing-concurrency.mjs"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 2);
  assert.match(r.stderr, /No connection opened/);
});

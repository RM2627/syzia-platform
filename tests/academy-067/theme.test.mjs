import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const script = readFileSync("academy/public/academy-theme.js", "utf8");
for (const [name, stored, dark, expected] of [
  ["system dark", null, true, "dark"],
  ["system light", null, false, "light"],
  ["manual light", "light", true, "light"],
  ["manual dark", "dark", false, "dark"],
  ["invalid value", "not-a-theme", true, "dark"],
  ["blocked storage", new Error("blocked"), true, "dark"],
])
  test("067-T pre-render " + name, () => {
    const document = { documentElement: { dataset: {} } },
      keys = [];
    runInNewContext(script, {
      document,
      localStorage: {
        getItem: (k) => {
          keys.push(k);
          if (stored instanceof Error) throw stored;
          return stored;
        },
      },
      window: { matchMedia: () => ({ matches: dark }) },
    });
    assert.equal(document.documentElement.dataset.academyTheme, expected);
    assert.deepEqual(keys, ["syzia.academy.theme"]);
  });
test("067-T pre-render script remains Academy-only and CSP-compatible", () => {
  const html = readFileSync("academy/index.html", "utf8");
  assert.ok(html.indexOf("/academy-theme.js") < html.indexOf("/src.tsx"));
  assert.doesNotMatch(
    readFileSync("index.html", "utf8"),
    /academy-theme|syzia.academy.theme/,
  );
  assert.doesNotMatch(script, /fetch|supabase|cookie|XMLHttpRequest/);
  assert.match(
    readFileSync("vite.academy.config.ts", "utf8"),
    /script-src 'self'/,
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { brandStyle, contrast } from "../src/consumer/brand.ts";
test("Derived colors keep accessible buttons, links and focus in both themes", () => {
  for (const color of [
    "#E10909",
    "#FFFFFF",
    "#000000",
    "#6C4DFF",
    "#F2C94C",
    "#00FF00",
    "#111111",
    "#C9B8FF",
  ])
    for (const theme of ["light", "dark"]) {
      const b = brandStyle(color, theme);
      for (const state of ["--brand", "--brand-hover", "--brand-active"])
        assert.ok(contrast(b[state], b["--brand-on"]) >= 4.5, color + state);
      for (const bg of ["--c-surface", "--brand-soft"])
        assert.ok(
          contrast(b["--brand-link"], b[bg]) >= 4.5,
          color + theme + bg,
        );
      assert.ok(contrast(b["--brand-focus"], b["--c-surface"]) >= 3);
    }
});

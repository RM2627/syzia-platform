import test from "node:test";
import assert from "node:assert/strict";
import { brandStyle, luminance, DEFAULT_BRAND } from "../src/consumer/brand.ts";
test("Cor livre: texto do botão mantém contraste mínimo de 4,5:1 e valor inválido usa o padrão", () => {
  for (let r = 0; r <= 255; r += 17) {
    for (let g = 0; g <= 255; g += 17) {
      for (let b = 0; b <= 255; b += 17) {
        const color =
          "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
        const style = brandStyle(color);
        const bg = luminance(color),
          fg = luminance(style["--brand-on"]);
        assert.ok(
          (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05) >= 4.5,
          color,
        );
      }
    }
  }
  assert.equal(brandStyle("red;display:none")["--brand"], DEFAULT_BRAND);
});

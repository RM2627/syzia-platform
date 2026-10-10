import type { CSSProperties } from "react";
export const DEFAULT_BRAND = "#6C4DFF";
export const suggestedColors = [
  DEFAULT_BRAND,
  "#E10909",
  "#193e35",
  "#183c62",
  "#563665",
  "#653d29",
  "#F2C94C",
  "#FFFFFF",
];
export const validColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
export function luminance(hex: string) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
export const contrast = (a: string, b: string) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) /
  (Math.min(luminance(a), luminance(b)) + 0.05);
function mix(a: string, b: string, t: number) {
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(a.slice(i, i + 2), 16) * (1 - t) +
            parseInt(b.slice(i, i + 2), 16) * t,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function readable(
  color: string,
  surface: string,
  ratio = 4.5,
  second = surface,
) {
  const target = luminance(surface) > 0.3 ? "#000000" : "#FFFFFF";
  for (let n = 0; n <= 100; n++) {
    const v = mix(color, target, n / 100);
    if (contrast(v, surface) >= ratio && contrast(v, second) >= ratio) return v;
  }
  return target;
}
export function brandStyle(value?: string, theme?: string): CSSProperties {
  const color = validColor(value || "") ? value! : DEFAULT_BRAND,
    dark = theme === "dark";
  const surface = dark ? "#1C1D22" : "#FFFFFF",
    bg = dark ? "#111217" : "#F7F7F9",
    text = dark ? "#F4F4F7" : "#202126";
  const soft = mix(surface, color, dark ? 0.16 : 0.08);
  const on = luminance(color) > 0.179 ? "#000000" : "#FFFFFF";
  // Moving towards the opposite color retains or improves contrast with button text.
  const target = on === "#FFFFFF" ? "#000000" : "#FFFFFF";
  return {
    "--brand": color,
    "--brand-on": on,
    "--brand-hover": mix(color, target, 0.12),
    "--brand-active": mix(color, target, 0.22),
    "--brand-soft": soft,
    "--brand-border": readable(color, surface, 3),
    "--brand-link": readable(color, surface, 4.5, soft),
    "--brand-focus": readable(color, surface, 3, soft),
    "--c-ink": text,
    "--c-muted": dark ? "#B9BAC6" : "#60616C",
    "--c-line": dark ? "#42444E" : "#D4D5DD",
    "--c-bg": bg,
    "--c-surface": surface,
    "--c-accent": mix(surface, color, dark ? 0.16 : 0.08),
    "--c-primary": readable(color, surface),
    colorScheme: dark ? "dark" : "light",
  } as CSSProperties;
}

// Reserved editorial positions only. No ad network, tracking, billing or affiliate
// destination is enabled. A future integration requires a separate reviewed change.
export const monetization = Object.freeze({
  enabled: false,
  positions: Object.freeze(["after-introduction", "after-article"]),
  formats: Object.freeze([
    "identified-sponsorship",
    "identified-affiliate",
    "digital-material",
    "display-ad",
  ]),
});
export function editorialDisclosure({
  sponsored = false,
  affiliate = false,
} = {}) {
  return sponsored
    ? "Conteúdo patrocinado"
    : affiliate
      ? "Este conteúdo contém links de afiliados"
      : "";
}

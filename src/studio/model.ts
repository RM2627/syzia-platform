import type { Company } from "../consumer/api";
// Same versioned configuration graph consumed by commercial_config_apply, not a new company model.
export function generateConfiguration(model: any) {
  const cfg = structuredClone(model),
    ids = new Map<string, string>();
  for (const rows of Object.values(cfg.tables) as any[][])
    for (const row of rows) if (row.id) ids.set(row.id, crypto.randomUUID());
  const remap = (v: any): any =>
    Array.isArray(v)
      ? v.map(remap)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, v]) => [k, remap(v)]))
        : typeof v === "string" && ids.has(v)
          ? ids.get(v)
          : v;
  return remap(cfg);
}
export function studioPreview(name: string, cfg: any): Company {
  const t = cfg.tables,
    s = t.company_settings?.[0] || {},
    b = t.company_branding?.[0] || {};
  const media = (id: string) =>
    t.company_media?.find((x: any) => x.id === id)?.public_code;
  return {
    name,
    slug: "previa-comercial",
    description: s.description || "",
    phone: s.public_phone || "",
    email: s.public_email || "",
    address: s.public_address || "",
    regions: s.service_regions || "",
    payments: s.payment_methods || "",
    hours: s.business_hours || [],
    timezone: "America/Recife",
    revision: "studio-private",
    notice_version: "consumer-v1",
    template: cfg.template,
    branding: {
      ...b,
      logo: media(b.logo_id),
      cover: media(b.cover_id),
      category_order: b.category_order || [],
      service_order: b.service_order || [],
    },
    services: (t.services || [])
      .filter((x: any) => x.active)
      .map((x: any) => ({
        ...x,
        code: x.id,
        image_media: media(x.image_media_id),
        image_url: "",
        addons: (t.service_addons || [])
          .filter((a: any) => a.service_id === x.id && a.active)
          .map((a: any) => ({ ...a, code: a.id })),
        questions: (t.service_intake_fields || [])
          .filter((q: any) => q.service_id === x.id && q.active)
          .map((q: any) => ({ ...q, code: q.id })),
      })),
    faqs: (t.faqs || []).filter((x: any) => x.active),
    portfolio: (t.portfolio_items || [])
      .filter((x: any) => x.active)
      .map((x: any) => ({
        ...x,
        code: x.id,
        service: x.service_id,
        images: x.media_ids.map(media).filter(Boolean),
      })),
    relations: (t.service_relations || []).map((x: any) => ({
      source: x.source_id,
      target: x.target_id,
      kind: x.kind,
    })),
    booking_policy: {
      active: false,
      cancel_minutes: 0,
      lead_minutes: 0,
      horizon_days: 0,
    },
    public_information: t.business_rules?.[0] || {},
  };
}
export function studioPending(cfg: any): string[] {
  const t = cfg.tables,
    s = t.company_settings?.[0] || {},
    out: string[] = [];
  if (!s.description?.trim()) out.push("Apresentação");
  if (!t.services?.some((x: any) => x.active))
    out.push("Ao menos um serviço ativo");
  if (!s.business_hours?.length) out.push("Horários não informados");
  if (!s.public_email && !s.public_phone) out.push("Contato não informado");
  if (!t.company_branding?.[0]?.logo_id) out.push("Logo temporária");
  if (!t.company_branding?.[0]?.cover_id) out.push("Capa temporária");
  if (!t.portfolio_items?.length)
    out.push("Portfólio opcional ainda sem trabalhos");
  return out;
}

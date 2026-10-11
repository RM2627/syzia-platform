import { expect } from "./demo-test";
import { demoLogin } from "./demo-login";

import type { Page } from "@playwright/test";
export async function rpc(page: Page, name: string, args: any = {}) {
  return page.evaluate(
    async ({ name, args }) => (await import("/src/api.ts")).rpc(name, args),
    { name, args },
  );
}
export async function crpc(page: Page, name: string, args: any = {}) {
  return page.evaluate(
    async ({ name, args }) => {
      const c = await import("/src/consumer/api.ts");
      await c.ensureConsumer();
      return c.crpc(name, args);
    },
    { name, args },
  );
}
export async function seed(page: Page, images = false, displayName?: string) {
  await demoLogin(page);
  const ctx: any = await rpc(page, "foundation_context"),
    org = ctx.organizations.find((x: any) => x.slug === "ms-auto-ficticia").id;
  const company: any = await rpc(page, "company_context", { p_org: org });
  const name =
    displayName ||
    "Consultoria de organização " + crypto.randomUUID().slice(0, 6);
  const service: any = await rpc(page, "company_service_save_with_checklist", {
    p_org: org,
    p_id: null,
    p_checklist_revision: 0,
    p_items: [
      { title: "Conferir orientações" },
      { title: "Preparar materiais" },
    ],
    p_key: crypto.randomUUID(),
    p_expected_revision: company.settings.revision,
    p_data: {
      name,
      description: "Serviço fictício para validar operação.",
      price_mode: "fixed",
      price_cents: 12000,
      duration_minutes: 60,
      contract_mode: "immediate",
      photo_policy: "optional",
      quotes_allowed: true,
    },
  });
  if (images) {
    const logo = await page.evaluate(async (org) => {
      const { uploadCompanyImage } =
        await import("/src/consumer/CompanyMedia.tsx");
      const canvas = document.createElement("canvas");
      canvas.width = 120;
      canvas.height = 60;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#C52831";
      ctx.fillRect(0, 0, 120, 60);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText("EMPRESA", 5, 38);
      const blob = await new Promise<Blob>((ok) =>
        canvas.toBlob((x) => ok(x!), "image/webp"),
      );
      return uploadCompanyImage(
        org,
        new File([blob], "logo-ficticio.webp", { type: "image/webp" }),
      );
    }, org);
    const presence: any = await rpc(page, "consumer_presence_context", {
      p_org: org,
    });
    await rpc(page, "consumer_branding_save", {
      p_org: org,
      p_revision: presence.revision,
      p_data: { ...presence.branding, logo, primary_color: "#C52831" },
    });
  }
  const d: any = await rpc(page, "consumer_page_draft", {
    p_org: org,
    p_show_prices: true,
  });
  await rpc(page, "consumer_publish_draft", {
    p_org: org,
    p_token: d.token,
    p_show_prices: true,
    p_expected_revision: d.page_revision,
  });
  const p: any = await crpc(page, "consumer_public_page", {
      p_slug: "ms-auto-ficticia",
    }),
    s = p.services.find((x: any) => x.name === name),
    items = [{ service: s.code, addons: [], answers: {}, notes: "" }];
  const q: any = await crpc(page, "consumer_create_multi_request", {
    p_slug: p.slug,
    p_revision: p.revision,
    p_items: items,
    p_customer: {
      name: "Marina Costa (demonstração)",
      whatsapp: "(87) 99999-1234",
      email: "cliente049@example.invalid",
      accepted_notice: true,
      notice_version: "consumer-v1",
    },
    p_notes: "Observação fictícia",
    p_contact: true,
    p_expected_cents: 12000,
    p_key: crypto.randomUUID(),
  });
  if (images)
    await page.evaluate(
      async ({ code, service }) => {
        const c = await import("/src/consumer/api.ts");
        const canvas = document.createElement("canvas");
        canvas.width = 80;
        canvas.height = 60;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#b34830";
        ctx.fillRect(0, 0, 80, 60);
        const blob = await new Promise<Blob>((ok) =>
          canvas.toBlob((x) => ok(x!), "image/png"),
        );
        await c.upload(
          code,
          new File([blob], "imagem-ficticia.png", { type: "image/png" }),
          crypto.randomUUID(),
          service,
        );
      },
      { code: q.code, service: s.code },
    );
  const day = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  const slots: any = await crpc(page, "consumer_journey_slots", {
    p_slug: p.slug,
    p_revision: p.revision,
    p_items: items,
    p_day: day,
  });
  expect(slots.slots.length).toBeGreaterThan(0);
  await crpc(page, "consumer_complete_journey", {
    p_code: q.code,
    p_start: slots.slots[0],
    p_attachment_count: images ? 1 : 0,
    p_key: crypto.randomUUID(),
  });
  const request: any = await crpc(page, "consumer_request_context", {
    p_code: q.code,
  });
  const agenda: any = await rpc(page, "operations_agenda", {
    p_org: org,
    p_from: day,
    p_to: new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10),
  });
  return {
    service,
    name,
    org,
    q,
    request,
    appointment:
      agenda.appointments.find((a: any) => a.request_code === q.code) ||
      agenda.appointments.find(
        (a: any) => a.public_code === request.appointments[0].code,
      ) ||
      agenda.appointments.find(
        (a: any) =>
          a.customer === "Marina Costa (demonstração)" &&
          a.starts_at === request.appointments[0].starts_at,
      ),
  };
}

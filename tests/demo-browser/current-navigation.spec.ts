import { openWorkspaceMenu } from "../support/workspace-navigation";
import { test, expect, Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
const out = path.resolve("reports/syzia-044/ui");
const results: any[] = [];
let seq = 0;
async function rpc(p: Page, name: string, args: any = {}) {
  return p.evaluate(
    async ({ name, args }) => (await import("/src/api.ts")).rpc(name, args),
    { name, args },
  );
}
async function login(p: Page, email: string) {
  await p.request.post("http://127.0.0.1:54321/__test/reset-access-limits");
  await p.goto("/entrar");
  await p.getByLabel("E-mail ou usuário", { exact: true }).fill(email);
  await p.getByLabel("Senha", { exact: true }).fill("FictitiousPassword123!");
  await p.getByRole("button", { name: "Entrar", exact: true }).click();
  await p.waitForURL(/\/(app|admin|painel|operacao-syzia|escolher-empresa)/);
}
async function record(
  p: Page,
  name: string,
  actor: string,
  fn: () => Promise<any>,
  capture = false,
) {
  const id = "UI-" + String(++seq).padStart(3, "0");
  let r: any = { id, name, actor };
  try {
    r.obtained = await fn();
    r.status = "PASS";
  } catch (e: any) {
    r.status = "FAIL";
    r.obtained = e.message;
    capture = true;
  }
  r.url = p.url();
  if (capture) {
    r.screenshot = "reports/syzia-044/ui/" + id + ".png";
    await p.screenshot({ path: path.join(out, id + ".png"), fullPage: true });
  }
  r.evidence = "reports/syzia-044/ui/" + id + ".json";
  await fs.writeFile(path.join(out, id + ".json"), JSON.stringify(r, null, 2));
  results.push(r);
  await fs.writeFile(
    path.join(out, "resultados.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(r.status, id, name);
  return r;
}
async function inspect(p: Page, url: string) {
  p.setDefaultTimeout(8000);
  await p.goto(url);
  await p.waitForLoadState("networkidle");
  await p.locator("main h1,main h2").first().waitFor();
  await p.waitForFunction(
    () =>
      !/Carregando…|Verificando permissões da empresa/.test(
        document.querySelector("main")?.textContent || "",
      ),
  );
  await p.waitForTimeout(300);
  return p.evaluate(() => {
    const visible = (el: Element) => !!(el as HTMLElement).offsetParent;
    const inputs = [
      ...document.querySelectorAll("input:not([type=hidden]),select,textarea"),
    ]
      .filter(visible)
      .map((el: any) => ({
        tag: el.tagName,
        type: el.type,
        label:
          el.labels?.length > 0 ||
          !!el.getAttribute("aria-label") ||
          !!el.getAttribute("aria-labelledby"),
        placeholder: el.placeholder,
      }));
    return {
      heading: [...document.querySelectorAll("h1,h2")].map(
        (e) => e.textContent,
      ),
      text: (
        document.querySelector("main") || document.body
      ).textContent?.slice(0, 18000),
      overflow: document.documentElement.scrollWidth - innerWidth,
      alerts: [...document.querySelectorAll("[role=alert]")].map(
        (e) => e.textContent,
      ),
      unlabelled: inputs.filter((x) => !x.label),
      links: [...document.querySelectorAll("main a")].map((x: any) => ({
        text: x.textContent,
        href: x.getAttribute("href"),
      })),
      theme: document.documentElement.getAttribute("data-theme"),
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  });
}
test("Regressão vigente: navegação, desktop/mobile, temas, roles e acessibilidade básica", async ({
  browser,
}) => {
  await fs.mkdir(out, { recursive: true });
  const admin = await browser.newContext({
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const p = await admin.newPage();
  await login(p, "admin@example.invalid");
  const ctx: any = await rpc(p, "foundation_context");
  const org = ctx.organizations.find(
    (o: any) => o.slug === "ms-auto-ficticia",
  ).id;
  const sections = [
    "",
    "agenda",
    "novo-agendamento",
    "atendimento",
    "orcamentos",
    "clientes",
    "pendencias",
    "comercial",
    "financeiro",
    "metricas",
    "operacao",
    "acessos",
    "pagina",
    "configuracao",
    "servicos",
    "manual",
    "faq",
    "respostas",
    "regras",
    "autonomia",
    "prontidao",
    "assinatura",
    "consumidor",
    "permissoes",
    "suporte",
    "legal",
  ];
  for (const width of [1440, 390]) {
    await p.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const section of sections) {
      await record(
        p,
        `Painel ${section || "Home"} ${width}px`,
        "ADM A",
        async () => {
          const r = await inspect(
            p,
            "/painel/" + org + (section ? "/" + section : ""),
          );
          expect(r.overflow).toBeLessThanOrEqual(1);
          expect(r.text).not.toMatch(/Página não encontrada|Algo deu errado/);
          return r;
        },
        ["", "acessos", "pagina", "financeiro"].includes(section),
      );
    }
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await record(
    p,
    "Teclado, foco e redução de movimento na Home",
    "ADM A",
    async () => {
      await inspect(p, "/painel/" + org);
      await p.keyboard.press("Tab");
      const active = await p.evaluate(() => ({
        tag: document.activeElement?.tagName,
        outline: getComputedStyle(document.activeElement!).outlineStyle,
        text: document.activeElement?.textContent,
        reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
      }));
      expect(active.tag).not.toBe("BODY");
      expect(active.reduced).toBeTruthy();
      return active;
    },
  );
  for (const theme of ["dark", "light"]) {
    const pr: any = await rpc(p, "consumer_presence_context", { p_org: org });
    await rpc(p, "consumer_branding_save", {
      p_org: org,
      p_revision: pr.revision,
      p_data: { ...pr.branding, theme },
    });
    const d: any = await rpc(p, "consumer_page_draft", {
      p_org: org,
      p_show_prices: true,
    });
    await rpc(p, "consumer_publish_draft", {
      p_org: org,
      p_token: d.token,
      p_show_prices: true,
      p_expected_revision: d.page_revision,
    });
    for (const width of [1440, 390]) {
      await p.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await record(
        p,
        `Página pública ${theme} ${width}px`,
        "consumidor",
        async () => {
          const r = await inspect(p, "/empresa/ms-auto-ficticia");
          expect(r.overflow).toBeLessThanOrEqual(1);
          expect(r.text).toContain("MS Auto");
          return r;
        },
        true,
      );
    }
  }
  await record(
    p,
    "Pedido: modal por teclado, fechamento e retorno de foco",
    "consumidor",
    async () => {
      await p
        .getByRole("button", { name: "Adicionar ao pedido" })
        .first()
        .click();
      const start = p.getByRole("button", {
        name: "Continuar pedido",
        exact: true,
      });
      await start.click();
      const dialog = p.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const before = await p.evaluate(() => ({
        inDialog: !!document.activeElement?.closest("[role=dialog]"),
        text: document.activeElement?.textContent,
      }));
      await p.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      return {
        before,
        after: await p.evaluate(() => ({
          tag: document.activeElement?.tagName,
          text: document.activeElement?.textContent,
        })),
      };
    },
    true,
  );
  const root = await browser.newContext({
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1000 },
  });
  const r = await root.newPage();
  await login(r, "root@example.invalid");
  for (const width of [1440, 390]) {
    await r.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const route of [
      "/app",
      "/admin/empresas",
      "/admin/pessoas",
      "/admin/equipe",
      "/admin/auditoria",
      "/admin/metricas",
      "/admin/assinaturas",
      "/admin/cobranca",
      "/admin/aquisicao",
    ])
      await record(
        r,
        `Administração ${route} ${width}px`,
        "Super Admin",
        async () => {
          const info = await inspect(r, route);
          expect(info.overflow).toBeLessThanOrEqual(1);
          return info;
        },
        ["/admin/empresas", "/admin/equipe"].includes(route),
      );
  }
  await record(
    p,
    "URL direta empresarial de outra organização",
    "ADM A",
    async () => {
      const all: any = await rpc(r, "access_organizations");
      const b = all.find((x: any) => x.slug === "horizonte-ficticio");
      const info = await inspect(p, "/painel/" + b.id + "/clientes");
      expect(info.text).toMatch(/não|permissão|acesso/i);
      expect(info.text).not.toMatch(/Lia Horizonte/);
      return info;
    },
    true,
  );
  for (const email of ["own@example.invalid", "shared@example.invalid"]) {
    const c = await browser.newContext({
      baseURL: "http://127.0.0.1:5173",
      viewport: { width: 390, height: 844 },
    });
    const q = await c.newPage();
    await record(
      q,
      "Login atual " + email,
      "colaborador/compartilhado",
      async () => {
        await login(q, email);
        const data = await rpc(q, "foundation_context");
        return { url: q.url(), context: data };
      },
      true,
    );
    await record(
      q,
      "URL de Financeiro sem grants gerenciais " + email,
      "colaborador/compartilhado",
      async () => {
        const info = await inspect(q, "/painel/" + org + "/financeiro");
        expect(info.text).toMatch(/não|permissão|acesso/i);
        return info;
      },
      true,
    );
    await c.close();
  }
  await record(
    r,
    "Logout encerra navegação protegida",
    "Super Admin",
    async () => {
      await r.goto("/app");
      await openWorkspaceMenu(r);
      await r.getByRole("button", { name: "Sair", exact: true }).click();
      await r.goto("/admin/empresas");
      await expect(
        r.getByLabel("E-mail ou usuário", { exact: true }),
      ).toBeVisible();
      return { url: r.url() };
    },
  );
  await admin.close();
  await root.close();
  expect(results.filter((r) => r.status !== "PASS")).toEqual([]);
});

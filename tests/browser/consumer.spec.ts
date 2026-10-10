import { test, expect } from "@playwright/test";
import { setupConsumer } from "../support/consumer-browser";
import { mkdir } from "node:fs/promises";
test.describe("Fase 4 · UI com SQL local e Auth simulado", () => {
  test("Publicação mobile, tablet e desktop sem conteúdo privado ou overflow", async ({
    page,
  }) => {
    const c = await setupConsumer(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await mkdir("reports/visual-phase4", { recursive: true });
      for (const [name, width, height] of [
        ["mobile", 390, 844],
        ["tablet", 820, 1180],
        ["desktop", 1440, 1000],
      ] as const) {
        await page.setViewportSize({ width, height });
        await page.goto("/empresa/ms-auto-ficticia");
        await expect(
          page.getByRole("heading", {
            name: "Encontre o serviço que precisa.",
          }),
        ).toBeVisible();
        await expect(page.getByText("REGRA PRIVADA")).toHaveCount(0);
        await expect(page.getByText("INTERNO SECRETO")).toHaveCount(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: `reports/visual-phase4/${name}.png`,
          fullPage: true,
        });
      }
      expect(errors).toEqual([]);
      expect(c.calls.includes("consumer_create_request")).toBe(false);
    } finally {
      await c.close();
    }
  });
  test("Filtro de categoria, FAQ e ajuda funcionam sem sessão", async ({
    page,
  }) => {
    const c = await setupConsumer(page);
    try {
      await page.goto("/empresa/ms-auto-ficticia");
      await page.getByRole("button", { name: "Interior", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Higienização interna" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Lavagem de cuidado" }),
      ).toHaveCount(0);
      await page.getByText("Preciso levar algum material?").click();
      await expect(
        page.getByText(
          "Não. Os materiais necessários já estão incluídos no serviço.",
        ),
      ).toBeVisible();
      await page.getByRole("button", { name: "Preciso de ajuda" }).click();
      await expect(
        page.getByText(/Para conversar com o atendimento humano/),
      ).toBeVisible();
    } finally {
      await c.close();
    }
  });
  async function request(page: any) {
    await page.goto("/empresa/ms-auto-ficticia");
    await page
      .getByRole("article")
      .filter({
        has: page.getByRole("heading", { name: "Lavagem de cuidado" }),
      })
      .getByRole("button", { name: "Solicitar orçamento" })
      .click();
    await page.getByRole("button", { name: "Continuar →" }).click();
    await page
      .getByLabel("Qual é o modelo do carro? *")
      .fill("Carro fictício azul");
    await page.getByRole("button", { name: "Continuar →" }).click();
    await page.getByLabel("Seu nome", { exact: true }).fill("Ana Fictícia");
    await page.getByLabel("WhatsApp com DDD").fill("81999990000");
    await page.getByLabel(/Li o aviso:/).check();
    await page.getByRole("button", { name: "Continuar →" }).click();
    await page
      .getByRole("button", { name: "Enviar solicitação", exact: true })
      .click();
    await page.waitForURL(/\/acompanhar\/r_/);
    await expect(
      page.getByRole("heading", { name: "Olá, Ana." }),
    ).toBeVisible();
  }
  test("Fluxo completo: identificação, revisão, envio e agenda", async ({
    page,
  }) => {
    const c = await setupConsumer(page);
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await request(page);
      await expect(
        page.getByText("Enviado para avaliação", { exact: false }).first(),
      ).toBeVisible();
      await page
        .getByLabel("Escolha um dia")
        .fill(new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
      await page.getByRole("button", { name: "Consultar horários" }).click();
      await page.getByRole("button", { name: "08:00", exact: true }).click();
      await page
        .getByRole("button", { name: "Confirmar horário — 08:00" })
        .click();
      await expect(page.getByText("✓ Confirmado")).toBeVisible();
      await page.getByRole("button", { name: "Gerar link seguro" }).click();
      await expect(page.getByLabel("Copie e guarde este link")).toHaveValue(
        /#secret=[a-f0-9]{64}$/,
      );
      await page.screenshot({
        path: "reports/visual-phase4/tracking-mobile.png",
        fullPage: true,
      });
      await page.getByRole("button", { name: "Cancelar este horário" }).click();
      await expect(
        page.getByText("Horário cancelado", { exact: true }),
      ).toBeVisible();
    } finally {
      await c.close();
    }
  });
  test("Proposta enviada pelo admin é revisada e aprovada pelo consumidor", async ({
    page,
  }) => {
    const c = await setupConsumer(page);
    try {
      await request(page);
      const code = new URL(page.url()).pathname.split("/").pop();
      await c.asAdmin(async ({ rpc }: any) => {
        const q = await rpc("consumer_request_context", { p_code: code });
        await rpc("consumer_send_quote", {
          p_code: code,
          p_items: [{ name: "Cuidado final", quantity: 1, unit_cents: 13500 }],
          p_duration: 60,
          p_expires: new Date(Date.now() + 86400000).toISOString(),
          p_expected_revision: q.revision,
          p_key: crypto.randomUUID(),
        });
      });
      await page.reload();
      await page.getByRole("button", { name: "Aprovar esta proposta" }).click();
      await expect(page.getByText("● Proposta aprovada")).toBeVisible();
    } finally {
      await c.close();
    }
  });
  test("Trocar URL não concede acesso a pedido; página suspensa indisponível", async ({
    page,
  }) => {
    const c = await setupConsumer(page);
    try {
      await page.goto("/acompanhar/r_000000000000000000000000");
      await expect(page.getByRole("alert")).toContainText(
        "Não foi possível acessar",
      );
      await c.asAdmin(async ({ db, orgs }: any) => {
        await db.exec("reset role");
        await db.query(
          "update organizations set status='suspended' where id=$1",
          [orgs.A],
        );
      });
      await page.goto("/empresa/ms-auto-ficticia");
      await expect(
        page.getByRole("heading", { name: "Esta página está indisponível" }),
      ).toBeVisible();
    } finally {
      await c.close();
    }
  });
  test("Falha de rede no envio mantém os dados preenchidos", async ({
    page,
  }) => {
    const c = await setupConsumer(page);
    try {
      await page.goto("/empresa/ms-auto-ficticia");
      await page
        .getByRole("article")
        .filter({
          has: page.getByRole("heading", { name: "Lavagem de cuidado" }),
        })
        .getByRole("button", { name: "Solicitar orçamento" })
        .click();
      await page.getByRole("button", { name: "Continuar →" }).click();
      await page
        .getByLabel("Qual é o modelo do carro? *")
        .fill("Carro preservado");
      await page.getByRole("button", { name: "Continuar →" }).click();
      await page
        .getByLabel("Seu nome", { exact: true })
        .fill("Pessoa Preservada");
      await page.getByLabel("WhatsApp com DDD").fill("81999990000");
      await page.getByLabel(/Li o aviso:/).check();
      await page.getByRole("button", { name: "Continuar →" }).click();
      await page.route("**/rest/v1/rpc/consumer_create_request", (r) =>
        r.abort(),
      );
      await page
        .getByRole("button", { name: "Enviar solicitação", exact: true })
        .click();
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(
        page.getByText("Pessoa Preservada", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Carro preservado", { exact: true }),
      ).toBeVisible();
    } finally {
      await c.close();
    }
  });
});
test("Fase 4 ampliada: portfólio publicado e recusa de proposta", async ({
  page,
}) => {
  const c = await setupConsumer(page);
  try {
    await page.goto("/empresa/ms-auto-ficticia");
    await expect(
      page.getByRole("heading", { name: "Conheça nosso trabalho." }),
    ).toBeVisible();
    await expect(
      page.getByAltText("Renovação do cuidado • exemplo fictício — antes"),
    ).toBeVisible();
    expect(
      await page
        .getByAltText("Renovação do cuidado • exemplo fictício — antes")
        .evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
    ).toBe(true);
    await page
      .getByRole("article")
      .filter({
        has: page.getByRole("heading", { name: "Lavagem de cuidado" }),
      })
      .getByRole("button", { name: "Solicitar orçamento" })
      .click();
    await page.getByRole("button", { name: "Continuar →" }).click();
    await page.getByLabel("Qual é o modelo do carro? *").fill("Carro fictício");
    await page.getByRole("button", { name: "Continuar →" }).click();
    await page
      .getByLabel("Seu nome", { exact: true })
      .fill("Cliente Recorrente");
    await page.getByLabel("WhatsApp com DDD").fill("81999990000");
    await page
      .getByLabel("Como conheceu a empresa? (opcional)")
      .selectOption("instagram");
    await page.getByLabel(/Li o aviso:/).check();
    await page.getByRole("button", { name: "Continuar →" }).click();
    await page
      .getByRole("button", { name: "Enviar solicitação", exact: true })
      .click();
    await page.waitForURL(/\/acompanhar\/r_/);
    const code = new URL(page.url()).pathname.split("/").pop();
    await c.asAdmin(async ({ rpc }: any) => {
      const q = await rpc("consumer_request_context", { p_code: code });
      await rpc("consumer_send_quote", {
        p_code: code,
        p_items: [
          { name: "Proposta fictícia", quantity: 1, unit_cents: 13000 },
        ],
        p_duration: 60,
        p_expires: new Date(Date.now() + 86400000).toISOString(),
        p_expected_revision: q.revision,
        p_key: crypto.randomUUID(),
      });
    });
    await page.reload();
    await page.getByRole("button", { name: "Recusar esta proposta" }).click();
    await expect(page.getByText("● Proposta recusada")).toBeVisible();
    await page.goto("/empresa/ms-auto-ficticia");
    await page
      .getByRole("article")
      .filter({
        has: page.getByRole("heading", { name: "Lavagem de cuidado" }),
      })
      .getByRole("button", { name: "Solicitar orçamento" })
      .click();
    await page.getByRole("button", { name: "Continuar →" }).click();
    await page.getByLabel("Qual é o modelo do carro? *").fill("Outro carro");
    await page.getByRole("button", { name: "Continuar →" }).click();
    await expect(page.getByLabel("Seu nome", { exact: true })).toHaveValue(
      "Cliente Recorrente",
    );
    await expect(page.getByLabel(/Li o aviso:/)).not.toBeChecked();
  } finally {
    await c.close();
  }
});
test("Fase 4 ampliada: admin configura rascunho visual e preparação financeira", async ({
  page,
}) => {
  const c = await setupConsumer(page);
  try {
    await page.goto("/entrar");
      await page.getByRole("button",{name:"Acesso da operação VIRELOQ"}).click();
    await page
      .getByLabel("E-mail", { exact: true })
      .fill("admin@example.invalid");
    await page
      .getByLabel("Senha", { exact: true })
      .fill("FictitiousPassword123!");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL("http://127.0.0.1:4173/");
    await page.goto("/painel/" + c.orgs.A + "/consumidor");
    await page
      .getByText("Identidade visual e portfólio", { exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Cor principal", exact: true })
      .selectOption("#183c62");
    await page
      .getByRole("button", { name: "Salvar identidade visual" })
      .click();
    await expect(page.getByText(/Rascunho salvo/)).toBeVisible();
    await page
      .getByText("Preparação de pagamentos opcionais", { exact: true })
      .click();
    await page
      .getByLabel("Regra futura de antecipação")
      .selectOption("required_deposit");
    await page.getByLabel("Percentual do sinal (%)").fill("30");
    await page
      .getByRole("button", { name: "Salvar preparação financeira" })
      .click();
    await expect(
      page.getByText("Preparação salva. Nenhum meio de pagamento foi ativado."),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Publicar dados aprovados" })
      .click();
    await page.goto("/empresa/ms-auto-ficticia");
    await expect(page.locator(".consumer")).toHaveClass(/c-theme-blue/);
    await expect(page.getByText("Sinal obrigatório")).toHaveCount(0);
  } finally {
    await c.close();
  }
});

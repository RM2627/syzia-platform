import { verifyRegistration } from "../support/verify-registration";
import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
import type { Page } from "@playwright/test";
test.setTimeout(300000);
async function saved(page: Page, button: string) {
  await page.getByRole("button", { name: button, exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({
        hasText:
          /Alteração salva|Operação concluída|Versão publicada|Configuração comercial salva/,
      })
      .first(),
  ).toBeVisible();
}
async function activate(
  page: Page,
  data: { company_code: string; username: string; temporary_code: string },
  legal: boolean,
) {
  await page.goto("/entrar");
  await page
    .getByLabel("Código da empresa", { exact: true })
    .fill(data.company_code);
  await page.getByLabel("Usuário", { exact: true }).fill(data.username);
  await page
    .getByLabel("Senha ou código de primeiro acesso", { exact: true })
    .fill(data.temporary_code);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page
    .getByLabel("Nova senha", { exact: true })
    .fill("FictitiousPassword123!");
  await page
    .getByLabel("Confirmar nova senha", { exact: true })
    .fill("FictitiousPassword123!");
  await page
    .getByRole("button", { name: "Confirmar e ativar", exact: true })
    .click();
  if (legal) {
    await page.getByLabel("Li e aceito os Termos de Uso").check();
    await page
      .getByLabel("Li e estou ciente da Política de Privacidade")
      .check();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await verifyRegistration(page);
  }
  await expect(
    page.getByRole("heading", { name: "Minhas empresas", exact: true }),
  ).toBeVisible();
}
test("Dia completo 01–34: nova empresa, onboarding, identidades, consumidor, operação, suporte e isolamento", async ({
  page,
  browser,
}) => {
  page.setDefaultTimeout(12000);
  await page.setViewportSize({ width: 1366, height: 900 });
  const steps: number[] = [];
  const step = async (n: number, fn: () => Promise<void>) => {
    console.log("DAY", n);
    await test.step(String(n).padStart(2, "0"), fn);
    steps.push(n);
  };
  const adminContext = await browser.newContext({
      viewport: { width: 820, height: 1180 },
    }),
    employeeContext = await browser.newContext(),
    consumerContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
  const adm = await adminContext.newPage(),
    employee = await employeeContext.newPage(),
    consumer = await consumerContext.newPage();
  for (const actor of [adm, employee, consumer]) actor.setDefaultTimeout(12000);
  const name = "Jornada Mestre " + Date.now(),
    slug = "jornada-mestre-" + Date.now();
  let base = "",
    credentials: any,
    worker: any,
    foreign = "";
  try {
    await step(1, async () => {
      await demoLogin(page, "root@example.invalid");
      await expect(
        page.getByRole("heading", { name: "Como a VIRELOQ está indo?" }),
      ).toBeVisible();
      foreign = (await page
        .getByRole("link", { name: /Estúdio Horizonte/ })
        .first()
        .getAttribute("href"))!;
    });
    await step(2, async () => {
      await page.goto("/admin/empresas");
      await page.getByLabel("Nome da empresa", { exact: true }).fill(name);
      await page.getByLabel("Identificador no endereço").fill(slug);
      await page.getByLabel("Preparar primeiro administrador agora").uncheck();
      const response = page.waitForResponse((r) =>
        r.url().endsWith("/access/create-organization"),
      );
      await page
        .getByRole("button", { name: "Criar empresa", exact: true })
        .click();
      const data = await (await response).json();
      base = "/painel/" + data.organization_id;
      expect(data.company_code).toMatch(/^[A-Z0-9]{1,8}-[A-F0-9]{5}$/);
      const commercial = await page.context().newPage();
      await commercial.goto("/admin/assinaturas");
      await commercial
        .getByLabel("Empresa da assinatura")
        .selectOption(data.organization_id);
      await commercial
        .getByText("Conceder condição interna/isenta", { exact: true })
        .click();
      await commercial.getByLabel("Incluir atendimento compartilhado").check();
      await commercial
        .getByLabel("Justificativa", { exact: true })
        .fill(
          "Organização interna totalmente fictícia da jornada de homologação local",
        );
      await commercial
        .getByRole("button", { name: "Conceder condição", exact: true })
        .click();
      await expect(
        commercial.getByText(
          "Empresa interna/isenta — fora do ciclo de trial e assinatura.",
        ),
      ).toBeVisible();
      await commercial.close();
    });
    await step(3, async () => {
      await expect(page.getByLabel("Empresa preparada")).toContainText(
        "Código",
      );
      await expect(
        page
          .locator("article.organization-record")
          .filter({ has: page.getByRole("heading", { name, exact: true }) }),
      ).toContainText(slug);
    });
    await step(4, async () => {
      await page
        .getByLabel("Empresa preparada")
        .getByRole("link", { name: "Abrir empresa", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Vamos preparar sua empresa" }),
      ).toBeVisible();
    });
    await step(5, async () => {
      await page.goto(base + "/configuracao");
      await page
        .getByRole("button", { name: "Iniciar configuração", exact: true })
        .click();
      await page
        .getByText("Como sua empresa quer atender?", { exact: true })
        .click();
      await page
        .getByLabel("Modalidade de atendimento", { exact: true })
        .selectOption("own");
      await expect(
        page.getByText("Alteração salva.", { exact: true }),
      ).toBeVisible();
      for (const [label, value] of Object.entries({
        "Descrição do negócio":
          "Serviços de cuidado e manutenção fictícios para a jornada integrada.",
        "Regiões atendidas": "Recife e região",
        "Formas de pagamento": "Pix e cartão",
        "Responsável por exceções": "Ana Teste",
        "Contato interno do responsável": "ana@example.invalid",
      }))
        await page.getByLabel(label, { exact: true }).fill(value);
      for (const group of [
        "Horários da empresa",
        "Horários do atendimento humano",
      ])
        for (const day of [
          "Domingo",
          "Segunda",
          "Terça",
          "Quarta",
          "Quinta",
          "Sexta",
          "Sábado",
        ])
          await page
            .getByRole("group", { name: group, exact: true })
            .getByLabel(day, { exact: true })
            .check();
      await saved(page, "Salvar configuração");
      await page.goto(base + "/servicos");
      await page.getByLabel("Nome do serviço").fill("Serviço da jornada");
      await page
        .getByLabel("Descrição do serviço")
        .fill("Serviço fictício para testar a jornada completa.");
      await page
        .getByLabel("Modalidade de preço", { exact: true })
        .selectOption("fixed");
      await page.getByLabel("Valor em reais", { exact: true }).fill("120");
      await page.getByLabel("Duração em minutos").fill("60");
      await page.getByLabel("Permitir solicitação de orçamento").check();
      await saved(page, "Adicionar");
      await page.goto(base + "/faq");
      await page.getByLabel("Pergunta da FAQ").fill("Como funciona o serviço?");
      await page
        .getByLabel("Resposta pública", { exact: true })
        .fill("A equipe avalia a solicitação e confirma os detalhes.");
      await saved(page, "Adicionar");
      await page.goto(base + "/respostas");
      await page.getByLabel("Título da resposta").fill("Boas-vindas");
      await page
        .getByLabel("Texto aprovado para resposta")
        .fill("Olá, vamos ajudar com sua solicitação.");
      await saved(page, "Adicionar");
      await page.goto(base + "/regras");
      await expect(page.locator("textarea").first()).toBeVisible();
      for (const field of await page.locator("textarea").all())
        await field.fill(
          "Regra operacional fictícia: confirmar condições com o cliente.",
        );
      await saved(page, "Salvar regras");
      await page.goto(base + "/autonomia");
      for (const label of [
        "Informar preço tabelado",
        "Criar orçamento tabelado",
        "Enviar orçamento",
        "Agendar",
        "Remarcar",
        "Cancelar",
        "Fazer acompanhamento",
      ])
        await page.getByLabel(label, { exact: true }).check();
      await page.getByLabel("Revisei e aprovo estas permissões").check();
      await saved(page, "Salvar autonomia");
      await page.goto(base + "/manual");
      await page.getByLabel("Título da nova versão").fill("Manual da jornada");
      await page
        .getByRole("button", { name: "Criar rascunho", exact: true })
        .click();
      await expect(page.locator("details.manual-topic")).toHaveCount(11);
      for (let i = 0; i < 11; i++) {
        const topic = page.locator("details.manual-topic").nth(i);
        await topic.locator("summary").click();
        await topic
          .locator("textarea")
          .fill(
            "Orientação fictícia para atendimento correto e respeito às condições publicadas.",
          );
        await topic
          .getByRole("button", { name: "Salvar alterações", exact: true })
          .click();
        await expect(
          page.getByText("Alteração salva.", { exact: true }),
        ).toBeVisible();
      }
      await page
        .getByLabel("Revisei o manual e o conteúdo da FAQ pública desta versão")
        .check();
      await saved(page, "Publicar versão do manual");
    });
    await step(6, async () => {
      await page
        .getByRole("link", {
          name: "Voltar à Administração VIRELOQ",
          exact: true,
        })
        .click();
      await page.goto(base + "/configuracao");
      await expect(
        page.getByLabel("Descrição do negócio", { exact: true }),
      ).toHaveValue(/Serviços de cuidado/);
    });
    await step(7, async () => {
      await page.goto(base + "/acessos");
      const form = page.locator("form").filter({
        has: page.getByRole("button", { name: "Criar usuário", exact: true }),
      });
      await form.getByLabel("Nome", { exact: true }).fill("Ana");
      await form.getByLabel("Sobrenome", { exact: true }).fill("Mestre");
      await form
        .getByLabel("E-mail do administrador")
        .fill("ana.mestre@example.invalid");
      const response = page.waitForResponse((r) =>
        r.url().endsWith("/access/provision"),
      );
      await form
        .getByRole("button", { name: "Criar usuário", exact: true })
        .click();
      credentials = await (await response).json();
    });
    await step(8, async () => {
      expect(credentials.temporary_code).toBeTruthy();
      await expect(page.getByLabel("Instruções de acesso")).toContainText(
        credentials.company_code,
      );
    });
    await step(9, async () => {
      await activate(adm, credentials, true);
    });
    await step(10, async () => {
      await expect(
        adm.getByRole("heading", { name: "Minhas empresas", exact: true }),
      ).toBeVisible();
    });
    await step(11, async () => {
      await adm.goto(base + "/legal");
      await expect(
        adm.getByText(/Responsável: Ana Mestre/).first(),
      ).toBeVisible();
    });
    await step(12, async () => {
      await adm.goto(base + "/acessos");
      const form = adm.locator("form").filter({
        has: adm.getByRole("button", { name: "Criar usuário", exact: true }),
      });
      await form.getByLabel("Nome", { exact: true }).fill("Rui");
      await form.getByLabel("Sobrenome", { exact: true }).fill("Equipe");
      await form
        .getByLabel("Papel", { exact: true })
        .selectOption("own_attendant");
      const response = adm.waitForResponse((r) =>
        r.url().endsWith("/access/provision"),
      );
      await form
        .getByRole("button", { name: "Criar usuário", exact: true })
        .click();
      worker = await (await response).json();
    });
    await step(13, async () => {
      await activate(employee, worker, false);
      await employee.goto("/admin/auditoria");
      await expect(
        employee.getByRole("heading", {
          name: /Acesso restrito|Acesso não permitido/,
        }),
      ).toBeVisible();
    });
    await step(14, async () => {
      await adm.goto(base + "/consumidor");
      await saved(adm, "Publicar dados aprovados");
      await adm.getByLabel("Receber agendamentos").check();
      await saved(adm, "Salvar regras da agenda");
      await adm.goto(base + "/prontidao");
      await adm
        .getByRole("button", { name: "Habilitar atendimento humano" })
        .click();
      await expect(
        adm.getByRole("button", { name: "Desabilitar atendimento humano" }),
      ).toBeVisible();
      await adm.goto(base);
      await expect(
        adm.getByRole("heading", { name: "Vamos preparar sua empresa" }),
      ).toHaveCount(0);
    });
    await adm.goto(base + "/comercial");
    await adm.getByRole("button", { name: "Configurar recuperação" }).click();
    await adm.getByLabel("Habilitar recuperação").check();
    await adm.getByLabel("Intervalo da empresa (minutos)").fill("120");
    await adm.getByLabel("Máximo de tentativas", { exact: true }).fill("2");
    await saved(adm, "Salvar configuração comercial");
    await step(15, async () => {
      const publicResponse = consumer.waitForResponse((r) =>
        r.url().endsWith("/rpc/consumer_public_page"),
      );
      await consumer.goto("/empresa/" + slug);
      const publicData = await (await publicResponse).json();
      console.log(
        "PUBLIC_STATE",
        JSON.stringify({
          error: publicData?.message,
          name: publicData?.name,
          keys: publicData && Object.keys(publicData),
        }),
      );
      await expect(
        consumer.getByRole("heading", { name: new RegExp(name) }),
      ).toBeVisible();
    });
    await step(16, async () => {
      await consumer
        .getByRole("article")
        .filter({
          has: consumer.getByRole("heading", {
            name: "Serviço da jornada",
            exact: true,
          }),
        })
        .getByRole("button", { name: "Solicitar orçamento" })
        .click();
      await consumer.getByRole("button", { name: "Continuar →" }).click();
      await consumer.getByRole("button", { name: "Continuar →" }).click();
      await consumer
        .getByLabel("Seu nome", { exact: true })
        .fill("Joana Dia Completo");
      await consumer.getByLabel("WhatsApp com DDD").fill("81999990077");
      await consumer.getByLabel(/Li o aviso:/).check();
      await consumer.getByLabel(/Autorizo contato por WhatsApp/).check();
      await consumer.getByRole("button", { name: "Continuar →" }).click();
      await consumer
        .getByRole("button", { name: "Enviar solicitação", exact: true })
        .click();
      await consumer.waitForURL(/\/acompanhar\/r_/);
      await adm.goto(base + "/comercial");
      await expect(
        adm
          .locator(".co-opportunity")
          .filter({ hasText: "Joana Dia Completo" }),
      ).toContainText("1/2");
      await consumer
        .getByLabel("Sua mensagem", { exact: true })
        .fill("Solicito atendimento para confirmar meu orçamento.");
      await consumer
        .getByRole("button", { name: "Enviar ao atendimento" })
        .click();
    });
    await step(17, async () => {
      await adm.goto(base + "/comercial");
      await expect(
        adm
          .locator(".co-opportunity")
          .filter({ hasText: "Joana Dia Completo" }),
      ).toContainText("Sem retorno programado");
      await employee.goto("/central");
      await employee
        .getByLabel("Minha presença", { exact: true })
        .selectOption("available");
      await employee
        .getByRole("button", { name: "Fila geral", exact: true })
        .click();
      await employee
        .getByLabel("Buscar cliente, empresa ou ticket")
        .fill("Joana Dia Completo");
      await expect(employee.locator(".h-ticket")).toHaveCount(1);
    });
    await step(18, async () => {
      await employee.locator(".h-ticket").click();
      await employee
        .getByRole("button", { name: "Assumir atendimento", exact: true })
        .click();
      await employee
        .getByLabel("Resposta pública ao cliente")
        .fill("Confirmamos as condições da proposta fictícia.");
      await employee
        .getByRole("button", { name: "Enviar mensagem", exact: true })
        .click();
    });
    await step(19, async () => {
      await employee
        .getByRole("button", { name: "Orçamento", exact: true })
        .click();
      await employee
        .getByLabel("Motivo da condição")
        .fill("Preço do catálogo aprovado sem alteração");
      await employee
        .getByRole("button", { name: "Enviar proposta autorizada" })
        .click();
      await consumer.reload();
      await consumer
        .getByRole("button", { name: "Aprovar esta proposta" })
        .click();
      await expect(consumer.getByText("● Proposta aprovada")).toBeVisible();
    });
    await step(20, async () => {
      await consumer
        .getByLabel("Escolha um dia")
        .fill(new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10));
      await consumer
        .getByRole("button", { name: "Consultar horários" })
        .click();
      await consumer
        .getByRole("button", { name: "08:00", exact: true })
        .click();
      await consumer
        .getByRole("button", { name: "Confirmar horário — 08:00" })
        .click();
      await expect(consumer.getByText("✓ Confirmado")).toBeVisible();
    });
    await step(21, async () => {
      await adm.goto(base + "/agenda");
      await adm
        .getByLabel("Data da agenda")
        .fill(new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10));
      await expect(
        adm.getByRole("link").filter({ hasText: "Joana Dia Completo" }).first(),
      ).toBeVisible();
      await adm.goto(base);
      await expect(
        adm.getByRole("heading", { name: "O que precisa ser feito hoje?" }),
      ).toBeVisible();
    });
    await step(22, async () => {
      await adm.goto(base + "/comercial");
      await expect(
        adm
          .locator(".co-opportunity")
          .filter({ hasText: "Joana Dia Completo" }),
      ).toContainText("Convertido");
      await adm.goto(base + "/pendencias");
      await expect(adm.getByRole("alert")).toHaveCount(0);
    });
    await step(23, async () => {
      await adm.goto(base + "/agenda");
      await adm
        .getByLabel("Data da agenda")
        .fill(new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10));
      await adm
        .getByRole("link")
        .filter({ hasText: "Joana Dia Completo" })
        .first()
        .click();
      await adm.getByRole("button", { name: "Cancelar", exact: true }).click();
      await adm
        .getByRole("dialog")
        .getByRole("button", { name: "Confirmar", exact: true })
        .click();
      await expect(
        adm.getByText("Cancelado", { exact: true }).first(),
      ).toBeVisible();
      await consumer.reload();
      await expect(
        consumer.getByText(/Cancelado|cancelado/).first(),
      ).toBeVisible();
    });
    await step(24, async () => {
      await adm.goto(base + "/metricas");
      await expect(
        adm.getByRole("heading", { name: "Financeiro empresarial" }),
      ).toBeVisible();
      await expect(
        adm
          .locator("article")
          .filter({ has: adm.getByText("Aprovado", { exact: true }) }),
      ).toContainText("R$ 120,00");
      await expect(
        adm
          .locator("article")
          .filter({ has: adm.getByText("Recebido", { exact: true }) }),
      ).toContainText("R$ 0,00");
      await expect(adm.getByRole("alert")).toHaveCount(0);
    });
    await step(25, async () => {
      await page.goto("/admin/metricas");
      await expect(
        page.getByText("Empresas cadastradas", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Joana Dia Completo", { exact: true }),
      ).toHaveCount(0);
    });
    await step(26, async () => {
      await page.goto(base);
      await expect(
        page.getByRole("heading", { name: "Suporte VIRELOQ", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "O que precisa ser feito hoje?" }),
      ).toHaveCount(0);
    });
    await step(27, async () => {
      await page
        .getByLabel("Motivo do acesso")
        .fill("Investigar configuração a pedido do ADM da empresa");
      await page
        .getByRole("button", { name: "Solicitar autorização ao ADM" })
        .click();
      await expect(page.getByText(/Solicitação enviada/)).toBeVisible();
    });
    await step(28, async () => {
      await adm.goto(base);
      await expect(
        adm.getByRole("link", { name: "Revisar autorizações" }),
      ).toBeVisible();
      await adm.getByRole("link", { name: "Revisar autorizações" }).click();
      await adm.getByRole("button", { name: "Autorizar por 1h" }).click();
    });
    await step(29, async () => {
      await expect(
        page.getByText("Suporte autorizado pelo ADM", { exact: true }),
      ).toBeVisible({ timeout: 15000 });
      await expect(
        page.getByRole("heading", { name: "O que precisa ser feito hoje?" }),
      ).toBeVisible();
      await page.screenshot({
        path: "reports/master-day/support-desktop.png",
        fullPage: true,
      });
    });
    await step(30, async () => {
      await adm.getByRole("button", { name: "Revogar acesso" }).click();
    });
    await step(31, async () => {
      await expect(
        page.getByRole("heading", { name: "Suporte VIRELOQ", exact: true }),
      ).toBeVisible({ timeout: 15000 });
      await expect(
        page.getByRole("heading", { name: "O que precisa ser feito hoje?" }),
      ).toHaveCount(0);
    });
    await step(32, async () => {
      await page
        .getByLabel("Motivo do acesso")
        .fill("Intervenção excepcional fictícia para validar segurança");
      await page
        .locator("summary")
        .filter({ hasText: "Acesso administrativo de emergência" })
        .click();
      await page.getByLabel("Confirmo a necessidade excepcional").check();
      await page
        .getByRole("button", { name: "Iniciar emergência de 15 minutos" })
        .click();
      await expect(
        page
          .getByText("Acesso administrativo de emergência", { exact: true })
          .first(),
      ).toBeVisible();
      await adm.reload();
      await expect(
        adm.getByRole("heading", { name: /Emergência/ }),
      ).toBeVisible();
      await adm.getByRole("button", { name: "Revogar acesso" }).click();
    });
    await step(33, async () => {
      await page.goto("/admin/empresas");
      const record = page
        .locator("article.organization-record")
        .filter({ has: page.getByRole("heading", { name, exact: true }) });
      await record
        .getByRole("button", { name: "Desativar", exact: true })
        .click();
      await expect(
        record.getByText("Desativada", { exact: true }),
      ).toBeVisible();
      await record
        .getByRole("button", { name: "Reativar", exact: true })
        .click();
      await expect(
        record.getByRole("button", { name: "Desativar", exact: true }),
      ).toBeVisible();
      await expect(record).toContainText(credentials.company_code);
    });
    await step(34, async () => {
      await activateExisting(adm, credentials);
      await adm.goto(foreign);
      await expect(
        adm.getByRole("heading", { name: "Empresa indisponível", exact: true }),
      ).toBeVisible();
      await employee.goto(consumer.url());
      await expect(employee.getByRole("alert")).toBeVisible();
      expect(
        await consumer.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
    expect(steps).toEqual(Array.from({ length: 34 }, (_, i) => i + 1));
    await test.info().attach("day-steps.json", {
      body: JSON.stringify({
        engine: "Browser + controlled HTTP/PGlite/Auth adapter",
        steps,
      }),
      contentType: "application/json",
    });
  } finally {
    await adminContext.close();
    await employeeContext.close();
    await consumerContext.close();
  }
});
async function activateExisting(
  page: Page,
  data: { company_code: string; username: string },
) {
  await page.goto("/entrar");
  await page
    .getByLabel("Código da empresa", { exact: true })
    .fill(data.company_code);
  await page.getByLabel("Usuário", { exact: true }).fill(data.username);
  await page
    .getByLabel("Senha ou código de primeiro acesso", { exact: true })
    .fill("FictitiousPassword123!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Minhas empresas", exact: true }),
  ).toBeVisible();
}

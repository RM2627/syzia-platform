import { test, expect } from "@playwright/test";
import { setupConsumer } from "../support/consumer-browser";
import { randomUUID } from "node:crypto";
import { users } from "../support/consumer-db.mjs";
async function login(page: any, email = "agenta@example.invalid") {
  await page.goto("/entrar");
      await page.getByRole("button",{name:"Acesso da operação VIRELOQ"}).click();
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page
    .getByLabel("Senha", { exact: true })
    .fill("FictitiousPassword123!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("http://127.0.0.1:4173/");
}
test("Central: fila, assumir, responder e nota interna sem mistura de público", async ({
  page,
}) => {
  const c = await setupConsumer(page, { central: true });
  try {
    await login(page);
    await page.goto("/central");
    await page.getByRole("button", { name: "Fila geral", exact: true }).click();
    await expect(page.locator(".h-ticket")).toHaveCount(1);
    await page.locator(".h-ticket").click();
    await page
      .getByRole("button", { name: "Assumir atendimento", exact: true })
      .click();
    await page
      .getByLabel("Resposta pública ao cliente")
      .fill("Olá, Ana. Vou conferir os detalhes do seu pedido.");
    await page
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click();
    await expect(page.locator(".h-messages")).toContainText("Vou conferir");
    await page
      .getByRole("button", { name: "Nota interna", exact: true })
      .click();
    await page
      .getByLabel("Nota interna · nunca enviada ao cliente")
      .fill("INTERNO: cliente prefere retorno à tarde");
    await page.getByRole("button", { name: "Salvar nota interna" }).click();
    await page.locator(".h-notes summary").click();
    await expect(page.locator(".h-notes")).toContainText("INTERNO");
    await c.asAdmin(async (x: any) => {
      await x.as("alice");
      const thread = await x.rpc("central_consumer_thread", {
        p_request: c.central!.requests.A,
      });
      expect(JSON.stringify(thread)).not.toContain("INTERNO");
      expect(thread.messages.at(-1).body).toContain("Vou conferir");
    });
  } finally {
    await c.close();
  }
});
test("Central: desktop, tablet e celular utilizáveis sem overflow", async ({
  page,
}) => {
  const c = await setupConsumer(page, { central: true });
  try {
    await login(page);
    await page.goto("/central/" + c.central!.codes.A);
    await page
      .getByRole("button", { name: "Assumir atendimento", exact: true })
      .click();
    for (const [name, width, height] of [
      ["desktop", 1600, 1000],
      ["tablet", 1024, 1366],
      ["mobile", 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect(
        page.getByRole("heading", {
          name: "Ana • Fictícia",
          exact: true,
          level: 2,
        }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBeTruthy();
      await page.screenshot({
        path: `reports/visual-phase5/${name}.png`,
        fullPage: true,
      });
    }
  } finally {
    await c.close();
  }
});
test("Central: troca de ticket elimina rascunho, resposta rápida e empresa anterior", async ({
  page,
}) => {
  const c = await setupConsumer(page, { central: true });
  try {
    await login(page, "shared@example.invalid");
    await page.goto("/central/" + c.central!.codes.A);
    await page
      .getByRole("button", { name: "Assumir atendimento", exact: true })
      .click();
    await page
      .getByLabel("Resposta pública ao cliente")
      .fill("RASCUNHO PRIVADO DA EMPRESA A");
    await page.goto("/central/" + c.central!.codes.B);
    await expect(
      page.getByRole("heading", { name: "Bruno • Fictício", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Resposta pública ao cliente")).toHaveValue(
      "",
    );
    await expect(page.locator(".h-work")).not.toContainText("MS Auto");
    await expect(page.locator(".h-work")).not.toContainText("RASCUNHO");
    await page.getByRole("button", { name: "Manual", exact: true }).click();
    await expect(page.locator(".h-context")).not.toContainText("SECRETO A");
  } finally {
    await c.close();
  }
});
test("Central: revisão antiga preserva texto e exige atualização explícita", async ({
  page,
}) => {
  const c = await setupConsumer(page, { central: true });
  try {
    await login(page);
    await page.goto("/central/" + c.central!.codes.A);
    await page
      .getByRole("button", { name: "Assumir atendimento", exact: true })
      .click();
    await page
      .getByLabel("Resposta pública ao cliente")
      .fill("Rascunho preservado");
    await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(16000);
    await expect(page.getByLabel("Resposta pública ao cliente")).toHaveValue("Rascunho preservado");
    await c.asAdmin(async (x: any) => {
      await x.as("agentA");
      const ctx = await x.rpc("central_context", {
        p_code: c.central!.codes.A,
      });
      await x.rpc("central_act", {
        p_code: c.central!.codes.A,
        p_revision: ctx.ticket.revision,
        p_action: "priority",
        p_data: { priority: 2 },
        p_key: randomUUID(),
      });
    });
    await page
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click();
    await expect(
      page.getByText(
        "Este atendimento foi alterado. Atualize e revise antes de tentar novamente.",
      ),
    ).toBeVisible();
    await expect(page.getByLabel("Resposta pública ao cliente")).toHaveValue(
      "Rascunho preservado",
    );
    await expect(
      page.getByRole("button", { name: "Revisei a atualização" }),
    ).toBeVisible();
  } finally {
    await c.close();
  }
});
test("Central: encaminhar à empresa e registrar decisão no painel próprio", async ({
  page,
}) => {
  const c = await setupConsumer(page, { central: true });
  try {
    await login(page);
    await page.goto("/central/" + c.central!.codes.A);
    await page
      .getByRole("button", { name: "Assumir atendimento", exact: true })
      .click();
    await page.getByRole("button", { name: "Encaminhar", exact: true }).click();
    await page.getByLabel("Motivo", { exact: true }).fill("Garantia");
    await page
      .getByLabel("Resumo do contexto")
      .fill("Consumidor perguntou sobre garantia do serviço.");
    await page
      .getByLabel("Pergunta ou decisão necessária")
      .fill("Qual orientação podemos oferecer?");
    await page
      .getByRole("button", { name: "Encaminhar para empresa", exact: true })
      .click();
    await expect(page.locator(".h-work-head")).toContainText(
      "Aguardando empresa",
    );
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await login(page, "admin@example.invalid");
    await page.goto("/painel/" + c.orgs.A + "/pendencias");
    await expect(page.locator(".h-ticket")).toHaveCount(1);
    await page.locator(".h-ticket").click();
    await page.getByRole("button", { name: "Encaminhar", exact: true }).click();
    await page
      .getByLabel("Resposta da empresa")
      .fill("Explicar as condições publicadas e confirmar os cuidados.");
    await page.getByRole("button", { name: "Registrar decisão" }).click();
    await expect(page.getByText(/Decisão registrada: Explicar/)).toBeVisible();
    await expect(page.locator(".h-work-head")).toContainText("Em atendimento");
  } finally {
    await c.close();
  }
});
test("Central: revogação bloqueia nova mensagem em tela já aberta", async ({
  page,
}) => {
  const c = await setupConsumer(page, { central: true });
  try {
    await login(page);
    await page.goto("/central/" + c.central!.codes.A);
    await page
      .getByRole("button", { name: "Assumir atendimento", exact: true })
      .click();
    await page
      .getByLabel("Resposta pública ao cliente")
      .fill("Não pode chegar ao cliente");
    await c.asAdmin(async (x: any) => {
      await x.as("root");
      await x.scalar(
        "select foundation_set_attendant($1,$2,'primary','suspended')",
        [x.orgs.A, users.agentA],
      );
    });
    await page
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click();
    await expect(page.locator(".h-work").getByRole("alert")).toContainText(
      "Ação não autorizada",
    );
    await expect(page.locator(".h-messages")).toHaveCount(0);
  } finally {
    await c.close();
  }
});
test("Central: proposta e agendamento usam a jornada aprovada do consumidor", async ({
  page,
}) => {
  const c = await setupConsumer(page, { central: true });
  try {
    await login(page);
    await page.goto("/central/" + c.central!.codes.A);
    await page
      .getByRole("button", { name: "Assumir atendimento", exact: true })
      .click();
    await page.getByRole("button", { name: "Orçamento", exact: true }).click();
    await page.getByLabel("Desconto (%)").fill("10");
    await page
      .getByLabel("Motivo da condição")
      .fill("Condição aprovada no manual");
    await page
      .getByRole("button", { name: "Enviar proposta autorizada" })
      .click();
    await expect(page.locator(".h-quote").first()).toContainText(
      "Proposta final",
    );
    await expect(page.locator(".h-quote").first()).toContainText("108,00");
    await c.asAdmin(async (x: any) => {
      await x.as("alice");
      const req = await x.rpc("consumer_request_context", {
        p_code: c.central!.requests.A,
      });
      await x.rpc("consumer_approve_quote", {
        p_code: c.central!.requests.A,
        p_version: req.current_version,
        p_key: randomUUID(),
      });
    });
    await page.reload();
    await page.getByRole("button", { name: "Agenda", exact: true }).click();
    await page
      .getByLabel("Dia para atendimento")
      .fill(new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
    await page
      .getByRole("button", { name: "Consultar disponibilidade" })
      .click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "08:00", exact: true }).click();
    await expect(page.locator(".h-context")).toContainText("Confirmado:");
  } finally {
    await c.close();
  }
});

test("Central: resposta perdida após commit recupera a mensagem sem duplicação", async ({
  page,
}) => {
  const c = await setupConsumer(page, { central: true });
  try {
    await login(page);
    await page.goto("/central/" + c.central!.codes.A);
    await page
      .getByRole("button", { name: "Assumir atendimento", exact: true })
      .click();
    const message = "Mensagem com confirmação perdida";
    let lost = false;
    await page.route("**/rest/v1/rpc/central_act", async (route) => {
      const args = route.request().postDataJSON();
      if (!lost && args.p_action === "message") {
        lost = true;
        await c.asAdmin(async (x: any) => {
          await x.as("agentA");
          await x.rpc("central_act", args);
        });
        await route.abort("connectionreset");
      } else await route.fallback();
    });
    await page.getByLabel("Resposta pública ao cliente").fill(message);
    await page
      .getByRole("button", { name: "Enviar mensagem", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Confirmar resultado anterior" }),
    ).toBeVisible();
    await expect(page.getByLabel("Resposta pública ao cliente")).toHaveValue(
      message,
    );
    await page
      .getByRole("button", { name: "Confirmar resultado anterior" })
      .click();
    await expect(page.getByLabel("Resposta pública ao cliente")).toHaveValue(
      "",
    );
    await expect(
      page.getByRole("button", { name: "Confirmar resultado anterior" }),
    ).toHaveCount(0);
    await c.asAdmin(async (x: any) => {
      await x.as("agentA");
      const ctx = await x.rpc("central_context", {
        p_code: c.central!.codes.A,
      });
      expect(ctx.messages.filter((m: any) => m.body === message)).toHaveLength(
        1,
      );
    });
  } finally {
    await c.close();
  }
});

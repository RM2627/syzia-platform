import { verifyRegistration } from "../support/verify-registration";
import { demoLogin as login } from "../support/demo-login";
import { test, expect } from "../support/demo-test";

test("Trial demo: 15 dias, prazo explícito, preservação e sem poderes administrativos", async ({
  page: p,
}) => {
  await p.setViewportSize({ width: 390, height: 844 });
  await login(p, "adminb@example.invalid");
  await p
    .getByRole("link", { name: /Estúdio Horizonte/ })
    .first()
    .click();
  const org = p.url().match(/painel\/([^/]+)/)?.[1];
  expect(org).toBeTruthy();
  await p.goto("/painel/" + org + "/assinatura");
  const panel = p.getByRole("region", { name: "Período gratuito" });
  await expect(panel.getByText("15", { exact: true })).toBeVisible();
  await expect(panel.getByText(/Encerramento:/)).toBeVisible();
  await expect(
    panel.getByText(/Seus dados e histórico são preservados/),
  ).toBeVisible();
  await expect(p.getByRole("button", { name: "Estender teste" })).toHaveCount(
    0,
  );
  expect(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await p.screenshot({
    path: "reports/visual-trial/trial-mobile.png",
    fullPage: true,
  });
});
test("Trial demo: análise, exceção, verificação, extensão e política auditadas pela interface", async ({
  page: p,
}) => {
  await login(p, "root@example.invalid");
  // Establish a prior benefit for the same fictitious identity, through the existing audited UI.
  await p.goto("/admin/assinaturas");
  await p
    .getByLabel("Empresa da assinatura")
    .selectOption({ label: "Estúdio Horizonte" });
  await p
    .getByRole("button", { name: "Registrar identidade verificada" })
    .click();
  const prior = p.getByRole("dialog");
  await prior
    .getByLabel("Identificador verificado", { exact: true })
    .fill("BR:CPF:52998224725");
  await prior
    .getByLabel("Referência da verificação")
    .fill("fixture-historico-trial-030");
  await prior.getByLabel(/Confirmei a evidência/).check();
  await prior
    .getByLabel("Motivo administrativo")
    .fill(
      "Histórico fictício para validar reutilização do período de avaliação",
    );
  await prior.getByRole("button", { name: "Registrar decisão" }).click();
  await expect(prior).toHaveCount(0);
  await p.goto("/admin/empresas");
  await p.getByLabel("Nome da empresa").fill("Trial fictício de revisão");
  await p.getByLabel("Identificador no endereço").fill("trial-revisao");
  await p.getByLabel("Nome", { exact: true }).fill("Gestor");
  await p.getByLabel("Sobrenome", { exact: true }).fill("Trial");
  await p.getByLabel("E-mail do administrador").fill("trial@example.invalid");
  const created = p.waitForResponse((r) =>
    r.url().endsWith("/access/provision"),
  );
  await p.getByRole("button", { name: "Criar e ativar empresa" }).click();
  const credentials = await (await created).json();
  expect(credentials.temporary_code).toBeTruthy();
  await p.getByRole("button", { name: "Sair", exact: true }).first().click();
  await p.goto("/ativar-acesso");
  await p
    .getByLabel("Código da empresa", { exact: true })
    .fill(credentials.company_code);
  await p.getByLabel("Usuário", { exact: true }).fill(credentials.username);
  await p
    .getByLabel("Código temporário", { exact: true })
    .fill(credentials.temporary_code);
  await p.getByRole("button", { name: "Validar código" }).click();
  await p
    .getByLabel("Nova senha", { exact: true })
    .fill("FictitiousPassword123!");
  await p.getByLabel("Confirmar nova senha").fill("FictitiousPassword123!");
  await p.getByRole("button", { name: "Ativar minha conta" }).click();
  await p.getByLabel("Li e aceito os Termos de Uso").check();
  await p.getByLabel("Li e estou ciente da Política de Privacidade").check();
  await p.getByRole("button", { name: "Continuar", exact: true }).click();
  await verifyRegistration(p);
  await p
    .getByRole("link", { name: /Trial fictício de revisão/ })
    .first()
    .click();
  const org = p.url().match(/painel\/([^/]+)/)?.[1];
  expect(org).toBeTruthy();
  await p.goto("/painel/" + org + "/assinatura");
  await p.getByRole("button", { name: "Experimentar 15 dias" }).first().click();
  await p
    .getByRole("button", { name: "Confirmar alteração", exact: true })
    .click();
  await expect(
    p.getByText("Solicitação em análise", { exact: true }),
  ).toBeVisible();
  await expect(p.getByText("Nenhuma cobrança gerada.")).toBeVisible();
  await p.getByRole("button", { name: "Sair", exact: true }).click();
  await login(p, "root@example.invalid");
  await p.goto("/admin/assinaturas");
  await p.getByLabel("Empresa da assinatura").selectOption(org);
  await p.getByRole("button", { name: "Analisar solicitação" }).click();
  let d = p.getByRole("dialog");
  await d.getByLabel("Dias autorizados").fill("15");
  await d
    .getByLabel("Motivo administrativo")
    .fill("Exceção legítima com dados totalmente fictícios");
  await d.getByRole("button", { name: "Registrar decisão" }).click();
  await expect(d.getByRole("alert")).toContainText("confirmação explícita");
  await d.getByLabel(/Autorizo expressamente/).check();
  await d.getByRole("button", { name: "Registrar decisão" }).click();
  await expect(d).toHaveCount(0);
  await expect(
    p
      .getByRole("region", { name: "Período gratuito" })
      .getByText("15", { exact: true }),
  ).toBeVisible();
  await p
    .getByRole("button", { name: "Registrar identidade verificada" })
    .click();
  d = p.getByRole("dialog");
  await d
    .getByLabel("Identificador verificado", { exact: true })
    .fill("ZZ:DEMO:REVIEW12345");
  await d.getByLabel("Referência da verificação").fill("fixture-manual-review");
  await d.getByLabel(/Confirmei a evidência/).check();
  await d
    .getByLabel("Motivo administrativo")
    .fill("Evidência de demonstração conferida manualmente");
  await d.getByRole("button", { name: "Registrar decisão" }).click();
  await expect(d).toHaveCount(0);
  await p.getByRole("button", { name: "Estender teste" }).click();
  d = p.getByRole("dialog");
  await d.getByLabel("Dias autorizados").fill("3");
  await d.getByLabel(/Autorizo expressamente/).check();
  await d
    .getByLabel("Motivo administrativo")
    .fill("Extensão legítima de três dias na demonstração");
  await d.getByRole("button", { name: "Registrar decisão" }).click();
  await expect(d).toHaveCount(0);
  await expect(
    p
      .getByRole("region", { name: "Período gratuito" })
      .getByText("18", { exact: true }),
  ).toBeVisible();
  await p.getByRole("button", { name: "Política de elegibilidade" }).click();
  d = p.getByRole("dialog");
  await d
    .getByLabel("Máximo de dias por concessão/extensão administrativa")
    .fill("45");
  await d
    .getByLabel("Motivo administrativo")
    .fill("Ajuste fictício de política configurável");
  await d.getByRole("button", { name: "Registrar decisão" }).click();
  await expect(d).toHaveCount(0);
  await p
    .getByText("Verificações e histórico administrativo", { exact: true })
    .click();
  await expect(p.getByText(/fixture-manual-review/)).toBeVisible();
  await expect(p.getByText(/Política de elegibilidade alterada/)).toBeVisible();
  await expect(p.getByText("ZZ:DEMO:REVIEW12345", { exact: true })).toHaveCount(
    0,
  );
  await p.screenshot({
    path: "reports/visual-trial/trial-admin-desktop.png",
    fullPage: true,
  });
});

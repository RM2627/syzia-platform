import { test, expect } from "../support/demo-test";
import {
  rpc,
  crpc,
  admin,
  setup,
  start,
  details,
  schedule,
  hours,
} from "./current-helpers";
test("044 HTTP: pedido sob avaliação rejeita comando empresarial com causa de aprovação", async ({
  page,
  browser,
}) => {
  const org = await admin(page);
  await hours(page, org);
  const s = await setup(page, org, "review 044", "quote");
  const v = await browser.newPage();
  await start(v, s.name);
  await details(v);
  await schedule(v);
  await v
    .getByRole("dialog")
    .getByRole("button", { name: "Enviar para avaliação", exact: true })
    .click();
  await v.waitForURL(/\/acompanhar\/r_/);
  const code = v.url().split("/").at(-1)!;
  const context: any = await crpc(v, "consumer_request_context", {
    p_code: code,
  });
  const requests: any = await rpc(page, "operations_requests", {
    p_org: org,
    p_search: "",
    p_offset: 0,
  });
  context.id = requests.find((r: any) => r.code === code).id;
  const result = await page.evaluate(
    async ({ org, context }) => {
      const api = await import("/src/api.ts");
      try {
        await api.rpc("operations_schedule", {
          p_org: org,
          p_request: context.id,
          p_start: context.desired_start,
          p_duration: 60,
          p_note: "Fixture HTTP 044",
          p_key: crypto.randomUUID(),
        });
        return { ok: true, message: "" };
      } catch (e) {
        return { ok: false, message: api.errorMessage(e) };
      }
    },
    { org, context },
  );
  expect(result.ok).toBe(false);
  expect(result.message).toMatch(/aprovar a proposta/);
  const consumer: any = await crpc(v, "consumer_request_context", {
    p_code: code,
  });
  expect(consumer.appointments).toHaveLength(0);
  await page.goto(`/painel/${org}/orcamentos?pedido=${code}`);
  await expect(
    page.getByRole("button", { name: "Confirmar agendamento", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "reports/syzia-044/review-before-approval.png",
    fullPage: true,
  });
  await v.close();
});
test("044 ficha: buffer vigente, ordem protegida e mensagem de replanejamento", async ({
  page,
  browser,
}) => {
  const org = await admin(page);
  await hours(page, org);
  const s = await setup(page, org, "split 044", "fixed", "dark", {
    duration_minutes: 600,
    execution_mode: "split",
    execution_max_periods: 3,
  });
  const v = await browser.newPage();
  await start(v, s.name);
  await details(v);
  await schedule(v);
  await v
    .getByRole("dialog")
    .getByRole("button", { name: /Confirmar/ })
    .click();
  await v.waitForURL(/\/acompanhar\/r_/);
  const code = v.url().split("/").at(-1)!;
  const q: any = await crpc(v, "consumer_request_context", { p_code: code });
  expect(q.appointments).toHaveLength(2);
  const agenda: any = await rpc(page, "operations_agenda", {
    p_org: org,
    p_from: new Date().toISOString().slice(0, 10),
    p_to: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
  });
  const parts = agenda.appointments
    .filter((a: any) => a.request_code === code)
    .sort((a: any, b: any) => a.part_number - b.part_number);
  expect(parts).toHaveLength(2);
  const c: any = await rpc(page, "consumer_admin_context", { p_org: org });
  await rpc(page, "consumer_schedule_config", {
    p_org: org,
    p_expected_revision: c.schedule.revision,
    p_rules: {
      active: true,
      lead_minutes: 0,
      horizon_days: 25,
      step_minutes: 30,
      buffer_minutes: 30,
      cancel_minutes: 0,
    },
  });
  await page.goto(`/painel/${org}/agenda?ficha=${parts[1].id}`);
  await page
    .getByRole("button", { name: "Remarcar este período", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const previous = new Date(Date.parse(parts[0].starts_at) - 86400000)
    .toISOString()
    .slice(0, 10);
  await dialog.getByLabel("Dia", { exact: true }).fill(previous);
  await dialog.getByLabel("Horário", { exact: true }).fill("08:00");
  await dialog.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Use Replanejar atendimento",
  );
  await page.screenshot({
    path: "reports/syzia-044/order-protected.png",
    fullPage: true,
  });
  const target = new Date(Date.parse(parts[1].starts_at) + 8 * 86400000)
    .toISOString()
    .slice(0, 10);
  await dialog.getByLabel("Dia", { exact: true }).fill(target);
  await dialog.getByLabel("Horário", { exact: true }).fill("08:00");
  await dialog.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(
    page.getByText("Alteração registrada no histórico."),
  ).toBeVisible();
  await expect(
    page.locator("dl").filter({ hasText: "Duração do serviço" }),
  ).toContainText("180 minutos");
  await expect(
    page.locator("dl").filter({ hasText: "Intervalo de preparação" }),
  ).toContainText("30 minutos");
  await page.screenshot({
    path: "reports/syzia-044/buffer-current.png",
    fullPage: true,
  });
  await v.close();
});

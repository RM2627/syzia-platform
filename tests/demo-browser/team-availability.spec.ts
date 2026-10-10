import { test, expect } from "../support/demo-test";
import { demoLogin } from "../support/demo-login";
import type { Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
async function rpc(p: Page, name: string, args: any = {}) {
  return p.evaluate(
    async ({ name, args }) => (await import("/src/api.ts")).rpc(name, args),
    { name, args },
  );
}
async function org(p: Page) {
  const c: any = await rpc(p, "foundation_context");
  return c.organizations.find((o: any) => o.slug === "ms-auto-ficticia").id;
}
async function shot(p: Page, name: string) {
  await mkdir("reports/team-availability/screenshots", { recursive: true });
  await p.screenshot({
    path: `reports/team-availability/screenshots/${name}.png`,
    fullPage: true,
  });
  expect(
    await p.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - innerWidth),
    ),
  ).toBe(0);
}
for (const width of [1440, 390, 320])
  test(`Employee availability ${width}: weekly editor, save, reload, aggregate requests`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await demoLogin(page);
    const id = await org(page);
    let reads = 0;
    page.on("request", (r) => {
      if (r.url().endsWith("/rpc/employee_availability_context")) reads++;
    });
    await page.goto(`/painel/${id}/permissoes`);
    const panel = page.getByRole("region", {
      name: "Disponibilidade para atendimentos",
    });
    await expect(panel).toBeVisible();
    const data: any = await rpc(page, "employee_availability_context", {
      p_org: id,
    });
    const employee =
      data.members.find(
        (m: any) => m.user_id !== "10000000-0000-0000-0000-000000000002",
      ) || data.members[0];
    await panel
      .getByRole("combobox", { name: "Funcionário", exact: true })
      .selectOption(employee.user_id);
    await panel.getByLabel("Usar horário geral da empresa").uncheck();
    await panel
      .getByRole("button", {
        name: "Adicionar intervalo · Segunda",
        exact: true,
      })
      .click();
    const starts = panel.getByLabel(/Segunda início/),
      ends = panel.getByLabel(/Segunda fim/);
    await starts.last().fill("08:00");
    await ends.last().fill("12:00");
    await panel
      .getByRole("button", {
        name: "Adicionar intervalo · Segunda",
        exact: true,
      })
      .click();
    await starts.last().fill("13:00");
    await ends.last().fill("17:00");
    await panel
      .getByRole("button", { name: "Salvar disponibilidade", exact: true })
      .click();
    await expect(
      panel.getByText("Disponibilidade salva.", { exact: false }),
    ).toBeVisible();
    await shot(page, `employee-${width}`);
    await page.reload();
    await panel
      .getByRole("combobox", { name: "Funcionário", exact: true })
      .selectOption(employee.user_id);
    await expect(
      panel.getByLabel("Usar horário geral da empresa"),
    ).toBeVisible();
    await expect(
      panel.getByLabel("Usar horário geral da empresa"),
    ).not.toBeChecked();
    await expect(starts).toHaveCount(2);
    // Reset the fictitious employee explicitly so viewport cases remain independent.
    const d: any = await rpc(page, "employee_availability_context", {
        p_org: id,
      }),
      m = d.members.find((x: any) => x.user_id === employee.user_id);
    await rpc(page, "employee_availability_save", {
      p_org: id,
      p_user: m.user_id,
      p_revision: m.revision,
      p_inherit: true,
      p_hours: [],
      p_blocks: [],
    });
    expect(reads).toBe(2); // Only the two explicit test reads; UI uses permissions_team payload.
  });
for (const width of [1440, 390])
  test(`Super Admin policy ${width}: configured hours, quota and audit`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await demoLogin(page, "root@example.invalid");
    await page.goto("/admin/assinaturas");
    await expect(
      page.getByRole("heading", {
        name: "Atendimento compartilhado",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByText("Horário global da Equipe SYZIA", { exact: true })
      .click();
    await expect(page.getByLabel("Timezone", { exact: true })).toHaveValue(
      "UTC",
    );
    await page.getByText("Limite por versão do plano", { exact: true }).click();
    const d: any = await rpc(page, "assisted_admin_context");
    await page
      .getByRole("combobox", { name: "Versão Assistido", exact: true })
      .selectOption(d.versions[0].id);
    await page.getByLabel("Atendimentos incluídos por ciclo").fill("3");
    await page.getByLabel("Avisar a partir de quantos atendimentos").fill("2");
    await page
      .getByRole("button", { name: "Salvar limite compartilhado" })
      .click();
    await expect(
      page.getByText("Configuração salva e auditada."),
    ).toBeVisible();
    await shot(page, `assisted-${width}`);
  });
test("Business admin: read-only usage and direct global RPC denial", async ({
  page,
}) => {
  await demoLogin(page);
  const id = await org(page);
  await page.goto(`/painel/${id}/assinatura`);
  await expect(
    page.getByRole("heading", {
      name: "Atendimento compartilhado",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Salvar horário compartilhado" }),
  ).toHaveCount(0);
  const denied = await page.evaluate(async () => {
    try {
      await (await import("/src/api.ts")).rpc("assisted_admin_context");
      return false;
    } catch {
      return true;
    }
  });
  expect(denied).toBe(true);
  await shot(page, "company-read-only");
  await page.goto("/admin/assinaturas");
  await expect(
    page.getByRole("heading", { name: "Acesso restrito", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Salvar horário compartilhado" }),
  ).toHaveCount(0);
});
for (const width of [1440, 390])
  test(`Agenda ${width}: assign responsible in existing appointment and preserve period`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await demoLogin(page);
    const id = await org(page);
    const day = (offset: number) =>
      new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    const agenda: any = await rpc(page, "operations_agenda", {
      p_org: id,
      p_from: day(0),
      p_to: day(7),
    });
    const a = agenda.appointments.find(
      (a: any) =>
        a.kind === "booking" &&
        a.state === "confirmed" &&
        a.execution_state === "scheduled" &&
        Date.parse(a.starts_at) > Date.now(),
    );
    expect(a).toBeTruthy();
    await page.goto(`/painel/${id}/agenda?ficha=${a.id}`);
    await expect(
      page.getByRole("heading", { name: "Responsável por este período" }),
    ).toBeVisible();
    const d: any = await rpc(page, "operations_detail", {
      p_org: id,
      p_id: a.id,
    });
    const worker = d.responsibles.find(
      (m: any) => m.id === "10000000-0000-0000-0000-000000000007",
    );
    expect(worker).toBeTruthy();
    await page
      .getByRole("combobox", { name: "Funcionário responsável", exact: true })
      .selectOption(worker.id);
    await page
      .getByRole("button", { name: "Salvar responsável", exact: true })
      .click();
    await expect(
      page.getByText(
        "Responsável atualizado. Disponibilidade validada para o período completo.",
        { exact: true },
      ),
    ).toBeVisible();
    const updated: any = await rpc(page, "operations_detail", {
      p_org: id,
      p_id: a.id,
    });
    expect(updated.appointment.responsible_id).toBe(worker.id);
    expect(updated.appointment.starts_at).toBe(d.appointment.starts_at);
    expect(updated.appointment.ends_at).toBe(d.appointment.ends_at);
    await shot(page, `agenda-responsible-${width}`);
    await rpc(page, "operations_assign_responsible", {
      p_org: id,
      p_id: a.id,
      p_user: null,
      p_revision: updated.appointment.revision,
      p_key: crypto.randomUUID(),
    });
  });

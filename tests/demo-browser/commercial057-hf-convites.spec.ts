import { test, expect } from "@playwright/test";

test("HF convites: autorizacao pela interface libera link", async ({ page }) => {
  await page.goto("/entrar");

  await page.getByLabel("E-mail ou usuário", { exact: true })
    .fill("root@example.invalid");
  await page.getByLabel("Senha", { exact: true })
    .fill("FictitiousPassword123!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/admin/);

  const result = await page.evaluate(async () => {
    const { rpc } = await import("/src/api.ts");
    const ctx: any = await rpc("commercial_management");
    const demo = ctx.demos[0];

    const lead: any = await rpc("commercial_contact_save", {
      p_id: null,
      p_revision: 0,
      p_key: crypto.randomUUID(),
      p_data: {
        name: "Cliente HF Convites",
        email: "cliente.hf@example.invalid",
        stage: "wants_trial"
      }
    });

    await rpc("commercial_demo_link", {
      p_demo: demo.id,
      p_lead: lead.id
    });

    return lead.id;
  });

  expect(result).toBeTruthy();

  await page.goto("/admin/comercial/convites");

  const row = page.getByRole("article", {
    name: /Cliente HF Convites/
  });

  await expect(row).toBeVisible();

  const generate = row.getByRole("button", {
    name: "Gerar link individual"
  });

  await expect(generate).toBeDisabled();

  const confirm = row.getByRole("checkbox", {
    name: /Confirmo que recebi autorização expressa/
  });

  await expect(confirm).toBeVisible();
  await confirm.check();

  await row.getByRole("button", {
    name: "Registrar autorização"
  }).click();

  await expect(generate).toBeEnabled();

  await generate.click();

  await expect(page.getByText(/Link individual gerado/))
    .toBeVisible();
});

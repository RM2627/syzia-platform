import {demoLogin as login} from "../support/demo-login";
import { test, expect } from "../support/demo-test";

for (const [device, width, height] of [
  ["desktop", 1440, 1000],
  ["mobile", 390, 844],
] as const) {
  test(
    "Onboarding real HTTP: primeira entrada, retomada, pular e refazer " +
      device,
    async ({ page }) => {
      await page.setViewportSize({ width, height });
      await login(page, "newadmin@example.invalid");
      await page
        .getByRole("link", { name: /Ateliê Inicial/ })
        .first()
        .click();
      const base = page.url();
      await expect(
        page.getByRole("heading", { name: "Vamos preparar sua empresa" }),
      ).toBeVisible();
      await expect(
        page.getByText("0 de 6 essenciais", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Manual de Atendimento", { exact: true }),
      ).toHaveCount(0);
      await page.getByRole("link", { name: /Dados da empresa/ }).click();
      await expect(
        page.getByRole("heading", { name: "Informações e funcionamento" }),
      ).toBeVisible();
      await page.goto(base + "/ajuda");
      await page.getByRole("button", { name: "Refazer tutorial" }).click();
      let tour = page.getByRole("region", { name: "Tutorial guiado" });
      await expect(tour.getByText("PASSO 1 DE 5")).toBeVisible();
      await tour.getByRole("button", { name: "Próximo" }).click();
      await expect(tour.getByText("PASSO 2 DE 5")).toBeVisible();
      await page.reload();
      tour = page.getByRole("region", { name: "Tutorial guiado" });
      await expect(tour.getByText("PASSO 2 DE 5")).toBeVisible();
      await tour.getByRole("button", { name: "Anterior" }).click();
      await expect(tour.getByText("PASSO 1 DE 5")).toBeVisible();
      await tour.getByRole("button", { name: "Pular" }).click();
      await page.reload();
      await expect(tour).toHaveCount(0);
      await page.goto(base + "/ajuda");
      await page.getByRole("button", { name: "Refazer tutorial" }).click();
      for (let i = 0; i < 4; i++)
        await tour.getByRole("button", { name: "Próximo" }).click();
      await tour.getByRole("button", { name: "Concluir" }).click();
      await page.reload();
      await expect(tour).toHaveCount(0);
      await page.goto(base);
      await expect(
        page.getByRole("heading", { name: "Vamos preparar sua empresa" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: "reports/visual-operations/onboarding-" + device + ".png",
        fullPage: true,
      });
    },
  );
  test(
    "Rotina empresarial: Home, agenda e ficha " + device,
    async ({ page }) => {
      await page.setViewportSize({ width, height });
      await login(page, "admin@example.invalid");
      await page
        .getByRole("link", { name: /MS Auto Details/ })
        .first()
        .click();
      const base = page.url();
      await expect(
        page.getByRole("heading", { name: "O que precisa ser feito hoje?" }),
      ).toBeVisible();
      await expect(
        page.getByText("Marina • Fictícia", { exact: true }).first(),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: "reports/visual-operations/home-" + device + ".png",
        fullPage: true,
      });
      await page.goto(base + "/agenda");
      await expect(
        page.getByRole("heading", { name: "Agenda", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("link")
        .filter({ hasText: "Marina • Fictícia" })
        .first()
        .click();
      await expect(
        page.getByRole("heading", { name: "Marina • Fictícia", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Concluído", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Iniciar serviço" }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: "reports/visual-operations/detail-" + device + ".png",
        fullPage: true,
      });
    },
  );
}
test('Rotina manual: cadastrar, agendar, remarcar, cancelar e bloquear pela interface',async({page})=>{
 await login(page,'admin@example.invalid');await page.getByRole('link',{name:/MS Auto Details/}).first().click();const base=page.url();await page.getByRole('link',{name:'+ Novo agendamento',exact:true}).click();await page.getByLabel('Nome',{exact:true}).fill('Nina • Teste manual fictício');await page.getByLabel('WhatsApp com DDD',{exact:true}).fill('81999990200');await page.getByLabel(/Confirmei com o cliente/).check();const service=page.getByRole('combobox',{name:'Serviço',exact:true});await service.selectOption({index:1});await page.getByLabel('Qual é o modelo do carro? *').fill('Veículo fictício');const day=new Date(Date.now()+25*86400000).toISOString().slice(0,10);await page.getByLabel('Dia',{exact:true}).fill(day);await page.getByLabel('Horário',{exact:true}).fill('10:00');await page.getByRole('button',{name:'Confirmar agendamento',exact:true}).click();await expect(page.getByRole('heading',{name:'Nina • Teste manual fictício',exact:true})).toBeVisible();await page.getByRole('button',{name:'Reagendar',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByLabel('Horário',{exact:true}).fill('12:00');await dialog.getByRole('button',{name:'Confirmar',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByText('Reagendado',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Cancelar',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirmar',exact:true}).click();await expect(page.getByText('Cancelado',{exact:true}).first()).toBeVisible();await page.goto(base+'/agenda');await page.getByRole('button',{name:'Bloquear período',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Dia',{exact:true}).fill(day);await dialog.getByLabel('Início',{exact:true}).fill('12:00');await dialog.getByLabel('Fim',{exact:true}).fill('14:00');await dialog.getByLabel('Motivo',{exact:true}).fill('Compromisso fictício');await dialog.getByRole('button',{name:'Confirmar bloqueio',exact:true}).click();await expect(dialog).toHaveCount(0);await page.getByLabel('Data da agenda').fill(day);await expect(page.getByText('Compromisso fictício',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Semana',exact:true}).click();await expect(page.locator('.op-day-label')).toHaveCount(7);await page.screenshot({path:'reports/visual-operations/agenda-week-desktop.png',fullPage:true});
});

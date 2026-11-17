import type { Page } from "@playwright/test";
import { expect, newIsolatedContext, test } from "./fixtures";
import { PASSWORD, seedAccount } from "./support";

test.describe.configure({ mode: "serial" });

async function loginAs(page: Page, email: string) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).first().fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/(app|admin)$/);
}

function tomorrow() {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

test("marca, campanha e regra de comissão com aprovação por duas administradoras", async ({ page, browser }, info) => {
  const key = `${info.project.name}-${Date.now()}`.toLowerCase();
  const ana = await seedAccount(["user", "admin"]);
  const bia = await seedAccount(["user", "admin"]);

  await loginAs(page, ana.email);
  await page.goto("/admin/marcas/nova");
  await page.getByLabel("Nome").fill(`Marca E2E ${key}`);
  await page.getByLabel("Identificador (URL)").fill(`marca-e2e-${key}`);
  await page.getByLabel("Domínios autorizados").fill("loja-e2e.example");
  await page.getByLabel("Parâmetros de rastreamento").fill("utm_source=plataforma\nx={email}");
  await page.getByRole("button", { name: "Salvar marca" }).click();
  await expect(page.getByText(/Marcador desconhecido/)).toBeVisible();
  await page.getByLabel("Parâmetros de rastreamento").fill("utm_source=plataforma\nutmi_cp={click_id}");
  await page.getByRole("button", { name: "Salvar marca" }).click();
  await page.waitForURL(/\/admin\/marcas\/[0-9a-f-]{36}$/);

  await page.getByText("+ Nova campanha").click();
  await page.getByLabel("Nome").last().fill("Lançamento");
  await page.getByLabel("Identificador", { exact: true }).fill("lancamento");
  await page.getByLabel("Início").fill("2026-01-01");
  await page.getByRole("button", { name: "Criar campanha" }).click();
  await expect(page.getByText("Campanha criada.")).toBeVisible();
  await page.getByRole("link", { name: "Lançamento" }).click();

  await expect(page.getByText(/Nenhuma regra aprovada em vigor/)).toBeVisible();
  await page.getByLabel("Vale a partir de").fill(tomorrow());
  await page.getByLabel("Comissão total (%)").fill("25");
  await page.getByLabel("Parcela da usuária (% da base)").fill("20");
  await page.getByLabel("Referência do contrato ou confirmação formal").fill("Confirmação FICTÍCIA de teste");
  await page.getByRole("button", { name: "Propor regra" }).click();
  await expect(page.getByText(/Outra administradora precisa aprová-la/)).toBeVisible();
  await expect(page.getByText("Você propôs esta regra; outra administradora precisa revisá-la.")).toBeVisible();
  await expect(page.getByText("25% / 20 p.p. / 5 p.p.", { exact: true })).toBeVisible();
  const campaignUrl = page.url();

  const ctx = await newIsolatedContext(browser);
  const other = await ctx.newPage();
  await loginAs(other, bia.email);
  await other.goto(campaignUrl);
  await other.getByRole("button", { name: "Aprovar regra" }).click();
  await expect(other.getByText("Aprovada", { exact: true })).toBeVisible();
  await ctx.close();
});

test("agendador de importação exige segredo", async ({ request }) => {
  expect((await request.get("/api/cron/importar-feeds")).status()).toBe(401);
  expect((await request.get("/api/cron/importar-feeds", { headers: { authorization: "Bearer errado" } })).status()).toBe(401);
  const ok = await request.get("/api/cron/importar-feeds", { headers: { authorization: "Bearer segredo-do-agendador-de-teste-0123456789" } });
  expect([200, 207]).toContain(ok.status());
});

test("relatório de cliques e exportação CSV; operadora não exporta", async ({ page, browser }) => {
  const admin = await seedAccount(["user", "admin"]);
  await loginAs(page, admin.email);
  await page.goto("/admin/relatorios");
  await expect(page.getByRole("heading", { name: "Relatório de cliques" })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Exportar CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^cliques-\d{4}-\d{2}-\d{2}-a-\d{4}-\d{2}-\d{2}\.csv$/);

  const op = await seedAccount(["user", "operator"]);
  const ctx = await newIsolatedContext(browser);
  const opPage = await ctx.newPage();
  await loginAs(opPage, op.email);
  await opPage.goto("/admin/relatorios");
  await expect(opPage.getByRole("link", { name: "Exportar CSV" })).toHaveCount(0);
  expect((await opPage.request.get("/admin/relatorios/exportar"))?.status()).toBe(404);
  expect((await opPage.goto("/admin/equipe"))?.status()).toBe(404);
  expect((await opPage.goto("/admin/marcas"))?.status()).toBe(404);
  await ctx.close();
});

test("administradora concede acesso de operadora pela tela de equipe", async ({ page }) => {
  const admin = await seedAccount(["user", "admin"]);
  const pessoa = await seedAccount();
  await loginAs(page, admin.email);
  await page.goto("/admin/equipe");
  const conceder = page.getByRole("region", { name: "Conceder acesso" });
  await conceder.getByLabel("E-mail da conta").fill(pessoa.email);
  await conceder.getByRole("button", { name: "Conceder" }).click();
  await expect(page.getByText(/Acesso concedido/)).toBeVisible();
  await expect(page.getByRole("cell", { name: new RegExp(pessoa.email) })).toBeVisible();
});

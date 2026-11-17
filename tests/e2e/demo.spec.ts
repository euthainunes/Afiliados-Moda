import type { Page } from "@playwright/test";
import { expect, newIsolatedContext, test } from "./fixtures";
import { PASSWORD } from "./support";

// Fluxos sobre os DADOS DE DEMONSTRAÇÃO carregados pelo seed (tudo fictício).
async function loginAs(page: Page, email: string) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).first().fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/(app|admin)$/);
}

test("faixa de demonstração aparece fora de produção", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("note")).toContainText("nenhuma venda, cobrança ou pagamento é real");
});

test("criadora vê desempenho, recompensas e extrato coerentes e marcados como demonstração", async ({ page }) => {
  await loginAs(page, "criadora1@exemplo.test");
  await page.goto("/app/desempenho");
  await expect(page.getByRole("img", { name: /Cliques por dia/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Aprovada|Liberada para resgate/ }).first()).toBeVisible();
  await page.goto("/app/recompensas");
  await expect(page.getByText("Valores de demonstração")).toBeVisible();
  await expect(page.getByText("Pago (simulado)")).toBeVisible();
  await expect(page.getByText("Pagamento simulado: nenhum valor foi transferido.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Extrato" })).toBeVisible();
  await page.goto("/app/notificacoes");
  await expect(page.getByText("Recompensa liberada").first()).toBeVisible();
  await page.goto("/app/links");
  await expect(page.getByRole("button", { name: /Copiar link/ }).first()).toBeVisible();
});

test("criadora solicita resgate com validação e acompanha o status", async ({ page }) => {
  await loginAs(page, "criadora5@exemplo.test");
  await page.goto("/app/recompensas/resgatar");
  await expect(page.getByText(/ainda não atingiu o mínimo|Cadastre os dados/)).toBeVisible();
  await page.getByLabel("Nome completo da titular").fill("Gabi Nunes (fictícia)");
  await page.getByLabel("CPF").fill("111.111.111-11");
  await page.getByLabel("Chave PIX", { exact: true }).fill("111.111.111-11");
  await page.getByRole("button", { name: "Salvar dados de recebimento" }).click();
  await expect(page.getByText("CPF inválido.")).toBeVisible();
});

test("administração: financeiro, aprovação de resgate, integrações, conciliação e saúde", async ({ page }, info) => {
  await loginAs(page, "admin2@exemplo.test");
  await page.goto("/admin/financeiro?origem=demonstracao");
  await expect(page.getByText("Receita confirmada da plataforma")).toBeVisible();
  await expect(page.getByText(/Fatura nº 1/)).toBeVisible();

  // O banco é compartilhado entre os perfis: a aprovação acontece uma vez (desktop) e o celular confere o resultado.
  if (info.project.name === "desktop") {
    await page.goto("/admin/resgates?status=requested");
    const card = page.locator("li", { hasText: "Elis" }).first();
    await card.getByRole("button", { name: "Aprovar" }).click();
    await expect(page.getByText("Resgate aprovado.")).toBeVisible();
  } else {
    await page.goto("/admin/resgates?status=approved");
    await expect(page.locator("li", { hasText: "Elis" }).first()).toBeVisible();
  }

  await page.goto("/admin/integracoes");
  await expect(page.getByText("Pedidos — Marca Fictícia (loja de demonstração)")).toBeVisible();
  await page.getByRole("button", { name: "Sincronizar agora" }).click();
  await expect(page.getByText(/Sincronização concluída/)).toBeVisible({ timeout: 30_000 });

  await page.goto("/admin/conciliacao");
  await expect(page.getByText("Clique não encontrado").first()).toBeVisible();

  await page.goto("/admin/saude");
  await expect(page.getByText("Livro-razão balanceado")).toBeVisible();
  await expect(page.getByText("todas as transações somam zero")).toBeVisible();

  await page.goto("/admin/vendas?estado=rejected");
  await expect(page.getByText(/autocompra|sem regra/).first()).toBeVisible();
});

test("operadora não acessa financeiro sensível nem configurações", async ({ browser }) => {
  const ctx = await newIsolatedContext(browser);
  const page = await ctx.newPage();
  await loginAs(page, "operadora@exemplo.test");
  for (const path of ["/admin/conciliacao", "/admin/integracoes", "/admin/configuracoes", "/admin/saude", "/admin/equipe"]) {
    expect((await page.goto(path))?.status(), path).toBe(404);
  }
  // Financeiro: somente leitura para a operadora (sem emitir faturas, registrar recebimentos ou aprovar ajustes).
  expect((await page.goto("/admin/financeiro"))?.status()).toBe(200);
  await expect(page.getByRole("button", { name: /Emitir fatura/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Registrar recebimento/ })).toHaveCount(0);
  expect((await page.goto("/admin/resgates"))?.status()).toBe(200);
  await expect(page.getByRole("button", { name: "Registrar pagamento simulado" })).toHaveCount(0);
  await ctx.close();
});

test("suporte e privacidade: abrir atendimento e baixar os próprios dados", async ({ page }) => {
  await loginAs(page, "criadora3@exemplo.test");
  await page.goto("/app/suporte/novo");
  await page.getByLabel("Resumo").fill("Dúvida de teste E2E");
  await page.getByLabel("Mensagem").fill("Mensagem fictícia enviada pelo teste automatizado.");
  await page.getByRole("button", { name: "Enviar" }).click();
  await page.waitForURL(/\/app\/suporte\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Mensagem fictícia enviada pelo teste automatizado.")).toBeVisible();

  await page.goto("/app/configuracoes");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Baixar meus dados (JSON)" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^meus-dados-.*\.json$/);
});

test("contato público valida e registra a mensagem", async ({ page }) => {
  await page.goto("/contato");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("Informe seu nome.")).toBeVisible();
  await page.getByLabel("Seu nome").fill("Visitante Fictícia");
  await page.getByLabel("Seu e-mail").fill("visitante@exemplo.test");
  await page.getByLabel("Resumo").fill("Contato de teste");
  await page.getByLabel("Mensagem").fill("Mensagem fictícia do formulário público.");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("Mensagem recebida!")).toBeVisible();
});

test("marca parceira vê o próprio portal, somente leitura, e nada além dele", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).first().fill("marca@exemplo.test");
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/marca\/marca-ficticia$/);
  await expect(page.getByRole("heading", { level: 1, name: "Marca Fictícia" })).toBeVisible();
  await expect(page.getByText("Vendas atribuídas", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("demonstração").first()).toBeVisible();

  await page.getByRole("link", { name: "Vendas", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Vendas atribuídas" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Pedido" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /recompensa|criadora recebe|plataforma/i })).toHaveCount(0);

  await page.getByRole("link", { name: "Faturas", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Faturas" })).toBeVisible();

  expect((await page.goto("/marca/outra-marca"))?.status()).toBe(404);
  expect((await page.goto("/admin"))?.status()).toBe(404);
});

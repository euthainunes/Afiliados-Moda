import { expect, test } from "./fixtures";
import { PASSWORD, seedAccount } from "./support";

async function loginAs(page: import("@playwright/test").Page, email: string, next?: string) {
  await page.goto(next ? `/entrar?next=${encodeURIComponent(next)}` : "/entrar");
  await page.getByLabel("E-mail", { exact: true }).first().fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("página inicial apresenta a proposta e leva ao cadastro", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Monte looks");
  await page.getByRole("link", { name: "Criar meu primeiro look" }).click();
  await expect(page).toHaveURL(/\/cadastro$/);
});

test("cadastro valida campos e confirma envio do e-mail", async ({ page }) => {
  await page.goto("/cadastro");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText("Informe seu nome.")).toBeVisible();
  await expect(page.getByText("É preciso ter 18 anos ou mais.")).toBeVisible();

  await page.getByLabel("Nome").fill("Dani Fictícia");
  await page.getByLabel("E-mail").fill(`cadastro-${Date.now()}@exemplo.test`);
  await page.getByLabel("Senha").fill("senha-ficticia-123");
  await page.getByLabel("Tenho 18 anos ou mais.").check();
  await page.getByRole("checkbox", { name: /Li e aceito/ }).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText("Quase lá!")).toBeVisible();
});

test("área logada exige login e preserva o destino", async ({ page }) => {
  const { email } = await seedAccount();
  await page.goto("/app/configuracoes");
  await expect(page).toHaveURL(/\/entrar\?next=%2Fapp%2Fconfiguracoes/);
  await page.getByLabel("E-mail", { exact: true }).first().fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/app\/configuracoes$/);
  await expect(page.getByText("Esta sessão")).toBeVisible();
});

test("senha errada mostra mensagem genérica", async ({ page }) => {
  const { email } = await seedAccount();
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).first().fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
});

test("usuária comum não acessa o painel interno", async ({ page }) => {
  const { email } = await seedAccount();
  await loginAs(page, email);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("link", { name: "Painel interno" })).toHaveCount(0);
  const response = await page.goto("/admin");
  expect(response?.status()).toBe(404);
});

test("administradora acessa o painel, a lista de contas e a auditoria", async ({ page }) => {
  const { email } = await seedAccount(["user", "admin"]);
  await loginAs(page, email);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  await page.goto("/admin/usuarias");
  await expect(page.getByRole("heading", { name: "Usuárias" })).toBeVisible();
  await page.goto("/admin/auditoria");
  await expect(page.getByText("staff.login").first()).toBeVisible();
});

test("operadora não acessa a auditoria", async ({ page }) => {
  const { email } = await seedAccount(["user", "operator"]);
  await loginAs(page, email);
  await expect(page).toHaveURL(/\/admin$/);
  const response = await page.goto("/admin/auditoria");
  expect(response?.status()).toBe(404);
});

test("sair encerra a sessão", async ({ page }) => {
  const { email } = await seedAccount();
  await loginAs(page, email);
  await expect(page).toHaveURL(/\/app$/);
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/entrar/);
});

test("não redireciona para sites externos após login", async ({ page }) => {
  const { email } = await seedAccount();
  await loginAs(page, email, "https://malicioso.example");
  await expect(page).toHaveURL(/localhost:3100\/app$/);
});

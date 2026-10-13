import { test } from "@playwright/test";
import { PASSWORD, seedAccount } from "./support";

// Gera capturas de tela das telas principais para revisão visual (não faz asserções).
test.skip(!process.env.SCREENSHOTS, "Defina SCREENSHOTS=1 para gerar capturas.");

test("capturas", async ({ page }, info) => {
  const dir = `test-results/telas/${info.project.name}`;
  await page.goto("/");
  await page.screenshot({ path: `${dir}/inicio.png`, fullPage: true });
  await page.goto("/cadastro");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByText("Informe seu nome.").waitFor();
  await page.screenshot({ path: `${dir}/cadastro-erros.png`, fullPage: true });
  const { email } = await seedAccount(["user", "admin"]);
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).first().fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/admin$/);
  await page.screenshot({ path: `${dir}/admin.png`, fullPage: true });
  await page.goto("/admin/usuarias");
  await page.screenshot({ path: `${dir}/admin-usuarias.png`, fullPage: true });
  await page.goto("/app/configuracoes");
  await page.screenshot({ path: `${dir}/configuracoes.png`, fullPage: true });
});

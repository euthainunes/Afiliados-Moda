import { test } from "./fixtures";
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

  // Telas da Fase 4 (dependem do catálogo importado em looks.spec.ts, que roda antes).
  await page.goto("/app/catalogo");
  await page.screenshot({ path: `${dir}/catalogo.png`, fullPage: true });
  await page.getByRole("link", { name: /Vestido Midi Floral/ }).click();
  await page.waitForURL(/\/app\/produtos\//);
  await page.screenshot({ path: `${dir}/produto.png`, fullPage: true });
  await page.getByRole("button", { name: "Adicionar ao look" }).click();
  await page.waitForURL(/\/app\/looks\/[0-9a-f-]{36}$/);
  await page.getByRole("searchbox", { name: "Buscar peças" }).fill("sandalia");
  await page.getByRole("button", { name: /Adicionar Sandália/ }).click();
  await page.getByRole("button", { name: /Remover Sandália/ }).waitFor();
  await page.screenshot({ path: `${dir}/montador.png`, fullPage: true });
  await page.goto("/looks");
  await page.screenshot({ path: `${dir}/descobrir.png`, fullPage: true });
  await page.locator("main ul li a").first().click();
  await page.waitForURL(/\/l\//);
  await page.screenshot({ path: `${dir}/look-publico.png`, fullPage: true });
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  const img = await page.request.get(new URL(og!).pathname);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(`${dir}/og-image.png`, await img.body());
});

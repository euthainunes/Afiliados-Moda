import { expect, test, type Page } from "@playwright/test";
import { clickCount, PASSWORD, seedAccount, seedFictitiousBrand } from "./support";

// Fluxo central: importar catálogo → montar look → publicar → compartilhar → clique rastreado.
test.describe.configure({ mode: "serial" });

async function loginAs(page: Page, email: string) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).first().fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(app|admin)$/);
}

test("operadora importa o catálogo fictício pelo painel", async ({ page }) => {
  await seedFictitiousBrand();
  const { email } = await seedAccount(["user", "operator"]);
  await loginAs(page, email);
  await page.goto("/admin/catalogo");
  await page.getByRole("button", { name: "Importar agora" }).click();
  await expect(page.getByText("Importação concluída.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/75 itens lidos/).first()).toBeVisible();
});

test("usuária monta, publica e compartilha um look; o clique é rastreado", async ({ page, context }, info) => {
  const { email } = await seedAccount();
  const title = `Look E2E ${info.project.name} ${Date.now()}`;
  await loginAs(page, email);

  // Catálogo: busca sem acento e filtro
  await page.goto("/app/catalogo");
  await page.getByRole("searchbox", { name: "Buscar peças" }).fill("vestido linho");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByText("1 peça(s) encontrada(s)")).toBeVisible();
  await page.getByRole("link", { name: /Vestido Longo Linho/ }).click();

  // Detalhe do produto → novo look
  await expect(page.getByRole("heading", { name: "Vestido Longo Linho" })).toBeVisible();
  await page.getByRole("button", { name: "Adicionar ao look" }).click();
  await page.waitForURL(/\/app\/looks\/[0-9a-f-]{36}$/);

  // Montador: tentar publicar sem requisitos mostra os problemas
  await page.getByRole("button", { name: "Publicar look" }).click();
  await expect(page.getByText(/Dê um título/)).toBeVisible();

  // Adiciona peça pela busca do montador
  await page.getByRole("searchbox", { name: "Buscar peças" }).fill("bolsa palha");
  await page.getByRole("button", { name: "Adicionar Bolsa de Palha" }).click();
  await expect(page.getByRole("button", { name: "Remover Bolsa de Palha" })).toBeVisible();

  // Reordena e preenche detalhes
  await page.getByRole("button", { name: "Mover Bolsa de Palha para cima" }).click();
  await expect(page.locator("ol li").first()).toContainText("Bolsa de Palha");
  await page.getByLabel("Título").fill(title);
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Alterações salvas.")).toBeVisible();

  await page.getByRole("button", { name: "Publicar look" }).click();
  await expect(page.getByText("Seu look está publicado. Compartilhe o link abaixo.")).toBeVisible();
  const url = await page.getByLabel("Link do look").inputValue();
  expect(url).toMatch(/\/l\/look-e2e-[a-z0-9-]+$/);
  await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /wa\.me\/\?text=/);

  // Página pública com metadados de compartilhamento
  const visitor = await context.browser()!.newContext();
  const pub = await visitor.newPage();
  await pub.goto(new URL(url).pathname);
  await expect(pub.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(pub.locator('meta[property="og:title"]')).toHaveAttribute("content", title);
  const ogImage = await pub.locator('meta[property="og:image"]').getAttribute("content");
  expect(ogImage).toBeTruthy();
  const img = await pub.request.get(new URL(ogImage!).pathname);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toContain("image/png");

  // Clique em "Ver na loja": o link passa pelo redirecionador, que responde 302 para a loja com o identificador de origem.
  // (A loja é fictícia; conferimos o destino do redirecionamento sem navegar até ela.)
  const link = pub.getByRole("link", { name: /Ver Bolsa de Palha na loja/ });
  await expect(link).toHaveAttribute("rel", /sponsored/);
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/r\/[0-9A-Za-z]{10}$/);
  const redirect = await pub.request.get(href!, { maxRedirects: 0, headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0 Safari/537.36" } });
  expect(redirect.status()).toBe(302);
  expect(redirect.headers()["cache-control"]).toContain("no-store");
  const shopUrl = new URL(redirect.headers()["location"]);
  expect(shopUrl.hostname).toBe("loja-ficticia.example");
  expect(shopUrl.searchParams.get("utmi_cp")).toMatch(/^[0-9A-Z]{26}$/);
  expect(shopUrl.searchParams.get("utm_campaign")).toBe("teste-ficticio");
  expect(await clickCount(title)).toBe(1);
  await visitor.close();

  // Descoberta pública lista o look
  await page.goto("/looks");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("usuária não abre o montador de look de outra pessoa", async ({ page }) => {
  const owner = await seedAccount();
  await loginAs(page, owner.email);
  await page.goto("/app/looks");
  await page.getByRole("button", { name: "+ Novo look" }).click();
  await page.waitForURL(/\/app\/looks\/[0-9a-f-]{36}$/);
  const editorPath = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "Sair" }).first().click();

  const other = await seedAccount();
  await loginAs(page, other.email);
  const response = await page.goto(editorPath);
  expect(response?.status()).toBe(404);
});

test("look inexistente responde 404 e links inválidos voltam à descoberta", async ({ page }) => {
  expect((await page.goto("/l/nao-existe-abc123"))?.status()).toBe(404);
  await page.goto("/r/XXXXXXXXXX");
  await expect(page).toHaveURL(/\/looks\?link=invalido$/);
  await expect(page.getByText("Este link de produto não está mais disponível.")).toBeVisible();
});

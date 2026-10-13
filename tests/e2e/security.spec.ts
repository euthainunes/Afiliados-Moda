import { expect, test } from "./fixtures";
import { PASSWORD, seedAccount } from "./support";
import { stepAt, totpAt } from "../../src/modules/identity/totp";

test("páginas saem com CSP de nonce e nenhum script é bloqueado", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (/Content Security Policy|Refused to (execute|load)/i.test(msg.text())) violations.push(msg.text());
  });
  for (const path of ["/", "/looks", "/entrar", "/faq"]) {
    const response = await page.goto(path);
    const csp = response?.headers()["content-security-policy"] ?? "";
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce, path).toBeTruthy();
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    // Os scripts do Next carregam o nonce desta resposta.
    const scriptNonces = await page.locator("script[src]").evaluateAll((els) => els.map((el) => (el as HTMLScriptElement).nonce));
    expect(scriptNonces.length).toBeGreaterThan(0);
    for (const n of scriptNonces) expect(n).toBe(nonce);
  }
  // Nonce diferente a cada requisição.
  const a = (await page.goto("/"))?.headers()["content-security-policy"];
  const b = (await page.goto("/"))?.headers()["content-security-policy"];
  expect(a).not.toBe(b);
  expect(violations).toEqual([]);
});

test("criadora ativa a verificação em duas etapas e passa a ser desafiada no login", async ({ page }) => {
  const { email } = await seedAccount();
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).first().fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto("/app/configuracoes");
  await page.getByRole("link", { name: "Ativar" }).click();
  await page.getByRole("button", { name: "Ativar verificação em duas etapas" }).click();
  await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
  const secret = (await page.getByTestId("mfa-secret").getAttribute("data-secret"))!;
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);

  await page.getByLabel("Código de 6 dígitos").fill("000000");
  await page.getByRole("button", { name: "Confirmar e ativar" }).click();
  await expect(page.getByText(/Código incorreto/)).toBeVisible();

  const enrollStep = stepAt(Date.now());
  await page.getByLabel("Código de 6 dígitos").fill(totpAt(secret, enrollStep));
  await page.getByRole("button", { name: "Confirmar e ativar" }).click();
  const codes = page.getByRole("list", { name: "Códigos de recuperação" }).getByRole("listitem");
  await expect(codes).toHaveCount(10);
  await page.getByRole("link", { name: "Concluir" }).click();
  await expect(page.getByText("Ativa", { exact: true })).toBeVisible();

  // Sai e entra de novo: agora a senha não basta.
  await page.getByRole("button", { name: "Sair" }).first().click();
  await page.goto("/entrar?next=/app/recompensas");
  await page.getByLabel("E-mail", { exact: true }).first().fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/entrar\/verificacao/);
  await expect(page.getByRole("heading", { name: "Verificação em duas etapas" })).toBeVisible();

  // Com a sessão pendente, a área logada continua fechada.
  await page.goto("/app");
  await expect(page).toHaveURL(/\/entrar\/verificacao/);

  await page.getByLabel("Código", { exact: true }).fill("111111");
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page.getByText(/Código incorreto ou expirado/)).toBeVisible();

  // Código do intervalo seguinte (o da ativação não pode ser reutilizado).
  await page.getByLabel("Código", { exact: true }).fill(totpAt(secret, Math.max(stepAt(Date.now()), enrollStep + 1)));
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

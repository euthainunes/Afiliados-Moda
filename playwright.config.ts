import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const env = {
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://afiliados:afiliados_dev@localhost:5432/afiliados_test",
  AUTH_SECRET: "segredo-de-teste-e2e-com-mais-de-32-caracteres-0123",
  APP_URL: `http://localhost:${PORT}`,
  MAIL_DRIVER: "console",
};

// Testes de ponta a ponta contra o build de produção, com banco de teste e dados fictícios.
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "celular", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // O cookie de sessão usa Secure; navegadores aceitam isso em http://localhost.
    command: `pnpm next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    env: { ...env, NODE_ENV: "test" },
    timeout: 60_000,
  },
});

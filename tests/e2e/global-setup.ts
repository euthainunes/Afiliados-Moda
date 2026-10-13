import { execFileSync } from "node:child_process";
import resetDatabase from "../support/global-setup";
import { PASSWORD } from "./support";

// Banco de testes limpo + dados de DEMONSTRAÇÃO completos (mesmo script usado em desenvolvimento).
export default async function setup() {
  await resetDatabase();
  execFileSync("pnpm", ["exec", "tsx", "--conditions=react-server", "--tsconfig", "tsconfig.json", "scripts/seed.mts"], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://afiliados:afiliados_dev@localhost:5432/afiliados_test",
      AUTH_SECRET: "segredo-de-teste-e2e-com-mais-de-32-caracteres-0123",
      APP_ENV: "development",
      MAIL_DRIVER: "memory",
      SEED_PASSWORD: PASSWORD,
      DOTENV_PATH: "/dev/null",
    },
  });
}

// Carrega os DADOS DE DEMONSTRAÇÃO (fictícios). Nunca executa em produção.
// Uso: pnpm db:seed  (senha das contas fictícias: SEED_PASSWORD ou SEED_ADMIN_PASSWORD do .env.local)
import { config } from "dotenv";
config({ path: process.env.DOTENV_PATH ?? ".env.local" });

const password = process.env.SEED_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD;
if (process.env.APP_ENV === "production") throw new Error("Dados de demonstração não podem ser carregados em produção.");
if (!password || password.length < 10) throw new Error("Defina SEED_PASSWORD (mínimo de 10 caracteres) no .env.local.");

const { seedDemo } = await import("@/demo/seed");
await seedDemo({ password });
process.exit(0);

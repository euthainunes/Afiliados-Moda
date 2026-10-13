// APAGA o banco local e recria tudo (migrações + demonstração). Somente desenvolvimento.
// Uso: pnpm db:reset
import { config } from "dotenv";
import postgres from "postgres";
config({ path: process.env.DOTENV_PATH ?? ".env.local" });

const url = process.env.DATABASE_URL ?? "";
if (process.env.APP_ENV && process.env.APP_ENV !== "development") throw new Error("db:reset só pode ser usado em desenvolvimento.");
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1"].includes(host)) throw new Error(`Recusado: o banco ${host} não é local.`);

const sql = postgres(url, { max: 1, onnotice: () => {} });
await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
await sql.end();
console.info("Banco local apagado.");

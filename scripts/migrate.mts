// Aplica as migrações versionadas em db/migrations. Uso: pnpm db:migrate
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: process.env.DOTENV_PATH ?? ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida.");

const client = postgres(url, { max: 1, onnotice: () => {} });
await migrate(drizzle(client), { migrationsFolder: "db/migrations" });
await client.end();
console.info("Migrações aplicadas.");

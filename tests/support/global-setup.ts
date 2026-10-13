import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Recria o schema do banco de teste do zero e aplica as migrações versionadas.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://afiliados:afiliados_dev@localhost:5432/afiliados_test";
  if (!/_test\b|_test$/.test(new URL(url).pathname)) {
    throw new Error("Por segurança, os testes só rodam em bancos cujo nome termina em _test.");
  }
  const client = postgres(url, { max: 1, onnotice: () => {} });
  await client.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(client), { migrationsFolder: "db/migrations" });
  await client.end();
}

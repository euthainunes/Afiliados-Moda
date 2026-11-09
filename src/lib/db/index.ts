import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

function connect() {
  return drizzle(postgres(env().DATABASE_URL, { max: 10 }), { schema });
}

export type Db = ReturnType<typeof connect>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Reaproveita a conexão entre recargas do servidor de desenvolvimento.
const globalForDb = globalThis as unknown as { db?: Db };
let instance: Db | undefined;

function getDb(): Db {
  if (!instance) {
    instance = globalForDb.db ?? connect();
    if (process.env.NODE_ENV !== "production") globalForDb.db = instance;
  }
  return instance;
}

// A conexão só é aberta no primeiro uso: o build e as páginas que não acessam o banco não precisam
// de DATABASE_URL (ex.: publicar a aplicação antes de o banco existir).
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

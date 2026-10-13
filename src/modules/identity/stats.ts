import { and, count, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { assertCan, type Principal } from "@/modules/access/can";

// Indicadores de contas (docs/02). Definições:
// - total: contas não excluídas; verificadas: com e-mail confirmado; novas: criadas nos últimos 7 dias.
export async function accountStats(actor: Principal) {
  assertCan(actor, "users.read");
  const notDeleted = sql`${users.status} <> 'deleted'`;
  const since = new Date(Date.now() - 7 * 24 * 3600_000);
  const [[total], [verified], [recent], [suspended]] = await Promise.all([
    db.select({ n: count() }).from(users).where(notDeleted),
    db.select({ n: count() }).from(users).where(and(notDeleted, isNotNull(users.emailVerifiedAt))),
    db.select({ n: count() }).from(users).where(and(notDeleted, gte(users.createdAt, since))),
    db.select({ n: count() }).from(users).where(sql`${users.status} = 'suspended'`),
  ]);
  return { total: total.n, verified: verified.n, recent: recent.n, suspended: suspended.n };
}

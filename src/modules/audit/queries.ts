import { count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs, profiles } from "@/lib/db/schema";
import { assertCan, type Principal } from "@/modules/access/can";

export async function listAuditLogs(actor: Principal, { page = 1, pageSize = 50 }: { page?: number; pageSize?: number }) {
  assertCan(actor, "audit.read");
  const [items, [{ total }]] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        actorName: profiles.displayName,
        actorRoles: auditLogs.actorRoles,
        before: auditLogs.before,
        after: auditLogs.after,
        occurredAt: auditLogs.occurredAt,
      })
      .from(auditLogs)
      .leftJoin(profiles, eq(profiles.userId, auditLogs.actorId))
      .orderBy(desc(auditLogs.occurredAt))
      .limit(pageSize)
      .offset((Math.max(1, page) - 1) * pageSize),
    db.select({ total: count() }).from(auditLogs),
  ]);
  return { items, total };
}

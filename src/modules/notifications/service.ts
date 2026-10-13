import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

export type NotificationInput = { userId: string; type: string; title: string; body: string; link?: string | null; dedupeKey: string; isDemo?: boolean };

// Idempotente: o mesmo evento (dedupeKey) nunca gera duas notificações.
export async function notify(input: NotificationInput, tx: Tx | typeof db = db): Promise<void> {
  await tx
    .insert(notifications)
    .values({ ...input, link: input.link ?? null, isDemo: input.isDemo ?? false })
    .onConflictDoNothing({ target: notifications.dedupeKey });
}

export async function listNotifications(userId: string, limit = 50) {
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function unreadCount(userId: string): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return n;
}

export async function markAllRead(userId: string): Promise<void> {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

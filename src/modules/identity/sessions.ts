import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, sessions, userRoles, users } from "@/lib/db/schema";
import { randomToken, sha256 } from "@/lib/crypto";
import { isStaff } from "@/modules/access/can";
import type { Role } from "@/modules/access/permissions";
import { SESSION_POLICY } from "./policies";

export type SessionContext = { ipHash?: string | null; userAgent?: string | null };

export type AuthenticatedSession = {
  sessionId: string;
  expiresAt: Date;
  user: { id: string; email: string; displayName: string; username: string; emailVerified: boolean };
  roles: Role[];
};

async function rolesOf(userId: string): Promise<Role[]> {
  const rows = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  return rows.map((r) => r.role);
}

export async function createSession(userId: string, ctx: SessionContext = {}) {
  const roles = await rolesOf(userId);
  const policy = isStaff(roles) ? SESSION_POLICY.staff : SESSION_POLICY.user;
  const token = randomToken();
  const now = Date.now();
  const expiresAt = new Date(now + policy.idleMs);
  await db.insert(sessions).values({
    id: sha256(token),
    userId,
    expiresAt,
    absoluteExpiresAt: new Date(now + policy.absoluteMs),
    ipHash: ctx.ipHash ?? null,
    userAgent: ctx.userAgent?.slice(0, 300) ?? null,
  });
  return { token, expiresAt };
}

// Valida o token do cookie. Retorna null para sessão inexistente, revogada, expirada ou conta inativa.
export async function validateSessionToken(token: string): Promise<AuthenticatedSession | null> {
  if (!token || token.length > 200) return null;
  const id = sha256(token);
  const now = new Date();
  const [row] = await db
    .select({ session: sessions, user: users, profile: profiles })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(sessions.id, id), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row || row.user.status !== "active") return null;

  const roles = await rolesOf(row.user.id);
  let expiresAt = row.session.expiresAt;

  // Expiração deslizante por inatividade, limitada pela expiração absoluta.
  if (now.getTime() - row.session.lastSeenAt.getTime() > SESSION_POLICY.touchIntervalMs) {
    const policy = isStaff(roles) ? SESSION_POLICY.staff : SESSION_POLICY.user;
    expiresAt = new Date(Math.min(now.getTime() + policy.idleMs, row.session.absoluteExpiresAt.getTime()));
    await db.update(sessions).set({ lastSeenAt: now, expiresAt }).where(eq(sessions.id, id));
  }

  return {
    sessionId: id,
    expiresAt,
    user: {
      id: row.user.id,
      email: row.user.email,
      displayName: row.profile.displayName,
      username: row.profile.username,
      emailVerified: !!row.user.emailVerifiedAt,
    },
    roles,
  };
}

export async function revokeSessionByToken(token: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sha256(token)));
}

export async function revokeSession(userId: string, sessionId: string): Promise<boolean> {
  const rows = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return rows.length > 0;
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
  const conditions = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
  if (exceptSessionId) conditions.push(ne(sessions.id, exceptSessionId));
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(...conditions));
}

export async function listActiveSessions(userId: string) {
  return db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      userAgent: sessions.userAgent,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(sessions.lastSeenAt);
}

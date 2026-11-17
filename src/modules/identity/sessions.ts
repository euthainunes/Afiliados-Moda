import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, sessions, userMfa, userRoles, users } from "@/lib/db/schema";
import { randomToken, sha256 } from "@/lib/crypto";
import { staffMfaRequired } from "@/lib/env";
import { isStaff, requiresMfa } from "@/modules/access/can";
import { MFA_REQUIRED_ROLES, type Role } from "@/modules/access/permissions";
import { SESSION_POLICY } from "./policies";

export type SessionContext = { ipHash?: string | null; userAgent?: string | null };

export type AuthenticatedSession = {
  sessionId: string;
  expiresAt: Date;
  user: { id: string; email: string; displayName: string; username: string; emailVerified: boolean };
  // Papéis efetivos desta sessão. Papéis de equipe ficam suspensos enquanto o segundo fator exigido não for cadastrado.
  roles: Role[];
  mfa: {
    enabled: boolean;
    // Segundo fator ainda não confirmado nesta sessão (só existe com allowPending).
    pending: boolean;
    // Conta da equipe sem segundo fator, num ambiente em que ele é obrigatório.
    enrollmentRequired: boolean;
  };
};

async function rolesOf(userId: string): Promise<Role[]> {
  const rows = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  return rows.map((r) => r.role);
}

export async function createSession(userId: string, ctx: SessionContext = {}, { pendingMfa = false } = {}) {
  const roles = await rolesOf(userId);
  const policy = isStaff(roles) ? SESSION_POLICY.staff : SESSION_POLICY.user;
  const token = randomToken();
  const now = Date.now();
  // Enquanto o segundo fator não é confirmado, a sessão vale só alguns minutos.
  const expiresAt = new Date(now + (pendingMfa ? SESSION_POLICY.pendingMfaMs : policy.idleMs));
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

// Chamado após a confirmação do segundo fator: devolve à sessão a duração normal.
export async function sessionPolicyExpiry(userId: string, absoluteExpiresAt: Date): Promise<Date> {
  const policy = isStaff(await rolesOf(userId)) ? SESSION_POLICY.staff : SESSION_POLICY.user;
  return new Date(Math.min(Date.now() + policy.idleMs, absoluteExpiresAt.getTime()));
}

// Valida o token do cookie. Retorna null para sessão inexistente, revogada, expirada, conta inativa
// ou — salvo com allowPending — sessão cujo segundo fator ainda não foi confirmado.
export async function validateSessionToken(token: string, { allowPending = false } = {}): Promise<AuthenticatedSession | null> {
  if (!token || token.length > 200) return null;
  const id = sha256(token);
  const now = new Date();
  const [row] = await db
    .select({ session: sessions, user: users, profile: profiles, mfaEnabledAt: userMfa.enabledAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(userMfa, eq(userMfa.userId, users.id))
    .where(and(eq(sessions.id, id), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row || row.user.status !== "active") return null;

  const mfaEnabled = !!row.mfaEnabledAt;
  const mfaVerified = !!row.session.mfaVerifiedAt;
  const pending = mfaEnabled && !mfaVerified;
  if (pending && !allowPending) return null;

  const assignedRoles = await rolesOf(row.user.id);
  const enrollmentRequired = !mfaEnabled && requiresMfa(assignedRoles) && staffMfaRequired();
  const roles = pending || enrollmentRequired ? assignedRoles.filter((r) => !MFA_REQUIRED_ROLES.includes(r)) : assignedRoles;
  let expiresAt = row.session.expiresAt;

  // Expiração deslizante por inatividade, limitada pela expiração absoluta.
  if (now.getTime() - row.session.lastSeenAt.getTime() > SESSION_POLICY.touchIntervalMs) {
    const policy = isStaff(assignedRoles) ? SESSION_POLICY.staff : SESSION_POLICY.user;
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
    mfa: { enabled: mfaEnabled, pending, enrollmentRequired },
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

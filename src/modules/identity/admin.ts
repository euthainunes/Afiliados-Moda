import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, userRoles, users } from "@/lib/db/schema";
import { assertCan, type Principal } from "@/modules/access/can";
import { recordAudit } from "@/modules/audit/service";
import { revokeAllSessions } from "./sessions";

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

export type UserListItem = {
  id: string;
  displayName: string;
  username: string;
  email: string;
  status: "active" | "suspended" | "deleted";
  emailVerified: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
};

// Lista de contas para o painel. Sem a permissão users.read_pii, o e-mail é mascarado.
export async function listUsers(
  actor: Principal,
  { query, page = 1, pageSize = 25 }: { query?: string; page?: number; pageSize?: number },
): Promise<{ items: UserListItem[]; total: number }> {
  assertCan(actor, "users.read");
  const canSeePii = actor.roles.includes("admin");
  const q = query?.trim();
  const filter = q
    ? or(ilike(profiles.displayName, `%${q}%`), ilike(profiles.username, `%${q}%`), canSeePii ? ilike(users.email, `%${q}%`) : undefined)
    : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: users.id,
        displayName: profiles.displayName,
        username: profiles.username,
        email: users.email,
        status: users.status,
        emailVerifiedAt: users.emailVerifiedAt,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(filter)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset((Math.max(1, page) - 1) * pageSize),
    db.select({ total: count() }).from(users).innerJoin(profiles, eq(profiles.userId, users.id)).where(filter),
  ]);

  if (canSeePii && q) {
    await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "users.search_pii", entityType: "user" });
  }

  return {
    total,
    items: rows.map(({ emailVerifiedAt, ...r }) => ({
      ...r,
      email: canSeePii ? r.email : maskEmail(r.email),
      emailVerified: !!emailVerifiedAt,
    })),
  };
}

export async function setUserStatus(
  actor: Principal,
  userId: string,
  status: "active" | "suspended",
  reason: string,
  ctx: { ipHash?: string | null } = {},
): Promise<void> {
  assertCan(actor, "users.suspend");
  if (actor.id === userId) throw new Error("Não é possível alterar a própria conta por aqui.");
  if (reason.trim().length < 5) throw new Error("Informe o motivo (mínimo de 5 caracteres).");

  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!target || target.status === "deleted") throw new Error("Conta não encontrada.");

  // Operadores não podem suspender contas da equipe interna.
  if (!actor.roles.includes("admin")) {
    const staff = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), or(eq(userRoles.role, "admin"), eq(userRoles.role, "operator"))));
    if (staff.length > 0) throw new Error("Somente administradores podem alterar contas da equipe.");
  }

  await db.transaction(async (tx) => {
    await tx.update(users).set({ status }).where(eq(users.id, userId));
    await recordAudit(
      {
        actorId: actor.id,
        actorRoles: actor.roles,
        action: status === "suspended" ? "user.suspended" : "user.reactivated",
        entityType: "user",
        entityId: userId,
        before: { status: target.status },
        after: { status, reason: reason.trim() },
        ipHash: ctx.ipHash,
      },
      tx,
    );
  });
  if (status === "suspended") await revokeAllSessions(userId);
}

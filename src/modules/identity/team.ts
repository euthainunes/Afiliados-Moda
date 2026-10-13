import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, userRoles, users } from "@/lib/db/schema";
import { assertCan, type Principal } from "@/modules/access/can";
import { recordAudit } from "@/modules/audit/service";
import { revokeAllSessions } from "./sessions";

export class TeamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamError";
  }
}

export type StaffRole = "operator" | "admin";

export async function listTeam(actor: Principal) {
  assertCan(actor, "team.manage");
  const rows = await db
    .select({ userId: users.id, email: users.email, displayName: profiles.displayName, role: userRoles.role, grantedAt: userRoles.grantedAt, status: users.status })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(inArray(userRoles.role, ["operator", "admin"]))
    .orderBy(asc(profiles.displayName));
  return rows;
}

// Concede um papel interno a uma conta existente e verificada. As sessões da pessoa são encerradas
// para que a nova política (sessão curta de equipe) passe a valer no próximo login.
export async function grantRole(actor: Principal, email: string, role: StaffRole): Promise<void> {
  assertCan(actor, "team.manage");
  const target = await db.query.users.findFirst({ where: eq(users.email, email.trim().toLowerCase()) });
  if (!target || target.status !== "active") throw new TeamError("Não há conta ativa com este e-mail. A pessoa precisa se cadastrar antes.");
  if (!target.emailVerifiedAt) throw new TeamError("A conta ainda não confirmou o e-mail.");
  await db.transaction(async (tx) => {
    const inserted = await tx.insert(userRoles).values({ userId: target.id, role, grantedBy: actor.id }).onConflictDoNothing().returning();
    if (inserted.length === 0) throw new TeamError("Esta pessoa já tem este papel.");
    await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "team.role_granted", entityType: "user", entityId: target.id, after: { role } }, tx);
  });
  await revokeAllSessions(target.id);
}

export async function revokeRole(actor: Principal, userId: string, role: StaffRole): Promise<void> {
  assertCan(actor, "team.manage");
  await db.transaction(async (tx) => {
    if (role === "admin") {
      // Serializa revogações de administração para garantir que sempre reste ao menos uma administradora.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('team:admins'))`);
      const admins = await tx.select({ userId: userRoles.userId }).from(userRoles).where(eq(userRoles.role, "admin"));
      if (admins.length <= 1 && admins[0]?.userId === userId) throw new TeamError("É preciso manter ao menos uma administradora.");
      if (userId === actor.id) throw new TeamError("Peça a outra administradora para remover o seu acesso de administração.");
    }
    const removed = await tx.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.role, role))).returning();
    if (removed.length === 0) throw new TeamError("Esta pessoa não tem este papel.");
    await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "team.role_revoked", entityType: "user", entityId: userId, before: { role } }, tx);
  });
  await revokeAllSessions(userId);
}

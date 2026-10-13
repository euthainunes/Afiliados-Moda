import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, userRoles, users } from "@/lib/db/schema";
import type { Role } from "@/modules/access/permissions";
import { hashPassword } from "@/modules/identity/password";

export const TEST_PASSWORD = "senha-ficticia-de-teste";

// E-mails fictícios únicos por teste, com domínio reservado .test.
export function fakeEmail(prefix = "pessoa") {
  return `${prefix}-${randomUUID().slice(0, 8)}@exemplo.test`;
}

export function fakeIp() {
  return `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

export async function createUser({ roles = ["user"], verified = true }: { roles?: Role[]; verified?: boolean } = {}) {
  const email = fakeEmail(roles.includes("admin") ? "admin" : roles.includes("operator") ? "operador" : "usuaria");
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: await hashPassword(TEST_PASSWORD), emailVerifiedAt: verified ? new Date() : null })
    .returning();
  await db.insert(profiles).values({ userId: user.id, displayName: "Pessoa Fictícia", username: `f_${user.id.slice(0, 12)}` });
  await db.insert(userRoles).values(roles.map((role) => ({ userId: user.id, role })));
  return { ...user, roles, principal: { id: user.id, roles } };
}

export async function getUser(id: string) {
  return db.query.users.findFirst({ where: eq(users.id, id) });
}

// Cria a conta administrativa FICTÍCIA de desenvolvimento. Nunca execute em produção.
// Uso: pnpm db:seed (lê SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD de .env.local)
import { config } from "dotenv";
config({ path: process.env.DOTENV_PATH ?? ".env.local" });

const { NODE_ENV, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
if (NODE_ENV === "production") throw new Error("Seed de desenvolvimento não pode rodar em produção.");
if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD || SEED_ADMIN_PASSWORD.length < 10) {
  throw new Error("Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (mínimo de 10 caracteres).");
}
if (!SEED_ADMIN_EMAIL.endsWith(".test")) {
  throw new Error("Use um e-mail fictício com domínio .test (ex.: admin@exemplo.test).");
}

const { eq } = await import("drizzle-orm");
const { db } = await import("@/lib/db");
const { profiles, userRoles, users, consents } = await import("@/lib/db/schema");
const { hashPassword } = await import("@/modules/identity/password");
const { LEGAL_VERSIONS } = await import("@/modules/identity/policies");

const email = SEED_ADMIN_EMAIL.toLowerCase();
const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
if (existing) {
  console.info(`Conta fictícia ${email} já existe; nada a fazer.`);
} else {
  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email, passwordHash: await hashPassword(SEED_ADMIN_PASSWORD), emailVerifiedAt: new Date() })
      .returning({ id: users.id });
    await tx.insert(profiles).values({ userId: user.id, displayName: "Admin Fictícia (dev)", username: "admin_ficticia" });
    await tx.insert(userRoles).values([
      { userId: user.id, role: "user" },
      { userId: user.id, role: "admin" },
    ]);
    await tx.insert(consents).values(
      (Object.keys(LEGAL_VERSIONS) as (keyof typeof LEGAL_VERSIONS)[]).map((document) => ({
        userId: user.id,
        document,
        version: LEGAL_VERSIONS[document],
      })),
    );
  });
  console.info(`Conta administrativa FICTÍCIA criada: ${email}`);
}
process.exit(0);

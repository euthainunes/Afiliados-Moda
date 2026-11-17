import { createHmac } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { sessions, userIdentities, userRoles, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { randomToken, safeEqual } from "@/lib/crypto";
import type { GoogleClaims } from "@/integrations/google/oidc";
import { recordAudit } from "@/modules/audit/service";
import { hashPassword } from "./password";
import { createAccount, openSession, type RequestContext } from "./service";
import { signUpSchema } from "./validation";

export const GOOGLE_PROVIDER = "google";
const PENDING_TTL_MS = 15 * 60_000;

export type SocialSignInResult =
  | { kind: "session"; token: string; expiresAt: Date; staff: boolean; mfaRequired: boolean; home: string; linked: boolean }
  | { kind: "needs_signup"; pending: string }
  | { kind: "refused"; reason: "suspended" | "deleted" };

// Cadastro iniciado pelo Google ainda sem aceite dos termos: os dados do Google viajam num valor assinado
// (HMAC com AUTH_SECRET) e com validade curta, guardado em cookie HttpOnly.
export function signPending(claims: GoogleClaims, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...claims, exp: now + PENDING_TTL_MS })).toString("base64url");
  const mac = createHmac("sha256", env().AUTH_SECRET).update(`google-pending:${body}`).digest("base64url");
  return `${body}.${mac}`;
}

export function readPending(value: string | undefined, now = Date.now()): GoogleClaims | null {
  if (!value || value.length > 2000) return null;
  const [body, mac] = value.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", env().AUTH_SECRET).update(`google-pending:${body}`).digest("base64url");
  if (!safeEqual(mac, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof data.exp !== "number" || data.exp < now || typeof data.sub !== "string" || typeof data.email !== "string") return null;
    return { sub: data.sub, email: data.email, name: typeof data.name === "string" ? data.name : null };
  } catch {
    return null;
  }
}

// Regras de vínculo:
// 1. Conta já ligada a este "sub" do Google → entra nela.
// 2. Conta com o mesmo e-mail (o Google confirmou que a pessoa controla o endereço) → vincula e entra.
//    Se essa conta ainda NÃO tinha confirmado o e-mail, quem a criou pode não ser a dona do endereço
//    (pré-cadastro malicioso): a senha antiga é invalidada e as sessões são encerradas antes do vínculo.
// 3. Nenhuma conta → cadastro pendente (aceite de termos e maioridade continua obrigatório).
// Segundo fator, suspensão e políticas de sessão valem igual ao login por senha.
export async function signInWithGoogle(claims: GoogleClaims, ctx: RequestContext = {}): Promise<SocialSignInResult> {
  const [identity] = await db
    .select({ userId: userIdentities.userId })
    .from(userIdentities)
    .where(and(eq(userIdentities.provider, GOOGLE_PROVIDER), eq(userIdentities.subject, claims.sub)));

  let user = identity ? await db.query.users.findFirst({ where: eq(users.id, identity.userId) }) : undefined;
  let linked = false;

  if (!user) {
    user = await db.query.users.findFirst({ where: eq(users.email, claims.email) });
    if (!user) return { kind: "needs_signup", pending: signPending(claims) };
    if (user.status !== "active") return { kind: "refused", reason: user.status === "suspended" ? "suspended" : "deleted" };

    const target = user;
    const roles = (await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, target.id))).map((r) => r.role);
    const unverified = !target.emailVerifiedAt;
    const unusable = unverified ? await hashPassword(randomToken(32)) : null;
    await db.transaction(async (tx) => {
      // Uma conta só pode ter uma conta Google; um "sub" só pode estar em uma conta (índices únicos).
      await tx.insert(userIdentities).values({ userId: target.id, provider: GOOGLE_PROVIDER, subject: claims.sub });
      if (unverified && unusable) {
        await tx.update(users).set({ emailVerifiedAt: new Date(), passwordHash: unusable, hasPassword: false }).where(eq(users.id, target.id));
        await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, target.id), isNull(sessions.revokedAt)));
      }
      await recordAudit(
        { actorId: target.id, actorRoles: roles, action: "auth.google_linked", entityType: "user", entityId: target.id, after: { senhaInvalidada: unverified }, ipHash: ctx.ipHash },
        tx,
      );
    });
    linked = true;
  }

  if (user.status === "suspended") return { kind: "refused", reason: "suspended" };
  if (user.status !== "active") return { kind: "refused", reason: "deleted" };

  await db
    .update(userIdentities)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(userIdentities.provider, GOOGLE_PROVIDER), eq(userIdentities.subject, claims.sub)));
  return { kind: "session", linked, ...(await openSession(user.id, ctx)) };
}

const completeSchema = signUpSchema.pick({ displayName: true, acceptTerms: true, isAdult: true });

export class SocialSignupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialSignupError";
  }
}

// Conclui o cadastro iniciado pelo Google. A conta nasce com e-mail confirmado (o Google o verificou) e
// sem senha utilizável; a pessoa pode criar uma senha depois por "Esqueci minha senha".
export async function completeGoogleSignup(pending: string | undefined, raw: unknown, ctx: RequestContext = {}) {
  const claims = readPending(pending);
  if (!claims) throw new SocialSignupError("O tempo para concluir o cadastro acabou. Entre com o Google novamente.");
  const input = completeSchema.parse(raw);

  const existing = await db.query.users.findFirst({ where: eq(users.email, claims.email) });
  if (existing) throw new SocialSignupError("Já existe uma conta com este e-mail. Entre com o Google novamente para vinculá-la.");

  const userId = await createAccount(
    { email: claims.email, displayName: input.displayName, passwordHash: await hashPassword(randomToken(32)), emailVerifiedAt: new Date(), hasPassword: false },
    ctx,
    async (tx, id) => {
      await tx.insert(userIdentities).values({ userId: id, provider: GOOGLE_PROVIDER, subject: claims.sub, lastUsedAt: new Date() });
    },
  );
  return openSession(userId, ctx);
}


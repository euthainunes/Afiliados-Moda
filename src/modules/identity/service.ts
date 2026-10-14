import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { authTokens, consents, profiles, userRoles, users } from "@/lib/db/schema";
import { hmac, randomToken, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import { recordAudit } from "@/modules/audit/service";
import { isStaff } from "@/modules/access/can";
import { getDummyHash, hashPassword, verifyPassword } from "./password";
import { isMfaEnabled } from "./mfa";
import { LEGAL_VERSIONS, RATE_LIMITS, TOKEN_TTL } from "./policies";
import { consumeRateLimit, resetRateLimit } from "./rate-limit";
import { createSession, revokeAllSessions, type SessionContext } from "./sessions";
import type { SignUpInput } from "./validation";

export type RequestContext = SessionContext & { ip?: string | null };

type TokenType = keyof typeof TOKEN_TTL;

function ipKey(ctx: RequestContext) {
  return ctx.ipHash ?? (ctx.ip ? hmac(ctx.ip) : "desconhecido");
}

function link(path: string, token: string) {
  return `${env().APP_URL}${path}?token=${encodeURIComponent(token)}`;
}

async function issueToken(userId: string, type: TokenType): Promise<string> {
  // Invalida tokens anteriores do mesmo tipo: só o link mais recente funciona.
  await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.type, type), isNull(authTokens.usedAt)));
  const token = randomToken();
  await db.insert(authTokens).values({
    userId,
    type,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL[type]),
  });
  return token;
}

// Consome um token de uso único de forma atômica (o UPDATE condicional impede uso duplo concorrente).
async function consumeToken(token: string, type: TokenType): Promise<string | null> {
  const [row] = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.tokenHash, sha256(token)),
        eq(authTokens.type, type),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: authTokens.userId });
  return row?.userId ?? null;
}

function slugify(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 20) || "usuaria"
  );
}

async function sendVerificationEmail(userId: string, email: string) {
  const token = await issueToken(userId, "email_verification");
  await sendMail({
    to: email,
    subject: "Confirme seu e-mail",
    text: `Olá! Para ativar sua conta, acesse o link abaixo (válido por 48 horas):\n\n${link("/verificar-email", token)}\n\nSe você não criou uma conta, ignore esta mensagem.`,
  });
}

export type SignUpResult = { ok: true } | { ok: false; error: "rate_limited" };

// Resposta idêntica para e-mail novo ou já cadastrado, para não revelar quem tem conta.
export async function signUp(input: SignUpInput, ctx: RequestContext = {}): Promise<SignUpResult> {
  const limit = await consumeRateLimit(`signup:ip:${ipKey(ctx)}`, RATE_LIMITS.signUpPerIp);
  if (!limit.ok) return { ok: false, error: "rate_limited" };

  const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  if (existing) {
    // Mesmo custo de processamento do cadastro novo (o hash domina o tempo), para o tempo de resposta
    // não revelar quem tem conta; e limite por endereço, para não virar ferramenta de envio em massa.
    await hashPassword(input.password);
    const byEmail = await consumeRateLimit(`email:addr:${hmac(input.email)}`, RATE_LIMITS.emailPerAddress);
    if (!byEmail.ok) return { ok: true };
    await sendMail({
      to: input.email,
      subject: "Tentativa de cadastro com seu e-mail",
      text: `Alguém tentou criar uma conta com este e-mail, que já está cadastrado.\nSe foi você, entre em ${env().APP_URL}/entrar ou recupere sua senha em ${env().APP_URL}/recuperar-senha.`,
    });
    return { ok: true };
  }

  const userId = await createAccount({ email: input.email, displayName: input.displayName, passwordHash: await hashPassword(input.password) }, ctx);
  await sendVerificationEmail(userId, input.email);
  return { ok: true };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Cria usuária, perfil, papel e registros de aceite numa única transação. `onCreated` roda na mesma
// transação (ex.: vincular a conta Google).
export async function createAccount(
  input: { email: string; displayName: string; passwordHash: string; emailVerifiedAt?: Date | null },
  ctx: RequestContext = {},
  onCreated?: (tx: Tx, userId: string) => Promise<void>,
): Promise<string> {
  const base = slugify(input.displayName);
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email: input.email, passwordHash: input.passwordHash, emailVerifiedAt: input.emailVerifiedAt ?? null })
      .returning({ id: users.id });
    // Nome de usuária gerado automaticamente; poderá ser editado no perfil.
    let username = base;
    for (let attempt = 0; attempt < 5; attempt++) {
      const taken = await tx
        .select({ id: profiles.userId })
        .from(profiles)
        .where(sql`lower(${profiles.username}) = ${username}`)
        .limit(1);
      if (taken.length === 0) break;
      username = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    }
    await tx.insert(profiles).values({ userId: user.id, displayName: input.displayName, username });
    await tx.insert(userRoles).values({ userId: user.id, role: "user" });
    await tx.insert(consents).values(
      (Object.keys(LEGAL_VERSIONS) as (keyof typeof LEGAL_VERSIONS)[]).map((document) => ({
        userId: user.id,
        document,
        version: LEGAL_VERSIONS[document],
      })),
    );
    await recordAudit(
      { actorId: user.id, actorRoles: ["user"], action: "user.signup", entityType: "user", entityId: user.id, ipHash: ctx.ipHash },
      tx,
    );
    await onCreated?.(tx, user.id);
    return user.id;
  });
}

export async function verifyEmail(token: string): Promise<boolean> {
  const userId = await consumeToken(token, "email_verification");
  if (!userId) return false;
  await db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));
  return true;
}

export async function resendVerification(email: string, ctx: RequestContext = {}): Promise<{ ok: boolean }> {
  const [byIp, byEmail] = await Promise.all([
    consumeRateLimit(`email:ip:${ipKey(ctx)}`, RATE_LIMITS.emailPerIp),
    consumeRateLimit(`email:addr:${hmac(email)}`, RATE_LIMITS.emailPerAddress),
  ]);
  if (!byIp.ok || !byEmail.ok) return { ok: false };
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (user && user.status === "active" && !user.emailVerifiedAt) {
    await sendVerificationEmail(user.id, user.email);
  }
  return { ok: true };
}

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; staff: boolean; mfaRequired: boolean }
  | { ok: false; error: "invalid" | "rate_limited" | "unverified" | "suspended"; retryAfterSec?: number };

export async function login(email: string, password: string, ctx: RequestContext = {}): Promise<LoginResult> {
  const emailKey = `login:email:${hmac(email)}`;
  const [byIp, byEmail] = await Promise.all([
    consumeRateLimit(`login:ip:${ipKey(ctx)}`, RATE_LIMITS.loginPerIp),
    consumeRateLimit(emailKey, RATE_LIMITS.loginPerEmail),
  ]);
  if (!byIp.ok || !byEmail.ok) {
    const retryAfterSec = Math.max(byIp.ok ? 0 : byIp.retryAfterSec, byEmail.ok ? 0 : byEmail.retryAfterSec);
    return { ok: false, error: "rate_limited", retryAfterSec };
  }

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  // Sempre executa a verificação de senha para não revelar, pelo tempo de resposta, se o e-mail existe.
  const valid = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password);
  if (!user || !valid || user.status === "deleted") return { ok: false, error: "invalid" };
  if (user.status === "suspended") return { ok: false, error: "suspended" };
  if (!user.emailVerifiedAt) return { ok: false, error: "unverified" };

  await resetRateLimit(emailKey);
  return { ok: true, ...(await openSession(user.id, ctx)) };
}

// Abre a sessão depois de a identidade ser comprovada (senha ou provedor externo).
// Com segundo fator ativo, a sessão nasce pendente e só vale depois do código do app (mfa.ts).
export async function openSession(userId: string, ctx: RequestContext = {}) {
  const mfaRequired = await isMfaEnabled(userId);
  const { token, expiresAt } = await createSession(userId, ctx, { pendingMfa: mfaRequired });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));

  const roles = (await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId))).map(
    (r) => r.role,
  );
  const staff = isStaff(roles);
  if (staff && !mfaRequired) {
    await recordAudit({ actorId: userId, actorRoles: roles, action: "staff.login", entityType: "session", ipHash: ctx.ipHash });
  }
  return { token, expiresAt, staff, mfaRequired };
}

// Resposta sempre genérica: não informa se o e-mail tem conta.
export async function requestPasswordReset(email: string, ctx: RequestContext = {}): Promise<{ ok: boolean }> {
  const [byIp, byEmail] = await Promise.all([
    consumeRateLimit(`email:ip:${ipKey(ctx)}`, RATE_LIMITS.emailPerIp),
    consumeRateLimit(`email:addr:${hmac(email)}`, RATE_LIMITS.emailPerAddress),
  ]);
  if (!byIp.ok || !byEmail.ok) return { ok: false };

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (user && user.status === "active") {
    const token = await issueToken(user.id, "password_reset");
    await sendMail({
      to: user.email,
      subject: "Redefinição de senha",
      text: `Recebemos um pedido para redefinir sua senha. O link abaixo vale por 30 minutos e só pode ser usado uma vez:\n\n${link("/redefinir-senha", token)}\n\nSe não foi você, ignore esta mensagem: sua senha continua a mesma.`,
    });
  }
  return { ok: true };
}

export async function resetPassword(token: string, newPassword: string, ctx: RequestContext = {}): Promise<boolean> {
  const userId = await consumeToken(token, "password_reset");
  if (!userId) return false;
  const passwordHash = await hashPassword(newPassword);
  // Quem recebeu o link comprovou acesso ao e-mail: marca como verificado.
  await db
    .update(users)
    .set({ passwordHash, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
    .where(eq(users.id, userId));
  await revokeAllSessions(userId);
  await recordAudit({ actorId: userId, action: "user.password_reset", entityType: "user", entityId: userId, ipHash: ctx.ipHash });
  return true;
}

export type ChangePasswordResult = { ok: true } | { ok: false; error: "invalid_current" };

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentSessionId: string,
): Promise<ChangePasswordResult> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
    return { ok: false, error: "invalid_current" };
  }
  await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, userId));
  // Encerra as demais sessões; a sessão atual continua ativa.
  await revokeAllSessions(userId, currentSessionId);
  await recordAudit({ actorId: userId, action: "user.password_changed", entityType: "user", entityId: userId });
  return { ok: true };
}

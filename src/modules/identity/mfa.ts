import { and, count, eq, gt, isNotNull, isNull, lt, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { mfaRecoveryCodes, sessions, userMfa, userRoles, users } from "@/lib/db/schema";
import { hmac } from "@/lib/crypto";
import { staffMfaRequired } from "@/lib/env";
import { decryptPii, encryptPii } from "@/lib/pii";
import { site } from "@/config/site";
import { assertCan, isStaff, type Principal } from "@/modules/access/can";
import type { Role } from "@/modules/access/permissions";
import { recordAudit } from "@/modules/audit/service";
import { RATE_LIMITS } from "./policies";
import { consumeRateLimit, resetRateLimit } from "./rate-limit";
import { sessionPolicyExpiry } from "./sessions";
import { generateTotpSecret, matchTotp, otpauthUri } from "./totp";
import { randomBytes } from "node:crypto";

export class MfaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MfaError";
  }
}

export const RECOVERY_CODE_COUNT = 10;
// Sem caracteres ambíguos (0/O, 1/I/L).
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function newRecoveryCode(): string {
  const bytes = randomBytes(10);
  const chars = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function recoveryHash(userId: string, code: string): string {
  return hmac(`mfa-recovery:${userId}:${normalizeRecoveryCode(code)}`);
}

async function rolesOf(userId: string): Promise<Role[]> {
  return (await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId))).map((r) => r.role);
}

export type MfaStatus =
  | { state: "disabled" }
  | { state: "enrolling"; secret: string; uri: string }
  | { state: "enabled"; enabledAt: Date; recoveryCodesLeft: number };

export async function getMfaStatus(userId: string): Promise<MfaStatus> {
  const row = await db.query.userMfa.findFirst({ where: eq(userMfa.userId, userId) });
  if (!row) return { state: "disabled" };
  if (!row.enabledAt) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    const secret = decryptPii(row.secretEnc);
    return { state: "enrolling", secret, uri: otpauthUri({ secret, account: user?.email ?? "conta", issuer: site.name }) };
  }
  const [{ left }] = await db
    .select({ left: count() })
    .from(mfaRecoveryCodes)
    .where(and(eq(mfaRecoveryCodes.userId, userId), isNull(mfaRecoveryCodes.usedAt)));
  return { state: "enabled", enabledAt: row.enabledAt, recoveryCodesLeft: left };
}

export async function isMfaEnabled(userId: string): Promise<boolean> {
  const row = await db.query.userMfa.findFirst({ where: and(eq(userMfa.userId, userId), isNotNull(userMfa.enabledAt)) });
  return !!row;
}

// Gera (ou substitui) um segredo ainda não confirmado. Um segundo fator já ativo não é trocado por aqui.
export async function startEnrollment(userId: string): Promise<void> {
  const secretEnc = encryptPii(generateTotpSecret());
  const result = await db
    .insert(userMfa)
    .values({ userId, secretEnc })
    .onConflictDoUpdate({ target: userMfa.userId, set: { secretEnc, lastUsedStep: 0 }, setWhere: isNull(userMfa.enabledAt) })
    .returning({ userId: userMfa.userId });
  if (result.length === 0) throw new MfaError("A verificação em duas etapas já está ativa.");
}

export async function cancelEnrollment(userId: string): Promise<void> {
  await db.delete(userMfa).where(and(eq(userMfa.userId, userId), isNull(userMfa.enabledAt)));
}

async function replaceRecoveryCodes(userId: string, tx: Parameters<Parameters<typeof db.transaction>[0]>[0]): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
  await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
  await tx.insert(mfaRecoveryCodes).values(codes.map((code) => ({ userId, codeHash: recoveryHash(userId, code) })));
  return codes;
}

// Aceita um código do app e avança o último intervalo usado de forma atômica (anti-replay, inclusive concorrente).
async function consumeTotp(userId: string, code: string, { requireEnabled }: { requireEnabled: boolean }): Promise<boolean> {
  const row = await db.query.userMfa.findFirst({ where: eq(userMfa.userId, userId) });
  if (!row || (requireEnabled && !row.enabledAt)) return false;
  const step = matchTotp(decryptPii(row.secretEnc), code, { afterStep: row.lastUsedStep });
  if (step === null) return false;
  const updated = await db
    .update(userMfa)
    .set({ lastUsedStep: step })
    .where(and(eq(userMfa.userId, userId), lt(userMfa.lastUsedStep, step)))
    .returning({ userId: userMfa.userId });
  return updated.length > 0;
}

async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  if (normalizeRecoveryCode(code).length !== 10) return false;
  const used = await db
    .update(mfaRecoveryCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(mfaRecoveryCodes.userId, userId), eq(mfaRecoveryCodes.codeHash, recoveryHash(userId, code)), isNull(mfaRecoveryCodes.usedAt)))
    .returning({ id: mfaRecoveryCodes.id });
  return used.length > 0;
}

// Confirma o cadastro com o primeiro código do app. A sessão atual passa a contar como verificada e
// as demais sessões são encerradas. Os códigos de recuperação são devolvidos uma única vez.
export async function confirmEnrollment(userId: string, sessionId: string, code: string, ipHash?: string | null): Promise<string[]> {
  const limit = await consumeRateLimit(`mfa:user:${userId}`, RATE_LIMITS.mfaPerUser);
  if (!limit.ok) throw new MfaError("Muitas tentativas. Aguarde alguns minutos.");
  const row = await db.query.userMfa.findFirst({ where: eq(userMfa.userId, userId) });
  if (!row) throw new MfaError("Comece a ativação novamente.");
  if (row.enabledAt) throw new MfaError("A verificação em duas etapas já está ativa.");
  if (!(await consumeTotp(userId, code, { requireEnabled: false }))) throw new MfaError("Código incorreto ou expirado. Confira o horário do celular e tente o código atual.");

  const roles = await rolesOf(userId);
  const now = new Date();
  const codes = await db.transaction(async (tx) => {
    await tx.update(userMfa).set({ enabledAt: now }).where(eq(userMfa.userId, userId));
    const codes = await replaceRecoveryCodes(userId, tx);
    await tx.update(sessions).set({ mfaVerifiedAt: now }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
    await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, userId), ne(sessions.id, sessionId), isNull(sessions.revokedAt)));
    await recordAudit({ actorId: userId, actorRoles: roles, action: "mfa.enabled", entityType: "user", entityId: userId, ipHash }, tx);
    return codes;
  });
  await resetRateLimit(`mfa:user:${userId}`);
  return codes;
}

export type ChallengeResult = { ok: true; staff: boolean; usedRecoveryCode: boolean; expiresAt: Date } | { ok: false; error: "invalid" | "rate_limited" };

// Segunda etapa do login: valida o código do app (ou um código de recuperação) para a sessão pendente.
export async function verifyChallenge(userId: string, sessionId: string, code: string, ipHash?: string | null): Promise<ChallengeResult> {
  const limit = await consumeRateLimit(`mfa:user:${userId}`, RATE_LIMITS.mfaPerUser);
  if (!limit.ok) return { ok: false, error: "rate_limited" };

  const trimmed = code.trim();
  let usedRecoveryCode = false;
  let valid = /^\d{3}\s?\d{3}$/.test(trimmed) && (await consumeTotp(userId, trimmed, { requireEnabled: true }));
  if (!valid && (await isMfaEnabled(userId))) {
    valid = await consumeRecoveryCode(userId, trimmed);
    usedRecoveryCode = valid;
  }
  if (!valid) return { ok: false, error: "invalid" };

  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())),
  });
  if (!session) return { ok: false, error: "invalid" };
  const expiresAt = await sessionPolicyExpiry(userId, session.absoluteExpiresAt);
  await db.update(sessions).set({ mfaVerifiedAt: new Date(), expiresAt }).where(eq(sessions.id, sessionId));

  await resetRateLimit(`mfa:user:${userId}`);
  const roles = await rolesOf(userId);
  const staff = isStaff(roles);
  if (usedRecoveryCode) await recordAudit({ actorId: userId, actorRoles: roles, action: "mfa.recovery_code_used", entityType: "user", entityId: userId, ipHash });
  if (staff) await recordAudit({ actorId: userId, actorRoles: roles, action: "staff.login", entityType: "session", ipHash });
  return { ok: true, staff, usedRecoveryCode, expiresAt };
}

// Ações sobre um segundo fator ativo exigem um código válido no momento (não basta a sessão).
async function requireCurrentCode(userId: string, code: string): Promise<void> {
  const limit = await consumeRateLimit(`mfa:user:${userId}`, RATE_LIMITS.mfaPerUser);
  if (!limit.ok) throw new MfaError("Muitas tentativas. Aguarde alguns minutos.");
  const ok = (await consumeTotp(userId, code, { requireEnabled: true })) || (await consumeRecoveryCode(userId, code));
  if (!ok) throw new MfaError("Código incorreto ou expirado.");
}

export async function regenerateRecoveryCodes(userId: string, code: string, ipHash?: string | null): Promise<string[]> {
  await requireCurrentCode(userId, code);
  const roles = await rolesOf(userId);
  return db.transaction(async (tx) => {
    const codes = await replaceRecoveryCodes(userId, tx);
    await recordAudit({ actorId: userId, actorRoles: roles, action: "mfa.recovery_codes_regenerated", entityType: "user", entityId: userId, ipHash }, tx);
    return codes;
  });
}

export async function disableMfa(userId: string, code: string, ipHash?: string | null): Promise<void> {
  const roles = await rolesOf(userId);
  if (isStaff(roles) && staffMfaRequired()) throw new MfaError("Contas da equipe precisam manter a verificação em duas etapas.");
  await requireCurrentCode(userId, code);
  await db.transaction(async (tx) => {
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
    await tx.delete(userMfa).where(eq(userMfa.userId, userId));
    await recordAudit({ actorId: userId, actorRoles: roles, action: "mfa.disabled", entityType: "user", entityId: userId, ipHash }, tx);
  });
}

// Para quem perdeu o celular e os códigos de recuperação: uma administradora remove o segundo fator de
// OUTRA pessoa (após confirmar a identidade fora da plataforma). Todas as sessões da pessoa são encerradas.
export async function adminResetMfa(actor: Principal, targetUserId: string, reason: string): Promise<void> {
  assertCan(actor, "team.manage");
  if (actor.id === targetUserId) throw new MfaError("Peça a outra administradora para redefinir o seu segundo fator.");
  const motivo = reason.trim();
  if (motivo.length < 10) throw new MfaError("Descreva como a identidade foi confirmada (mínimo de 10 caracteres).");
  await db.transaction(async (tx) => {
    const removed = await tx.delete(userMfa).where(eq(userMfa.userId, targetUserId)).returning({ userId: userMfa.userId });
    if (removed.length === 0) throw new MfaError("Esta pessoa não tem verificação em duas etapas ativa.");
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, targetUserId));
    await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, targetUserId), isNull(sessions.revokedAt)));
    await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "mfa.reset_by_admin", entityType: "user", entityId: targetUserId, after: { motivo } }, tx);
  });
}

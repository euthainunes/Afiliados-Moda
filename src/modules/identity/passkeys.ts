import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { and, count, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { passkeys, sessions, userMfa, userRoles, users, webauthnChallenges } from "@/lib/db/schema";
import { hmac, randomToken } from "@/lib/crypto";
import { env, staffMfaRequired } from "@/lib/env";
import { site } from "@/config/site";
import { requiresMfa } from "@/modules/access/can";
import type { Role } from "@/modules/access/permissions";
import { recordAudit } from "@/modules/audit/service";
import { RATE_LIMITS } from "./policies";
import { consumeRateLimit } from "./rate-limit";
import { openSession, type RequestContext } from "./service";

// Chaves de acesso (WebAuthn / passkeys): entrar com a biometria ou o PIN do aparelho, sem senha.
// A chave privada nunca sai do aparelho; guardamos só a pública. Como o aparelho exige verificação
// da pessoa (userVerification: required), entrar com chave conta como verificação em duas etapas.

export class PasskeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasskeyError";
  }
}

export const MAX_PASSKEYS = 10;
const CHALLENGE_TTL_MS = 5 * 60_000;

function relyingParty() {
  const url = new URL(env().APP_URL);
  return { rpID: url.hostname, origin: url.origin, rpName: site.name };
}

async function saveChallenge(purpose: "register" | "login", challenge: string, userId: string | null): Promise<string> {
  const id = randomToken(24);
  await db.insert(webauthnChallenges).values({ id, purpose, challenge, userId, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) });
  return id;
}

// Uso único e atômico: o desafio é apagado ao ser lido.
async function takeChallenge(id: string, purpose: "register" | "login", userId: string | null): Promise<string> {
  if (!id || id.length > 100) throw new PasskeyError("A operação expirou. Tente de novo.");
  const conditions = [eq(webauthnChallenges.id, id), eq(webauthnChallenges.purpose, purpose), gt(webauthnChallenges.expiresAt, new Date())];
  conditions.push(userId ? eq(webauthnChallenges.userId, userId) : isNull(webauthnChallenges.userId));
  const [row] = await db.delete(webauthnChallenges).where(and(...conditions)).returning({ challenge: webauthnChallenges.challenge });
  if (!row) throw new PasskeyError("A operação expirou. Tente de novo.");
  return row.challenge;
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

// ---------- Cadastro de uma chave (pessoa já autenticada) ----------

export async function startPasskeyRegistration(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || user.status !== "active") throw new PasskeyError("Conta não encontrada.");
  const existing = await db.select({ id: passkeys.id, transports: passkeys.transports }).from(passkeys).where(eq(passkeys.userId, userId));
  if (existing.length >= MAX_PASSKEYS) throw new PasskeyError(`Limite de ${MAX_PASSKEYS} chaves de acesso. Remova uma antes de adicionar outra.`);
  const { rpID, rpName } = relyingParty();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  return { options, challengeId: await saveChallenge("register", options.challenge, userId) };
}

export async function finishPasskeyRegistration(
  userId: string,
  sessionId: string,
  challengeId: string,
  response: RegistrationResponseJSON,
  rawName: string,
  ipHash?: string | null,
) {
  const expectedChallenge = await takeChallenge(challengeId, "register", userId);
  const { rpID, origin } = relyingParty();
  let verification;
  try {
    verification = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
  } catch {
    throw new PasskeyError("Não foi possível confirmar a chave de acesso. Tente de novo.");
  }
  if (!verification.verified) throw new PasskeyError("Não foi possível confirmar a chave de acesso. Tente de novo.");
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const name = rawName.trim().slice(0, 60) || "Chave de acesso";
  const [{ n }] = await db.select({ n: count() }).from(passkeys).where(eq(passkeys.userId, userId));
  if (n >= MAX_PASSKEYS) throw new PasskeyError(`Limite de ${MAX_PASSKEYS} chaves de acesso.`);
  const roles = (await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId))).map((r) => r.role);
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(passkeys)
      .values({ id: credential.id, userId, publicKey: b64(credential.publicKey), counter: credential.counter, transports: credential.transports ?? [], deviceType: credentialDeviceType, backedUp: credentialBackedUp, name })
      .onConflictDoNothing()
      .returning({ id: passkeys.id });
    if (inserted.length === 0) throw new PasskeyError("Esta chave de acesso já está cadastrada.");
    // A pessoa acabou de se verificar no aparelho: a sessão atual conta como verificada.
    await tx.update(sessions).set({ mfaVerifiedAt: new Date() }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
    await recordAudit({ actorId: userId, actorRoles: roles, action: "passkey.added", entityType: "user", entityId: userId, after: { name, deviceType: credentialDeviceType }, ipHash }, tx);
  });
}

export async function listPasskeys(userId: string) {
  return db
    .select({ id: passkeys.id, name: passkeys.name, createdAt: passkeys.createdAt, lastUsedAt: passkeys.lastUsedAt, backedUp: passkeys.backedUp })
    .from(passkeys)
    .where(eq(passkeys.userId, userId))
    .orderBy(passkeys.createdAt);
}

export async function removePasskey(userId: string, passkeyId: string, ipHash?: string | null): Promise<void> {
  const roles = (await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId))).map((r) => r.role as Role);
  if (requiresMfa(roles) && staffMfaRequired()) {
    // Equipe e marcas precisam manter algum segundo fator: app autenticador ou outra chave.
    const totp = await db.query.userMfa.findFirst({ where: and(eq(userMfa.userId, userId)) });
    const [{ n }] = await db.select({ n: count() }).from(passkeys).where(eq(passkeys.userId, userId));
    if (!totp?.enabledAt && n <= 1) throw new PasskeyError("Mantenha ao menos um segundo fator: ative o app autenticador ou cadastre outra chave antes de remover esta.");
  }
  await db.transaction(async (tx) => {
    const removed = await tx.delete(passkeys).where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, userId))).returning({ name: passkeys.name });
    if (removed.length === 0) throw new PasskeyError("Chave não encontrada.");
    await recordAudit({ actorId: userId, actorRoles: roles, action: "passkey.removed", entityType: "user", entityId: userId, before: { name: removed[0].name }, ipHash }, tx);
  });
}

// ---------- Entrar com chave de acesso (sem e-mail nem senha) ----------

export async function startPasskeyLogin() {
  const { rpID } = relyingParty();
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
  return { options, challengeId: await saveChallenge("login", options.challenge, null) };
}

export type PasskeyLoginResult = { ok: true; token: string; expiresAt: Date; home: string } | { ok: false; error: "invalid" | "rate_limited" | "suspended" };

export async function finishPasskeyLogin(challengeId: string, response: AuthenticationResponseJSON, ctx: RequestContext = {}): Promise<PasskeyLoginResult> {
  const ip = ctx.ipHash ?? (ctx.ip ? hmac(ctx.ip) : "desconhecido");
  const limit = await consumeRateLimit(`login:ip:${ip}`, RATE_LIMITS.loginPerIp);
  if (!limit.ok) return { ok: false, error: "rate_limited" };
  let expectedChallenge: string;
  try {
    expectedChallenge = await takeChallenge(challengeId, "login", null);
  } catch {
    return { ok: false, error: "invalid" };
  }
  const passkey = typeof response?.id === "string" ? await db.query.passkeys.findFirst({ where: eq(passkeys.id, response.id) }) : undefined;
  if (!passkey) return { ok: false, error: "invalid" };
  const user = await db.query.users.findFirst({ where: eq(users.id, passkey.userId) });
  if (!user || user.status === "deleted") return { ok: false, error: "invalid" };
  if (user.status === "suspended") return { ok: false, error: "suspended" };

  const { rpID, origin } = relyingParty();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: { id: passkey.id, publicKey: Buffer.from(passkey.publicKey, "base64url"), counter: passkey.counter, transports: passkey.transports },
    });
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (!verification.verified) return { ok: false, error: "invalid" };

  // Contador que não avança indica possível clone da chave (quando o aparelho usa contador).
  const { newCounter } = verification.authenticationInfo;
  const updated = await db
    .update(passkeys)
    .set({ counter: newCounter, lastUsedAt: new Date() })
    .where(and(eq(passkeys.id, passkey.id), newCounter > 0 ? lt(passkeys.counter, newCounter) : eq(passkeys.counter, 0)))
    .returning({ id: passkeys.id });
  if (updated.length === 0) return { ok: false, error: "invalid" };

  const session = await openSession(user.id, ctx, { secondFactorVerified: true });
  const roles = (await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, user.id))).map((r) => r.role);
  await recordAudit({ actorId: user.id, actorRoles: roles, action: "auth.passkey_login", entityType: "session", ipHash: ctx.ipHash });
  return { ok: true, token: session.token, expiresAt: session.expiresAt, home: session.home };
}

import { and, eq, isNull, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { auditLogs, mfaRecoveryCodes, sessions, supportTickets, userMfa } from "@/lib/db/schema";
import { env, resetEnvCache, staffMfaRequired } from "@/lib/env";
import { decryptPii } from "@/lib/pii";
import { AccessDeniedError } from "@/modules/access/can";
import {
  adminResetMfa,
  confirmEnrollment,
  disableMfa,
  getMfaStatus,
  MfaError,
  regenerateRecoveryCodes,
  startEnrollment,
  verifyChallenge,
} from "@/modules/identity/mfa";
import { login } from "@/modules/identity/service";
import { createSession, validateSessionToken } from "@/modules/identity/sessions";
import { stepAt, totpAt } from "@/modules/identity/totp";
import { runCleanup } from "@/modules/system/cleanup";
import { createUser, fakeIp, TEST_PASSWORD } from "../support/factories";

const ctx = () => ({ ip: fakeIp() });
let clock = Date.now();

// Só o relógio (Date) é controlado; temporizadores e o banco seguem reais.
beforeEach(() => {
  clock = Date.now();
  vi.useFakeTimers({ toFake: ["Date"], now: clock });
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.REQUIRE_STAFF_MFA;
  delete process.env.APP_ENV;
  resetEnvCache();
});

// Avança para o próximo intervalo de 30 s, para que um novo código seja aceito.
function nextInterval() {
  clock += 30_000;
  vi.setSystemTime(clock);
}

async function secretOf(userId: string) {
  const row = await db.query.userMfa.findFirst({ where: eq(userMfa.userId, userId) });
  return decryptPii(row!.secretEnc);
}

const codeNow = (secret: string) => totpAt(secret, stepAt(Date.now()));

async function enroll(userId: string) {
  const session = await createSession(userId);
  const sessionId = (await validateSessionToken(session.token))!.sessionId;
  await startEnrollment(userId);
  const secret = await secretOf(userId);
  const codes = await confirmEnrollment(userId, sessionId, codeNow(secret));
  return { secret, codes, session };
}

describe("cadastro da verificação em duas etapas", () => {
  it("guarda o segredo criptografado, gera 10 códigos de recuperação e encerra as outras sessões", async () => {
    const u = await createUser();
    const other = await createSession(u.id);
    const current = await createSession(u.id);
    const currentId = (await validateSessionToken(current.token))!.sessionId;

    await startEnrollment(u.id);
    const status = await getMfaStatus(u.id);
    expect(status.state).toBe("enrolling");
    if (status.state !== "enrolling") return;
    expect(status.uri).toContain(`secret=${status.secret}`);
    const row = await db.query.userMfa.findFirst({ where: eq(userMfa.userId, u.id) });
    expect(row!.secretEnc).not.toContain(status.secret);

    await expect(confirmEnrollment(u.id, currentId, "000000")).rejects.toThrow(MfaError);
    const codes = await confirmEnrollment(u.id, currentId, codeNow(status.secret));
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    const stored = await db.select().from(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, u.id));
    expect(stored.map((c) => c.codeHash)).not.toContain(codes[0]);

    // A sessão em que a ativação foi feita continua válida; as outras são encerradas.
    expect((await validateSessionToken(current.token))?.mfa).toEqual({ enabled: true, pending: false, enrollmentRequired: false });
    expect(await validateSessionToken(other.token)).toBeNull();
    await expect(startEnrollment(u.id)).rejects.toThrow(/já está ativa/);
    const audit = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, u.id), eq(auditLogs.action, "mfa.enabled")));
    expect(audit).toHaveLength(1);
  });
});

describe("login com segundo fator", () => {
  it("sessão fica pendente até o código; o mesmo código não vale duas vezes", async () => {
    const u = await createUser();
    const { secret } = await enroll(u.id);

    const result = await login(u.email, TEST_PASSWORD, ctx());
    expect(result).toMatchObject({ ok: true, mfaRequired: true });
    if (!result.ok) return;
    // Sessão pendente: inválida para tudo, exceto a tela de verificação, e com prazo curto.
    expect(await validateSessionToken(result.token)).toBeNull();
    const pending = (await validateSessionToken(result.token, { allowPending: true }))!;
    expect(pending.mfa.pending).toBe(true);
    expect(result.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(10 * 60_000);

    expect(await verifyChallenge(u.id, pending.sessionId, "123456")).toEqual({ ok: false, error: "invalid" });
    // O código usado na ativação (mesmo intervalo) não serve de novo.
    expect(await verifyChallenge(u.id, pending.sessionId, codeNow(secret))).toEqual({ ok: false, error: "invalid" });

    nextInterval();
    const ok = await verifyChallenge(u.id, pending.sessionId, codeNow(secret));
    expect(ok).toMatchObject({ ok: true, staff: false, usedRecoveryCode: false });
    if (!ok.ok) return;
    expect(ok.expiresAt.getTime() - Date.now()).toBeGreaterThan(24 * 3600_000);
    expect((await validateSessionToken(result.token))?.user.id).toBe(u.id);

    // Replay em outra sessão pendente com o código já usado.
    const again = await login(u.email, TEST_PASSWORD, ctx());
    if (!again.ok) throw new Error("login falhou");
    const p2 = (await validateSessionToken(again.token, { allowPending: true }))!;
    expect(await verifyChallenge(u.id, p2.sessionId, codeNow(secret))).toEqual({ ok: false, error: "invalid" });
  });

  it("código de recuperação vale uma única vez e fica na auditoria", async () => {
    const u = await createUser();
    const { codes } = await enroll(u.id);
    const r = await login(u.email, TEST_PASSWORD, ctx());
    if (!r.ok) throw new Error("login falhou");
    const p = (await validateSessionToken(r.token, { allowPending: true }))!;
    expect(await verifyChallenge(u.id, p.sessionId, codes[0].toUpperCase())).toMatchObject({ ok: true, usedRecoveryCode: true });

    const r2 = await login(u.email, TEST_PASSWORD, ctx());
    if (!r2.ok) throw new Error("login falhou");
    const p2 = (await validateSessionToken(r2.token, { allowPending: true }))!;
    expect(await verifyChallenge(u.id, p2.sessionId, codes[0])).toEqual({ ok: false, error: "invalid" });
    expect(await getMfaStatus(u.id)).toMatchObject({ state: "enabled", recoveryCodesLeft: 9 });
    const audit = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, u.id), eq(auditLogs.action, "mfa.recovery_code_used")));
    expect(audit).toHaveLength(1);
  });

  it("limita tentativas por conta", async () => {
    const u = await createUser();
    await enroll(u.id);
    const r = await login(u.email, TEST_PASSWORD, ctx());
    if (!r.ok) throw new Error("login falhou");
    const p = (await validateSessionToken(r.token, { allowPending: true }))!;
    for (let i = 0; i < 10; i++) expect(await verifyChallenge(u.id, p.sessionId, "000000")).toMatchObject({ ok: false, error: "invalid" });
    expect(await verifyChallenge(u.id, p.sessionId, "000000")).toEqual({ ok: false, error: "rate_limited" });
  });

  it("gerenciar exige código atual: novos códigos invalidam os antigos; desativar remove tudo", async () => {
    const u = await createUser();
    const { secret, codes } = await enroll(u.id);
    await expect(regenerateRecoveryCodes(u.id, "000000")).rejects.toThrow(MfaError);
    nextInterval();
    const fresh = await regenerateRecoveryCodes(u.id, codeNow(secret));
    expect(fresh).toHaveLength(10);
    await expect(disableMfa(u.id, codes[1])).rejects.toThrow(MfaError); // código antigo não vale mais
    await disableMfa(u.id, fresh[0]);
    expect((await getMfaStatus(u.id)).state).toBe("disabled");
    expect(await db.select().from(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, u.id))).toHaveLength(0);
    expect(await login(u.email, TEST_PASSWORD, ctx())).toMatchObject({ ok: true, mfaRequired: false });
  });
});

describe("obrigatoriedade para a equipe", () => {
  it("sem segundo fator, a conta da equipe perde os papéis internos até cadastrá-lo", async () => {
    process.env.REQUIRE_STAFF_MFA = "true";
    resetEnvCache();
    const admin = await createUser({ roles: ["user", "admin"] });
    const r = await login(admin.email, TEST_PASSWORD, ctx());
    if (!r.ok) throw new Error("login falhou");
    const s = (await validateSessionToken(r.token))!;
    expect(s.roles).toEqual(["user"]);
    expect(s.mfa.enrollmentRequired).toBe(true);

    await startEnrollment(admin.id);
    await confirmEnrollment(admin.id, s.sessionId, codeNow(await secretOf(admin.id)));
    const after = (await validateSessionToken(r.token))!;
    expect(after.roles.sort()).toEqual(["admin", "user"]);
    expect(after.mfa.enrollmentRequired).toBe(false);

    nextInterval();
    await expect(disableMfa(admin.id, codeNow(await secretOf(admin.id)))).rejects.toThrow(/equipe/);
  });

  it("fora de produção é configurável; em produção é sempre obrigatória e não pode ser desligada", () => {
    expect(staffMfaRequired()).toBe(false);
    process.env.APP_ENV = "production";
    process.env.MAIL_DRIVER = "resend";
    process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
    resetEnvCache();
    try {
      expect(staffMfaRequired()).toBe(true);
      process.env.REQUIRE_STAFF_MFA = "false";
      resetEnvCache();
      expect(() => env()).toThrow(/não pode ser desligada/);
    } finally {
      process.env.MAIL_DRIVER = "memory";
      delete process.env.PII_ENCRYPTION_KEY;
    }
  });

  it("redefinição por administradora: só de outra pessoa, com motivo, encerrando as sessões", async () => {
    const admin = await createUser({ roles: ["user", "admin"] });
    const operator = await createUser({ roles: ["user", "operator"] });
    const u = await createUser();
    const { session } = await enroll(u.id);

    await expect(adminResetMfa(operator.principal, u.id, "confirmado por videochamada")).rejects.toThrow(AccessDeniedError);
    await expect(adminResetMfa(admin.principal, u.id, "curto")).rejects.toThrow(/mínimo/);
    await enroll(admin.id);
    await expect(adminResetMfa(admin.principal, admin.id, "confirmado por videochamada")).rejects.toThrow(/outra administradora/);

    await adminResetMfa(admin.principal, u.id, "confirmado por videochamada");
    expect((await getMfaStatus(u.id)).state).toBe("disabled");
    expect(await validateSessionToken(session.token)).toBeNull();
    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, u.id), eq(auditLogs.action, "mfa.reset_by_admin")));
    expect(log.actorId).toBe(admin.id);
  });
});

describe("rotina de limpeza", () => {
  it("remove sessões vencidas há mais de 30 dias e anonimiza contatos públicos encerrados antigos", async () => {
    const u = await createUser();
    const old = await createSession(u.id);
    const fresh = await createSession(u.id);
    const oldId = (await validateSessionToken(old.token))!.sessionId;
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 40 * 86_400_000) }).where(eq(sessions.id, oldId));

    const [ticket] = await db
      .insert(supportTickets)
      .values({ contactEmail: "contato-antigo@exemplo.test", contactName: "Contato Fictício", category: "outro", subject: "Teste", status: "closed", updatedAt: new Date(Date.now() - 400 * 86_400_000) })
      .returning();
    const [openTicket] = await db
      .insert(supportTickets)
      .values({ contactEmail: "contato-aberto@exemplo.test", contactName: "Contato Aberto", category: "outro", subject: "Teste", status: "open" })
      .returning();
    // O $onUpdate do Drizzle não atua em insert; garante a data antiga.
    await db.execute(sql`update support_tickets set updated_at = now() - interval '400 days' where id = ${ticket.id}`);

    const result = await runCleanup();
    expect(result.sessions).toBeGreaterThanOrEqual(1);
    expect(await db.query.sessions.findFirst({ where: eq(sessions.id, oldId) })).toBeUndefined();
    expect(await validateSessionToken(fresh.token)).not.toBeNull();
    const t = await db.query.supportTickets.findFirst({ where: eq(supportTickets.id, ticket.id) });
    expect(t).toMatchObject({ contactEmail: null, contactName: null, subject: "Teste" });
    const o = await db.query.supportTickets.findFirst({ where: and(eq(supportTickets.id, openTicket.id), isNull(supportTickets.userId)) });
    expect(o?.contactEmail).toBe("contato-aberto@exemplo.test");

    // Idempotente.
    expect((await runCleanup()).contactsAnonymized).toBe(0);
  });
});

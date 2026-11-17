import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { auditLogs, passkeys, users, webauthnChallenges } from "@/lib/db/schema";
import { resetEnvCache } from "@/lib/env";
import { confirmEnrollment, startEnrollment } from "@/modules/identity/mfa";
import { finishPasskeyLogin, finishPasskeyRegistration, PasskeyError, removePasskey, startPasskeyLogin, startPasskeyRegistration } from "@/modules/identity/passkeys";
import { createSession, validateSessionToken } from "@/modules/identity/sessions";
import { createUser, fakeIp } from "../support/factories";
import { SoftAuthenticator } from "../support/soft-authenticator";

afterEach(() => {
  delete process.env.REQUIRE_STAFF_MFA;
  resetEnvCache();
});

// Sessão já autenticada por completo (quem cadastra uma chave está logada).
async function sessionFor(userId: string) {
  const s = await createSession(userId, {}, { mfaVerified: true });
  return { ...s, id: (await validateSessionToken(s.token))!.sessionId };
}

async function enroll(userId: string, auth = new SoftAuthenticator(), name = "Celular") {
  const s = await sessionFor(userId);
  const { options, challengeId } = await startPasskeyRegistration(userId);
  await finishPasskeyRegistration(userId, s.id, challengeId, auth.register(options) as never, name);
  return { auth, session: s };
}

async function login(auth: SoftAuthenticator, opts: { counterStep?: number } = {}) {
  const { options, challengeId } = await startPasskeyLogin();
  return finishPasskeyLogin(challengeId, auth.authenticate(options, opts) as never, { ip: fakeIp() });
}

describe("chaves de acesso", () => {
  it("cadastra (só a chave pública) e entra sem senha, com a sessão já verificada", async () => {
    const u = await createUser();
    const { auth } = await enroll(u.id);
    const [stored] = await db.select().from(passkeys).where(eq(passkeys.userId, u.id));
    expect(stored).toMatchObject({ id: auth.id, name: "Celular", deviceType: "singleDevice" });

    const r = await login(auth);
    expect(r).toMatchObject({ ok: true, home: "/app" });
    if (!r.ok) return;
    const s = (await validateSessionToken(r.token))!;
    expect(s.user.id).toBe(u.id);
    const [log] = (await db.select().from(auditLogs).where(eq(auditLogs.actorId, u.id))).filter((l) => l.action === "auth.passkey_login");
    expect(log).toBeTruthy();
  });

  it("desafio vale uma vez, não é aceito de outra finalidade e respostas adulteradas são recusadas", async () => {
    const u = await createUser();
    const { auth } = await enroll(u.id);
    const { options, challengeId } = await startPasskeyLogin();
    const response = auth.authenticate(options);
    expect((await finishPasskeyLogin(challengeId, response as never, { ip: fakeIp() })).ok).toBe(true);
    // Mesmo desafio de novo (replay).
    expect(await finishPasskeyLogin(challengeId, auth.authenticate(options) as never, { ip: fakeIp() })).toEqual({ ok: false, error: "invalid" });

    // Assinatura adulterada.
    const next = await startPasskeyLogin();
    const forged = auth.authenticate(next.options);
    forged.response.signature = Buffer.from("assinatura-falsa").toString("base64url");
    expect(await finishPasskeyLogin(next.challengeId, forged as never, { ip: fakeIp() })).toEqual({ ok: false, error: "invalid" });

    // Chave de outro site (origem diferente).
    const phishing = new SoftAuthenticator("https://site-falso.example", "site-falso.example");
    const p = await startPasskeyLogin();
    expect(await finishPasskeyLogin(p.challengeId, phishing.authenticate(p.options) as never, { ip: fakeIp() })).toEqual({ ok: false, error: "invalid" });

    // Desafio de cadastro não serve para entrar.
    const reg = await startPasskeyRegistration(u.id);
    expect(await finishPasskeyLogin(reg.challengeId, auth.authenticate(reg.options) as never, { ip: fakeIp() })).toEqual({ ok: false, error: "invalid" });
  });

  it("contador que volta (possível clone) e aparelho sem verificação da pessoa são recusados", async () => {
    const u = await createUser();
    const { auth } = await enroll(u.id);
    expect((await login(auth)).ok).toBe(true);
    auth.counter = 0;
    expect(await login(auth)).toEqual({ ok: false, error: "invalid" });

    const noUv = new SoftAuthenticator(undefined, undefined, false);
    const s = await sessionFor(u.id);
    const { options, challengeId } = await startPasskeyRegistration(u.id);
    await expect(finishPasskeyRegistration(u.id, s.id, challengeId, noUv.register(options) as never, "x")).rejects.toBeInstanceOf(PasskeyError);
  });

  it("conta suspensa não entra; desafios ficam guardados com validade curta", async () => {
    const u = await createUser();
    const { auth } = await enroll(u.id);
    await db.update(users).set({ status: "suspended" }).where(eq(users.id, u.id));
    expect(await login(auth)).toEqual({ ok: false, error: "suspended" });
    const { challengeId } = await startPasskeyLogin();
    const [c] = await db.select().from(webauthnChallenges).where(eq(webauthnChallenges.id, challengeId));
    expect(c.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(5 * 60_000);
  });

  it("entrar com chave atende a exigência da equipe e ignora o código do app", async () => {
    process.env.REQUIRE_STAFF_MFA = "true";
    resetEnvCache();
    const admin = await createUser({ roles: ["user", "admin"] });
    const { auth } = await enroll(admin.id);
    const r = await login(auth);
    if (!r.ok) throw new Error("login falhou");
    expect(r.home).toBe("/admin");
    const s = (await validateSessionToken(r.token))!;
    expect(s.mfa.enrollmentRequired).toBe(false);
    expect(s.roles).toContain("admin");

    // Com app autenticador ativo, a chave também dispensa o código (já é segundo fator).
    const withTotp = await createUser();
    const sess = await sessionFor(withTotp.id);
    await startEnrollment(withTotp.id);
    const { decryptPii } = await import("@/lib/pii");
    const { totpAt, stepAt } = await import("@/modules/identity/totp");
    const row = await db.query.userMfa.findFirst({ where: (t, { eq: e }) => e(t.userId, withTotp.id) });
    await confirmEnrollment(withTotp.id, sess.id, totpAt(decryptPii(row!.secretEnc), stepAt(Date.now())));
    const k = await enroll(withTotp.id);
    const r2 = await login(k.auth);
    if (!r2.ok) throw new Error("login falhou");
    expect((await validateSessionToken(r2.token))?.mfa.pending).toBe(false);
  });

  it("equipe não remove a última chave sem outro segundo fator; criadora remove", async () => {
    process.env.REQUIRE_STAFF_MFA = "true";
    resetEnvCache();
    const admin = await createUser({ roles: ["user", "admin"] });
    const { auth } = await enroll(admin.id);
    await expect(removePasskey(admin.id, auth.id)).rejects.toThrow(/segundo fator/);
    const second = await enroll(admin.id, new SoftAuthenticator(), "Notebook");
    await removePasskey(admin.id, auth.id);
    await expect(removePasskey(admin.id, second.auth.id)).rejects.toThrow(/segundo fator/);

    const u = await createUser();
    const k = await enroll(u.id);
    await removePasskey(u.id, k.auth.id);
    expect(await login(k.auth)).toEqual({ ok: false, error: "invalid" });
    // Ninguém remove chave alheia.
    const other = await enroll(u.id);
    const stranger = await createUser();
    await expect(removePasskey(stranger.id, other.auth.id)).rejects.toThrow(/não encontrada/);
  });
});

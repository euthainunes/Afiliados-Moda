import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { authTokens, consents, users } from "@/lib/db/schema";
import { memoryOutbox } from "@/lib/mailer";
import {
  changePassword,
  login,
  requestPasswordReset,
  resetPassword,
  signUp,
  verifyEmail,
} from "@/modules/identity/service";
import { listActiveSessions, revokeSession, validateSessionToken } from "@/modules/identity/sessions";
import { createUser, fakeEmail, fakeIp, TEST_PASSWORD } from "../support/factories";

function tokenFromLastMail(to: string) {
  const mail = [...memoryOutbox].reverse().find((m) => m.to === to);
  const match = mail?.text.match(/token=([A-Za-z0-9_\-%]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

const ctx = () => ({ ip: fakeIp() });

const signUpInput = (email: string) => ({
  displayName: "Bia Fictícia",
  email,
  password: "senha-ficticia-123",
  acceptTerms: true as const,
  isAdult: true as const,
});

beforeEach(() => {
  memoryOutbox.length = 0;
});

describe("cadastro e confirmação de e-mail", () => {
  it("cria conta, registra consentimentos e só permite login após confirmar o e-mail", async () => {
    const email = fakeEmail();
    expect(await signUp(signUpInput(email), ctx())).toEqual({ ok: true });

    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    expect(user?.emailVerifiedAt).toBeNull();
    expect(user?.passwordHash).not.toContain("senha-ficticia-123");
    const accepted = await db.select().from(consents).where(eq(consents.userId, user!.id));
    expect(accepted.map((c) => c.document).sort()).toEqual(["privacy", "rewards_rules", "terms"]);

    expect(await login(email, "senha-ficticia-123", ctx())).toMatchObject({ ok: false, error: "unverified" });

    const token = tokenFromLastMail(email)!;
    expect(token).toBeTruthy();
    expect(await verifyEmail(token)).toBe(true);
    expect(await verifyEmail(token)).toBe(false); // uso único

    const result = await login(email, "senha-ficticia-123", ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const session = await validateSessionToken(result.token);
    expect(session?.user.email).toBe(email);
    expect(session?.roles).toEqual(["user"]);
  });

  it("não revela se o e-mail já tem conta e não duplica cadastro", async () => {
    const email = fakeEmail();
    await signUp(signUpInput(email), ctx());
    expect(await signUp(signUpInput(email), ctx())).toEqual({ ok: true });
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.email, email));
    expect(n).toBe(1);
    expect(memoryOutbox.at(-1)?.subject).toBe("Tentativa de cadastro com seu e-mail");

    // Tentativas de vários IPs não viram envio em massa para a mesma pessoa.
    for (let i = 0; i < 6; i++) await signUp(signUpInput(email), ctx());
    expect(memoryOutbox.filter((m) => m.to === email && m.subject.startsWith("Tentativa")).length).toBeLessThanOrEqual(3);
  });

  it("trata e-mail sem diferenciar maiúsculas", async () => {
    const u = await createUser();
    expect((await login(u.email.toUpperCase().toLowerCase(), TEST_PASSWORD, ctx())).ok).toBe(true);
  });
});

describe("login e proteção contra abuso", () => {
  it("rejeita senha errada e e-mail inexistente com a mesma mensagem", async () => {
    const u = await createUser();
    expect(await login(u.email, "senha-errada-123", ctx())).toMatchObject({ ok: false, error: "invalid" });
    expect(await login(fakeEmail(), "qualquer-senha-1", ctx())).toMatchObject({ ok: false, error: "invalid" });
  });

  it("bloqueia após tentativas repetidas no mesmo e-mail, mesmo trocando de IP", async () => {
    const u = await createUser();
    for (let i = 0; i < 8; i++) await login(u.email, "senha-errada-123", ctx());
    const blocked = await login(u.email, TEST_PASSWORD, ctx());
    expect(blocked).toMatchObject({ ok: false, error: "rate_limited" });
    expect(blocked.ok === false && blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("não permite login de conta suspensa", async () => {
    const u = await createUser();
    await db.update(users).set({ status: "suspended" }).where(eq(users.id, u.id));
    expect(await login(u.email, TEST_PASSWORD, ctx())).toMatchObject({ ok: false, error: "suspended" });
  });
});

describe("sessões", () => {
  it("invalida a sessão de conta suspensa e respeita revogação", async () => {
    const u = await createUser();
    const r = await login(u.email, TEST_PASSWORD, ctx());
    if (!r.ok) throw new Error("login falhou");
    const s = await validateSessionToken(r.token);
    expect(s).not.toBeNull();

    // Outra conta não consegue revogar esta sessão.
    const other = await createUser();
    expect(await revokeSession(other.id, s!.sessionId)).toBe(false);
    expect(await validateSessionToken(r.token)).not.toBeNull();

    await db.update(users).set({ status: "suspended" }).where(eq(users.id, u.id));
    expect(await validateSessionToken(r.token)).toBeNull();
  });

  it("sessão de equipe expira antes da sessão de usuária", async () => {
    const staff = await createUser({ roles: ["user", "admin"] });
    const regular = await createUser();
    const a = await login(staff.email, TEST_PASSWORD, ctx());
    const b = await login(regular.email, TEST_PASSWORD, ctx());
    if (!a.ok || !b.ok) throw new Error("login falhou");
    expect(a.staff).toBe(true);
    expect(a.expiresAt.getTime()).toBeLessThan(b.expiresAt.getTime());
  });

  it("rejeita tokens forjados", async () => {
    expect(await validateSessionToken("token-inventado")).toBeNull();
    expect(await validateSessionToken("")).toBeNull();
  });
});

describe("recuperação e troca de senha", () => {
  it("redefine a senha com link de uso único e encerra todas as sessões", async () => {
    const u = await createUser();
    const before = await login(u.email, TEST_PASSWORD, ctx());
    if (!before.ok) throw new Error("login falhou");

    await requestPasswordReset(u.email, ctx());
    const token = tokenFromLastMail(u.email)!;
    expect(await resetPassword(token, "nova-senha-ficticia", ctx())).toBe(true);
    expect(await resetPassword(token, "outra-senha-ficticia", ctx())).toBe(false);

    expect(await validateSessionToken(before.token)).toBeNull();
    expect((await login(u.email, TEST_PASSWORD, ctx())).ok).toBe(false);
    expect((await login(u.email, "nova-senha-ficticia", ctx())).ok).toBe(true);
  });

  it("não envia nada para e-mail inexistente, mas responde igual", async () => {
    const email = fakeEmail();
    expect(await requestPasswordReset(email, ctx())).toEqual({ ok: true });
    expect(memoryOutbox.find((m) => m.to === email)).toBeUndefined();
  });

  it("rejeita link expirado e invalida links anteriores", async () => {
    const u = await createUser();
    await requestPasswordReset(u.email, ctx());
    const first = tokenFromLastMail(u.email)!;
    await requestPasswordReset(u.email, ctx());
    const second = tokenFromLastMail(u.email)!;
    expect(await resetPassword(first, "nova-senha-ficticia", ctx())).toBe(false);

    await db.update(authTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authTokens.userId, u.id));
    expect(await resetPassword(second, "nova-senha-ficticia", ctx())).toBe(false);
  });

  it("troca de senha exige a senha atual e mantém só a sessão corrente", async () => {
    const u = await createUser();
    const a = await login(u.email, TEST_PASSWORD, ctx());
    const b = await login(u.email, TEST_PASSWORD, ctx());
    if (!a.ok || !b.ok) throw new Error("login falhou");
    const current = (await validateSessionToken(a.token))!;

    expect(await changePassword(u.id, "errada-errada", "nova-senha-ficticia", current.sessionId)).toEqual({ ok: false, error: "invalid_current" });
    expect(await changePassword(u.id, TEST_PASSWORD, "nova-senha-ficticia", current.sessionId)).toEqual({ ok: true });

    expect(await validateSessionToken(a.token)).not.toBeNull();
    expect(await validateSessionToken(b.token)).toBeNull();
    expect(await listActiveSessions(u.id)).toHaveLength(1);
  });
});

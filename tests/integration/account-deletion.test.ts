import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { auditLogs, userIdentities, users } from "@/lib/db/schema";
import { memoryOutbox } from "@/lib/mailer";
import { requestPasswordReset, resetPassword } from "@/modules/identity/service";
import { createSession, validateSessionToken } from "@/modules/identity/sessions";
import { completeGoogleSignup, signInWithGoogle } from "@/modules/identity/social";
import { deleteAccountWithLink, deleteMyAccount, deletionLinkIsValid, PrivacyError, requestAccountDeletionLink } from "@/modules/privacy/service";
import { createUser, fakeEmail, fakeIp } from "../support/factories";
import { resetEnvCache } from "@/lib/env";

function lastToken(to: string, path: string) {
  const mail = [...memoryOutbox].reverse().find((m) => m.to === to && m.text.includes(path));
  const m = mail?.text.match(/token=([A-Za-z0-9_\-%]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}

async function googleOnlyAccount() {
  process.env.GOOGLE_CLIENT_ID = "cliente-ficticio";
  process.env.GOOGLE_CLIENT_SECRET = "segredo-ficticio";
  resetEnvCache();
  const claims = { sub: `sub-${Math.random().toString(36).slice(2)}`, email: fakeEmail("google"), name: "Gabi" };
  const first = await signInWithGoogle(claims, { ip: fakeIp() });
  if (first.kind !== "needs_signup") throw new Error("esperava cadastro pendente");
  const session = await completeGoogleSignup(first.pending, { displayName: "Gabi", acceptTerms: "on", isAdult: "on" });
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  resetEnvCache();
  const user = (await db.query.users.findFirst({ where: eq(users.email, claims.email) }))!;
  return { user, session };
}

beforeEach(() => {
  memoryOutbox.length = 0;
});

describe("exclusão de conta sem senha", () => {
  it("conta criada pelo Google confirma a exclusão por link no e-mail", async () => {
    const { user, session } = await googleOnlyAccount();
    expect(user.hasPassword).toBe(false);
    await expect(deleteMyAccount(user.id, "qualquer", "EXCLUIR")).rejects.toThrow(/não tem senha/);

    await requestAccountDeletionLink(user.id);
    const token = lastToken(user.email, "/excluir-conta")!;
    expect(token).toBeTruthy();
    expect(await deletionLinkIsValid(token)).toBe(true);

    // Confirmação errada não consome o link.
    await expect(deleteAccountWithLink(token, "excluir não")).rejects.toThrow(PrivacyError);
    expect(await deletionLinkIsValid(token)).toBe(true);

    await deleteAccountWithLink(token, "excluir");
    const after = (await db.query.users.findFirst({ where: eq(users.id, user.id) }))!;
    expect(after.status).toBe("deleted");
    expect(after.email).toMatch(/@anonimizada\.invalid$/);
    expect(await validateSessionToken(session.token)).toBeNull();
    expect(await db.select().from(userIdentities).where(eq(userIdentities.userId, user.id))).toHaveLength(0);
    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.entityId, user.id)).then((r) => r.filter((l) => l.action === "privacy.account_deleted"));
    expect(log.after).toMatchObject({ confirmadoPor: "link por e-mail" });

    await expect(deleteAccountWithLink(token, "EXCLUIR")).rejects.toThrow(/expirado/);
    expect(await deletionLinkIsValid(token)).toBe(false);
  });

  it("criar senha pela recuperação marca que a conta passou a ter senha", async () => {
    const { user } = await googleOnlyAccount();
    await requestPasswordReset(user.email, { ip: fakeIp() });
    const token = lastToken(user.email, "/redefinir-senha")!;
    expect(await resetPassword(token, "nova-senha-ficticia-123", { ip: fakeIp() })).toBe(true);
    expect((await db.query.users.findFirst({ where: eq(users.id, user.id) }))!.hasPassword).toBe(true);
  });

  it("equipe interna não pede link e um link inventado não exclui ninguém", async () => {
    const staff = await createUser({ roles: ["user", "operator"] });
    await expect(requestAccountDeletionLink(staff.id)).rejects.toThrow(/equipe/);
    const u = await createUser();
    await createSession(u.id);
    await expect(deleteAccountWithLink("token-inventado-com-mais-de-vinte-caracteres", "EXCLUIR")).rejects.toThrow(/expirado/);
    expect((await db.query.users.findFirst({ where: eq(users.id, u.id) }))!.status).toBe("active");
  });
});

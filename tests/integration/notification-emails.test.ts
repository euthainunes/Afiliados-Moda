import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { notifications, users } from "@/lib/db/schema";
import { memoryOutbox, sendMail } from "@/lib/mailer";
import { composeDigest, deliverNotificationEmails } from "@/modules/notifications/email";
import { notify } from "@/modules/notifications/service";
import { setEmailNotifications } from "@/modules/privacy/service";
import { createUser } from "../support/factories";

const key = () => `teste:${Math.random().toString(36).slice(2)}`;
const statusOf = async (dedupeKey: string) => (await db.query.notifications.findFirst({ where: eq(notifications.dedupeKey, dedupeKey) }))!;
const mailsTo = (email: string) => memoryOutbox.filter((m) => m.to === email);

beforeEach(() => {
  memoryOutbox.length = 0;
});

describe("fila de avisos por e-mail", () => {
  it("só avisos importantes e reais entram na fila", async () => {
    const u = await createUser();
    const [real, demo, frequent] = [key(), key(), key()];
    await notify({ userId: u.id, type: "payout_paid", title: "Resgate pago", body: "O PIX foi enviado.", dedupeKey: real });
    await notify({ userId: u.id, type: "payout_paid", title: "Resgate pago (simulação)", body: "x", dedupeKey: demo, isDemo: true });
    await notify({ userId: u.id, type: "conversion_registered", title: "Nova venda", body: "x", dedupeKey: frequent });
    expect((await statusOf(real)).emailStatus).toBe("pending");
    expect((await statusOf(demo)).emailStatus).toBe("skipped");
    expect((await statusOf(frequent)).emailStatus).toBe("skipped");
  });

  it("reúne os avisos pendentes num único e-mail e não reenvia", async () => {
    const u = await createUser();
    const [a, b] = [key(), key()];
    await notify({ userId: u.id, type: "reward_eligible", title: "Recompensa liberada", body: "R$ 10,00 disponíveis.", link: "/app/recompensas", dedupeKey: a });
    await notify({ userId: u.id, type: "payout_approved", title: "Resgate aprovado", body: "Seu resgate foi aprovado.", dedupeKey: b });

    await deliverNotificationEmails();
    const mails = mailsTo(u.email);
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toBe("2 novidades na sua conta");
    expect(mails[0].text).toContain("Recompensa liberada");
    expect(mails[0].text).toContain("Resgate aprovado");
    expect(mails[0].text).toContain("http://localhost:3000/app/recompensas");
    expect(mails[0].text).toContain("/app/configuracoes");
    expect((await statusOf(a)).emailStatus).toBe("sent");

    await deliverNotificationEmails();
    expect(mailsTo(u.email)).toHaveLength(1);
  });

  it("respeita a preferência da pessoa e contas sem e-mail confirmado", async () => {
    const optOut = await createUser();
    const pendingKey = key();
    await notify({ userId: optOut.id, type: "payout_paid", title: "Resgate pago", body: "x", dedupeKey: pendingKey });
    await setEmailNotifications(optOut.id, false);
    expect((await statusOf(pendingKey)).emailStatus).toBe("skipped");
    const later = key();
    await notify({ userId: optOut.id, type: "payout_paid", title: "Outro", body: "x", dedupeKey: later });

    const unverified = await createUser({ verified: false });
    const k2 = key();
    await notify({ userId: unverified.id, type: "support_reply", title: "Resposta", body: "x", dedupeKey: k2 });

    await deliverNotificationEmails();
    expect(mailsTo(optOut.email)).toHaveLength(0);
    expect(mailsTo(unverified.email)).toHaveLength(0);
    expect((await statusOf(later)).emailStatus).toBe("skipped");
    expect((await statusOf(k2)).emailStatus).toBe("skipped");
  });

  it("tenta de novo após falha e desiste na terceira", async () => {
    const u = await createUser();
    const k = key();
    await notify({ userId: u.id, type: "adjustment", title: "Ajuste", body: "x", dedupeKey: k });
    const failing = async (mail: { to: string }) => {
      if (mail.to === u.email) throw new Error("provedor fora do ar");
      return sendMail(mail as never);
    };
    await deliverNotificationEmails({ send: failing });
    expect(await statusOf(k)).toMatchObject({ emailStatus: "pending", emailAttempts: 1 });
    await deliverNotificationEmails({ send: failing });
    await deliverNotificationEmails({ send: failing });
    expect(await statusOf(k)).toMatchObject({ emailStatus: "failed", emailAttempts: 3 });
    await deliverNotificationEmails();
    expect(mailsTo(u.email)).toHaveLength(0);
  });

  it("execuções simultâneas não enviam em dobro e reservas abandonadas voltam para a fila", async () => {
    const u = await createUser();
    const k = key();
    await notify({ userId: u.id, type: "payout_paid", title: "Resgate pago", body: "x", dedupeKey: k });
    await Promise.all([deliverNotificationEmails(), deliverNotificationEmails(), deliverNotificationEmails()]);
    expect(mailsTo(u.email)).toHaveLength(1);

    const stuck = key();
    await notify({ userId: u.id, type: "payout_paid", title: "Travado", body: "x", dedupeKey: stuck });
    await db.update(notifications).set({ emailStatus: "sending", emailClaimedAt: sql`now() - interval '2 hours'` }).where(eq(notifications.dedupeKey, stuck));
    await deliverNotificationEmails();
    expect((await statusOf(stuck)).emailStatus).toBe("sent");
    expect(mailsTo(u.email)).toHaveLength(2);
  });

  it("conta suspensa não recebe e-mail", async () => {
    const u = await createUser();
    await db.update(users).set({ status: "suspended" }).where(eq(users.id, u.id));
    const k = key();
    await notify({ userId: u.id, type: "payout_paid", title: "x", body: "x", dedupeKey: k });
    await deliverNotificationEmails();
    expect(mailsTo(u.email)).toHaveLength(0);
    expect((await statusOf(k)).emailStatus).toBe("skipped");
  });

  it("um aviso só vira assunto direto do e-mail", () => {
    expect(composeDigest("Ana", [{ title: "Resgate pago", body: "O PIX foi enviado.", link: null }]).subject).toBe("Resgate pago");
  });
});

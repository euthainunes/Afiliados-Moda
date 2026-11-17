import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications, profiles, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { sendMail, type Mail } from "@/lib/mailer";
import { logEvent, reportError } from "@/lib/observability";
import { site } from "@/config/site";

export const EMAIL_RETRY = { maxAttempts: 3, staleSendingMinutes: 30 } as const;

type Pending = typeof notifications.$inferSelect;

export type DeliveryResult = { emails: number; notifications: number; skipped: number; failed: number };

function absolute(link: string | null): string | null {
  if (!link || !link.startsWith("/")) return null;
  return `${env().APP_URL}${link}`;
}

// Um e-mail por pessoa reunindo os avisos pendentes (evita uma dezena de e-mails no mesmo dia).
export function composeDigest(name: string, items: Pick<Pending, "title" | "body" | "link">[]): Pick<Mail, "subject" | "text"> {
  const subject = items.length === 1 ? items[0].title : `${items.length} novidades na sua conta`;
  const lines = items.map((n) => {
    const url = absolute(n.link);
    return `• ${n.title}\n  ${n.body}${url ? `\n  ${url}` : ""}`;
  });
  const text = [
    `Olá, ${name}!`,
    "",
    items.length === 1 ? "Há uma novidade na sua conta:" : "Há novidades na sua conta:",
    "",
    lines.join("\n\n"),
    "",
    "—",
    `Você recebe estes avisos porque tem conta na ${site.name}. Para não receber mais por e-mail, desligue em Conta → Avisos por e-mail: ${env().APP_URL}/app/configuracoes`,
  ].join("\n");
  return { subject, text };
}

// Envia os e-mails pendentes. Seguro para rodar em paralelo (cada aviso é reservado com SKIP LOCKED)
// e repetidamente (o que já foi enviado não volta para a fila). Falhas tentam de novo até 3 vezes.
export async function deliverNotificationEmails({ limit = 200, send = sendMail }: { limit?: number; send?: (mail: Mail) => Promise<void> } = {}): Promise<DeliveryResult> {
  const result: DeliveryResult = { emails: 0, notifications: 0, skipped: 0, failed: 0 };

  // Reservas abandonadas (processo interrompido no meio do envio) voltam para a fila.
  await db
    .update(notifications)
    .set({ emailStatus: "pending" })
    .where(and(eq(notifications.emailStatus, "sending"), lt(notifications.emailClaimedAt, sql`now() - make_interval(mins => ${EMAIL_RETRY.staleSendingMinutes})`)));

  const claimed = await db.execute<{ id: string }>(sql`
    update notifications set email_status = 'sending', email_attempts = email_attempts + 1, email_claimed_at = now()
    where id in (
      select id from notifications where email_status = 'pending' and is_demo = false
      order by created_at limit ${limit} for update skip locked
    )
    returning id`);
  const ids = claimed.map((r) => r.id);
  if (ids.length === 0) return result;

  const rows = await db
    .select({ n: notifications, email: users.email, status: users.status, verified: users.emailVerifiedAt, name: profiles.displayName, wants: profiles.emailNotifications })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .innerJoin(profiles, eq(profiles.userId, notifications.userId))
    .where(inArray(notifications.id, ids))
    .orderBy(notifications.createdAt);

  const byUser = new Map<string, typeof rows>();
  for (const r of rows) byUser.set(r.n.userId, [...(byUser.get(r.n.userId) ?? []), r]);

  for (const group of byUser.values()) {
    const first = group[0];
    const groupIds = group.map((r) => r.n.id);
    // Conta inativa, e-mail não confirmado ou preferência desligada: o aviso fica só na plataforma.
    if (first.status !== "active" || !first.verified || !first.wants) {
      await db.update(notifications).set({ emailStatus: "skipped" }).where(inArray(notifications.id, groupIds));
      result.skipped += groupIds.length;
      continue;
    }
    try {
      await send({ to: first.email, ...composeDigest(first.name, group.map((r) => r.n)) });
      await db.update(notifications).set({ emailStatus: "sent", emailedAt: new Date() }).where(inArray(notifications.id, groupIds));
      result.emails++;
      result.notifications += groupIds.length;
    } catch (error) {
      const giveUp = first.n.emailAttempts >= EMAIL_RETRY.maxAttempts;
      await db.update(notifications).set({ emailStatus: giveUp ? "failed" : "pending" }).where(inArray(notifications.id, groupIds));
      if (giveUp) result.failed += groupIds.length;
      reportError(error, { event: "avisos.email_falhou", avisos: groupIds.length, desistiu: giveUp });
    }
  }
  logEvent("info", "avisos.email", result);
  return result;
}

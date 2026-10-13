import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { authTokens, rateLimitBuckets, sessions, supportTickets, userMfa } from "@/lib/db/schema";
import { getSetting } from "@/modules/settings/service";

const DAY = 24 * 3600_000;

// Prazos de guarda de dados técnicos. Nada aqui é financeiro nem de auditoria (esses são permanentes).
export const RETENTION = {
  // Sessões expiradas ou encerradas: mantidas por 30 dias para investigação de incidentes.
  sessionsDays: 30,
  // Links de confirmação de e-mail e de redefinição de senha já usados ou vencidos.
  authTokensDays: 7,
  // Janelas de limite de tentativas (as maiores duram 1 h).
  rateLimitHours: 24,
  // Ativações de verificação em duas etapas iniciadas e não concluídas.
  mfaEnrollmentHours: 24,
} as const;

export type CleanupResult = {
  sessions: number;
  authTokens: number;
  rateLimitBuckets: number;
  mfaEnrollments: number;
  contactsAnonymized: number;
};

// Rotina diária e idempotente: pode rodar várias vezes sem efeito adicional.
export async function runCleanup(now = new Date()): Promise<CleanupResult> {
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const contactDays = await getSetting("privacy.contact_retention_days");

  const removedSessions = await db
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, ago(RETENTION.sessionsDays * DAY)), lt(sessions.revokedAt, ago(RETENTION.sessionsDays * DAY))))
    .returning({ id: sessions.id });

  const removedTokens = await db
    .delete(authTokens)
    .where(or(lt(authTokens.expiresAt, ago(RETENTION.authTokensDays * DAY)), lt(authTokens.usedAt, ago(RETENTION.authTokensDays * DAY))))
    .returning({ id: authTokens.id });

  const removedBuckets = await db
    .delete(rateLimitBuckets)
    .where(lt(rateLimitBuckets.windowStart, ago(RETENTION.rateLimitHours * 3600_000)))
    .returning({ key: rateLimitBuckets.key });

  const removedEnrollments = await db
    .delete(userMfa)
    .where(and(isNull(userMfa.enabledAt), lt(userMfa.createdAt, ago(RETENTION.mfaEnrollmentHours * 3600_000))))
    .returning({ userId: userMfa.userId });

  // Contatos do formulário público (sem conta): o histórico da conversa fica, nome e e-mail saem.
  const anonymized = await db
    .update(supportTickets)
    .set({ contactName: null, contactEmail: null })
    .where(
      and(
        isNull(supportTickets.userId),
        eq(supportTickets.status, "closed"),
        isNotNull(supportTickets.contactEmail),
        lt(supportTickets.updatedAt, ago(contactDays * DAY)),
      ),
    )
    .returning({ id: supportTickets.id });

  return {
    sessions: removedSessions.length,
    authTokens: removedTokens.length,
    rateLimitBuckets: removedBuckets.length,
    mfaEnrollments: removedEnrollments.length,
    contactsAnonymized: anonymized.length,
  };
}

import { db, type Tx } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";

const SENSITIVE_KEYS = /pass(word)?|token|secret|hash|cpf|pix|email/i;

// Mascara campos sensíveis antes de gravar estados "antes/depois" na trilha.
export function maskSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SENSITIVE_KEYS.test(k) && v != null ? "[mascarado]" : maskSensitive(v),
      ]),
    );
  }
  return value;
}

export type AuditEntry = {
  actorId: string | null;
  actorRoles?: readonly string[];
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ipHash?: string | null;
};

export async function recordAudit(entry: AuditEntry, tx: Tx | typeof db = db): Promise<void> {
  await tx.insert(auditLogs).values({
    actorId: entry.actorId,
    actorRoles: [...(entry.actorRoles ?? [])],
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before === undefined ? null : maskSensitive(entry.before),
    after: entry.after === undefined ? null : maskSensitive(entry.after),
    ipHash: entry.ipHash ?? null,
  });
}

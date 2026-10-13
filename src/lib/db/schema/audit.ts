import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

// Trilha de auditoria append-only: UPDATE e DELETE são bloqueados por trigger (ver migração 0001).
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Contas nunca são apagadas fisicamente (são anonimizadas), então a referência é preservada.
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "restrict" }),
    actorRoles: text("actor_roles").array().notNull().default([]),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ipHash: text("ip_hash"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_actor_idx").on(t.actorId, t.occurredAt),
    index("audit_logs_occurred_idx").on(t.occurredAt),
  ],
);

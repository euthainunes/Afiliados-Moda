import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { brands } from "./catalog";
import { users } from "./identity";

export const integrationKind = pgEnum("integration_kind", ["order_source", "email", "payouts"]);
// disabled: desligada; demo: adaptador de demonstração (proibido em produção); live: serviço real.
export const integrationMode = pgEnum("integration_mode", ["disabled", "demo", "live"]);
export const integrationProvider = pgEnum("integration_provider", ["demo", "vtex", "console", "resend", "manual_pix"]);

// Registro central das integrações. Credenciais NUNCA ficam aqui: `secretEnv` guarda apenas o nome
// da variável de ambiente (ou do cofre) que contém o segredo.
export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: integrationKind("kind").notNull(),
    provider: integrationProvider("provider").notNull(),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    mode: integrationMode("mode").notNull().default("disabled"),
    config: jsonb("config").$type<Record<string, string>>().notNull().default({}),
    secretEnv: text("secret_env").array().notNull().default([]),
    cursor: text("cursor"),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    lastError: text("last_error"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("integrations_kind_brand_idx").on(t.kind, t.brandId)],
);

export const syncStatus = pgEnum("sync_status", ["running", "succeeded", "partial", "failed"]);

export type SyncCounters = { received: number; created: number; updated: number; unchanged: number; failed: number };

export const integrationSyncLogs = pgTable(
  "integration_sync_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "restrict" }),
    operation: text("operation").notNull(),
    mode: integrationMode("mode").notNull(),
    status: syncStatus("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(1),
    counters: jsonb("counters").$type<SyncCounters>(),
    error: text("error"),
    errorSample: jsonb("error_sample").$type<{ ref: string; reason: string }[]>(),
  },
  (t) => [index("integration_sync_logs_integration_idx").on(t.integrationId, t.startedAt)],
);

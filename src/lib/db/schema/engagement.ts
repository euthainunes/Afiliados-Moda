import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

const ts = (name: string) => timestamp(name, { withTimezone: true });

// pending: aguardando envio · sending: em envio · sent: enviado · skipped: não vai por e-mail · failed: desistiu após tentativas
export const notificationEmailStatus = pgEnum("notification_email_status", ["pending", "sending", "sent", "skipped", "failed"]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    // Evita notificar duas vezes o mesmo evento.
    dedupeKey: text("dedupe_key").notNull().unique(),
    readAt: ts("read_at"),
    isDemo: boolean("is_demo").notNull().default(false),
    // Fila de e-mail (envio fora da transação que criou o aviso; ver notifications/email.ts).
    emailStatus: notificationEmailStatus("email_status").notNull().default("pending"),
    emailAttempts: integer("email_attempts").notNull().default(0),
    // Quando o envio foi reservado; reservas antigas (processo interrompido) voltam para a fila.
    emailClaimedAt: ts("email_claimed_at"),
    emailedAt: ts("emailed_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt), index("notifications_email_queue_idx").on(t.emailStatus, t.createdAt)],
);

export const ticketStatus = pgEnum("ticket_status", ["open", "answered", "closed"]);
export const ticketCategory = pgEnum("ticket_category", ["conta", "looks", "recompensas", "resgate", "privacidade", "marca", "outro"]);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    // Para contatos sem conta (formulário público). Retenção curta (docs/03).
    contactEmail: text("contact_email"),
    contactName: text("contact_name"),
    category: ticketCategory("category").notNull(),
    subject: text("subject").notNull(),
    status: ticketStatus("status").notNull().default("open"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("support_tickets_user_idx").on(t.userId, t.updatedAt), index("support_tickets_status_idx").on(t.status, t.updatedAt)],
);

export const supportMessages = pgTable(
  "support_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    fromStaff: boolean("from_staff").notNull().default(false),
    body: text("body").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("support_messages_ticket_idx").on(t.ticketId, t.createdAt)],
);

// Parâmetros da plataforma editáveis no painel (com auditoria).
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "restrict" }),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

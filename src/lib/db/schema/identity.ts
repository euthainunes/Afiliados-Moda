import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  integer,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const citext = customType<{ data: string }>({ dataType: () => "citext" });

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const userStatus = pgEnum("user_status", ["active", "suspended", "deleted"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: citext("email").notNull().unique(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  passwordHash: text("password_hash").notNull(),
  status: userStatus("status").notNull().default("active"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ...timestamps,
});

export const profiles = pgTable(
  "profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    username: text("username").notNull(),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    // Preferência da titular: receber por e-mail os avisos importantes (vendas, recompensas, resgates, suporte).
    emailNotifications: boolean("email_notifications").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("profiles_username_lower_idx").on(sql`lower(${t.username})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 do token do cookie; o token em claro nunca é armazenado.
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    // Momento em que o segundo fator foi confirmado nesta sessão (null = ainda não confirmado).
    mfaVerifiedAt: timestamp("mfa_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

export const authTokenType = pgEnum("auth_token_type", ["email_verification", "password_reset"]);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: authTokenType("type").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_tokens_user_type_idx").on(t.userId, t.type)],
);

export const consentDocument = pgEnum("consent_document", ["terms", "privacy", "rewards_rules"]);

// Histórico de aceites: nunca sobrescrito.
export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    document: consentDocument("document").notNull(),
    version: text("version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consents_user_idx").on(t.userId)],
);

export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
});

// Segundo fator (TOTP, RFC 6238). O segredo fica criptografado (AES-256-GCM); enabledAt null = cadastro em andamento.
export const userMfa = pgTable("user_mfa", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  secretEnc: text("secret_enc").notNull(),
  enabledAt: timestamp("enabled_at", { withTimezone: true }),
  // Último intervalo de 30 s aceito: impede reutilizar o mesmo código (replay).
  lastUsedStep: bigint("last_used_step", { mode: "number" }).notNull().default(0),
  ...timestamps,
});

// Códigos de recuperação: guardados apenas como HMAC; cada um vale uma vez.
export const mfaRecoveryCodes = pgTable(
  "mfa_recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull().unique(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mfa_recovery_codes_user_idx").on(t.userId)],
);

// Contas externas vinculadas (login social). A ligação é pelo identificador estável do provedor ("sub"),
// não pelo e-mail, que pode mudar.
export const userIdentities = pgTable(
  "user_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    subject: text("subject").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("user_identities_provider_subject_idx").on(t.provider, t.subject), uniqueIndex("user_identities_user_provider_idx").on(t.userId, t.provider)],
);

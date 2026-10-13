import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { brands, campaigns, products } from "./catalog";
import { users } from "./identity";
import { looks } from "./looks";

// Um link curto por peça de um look: /r/{code}.
export const trackingLinks = pgTable(
  "tracking_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    lookId: uuid("look_id")
      .notNull()
      .references(() => looks.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tracking_links_look_product_idx").on(t.lookId, t.productId)],
);

// Clique de saída para a loja. Dados mínimos: IP e navegador apenas como HMAC (docs/03 §3).
export const clicks = pgTable(
  "clicks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Identificador público enviado à loja (ULID, ordenável no tempo, sem dados pessoais).
    clickId: text("click_id").notNull(),
    trackingLinkId: uuid("tracking_link_id")
      .notNull()
      .references(() => trackingLinks.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    lookId: uuid("look_id")
      .notNull()
      .references(() => looks.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "restrict" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "restrict" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    ipHash: text("ip_hash"),
    uaHash: text("ua_hash"),
    referrerDomain: text("referrer_domain"),
    isBot: boolean("is_bot").notNull().default(false),
    isSelfClick: boolean("is_self_click").notNull().default(false),
    destinationUrl: text("destination_url").notNull(),
  },
  (t) => [
    uniqueIndex("clicks_click_id_idx").on(t.clickId),
    index("clicks_look_idx").on(t.lookId, t.occurredAt),
    index("clicks_user_idx").on(t.userId, t.occurredAt),
  ],
);

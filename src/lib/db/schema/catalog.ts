import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// Dinheiro sempre em centavos inteiros (docs/03).
const cents = (name: string) => bigint(name, { mode: "number" });

export const brandStatus = pgEnum("brand_status", ["active", "inactive"]);

// Parâmetros de rastreamento acrescentados à URL de destino. Os valores aceitam os marcadores
// {click_id} e {campaign}. Para a Suntime, dependem da auditoria VTEX (docs/05 §6) e começam vazios.
export type TrackingConfig = { params: Record<string, string> };

export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: brandStatus("status").notNull().default("active"),
  website: text("website"),
  // Domínios aceitos como destino de produtos (protege o redirecionador contra links indevidos no feed).
  allowedDomains: text("allowed_domains").array().notNull().default([]),
  trackingConfig: jsonb("tracking_config").$type<TrackingConfig>().notNull().default({ params: {} }),
  // Marca de dados fictícios (testes e demonstração), nunca exibida como parceira real.
  isFictitious: boolean("is_fictitious").notNull().default(false),
  ...timestamps,
});

export const campaignStatus = pgEnum("campaign_status", ["draft", "active", "ended"]);

// Campanhas por marca. As regras de comissão (versionadas) entram na Fase 6.
export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: campaignStatus("status").notNull().default("draft"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("campaigns_brand_slug_idx").on(t.brandId, t.slug)],
);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ...timestamps,
});

export const availability = pgEnum("availability", ["in_stock", "out_of_stock"]);
// listed: aparece no catálogo; unlisted: saiu do feed (continua visível nos looks como indisponível).
export const productStatus = pgEnum("product_status", ["listed", "unlisted"]);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "restrict" }),
    // Identificador do produto na loja (item_group_id do feed, ou o id do item quando não houver grupo).
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    externalCategory: text("external_category"),
    url: text("url").notNull(),
    imageUrls: text("image_urls").array().notNull().default([]),
    priceCents: cents("price_cents").notNull(),
    salePriceCents: cents("sale_price_cents"),
    currency: text("currency").notNull().default("BRL"),
    availability: availability("availability").notNull(),
    status: productStatus("status").notNull().default("listed"),
    color: text("color"),
    gender: text("gender"),
    // Texto normalizado (minúsculas, sem acentos) para busca por trigramas.
    searchText: text("search_text").notNull(),
    contentHash: text("content_hash").notNull(),
    lastSeenRunId: uuid("last_seen_run_id"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("products_brand_external_idx").on(t.brandId, t.externalId),
    index("products_listing_idx").on(t.status, t.availability, t.categoryId),
    index("products_price_idx").on(t.priceCents),
    index("products_search_trgm_idx").using("gin", sql`${t.searchText} gin_trgm_ops`),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    externalSku: text("external_sku").notNull(),
    size: text("size"),
    color: text("color"),
    availability: availability("availability").notNull(),
    priceCents: cents("price_cents").notNull(),
    salePriceCents: cents("sale_price_cents"),
    url: text("url").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("product_variants_sku_idx").on(t.productId, t.externalSku)],
);

export const productPriceHistory = pgTable(
  "product_price_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    priceCents: cents("price_cents").notNull(),
    salePriceCents: cents("sale_price_cents"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("product_price_history_product_idx").on(t.productId, t.observedAt)],
);

export const feedFormat = pgEnum("feed_format", ["google_merchant_xml"]);

export const productFeeds = pgTable("product_feeds", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "restrict" }),
  // URL https do feed, ou "file:caminho" (somente fora de produção, para o feed fictício).
  source: text("source").notNull(),
  format: feedFormat("format").notNull().default("google_merchant_xml"),
  ...timestamps,
});

export const importRunStatus = pgEnum("import_run_status", ["running", "succeeded", "failed"]);

export type ImportStats = {
  itemsRead: number;
  productsUpserted: number;
  productsUnchanged: number;
  variantsUpserted: number;
  itemsRejected: number;
  productsUnlisted: number;
  priceChanges: number;
  unlistingSkipped?: boolean;
};

export const importRuns = pgTable(
  "import_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    feedId: uuid("feed_id")
      .notNull()
      .references(() => productFeeds.id, { onDelete: "restrict" }),
    status: importRunStatus("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    triggeredBy: uuid("triggered_by").references(() => users.id, { onDelete: "restrict" }),
    stats: jsonb("stats").$type<ImportStats>(),
    // Amostra dos itens rejeitados (id do item + motivo), limitada para não crescer sem controle.
    errors: jsonb("errors").$type<{ itemId: string; reason: string }[]>(),
    errorMessage: text("error_message"),
  },
  (t) => [index("import_runs_feed_idx").on(t.feedId, t.startedAt)],
);

export const favorites = pgTable(
  "favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] })],
);

import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { brands, campaigns } from "./catalog";
import { commissionRules } from "./commercial";
import { users } from "./identity";
import { integrations } from "./integrations";
import { looks } from "./looks";
import { clicks } from "./tracking";

const cents = (name: string) => bigint(name, { mode: "number" });
const ts = (name: string) => timestamp(name, { withTimezone: true });

// ---- Pedidos (espelho mínimo do pedido na loja; sem dados pessoais da compradora) ----

export const orderStatus = pgEnum("order_status", ["created", "paid", "invoiced", "delivered", "canceled", "returned"]);

export type AttributionEvidence = { clickId: string | null; method: string; raw?: Record<string, string> };

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "restrict" }),
    integrationId: uuid("integration_id").references(() => integrations.id, { onDelete: "restrict" }),
    externalOrderId: text("external_order_id").notNull(),
    storeCreatedAt: ts("store_created_at").notNull(),
    status: orderStatus("status").notNull(),
    statusRaw: text("status_raw").notNull(),
    statusChangedAt: ts("status_changed_at").notNull(),
    currency: text("currency").notNull().default("BRL"),
    itemsTotalCents: cents("items_total_cents").notNull(),
    discountsCents: cents("discounts_cents").notNull().default(0),
    shippingCents: cents("shipping_cents").notNull().default(0),
    attribution: jsonb("attribution").$type<AttributionEvidence>().notNull(),
    contentHash: text("content_hash").notNull(),
    isTest: boolean("is_test").notNull().default(false),
    isDemo: boolean("is_demo").notNull().default(false),
    firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("orders_brand_external_idx").on(t.brandId, t.externalOrderId), index("orders_brand_created_idx").on(t.brandId, t.storeCreatedAt)],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    externalSku: text("external_sku").notNull(),
    title: text("title"),
    quantity: integer("quantity").notNull(),
    unitPriceCents: cents("unit_price_cents").notNull(),
    listPriceCents: cents("list_price_cents").notNull(),
    discountCents: cents("discount_cents").notNull().default(0),
    returnedQuantity: integer("returned_quantity").notNull().default(0),
  },
  (t) => [uniqueIndex("order_items_order_sku_idx").on(t.orderId, t.externalSku), check("order_items_qty", sql`${t.quantity} > 0 and ${t.returnedQuantity} between 0 and ${t.quantity}`)],
);

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: orderStatus("status").notNull(),
    statusRaw: text("status_raw").notNull(),
    changedAt: ts("changed_at").notNull(),
    recordedAt: ts("recorded_at").notNull().defaultNow(),
  },
  (t) => [index("order_status_history_order_idx").on(t.orderId, t.changedAt)],
);

// ---- Conversões (venda atribuída) ----

export const conversionState = pgEnum("conversion_state", ["registered", "in_validation", "approved", "rejected", "canceled"]);

export type RuleSnapshot = {
  ruleId: string;
  version: number;
  baseType: string;
  commissionBps: number;
  userShareBps: number;
  platformShareBps: number;
  attributionWindowDays: number;
  eligibilityPolicy: { startEvent: string; waitDays: number; requireBrandPaymentReceived: boolean };
};

export const conversions = pgTable(
  "conversions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "restrict" }),
    clickId: uuid("click_id")
      .notNull()
      .references(() => clicks.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    lookId: uuid("look_id")
      .notNull()
      .references(() => looks.id, { onDelete: "restrict" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "restrict" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "restrict" }),
    commissionRuleId: uuid("commission_rule_id").references(() => commissionRules.id, { onDelete: "restrict" }),
    ruleSnapshot: jsonb("rule_snapshot").$type<RuleSnapshot>(),
    state: conversionState("state").notNull(),
    rejectionReason: text("rejection_reason"),
    // Valores vigentes (após devoluções). O histórico completo está no livro-razão.
    baseAmountCents: cents("base_amount_cents").notNull().default(0),
    commissionCents: cents("commission_cents").notNull().default(0),
    userRewardCents: cents("user_reward_cents").notNull().default(0),
    platformCents: cents("platform_cents").notNull().default(0),
    registeredAt: ts("registered_at").notNull().defaultNow(),
    approvedAt: ts("approved_at"),
    eligibleFrom: ts("eligible_from"),
    eligibleAt: ts("eligible_at"),
    canceledAt: ts("canceled_at"),
    isDemo: boolean("is_demo").notNull().default(false),
    updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("conversions_user_idx").on(t.userId, t.registeredAt),
    index("conversions_state_idx").on(t.state, t.brandId, t.registeredAt),
    check("conversions_split", sql`${t.userRewardCents} + ${t.platformCents} = ${t.commissionCents}`),
  ],
);

// ---- Livro-razão de partidas dobradas (imutável; soma de cada transação = 0) ----

export const ledgerAccount = pgEnum("ledger_account", [
  "brand_receivable_estimated", // comissão estimada a receber da marca (ativo)
  "brand_receivable_confirmed", // comissão confirmada a receber (ativo)
  "cash", // caixa da plataforma (ativo)
  "user_reward_pending", // recompensa pendente devida à usuária (passivo)
  "user_reward_eligible", // recompensa elegível para resgate (passivo)
  "user_reward_in_payout", // recompensa em resgate (passivo)
  "platform_revenue_estimated", // receita estimada da plataforma
  "platform_revenue_confirmed", // receita confirmada da plataforma
  "adjustments", // contrapartida de ajustes manuais aprovados
]);

export const ledgerTransactions = pgTable(
  "ledger_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    kind: text("kind").notNull(),
    conversionId: uuid("conversion_id").references(() => conversions.id, { onDelete: "restrict" }),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    reason: text("reason").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "restrict" }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "restrict" }),
    isDemo: boolean("is_demo").notNull().default(false),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
  },
  (t) => [index("ledger_transactions_conversion_idx").on(t.conversionId), index("ledger_transactions_occurred_idx").on(t.occurredAt)],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: "restrict" }),
    account: ledgerAccount("account").notNull(),
    // Dono do saldo: usuária (contas user_*), marca (brand_*) ou nulo (plataforma).
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "restrict" }),
    // Débito positivo, crédito negativo.
    amountCents: cents("amount_cents").notNull(),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ledger_entries_user_idx").on(t.userId, t.account),
    index("ledger_entries_brand_idx").on(t.brandId, t.account),
    index("ledger_entries_tx_idx").on(t.transactionId),
    check("ledger_entries_nonzero", sql`${t.amountCents} <> 0`),
  ],
);

// ---- Resgates ----

export const payoutAccounts = pgTable("payout_accounts", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  pixKeyType: text("pix_key_type").notNull(),
  pixKeyEnc: text("pix_key_enc").notNull(),
  pixKeyHint: text("pix_key_hint").notNull(),
  cpfEnc: text("cpf_enc").notNull(),
  cpfHash: text("cpf_hash").notNull().unique(),
  holderName: text("holder_name").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const payoutStatus = pgEnum("payout_status", ["requested", "approved", "rejected", "paid", "canceled"]);

export const payoutRequests = pgTable(
  "payout_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amountCents: cents("amount_cents").notNull(),
    status: payoutStatus("status").notNull().default("requested"),
    pixKeyHint: text("pix_key_hint").notNull(),
    requestedAt: ts("requested_at").notNull().defaultNow(),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
    reviewedAt: ts("reviewed_at"),
    reviewNote: text("review_note"),
    paidBy: uuid("paid_by").references(() => users.id, { onDelete: "restrict" }),
    paidAt: ts("paid_at"),
    // Referência do comprovante (ID da transação PIX). Em demonstração: sempre "SIMULADO".
    paymentReference: text("payment_reference"),
    simulated: boolean("simulated").notNull().default(false),
    isDemo: boolean("is_demo").notNull().default(false),
  },
  (t) => [
    index("payout_requests_user_idx").on(t.userId, t.requestedAt),
    index("payout_requests_status_idx").on(t.status, t.requestedAt),
    // Uma solicitação em aberto por usuária.
    uniqueIndex("payout_requests_one_open_idx").on(t.userId).where(sql`${t.status} in ('requested', 'approved')`),
    check("payout_requests_positive", sql`${t.amountCents} > 0`),
  ],
);

// ---- Cobrança das marcas ----

export const invoiceStatus = pgEnum("invoice_status", ["issued", "paid", "canceled"]);

export const brandInvoices = pgTable("brand_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "restrict" }),
  number: integer("number").notNull().unique(),
  periodStart: ts("period_start").notNull(),
  periodEnd: ts("period_end").notNull(),
  amountCents: cents("amount_cents").notNull(),
  status: invoiceStatus("status").notNull().default("issued"),
  issuedBy: uuid("issued_by").references(() => users.id, { onDelete: "restrict" }),
  issuedAt: ts("issued_at").notNull().defaultNow(),
  isDemo: boolean("is_demo").notNull().default(false),
});

export const brandInvoiceItems = pgTable("brand_invoice_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => brandInvoices.id, { onDelete: "restrict" }),
  // Uma conversão é faturada uma única vez.
  conversionId: uuid("conversion_id")
    .notNull()
    .unique()
    .references(() => conversions.id, { onDelete: "restrict" }),
  amountCents: cents("amount_cents").notNull(),
});

export const brandPayments = pgTable("brand_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => brandInvoices.id, { onDelete: "restrict" }),
  amountCents: cents("amount_cents").notNull(),
  receivedAt: ts("received_at").notNull(),
  reference: text("reference").notNull(),
  simulated: boolean("simulated").notNull().default(false),
  registeredBy: uuid("registered_by").references(() => users.id, { onDelete: "restrict" }),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// ---- Ajustes manuais (quatro olhos) ----

export const adjustmentStatus = pgEnum("adjustment_status", ["proposed", "approved", "rejected"]);

export const ledgerAdjustments = pgTable("ledger_adjustments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  conversionId: uuid("conversion_id").references(() => conversions.id, { onDelete: "restrict" }),
  // Valor a creditar (positivo) ou debitar (negativo) do saldo elegível da usuária.
  amountCents: cents("amount_cents").notNull(),
  reason: text("reason").notNull(),
  status: adjustmentStatus("status").notNull().default("proposed"),
  proposedBy: uuid("proposed_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
  reviewedAt: ts("reviewed_at"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// ---- Conciliação ----

export const reconciliationStatus = pgEnum("reconciliation_status", ["open", "explained"]);

export const reconciliationItems = pgTable(
  "reconciliation_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Chave estável da divergência (evita duplicar o mesmo achado em execuções seguidas).
    fingerprint: text("fingerprint").notNull().unique(),
    kind: text("kind").notNull(),
    description: text("description").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
    conversionId: uuid("conversion_id").references(() => conversions.id, { onDelete: "restrict" }),
    expectedCents: cents("expected_cents"),
    observedCents: cents("observed_cents"),
    status: reconciliationStatus("status").notNull().default("open"),
    resolutionNote: text("resolution_note"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "restrict" }),
    detectedAt: ts("detected_at").notNull().defaultNow(),
    resolvedAt: ts("resolved_at"),
    isDemo: boolean("is_demo").notNull().default(false),
  },
  (t) => [index("reconciliation_items_status_idx").on(t.status, t.detectedAt)],
);

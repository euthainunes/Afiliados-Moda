import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { campaigns } from "./catalog";
import { users } from "./identity";

// Base de cálculo contratual (decisão D1 pendente: a opção é escolhida por regra, nunca fixada no código).
export const commissionBase = pgEnum("commission_base", [
  "item_net_paid", // valor pago pelos itens atribuídos, líquido de descontos, sem frete
  "item_list_price", // preço de tabela dos itens
  "order_total_excl_shipping", // total do pedido sem frete
]);

// Marco que inicia a contagem do prazo de elegibilidade (decisão D4 pendente).
export const eligibilityStart = pgEnum("eligibility_start", ["order_created", "order_invoiced", "order_delivered"]);

export const ruleStatus = pgEnum("commission_rule_status", ["draft", "approved", "rejected"]);

export type EligibilityPolicy = {
  startEvent: "order_created" | "order_invoiced" | "order_delivered";
  waitDays: number;
  requireBrandPaymentReceived: boolean;
};

// Regras comerciais versionadas por campanha (docs/03 e docs/05 §2).
// Percentuais em pontos-base: 2500 = 25,00%. Imutáveis após aprovação (trigger na migração 0004).
export const commissionRules = pgTable(
  "commission_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    status: ruleStatus("status").notNull().default("draft"),
    baseType: commissionBase("base_type").notNull(),
    commissionBps: integer("commission_bps").notNull(),
    userShareBps: integer("user_share_bps").notNull(),
    platformShareBps: integer("platform_share_bps").notNull(),
    attributionWindowDays: integer("attribution_window_days").notNull(),
    eligibilityPolicy: jsonb("eligibility_policy").$type<EligibilityPolicy>().notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    contractReference: text("contract_reference"),
    notes: text("notes"),
    proposedBy: uuid("proposed_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("commission_rules_campaign_version_idx").on(t.campaignId, t.version),
    index("commission_rules_campaign_status_idx").on(t.campaignId, t.status, t.validFrom),
    check("commission_rules_bps_range", sql`${t.commissionBps} between 0 and 10000 and ${t.userShareBps} >= 0 and ${t.platformShareBps} >= 0`),
    check("commission_rules_split_sum", sql`${t.userShareBps} + ${t.platformShareBps} = ${t.commissionBps}`),
    check("commission_rules_window", sql`${t.attributionWindowDays} between 1 and 90`),
    check("commission_rules_validity", sql`${t.validTo} is null or ${t.validTo} > ${t.validFrom}`),
    check("commission_rules_approved_has_contract", sql`${t.status} <> 'approved' or coalesce(length(trim(${t.contractReference})), 0) > 0`),
  ],
);

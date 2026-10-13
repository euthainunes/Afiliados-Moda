import { and, count, desc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  brandInvoiceItems,
  brands,
  conversions,
  ledgerAdjustments,
  ledgerEntries,
  ledgerTransactions,
  looks,
  orders,
  payoutRequests,
  profiles,
  reconciliationItems,
} from "@/lib/db/schema";
import { assertCan, type Principal } from "@/modules/access/can";

export type ConversionFilters = { state?: string; brand?: string; demo?: "sim" | "nao"; page?: number };

export async function listConversionsAdmin(actor: Principal, f: ConversionFilters, pageSize = 50) {
  assertCan(actor, "orders.read");
  const conditions: SQL[] = [];
  if (f.state && ["registered", "in_validation", "approved", "rejected", "canceled"].includes(f.state)) conditions.push(eq(conversions.state, f.state as "approved"));
  if (f.brand) conditions.push(eq(brands.slug, f.brand));
  if (f.demo) conditions.push(eq(conversions.isDemo, f.demo === "sim"));
  const where = conditions.length ? and(...conditions) : undefined;
  const page = Math.max(1, f.page ?? 1);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        conversion: conversions,
        externalOrderId: orders.externalOrderId,
        orderStatus: orders.status,
        brandName: brands.name,
        lookTitle: looks.title,
        creator: profiles.displayName,
        invoiced: brandInvoiceItems.invoiceId,
      })
      .from(conversions)
      .innerJoin(orders, eq(orders.id, conversions.orderId))
      .innerJoin(brands, eq(brands.id, conversions.brandId))
      .innerJoin(looks, eq(looks.id, conversions.lookId))
      .innerJoin(profiles, eq(profiles.userId, conversions.userId))
      .leftJoin(brandInvoiceItems, eq(brandInvoiceItems.conversionId, conversions.id))
      .where(where)
      .orderBy(desc(conversions.registeredAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(conversions).innerJoin(brands, eq(brands.id, conversions.brandId)).where(where),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function listOrdersWithoutConversion(actor: Principal, limit = 50) {
  assertCan(actor, "orders.read");
  return db
    .select({ order: orders, brandName: brands.name })
    .from(orders)
    .innerJoin(brands, eq(brands.id, orders.brandId))
    .leftJoin(conversions, eq(conversions.orderId, orders.id))
    .where(isNull(conversions.id))
    .orderBy(desc(orders.storeCreatedAt))
    .limit(limit);
}

export async function listPayoutsAdmin(actor: Principal, status?: string) {
  assertCan(actor, "payouts.review");
  const valid = ["requested", "approved", "rejected", "paid", "canceled"];
  return db
    .select({ payout: payoutRequests, userName: profiles.displayName, username: profiles.username })
    .from(payoutRequests)
    .innerJoin(profiles, eq(profiles.userId, payoutRequests.userId))
    .where(status && valid.includes(status) ? eq(payoutRequests.status, status as "paid") : undefined)
    .orderBy(desc(payoutRequests.requestedAt))
    .limit(200);
}

export async function recentLedger(actor: Principal, limit = 60) {
  assertCan(actor, "ledger.read");
  const txs = await db.select().from(ledgerTransactions).orderBy(desc(ledgerTransactions.occurredAt)).limit(limit);
  const entries = txs.length ? await db.select().from(ledgerEntries).where(inArray(ledgerEntries.transactionId, txs.map((t) => t.id))) : [];
  return txs.map((t) => ({ tx: t, entries: entries.filter((e) => e.transactionId === t.id) }));
}

export async function listAdjustments(actor: Principal) {
  assertCan(actor, "ledger.read");
  return db
    .select({ adjustment: ledgerAdjustments, userName: profiles.displayName })
    .from(ledgerAdjustments)
    .innerJoin(profiles, eq(profiles.userId, ledgerAdjustments.userId))
    .orderBy(desc(ledgerAdjustments.createdAt))
    .limit(100);
}

export async function listReconciliation(actor: Principal, status: "open" | "explained" = "open") {
  assertCan(actor, "reconciliation.manage");
  return db.select().from(reconciliationItems).where(eq(reconciliationItems.status, status)).orderBy(desc(reconciliationItems.detectedAt)).limit(200);
}

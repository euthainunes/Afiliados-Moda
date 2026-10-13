import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import { brands, integrations, integrationSyncLogs, orderItems, orders, orderStatusHistory, type SyncCounters } from "@/lib/db/schema";
import type { ExternalOrder } from "@/integrations/contracts";
import { IntegrationError, withRetry } from "@/integrations/errors";
import { orderSourceFor } from "@/integrations/registry";
import { processOrderConversion } from "@/modules/finance/conversions";

const MAX_ERROR_SAMPLE = 50;

export function orderHash(o: ExternalOrder): string {
  return createHash("sha256")
    .update(JSON.stringify({ s: o.status, sc: o.statusChangedAt.toISOString(), i: o.items, sh: o.shippingCents, a: o.attribution.clickId }))
    .digest("hex");
}

// Grava ou atualiza o espelho do pedido. Idempotente: pedido idêntico ao já gravado não muda nada.
export async function upsertExternalOrder(tx: Tx, brandId: string, integrationId: string | null, o: ExternalOrder, isDemo: boolean) {
  if (o.items.length === 0) throw new Error("pedido sem itens");
  const contentHash = orderHash(o);
  const [existing] = await tx.select().from(orders).where(and(eq(orders.brandId, brandId), eq(orders.externalOrderId, o.externalId))).for("update");
  if (existing && existing.contentHash === contentHash) return { orderId: existing.id, status: "unchanged" as const };
  if (existing && existing.isDemo !== isDemo) throw new Error("pedido real e de demonstração com o mesmo identificador");

  const discounts = o.items.reduce((s, i) => s + i.discountCents, 0);
  const itemsTotal = o.items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
  const values = {
    brandId,
    integrationId,
    externalOrderId: o.externalId,
    storeCreatedAt: o.createdAt,
    status: o.status,
    statusRaw: o.statusRaw,
    statusChangedAt: o.statusChangedAt,
    currency: o.currency,
    itemsTotalCents: itemsTotal,
    discountsCents: discounts,
    shippingCents: o.shippingCents,
    attribution: o.attribution,
    contentHash,
    isTest: o.isTest,
    isDemo,
  };
  let orderId: string;
  if (existing) {
    await tx.update(orders).set(values).where(eq(orders.id, existing.id));
    orderId = existing.id;
  } else {
    [{ id: orderId }] = await tx.insert(orders).values(values).returning({ id: orders.id });
  }
  for (const i of o.items) {
    const item = { title: i.title, quantity: i.quantity, unitPriceCents: i.unitPriceCents, listPriceCents: i.listPriceCents, discountCents: i.discountCents, returnedQuantity: i.returnedQuantity };
    await tx.insert(orderItems).values({ orderId, externalSku: i.externalSku, ...item }).onConflictDoUpdate({ target: [orderItems.orderId, orderItems.externalSku], set: item });
  }
  const known = await tx.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, orderId));
  const history = o.statusHistory.length ? o.statusHistory : [{ status: o.status, statusRaw: o.statusRaw, at: o.statusChangedAt }];
  for (const h of history) {
    if (!known.some((k) => k.status === h.status && k.changedAt.getTime() === h.at.getTime())) {
      await tx.insert(orderStatusHistory).values({ orderId, status: h.status, statusRaw: h.statusRaw, changedAt: h.at });
    }
  }
  return { orderId, status: existing ? ("updated" as const) : ("created" as const) };
}

export type SyncResult = { logId: string; status: "succeeded" | "partial" | "failed"; counters: SyncCounters; error?: string };

// Sincroniza uma fonte de pedidos: busca com tentativas controladas, grava cada pedido em sua própria
// transação (um pedido com problema não derruba os demais) e registra tudo no histórico de sincronização.
export async function syncOrderIntegration(integrationId: string, { since, now = new Date() }: { since?: Date; now?: Date } = {}): Promise<SyncResult> {
  const [row] = await db.select().from(integrations).where(eq(integrations.id, integrationId));
  if (!row || !row.brandId) throw new Error("Integração não encontrada.");
  const brand = await db.query.brands.findFirst({ where: eq(brands.id, row.brandId) });
  const counters: SyncCounters = { received: 0, created: 0, updated: 0, unchanged: 0, failed: 0 };
  const errors: { ref: string; reason: string }[] = [];
  const [log] = await db.insert(integrationSyncLogs).values({ integrationId, operation: "orders.sync", mode: row.mode }).returning({ id: integrationSyncLogs.id });

  const fail = async (message: string, attempts = 1): Promise<SyncResult> => {
    await db.update(integrationSyncLogs).set({ status: "failed", finishedAt: new Date(), error: message.slice(0, 500), attempts, counters }).where(eq(integrationSyncLogs.id, log.id));
    await db
      .update(integrations)
      .set({ lastErrorAt: new Date(), lastError: message.slice(0, 500), consecutiveFailures: row.consecutiveFailures + 1 })
      .where(eq(integrations.id, integrationId));
    return { logId: log.id, status: "failed", counters, error: message };
  };

  let fetched: ExternalOrder[];
  let attempts = 1;
  try {
    const source = await orderSourceFor(row);
    // Janela com sobreposição de 2 h sobre o cursor anterior: nada se perde entre execuções.
    const from = since ?? (row.cursor ? new Date(new Date(row.cursor).getTime() - 2 * 3_600_000) : new Date(now.getTime() - 30 * 86_400_000));
    const r = await withRetry(() => source.fetchOrdersUpdatedSince(from), { attempts: 3, baseDelayMs: 1000 });
    fetched = r.value;
    attempts = r.attempts;
    if (source.isDemo && !brand?.isFictitious) return fail("Fonte de demonstração associada a marca real.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Falha desconhecida", error instanceof IntegrationError ? 3 : 1);
  }

  let cursor = row.cursor ? new Date(row.cursor) : new Date(0);
  for (const order of fetched) {
    counters.received++;
    try {
      await db.transaction(async (tx) => {
        const result = await upsertExternalOrder(tx, row.brandId!, row.id, order, row.mode === "demo");
        counters[result.status]++;
        if (result.status !== "unchanged") await processOrderConversion(tx, result.orderId, now);
      });
      if (order.statusChangedAt > cursor) cursor = order.statusChangedAt;
    } catch (error) {
      counters.failed++;
      if (errors.length < MAX_ERROR_SAMPLE) errors.push({ ref: order.externalId, reason: error instanceof Error ? error.message.slice(0, 200) : "erro" });
    }
  }

  const status = counters.failed === 0 ? "succeeded" : counters.failed < counters.received ? "partial" : "failed";
  await db.update(integrationSyncLogs).set({ status, finishedAt: new Date(), attempts, counters, errorSample: errors }).where(eq(integrationSyncLogs.id, log.id));
  await db
    .update(integrations)
    .set(
      status === "failed"
        ? { lastErrorAt: new Date(), lastError: errors[0]?.reason ?? "falha", consecutiveFailures: row.consecutiveFailures + 1 }
        : { lastSuccessAt: new Date(), consecutiveFailures: 0, cursor: cursor.getTime() > 0 ? cursor.toISOString() : row.cursor },
    )
    .where(eq(integrations.id, integrationId));
  return { logId: log.id, status, counters };
}

// Reprocessa a conversão de um pedido já gravado (ex.: após correção de regra ou de clique).
export async function reprocessOrder(orderId: string) {
  return db.transaction((tx) => processOrderConversion(tx, orderId));
}

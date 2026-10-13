import { createHash } from "node:crypto";
import { and, asc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { type Tx } from "@/lib/db";
import { clicks, commissionRules, conversions, orderItems, orders, orderStatusHistory, type RuleSnapshot } from "@/lib/db/schema";
import { formatCents } from "@/lib/money";
import { notify } from "@/modules/notifications/service";
import { getSetting } from "@/modules/settings/service";
import { baseAmount, splitCommission } from "./calc";
import { conversionPosted, postTransaction } from "./ledger";

const DAY = 86_400_000;

export type ConversionOutcome =
  | { kind: "unattributed"; reason: string }
  | { kind: "rejected"; conversionId: string; reason: string }
  | { kind: "processed"; conversionId: string; state: string; changed: boolean };

async function ruleAt(tx: Tx, campaignId: string, at: Date) {
  const [rule] = await tx
    .select()
    .from(commissionRules)
    .where(
      and(
        eq(commissionRules.campaignId, campaignId),
        eq(commissionRules.status, "approved"),
        lte(commissionRules.validFrom, at),
        or(isNull(commissionRules.validTo), gt(commissionRules.validTo, at)),
      ),
    )
    .limit(1);
  return rule ?? null;
}

function snapshotOf(rule: typeof commissionRules.$inferSelect): RuleSnapshot {
  return {
    ruleId: rule.id,
    version: rule.version,
    baseType: rule.baseType,
    commissionBps: rule.commissionBps,
    userShareBps: rule.userShareBps,
    platformShareBps: rule.platformShareBps,
    attributionWindowDays: rule.attributionWindowDays,
    eligibilityPolicy: rule.eligibilityPolicy,
  };
}

// Data em que o pedido atingiu o marco que inicia a contagem do prazo de elegibilidade.
function startDate(history: { status: string; changedAt: Date }[], createdAt: Date, startEvent: string): Date | null {
  if (startEvent === "order_created") return createdAt;
  const accepted = startEvent === "order_delivered" ? ["delivered"] : ["invoiced", "delivered"];
  return history.find((h) => accepted.includes(h.status))?.changedAt ?? null;
}

// Cria ou atualiza a conversão de um pedido e lança no livro-razão apenas as DIFERENÇAS entre o que
// já foi lançado e o valor correto agora. Reprocessar o mesmo pedido não gera lançamentos novos.
export async function processOrderConversion(tx: Tx, orderId: string, now = new Date()): Promise<ConversionOutcome> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!order) throw new Error("Pedido não encontrado.");
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const history = await tx.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, orderId)).orderBy(asc(orderStatusHistory.changedAt));

  let [conversion] = await tx.select().from(conversions).where(eq(conversions.orderId, orderId)).for("update");

  if (!conversion) {
    const publicClickId = order.attribution.clickId;
    if (!publicClickId) return { kind: "unattributed", reason: "pedido sem identificador de clique" };
    const [click] = await tx.select().from(clicks).where(eq(clicks.clickId, publicClickId)).limit(1);
    if (!click || click.brandId !== order.brandId || click.isBot) return { kind: "unattributed", reason: "nenhum clique válido corresponde ao identificador" };

    const rule = click.campaignId ? await ruleAt(tx, click.campaignId, click.occurredAt) : null;
    const elapsed = order.storeCreatedAt.getTime() - click.occurredAt.getTime();
    let reason: string | null = null;
    if (elapsed < 0) reason = "pedido anterior ao clique";
    else if (click.isSelfClick && (await getSetting("attribution.reject_self_purchase"))) reason = "compra originada de clique da própria autora (autocompra)";
    else if (!rule) reason = "sem regra comercial aprovada na data do clique";
    else if (elapsed > rule.attributionWindowDays * DAY) reason = `fora da janela de atribuição de ${rule.attributionWindowDays} dias`;

    [conversion] = await tx
      .insert(conversions)
      .values({
        orderId,
        clickId: click.id,
        userId: click.userId,
        lookId: click.lookId,
        brandId: click.brandId,
        campaignId: click.campaignId,
        commissionRuleId: rule?.id ?? null,
        ruleSnapshot: rule ? snapshotOf(rule) : null,
        state: reason ? "rejected" : "registered",
        rejectionReason: reason,
        registeredAt: order.storeCreatedAt,
        isDemo: order.isDemo,
      })
      .returning();

    if (reason) {
      await notify(
        { userId: click.userId, type: "conversion_rejected", title: "Venda não elegível", body: `Um pedido feito a partir do seu look não gera recompensa: ${reason}.`, link: "/app/desempenho", dedupeKey: `conv:${conversion.id}:rejected`, isDemo: order.isDemo },
        tx,
      );
      return { kind: "rejected", conversionId: conversion.id, reason };
    }
  }

  if (conversion.state === "rejected") return { kind: "rejected", conversionId: conversion.id, reason: conversion.rejectionReason ?? "" };
  const snapshot = conversion.ruleSnapshot!;

  // ---- Situação e valores-alvo ----
  const fullyReturned = items.length > 0 && items.every((i) => i.returnedQuantity >= i.quantity);
  const canceled = order.status === "canceled" || fullyReturned;
  const split = canceled ? { baseCents: 0, commissionCents: 0, userCents: 0, platformCents: 0 } : splitCommission(baseAmount(items, snapshot.baseType), snapshot);
  const start = startDate(history, order.storeCreatedAt, snapshot.eligibilityPolicy.startEvent);

  let state = conversion.state;
  if (canceled) state = "canceled";
  else if (conversion.state === "approved" || start) state = "approved";
  else if (["paid", "invoiced", "delivered"].includes(order.status)) state = "in_validation";

  if (conversion.state === "canceled" && state === "canceled") return { kind: "processed", conversionId: conversion.id, state, changed: false };

  const base = { sourceType: "order", sourceId: order.id, isDemo: conversion.isDemo, conversionId: conversion.id };
  let changed = false;

  // Aprovação comercial: a comissão estimada passa a confirmada (sem mudar valores).
  if (state === "approved" && conversion.state !== "approved") {
    const posted = await conversionPosted(tx, conversion.id);
    const r = await postTransaction(tx, {
      ...base,
      idempotencyKey: `conv:${conversion.id}:approved`,
      kind: "conversion_approved",
      reason: "Venda aprovada comercialmente (pedido atingiu o marco da regra).",
      entries: [
        { account: "brand_receivable_estimated", amountCents: -posted.brandEstimated, brandId: conversion.brandId },
        { account: "brand_receivable_confirmed", amountCents: posted.brandEstimated, brandId: conversion.brandId },
        { account: "platform_revenue_estimated", amountCents: posted.platformEstimated },
        { account: "platform_revenue_confirmed", amountCents: -posted.platformEstimated },
      ],
    });
    changed ||= r.created;
  }

  // Diferença entre o alvo e o já lançado (registro, devolução parcial, cancelamento).
  const posted = await conversionPosted(tx, conversion.id);
  const dC = split.commissionCents - posted.commission;
  const dP = split.platformCents - (posted.platformEstimated + posted.platformConfirmed);
  const dU = split.userCents - (posted.userPending + posted.userEligible);
  if (dC !== 0 || dP !== 0 || dU !== 0) {
    const approved = state === "approved" || conversion.state === "approved";
    const kind = posted.commission === 0 ? "conversion_registered" : split.commissionCents === 0 ? "conversion_canceled" : "conversion_adjusted";
    const reason =
      kind === "conversion_registered"
        ? `Venda atribuída: base ${formatCents(split.baseCents)}, regra v${snapshot.version}.`
        : kind === "conversion_canceled"
          ? `Pedido ${order.status === "canceled" ? "cancelado" : "devolvido"} na loja; valores revertidos.`
          : `Pedido alterado na loja (devolução parcial); nova base ${formatCents(split.baseCents)}.`;
    const fingerprint = createHash("sha256").update(`${order.contentHash}|${split.commissionCents}|${split.userCents}`).digest("hex").slice(0, 16);
    const r = await postTransaction(tx, {
      ...base,
      idempotencyKey: `conv:${conversion.id}:sync:${fingerprint}`,
      kind,
      reason,
      entries: [
        { account: approved ? "brand_receivable_confirmed" : "brand_receivable_estimated", amountCents: dC, brandId: conversion.brandId },
        { account: approved ? "platform_revenue_confirmed" : "platform_revenue_estimated", amountCents: -dP },
        // Depois de elegível, ajustes recaem no saldo elegível (podendo ficar negativo: saldo a compensar).
        { account: conversion.eligibleAt ? "user_reward_eligible" : "user_reward_pending", amountCents: -dU, userId: conversion.userId },
      ],
    });
    changed ||= r.created;
  }

  const eligibleFrom = start && state === "approved" ? new Date(start.getTime() + snapshot.eligibilityPolicy.waitDays * DAY) : conversion.eligibleFrom;
  await tx
    .update(conversions)
    .set({
      state,
      baseAmountCents: split.baseCents,
      commissionCents: split.commissionCents,
      userRewardCents: split.userCents,
      platformCents: split.platformCents,
      // Datas de negócio: quando o pedido atingiu o marco na loja (não a hora do processamento).
      approvedAt: state === "approved" ? (conversion.approvedAt ?? start ?? now) : conversion.approvedAt,
      canceledAt: state === "canceled" ? (conversion.canceledAt ?? order.statusChangedAt) : null,
      eligibleFrom,
    })
    .where(eq(conversions.id, conversion.id));

  const n = (type: string, title: string, body: string) =>
    notify({ userId: conversion.userId, type, title, body, link: "/app/desempenho", dedupeKey: `conv:${conversion.id}:${type}:${order.contentHash.slice(0, 12)}`, isDemo: conversion.isDemo }, tx);
  const registeredNow = posted.commission === 0 && split.commissionCents > 0;
  if (registeredNow) {
    await n("conversion_registered", "Nova venda atribuída", `Uma compra a partir do seu look gerou ${formatCents(split.userCents)} de recompensa pendente.`);
  }
  if (state === "approved" && conversion.state !== "approved") {
    const when = eligibleFrom ? `, com liberação prevista a partir de ${eligibleFrom.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "";
    await n("conversion_approved", "Venda confirmada", `A loja confirmou a venda. Recompensa: ${formatCents(split.userCents)}${when}.`);
  }
  if (state === "canceled" && conversion.state !== "canceled") {
    await n("conversion_canceled", "Venda cancelada", "Um pedido atribuído a você foi cancelado ou devolvido na loja, e a recompensa correspondente foi revertida.");
  } else if (!registeredNow && split.commissionCents > 0 && dU !== 0) {
    await n("conversion_adjusted", "Venda ajustada", `Houve devolução parcial em um pedido. Recompensa atualizada: ${formatCents(split.userCents)}.`);
  }

  return { kind: "processed", conversionId: conversion.id, state, changed: changed || conversion.state !== state };
}

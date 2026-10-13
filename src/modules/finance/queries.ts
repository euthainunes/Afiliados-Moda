import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, clicks, conversions, ledgerEntries, ledgerTransactions, looks, payoutRequests, products, trackingLinks } from "@/lib/db/schema";

export const CONVERSION_STATE_LABELS = {
  registered: "Registrada",
  in_validation: "Em validação",
  approved: "Aprovada",
  rejected: "Não elegível",
  canceled: "Cancelada",
} as const;

// Série diária de cliques válidos e vendas atribuídas da usuária, direto das tabelas de origem.
// O gráfico do painel usa exatamente estes números (sem valores fixos ou inventados).
export async function performanceSeries(userId: string, days = 30, now = new Date()) {
  const since = new Date(now.getTime() - (days - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const dayExpr = (col: unknown) => sql<string>`to_char(${col} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`;
  const [clickRows, convRows] = await Promise.all([
    db
      .select({ day: dayExpr(clicks.occurredAt), n: sql<number>`count(*)::int` })
      .from(clicks)
      .where(and(eq(clicks.userId, userId), eq(clicks.isBot, false), eq(clicks.isSelfClick, false), gte(clicks.occurredAt, since)))
      .groupBy(sql`1`),
    db
      .select({ day: dayExpr(conversions.registeredAt), n: sql<number>`count(*)::int`, reward: sql<number>`coalesce(sum(${conversions.userRewardCents}), 0)::int` })
      .from(conversions)
      .where(and(eq(conversions.userId, userId), inArray(conversions.state, ["registered", "in_validation", "approved"]), gte(conversions.registeredAt, since)))
      .groupBy(sql`1`),
  ]);
  const series: { day: string; clicks: number; conversions: number; rewardCents: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 86_400_000 + 12 * 3_600_000);
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
    series.push({
      day: key,
      clicks: clickRows.find((r) => r.day === key)?.n ?? 0,
      conversions: convRows.find((r) => r.day === key)?.n ?? 0,
      rewardCents: convRows.find((r) => r.day === key)?.reward ?? 0,
    });
  }
  return series;
}

export async function conversionsForUser(userId: string, limit = 100) {
  return db
    .select({
      id: conversions.id,
      state: conversions.state,
      rejectionReason: conversions.rejectionReason,
      registeredAt: conversions.registeredAt,
      approvedAt: conversions.approvedAt,
      eligibleFrom: conversions.eligibleFrom,
      eligibleAt: conversions.eligibleAt,
      baseCents: conversions.baseAmountCents,
      rewardCents: conversions.userRewardCents,
      isDemo: conversions.isDemo,
      lookTitle: looks.title,
      brandName: brands.name,
    })
    .from(conversions)
    .innerJoin(looks, eq(looks.id, conversions.lookId))
    .innerJoin(brands, eq(brands.id, conversions.brandId))
    .where(eq(conversions.userId, userId))
    .orderBy(desc(conversions.registeredAt))
    .limit(limit);
}

// Extrato: cada linha é um lançamento do livro-razão que afeta o saldo da usuária, com motivo e origem.
export async function statementForUser(userId: string, limit = 200) {
  const rows = await db
    .select({
      transactionId: ledgerTransactions.id,
      kind: ledgerTransactions.kind,
      reason: ledgerTransactions.reason,
      occurredAt: ledgerTransactions.occurredAt,
      isDemo: ledgerTransactions.isDemo,
      account: ledgerEntries.account,
      amount: ledgerEntries.amountCents,
    })
    .from(ledgerEntries)
    .innerJoin(ledgerTransactions, eq(ledgerTransactions.id, ledgerEntries.transactionId))
    .where(and(eq(ledgerEntries.userId, userId)))
    .orderBy(desc(ledgerTransactions.occurredAt))
    .limit(limit);
  // Valor visto pela usuária: crédito no passivo = valor a favor dela (sinal invertido).
  return rows.map((r) => ({ ...r, amountForUser: r.amount === 0 ? 0 : -r.amount }));
}

export async function payoutsForUser(userId: string) {
  return db.select().from(payoutRequests).where(eq(payoutRequests.userId, userId)).orderBy(desc(payoutRequests.requestedAt));
}

// Links rastreáveis da usuária, com cliques válidos por link.
export async function linksForUser(userId: string) {
  return db
    .select({
      code: trackingLinks.code,
      lookTitle: looks.title,
      lookSlug: looks.slug,
      lookStatus: looks.status,
      productTitle: products.title,
      brandName: brands.name,
      clicks: sql<number>`(select count(*)::int from clicks c where c.tracking_link_id = ${trackingLinks.id} and c.is_bot = false and c.is_self_click = false)`,
    })
    .from(trackingLinks)
    .innerJoin(looks, eq(looks.id, trackingLinks.lookId))
    .innerJoin(products, eq(products.id, trackingLinks.productId))
    .innerJoin(brands, eq(brands.id, products.brandId))
    .where(eq(trackingLinks.userId, userId))
    .orderBy(desc(trackingLinks.createdAt));
}

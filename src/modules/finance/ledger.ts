import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import { ledgerEntries, ledgerTransactions, payoutRequests } from "@/lib/db/schema";

export type LedgerAccount = (typeof ledgerEntries.$inferInsert)["account"];
export type EntryInput = { account: LedgerAccount; amountCents: number; userId?: string | null; brandId?: string | null };

export type PostInput = {
  idempotencyKey: string;
  kind: string;
  reason: string;
  sourceType: string;
  sourceId: string;
  isDemo: boolean;
  conversionId?: string | null;
  createdBy?: string | null;
  approvedBy?: string | null;
  occurredAt?: Date;
  entries: EntryInput[];
};

// Inverte o sinal sem produzir "-0".
const neg = (x: number) => (x === 0 ? 0 : -x);

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerError";
  }
}

// Lança uma transação balanceada. Idempotente: a mesma chave nunca gera um segundo lançamento.
// O banco também confere a soma zero (trigger) e impede alterações posteriores.
export async function postTransaction(tx: Tx, input: PostInput): Promise<{ created: boolean; transactionId: string | null }> {
  const entries = input.entries.filter((e) => e.amountCents !== 0);
  if (entries.length === 0) return { created: false, transactionId: null };
  const sum = entries.reduce((s, e) => s + e.amountCents, 0);
  if (sum !== 0) throw new LedgerError(`Transação desbalanceada (${input.kind}): soma ${sum}.`);
  if (input.reason.trim().length < 3) throw new LedgerError("Todo lançamento precisa de justificativa.");

  const [created] = await tx
    .insert(ledgerTransactions)
    .values({
      idempotencyKey: input.idempotencyKey,
      kind: input.kind,
      reason: input.reason,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      isDemo: input.isDemo,
      conversionId: input.conversionId ?? null,
      createdBy: input.createdBy ?? null,
      approvedBy: input.approvedBy ?? null,
      occurredAt: input.occurredAt ?? new Date(),
    })
    .onConflictDoNothing({ target: ledgerTransactions.idempotencyKey })
    .returning({ id: ledgerTransactions.id });
  if (!created) return { created: false, transactionId: null };

  await tx.insert(ledgerEntries).values(
    entries.map((e) => ({ transactionId: created.id, account: e.account, amountCents: e.amountCents, userId: e.userId ?? null, brandId: e.brandId ?? null, isDemo: input.isDemo })),
  );
  return { created: true, transactionId: created.id };
}

// Saldo por conta (débito positivo, crédito negativo) dos lançamentos de uma conversão.
export async function conversionPosted(tx: Tx | typeof db, conversionId: string) {
  const rows = await tx
    .select({ account: ledgerEntries.account, total: sql<string>`sum(${ledgerEntries.amountCents})` })
    .from(ledgerEntries)
    .innerJoin(ledgerTransactions, eq(ledgerTransactions.id, ledgerEntries.transactionId))
    .where(eq(ledgerTransactions.conversionId, conversionId))
    .groupBy(ledgerEntries.account);
  const by = Object.fromEntries(rows.map((r) => [r.account, Number(r.total)])) as Partial<Record<LedgerAccount, number>>;
  const v = (a: LedgerAccount) => by[a] ?? 0;
  return {
    // Comissão reconhecida para a marca (inclui a parte já recebida em caixa por pagamento de fatura).
    commission: v("brand_receivable_estimated") + v("brand_receivable_confirmed") + v("cash"),
    brandEstimated: v("brand_receivable_estimated"),
    brandConfirmed: v("brand_receivable_confirmed"),
    platformEstimated: neg(v("platform_revenue_estimated")),
    platformConfirmed: neg(v("platform_revenue_confirmed")),
    userPending: neg(v("user_reward_pending")),
    userEligible: neg(v("user_reward_eligible")),
  };
}

export type UserBalances = {
  pendingCents: number;
  eligibleCents: number;
  inPayoutCents: number;
  paidCents: number;
};

// Saldos da usuária derivados exclusivamente do livro-razão (não existe campo de saldo editável).
export async function userBalances(userId: string, { demo }: { demo?: boolean } = {}): Promise<UserBalances> {
  const conditions = [eq(ledgerEntries.userId, userId), inArray(ledgerEntries.account, ["user_reward_pending", "user_reward_eligible", "user_reward_in_payout"])];
  if (demo !== undefined) conditions.push(eq(ledgerEntries.isDemo, demo));
  const rows = await db
    .select({ account: ledgerEntries.account, total: sql<string>`sum(${ledgerEntries.amountCents})` })
    .from(ledgerEntries)
    .where(and(...conditions))
    .groupBy(ledgerEntries.account);
  const v = (a: LedgerAccount) => neg(Number(rows.find((r) => r.account === a)?.total ?? 0));
  const paidConditions = [eq(payoutRequests.userId, userId), eq(payoutRequests.status, "paid")];
  if (demo !== undefined) paidConditions.push(eq(payoutRequests.isDemo, demo));
  const [{ paid }] = await db.select({ paid: sql<string>`coalesce(sum(${payoutRequests.amountCents}), 0)` }).from(payoutRequests).where(and(...paidConditions));
  return { pendingCents: v("user_reward_pending"), eligibleCents: v("user_reward_eligible"), inPayoutCents: v("user_reward_in_payout"), paidCents: Number(paid) };
}

// Totais da plataforma por conta, separados entre demonstração e dados reais.
export async function platformTotals(demo: boolean) {
  const rows = await db
    .select({ account: ledgerEntries.account, total: sql<string>`sum(${ledgerEntries.amountCents})` })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.isDemo, demo))
    .groupBy(ledgerEntries.account);
  const v = (a: LedgerAccount) => Number(rows.find((r) => r.account === a)?.total ?? 0);
  return {
    commissionEstimatedCents: v("brand_receivable_estimated"),
    commissionConfirmedOpenCents: v("brand_receivable_confirmed"),
    cashCents: v("cash"),
    userPendingCents: neg(v("user_reward_pending")),
    userEligibleCents: neg(v("user_reward_eligible")),
    userInPayoutCents: neg(v("user_reward_in_payout")),
    platformRevenueEstimatedCents: neg(v("platform_revenue_estimated")),
    platformRevenueConfirmedCents: neg(v("platform_revenue_confirmed")),
    adjustmentsCents: v("adjustments"),
  };
}

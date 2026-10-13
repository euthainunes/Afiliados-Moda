import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lte, max, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  brandInvoiceItems,
  brandInvoices,
  brandPayments,
  brands,
  conversions,
  ledgerAdjustments,
  ledgerEntries,
  ledgerTransactions,
  orders,
  payoutAccounts,
  payoutRequests,
  reconciliationItems,
} from "@/lib/db/schema";
import { hmac } from "@/lib/crypto";
import { assertDemoAllowed } from "@/lib/env";
import { formatCents } from "@/lib/money";
import { encryptPii, maskTail } from "@/lib/pii";
import { payoutProvider } from "@/integrations/registry";
import { assertCan, assertDifferentApprover, type Principal } from "@/modules/access/can";
import { recordAudit } from "@/modules/audit/service";
import { notify } from "@/modules/notifications/service";
import { getSetting } from "@/modules/settings/service";
import { conversionPosted, postTransaction, userBalances } from "./ledger";

export class FinanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinanceError";
  }
}

const isUuid = (v: string) => z.uuid().safeParse(v).success;

// ===================== Elegibilidade =====================

// Libera recompensas aprovadas cujo prazo terminou. O tempo sozinho NÃO basta: o pedido não pode estar
// cancelado, não pode haver divergência aberta e, se a regra exigir, a marca precisa ter pago a comissão.
export async function runEligibility(now = new Date()) {
  const candidates = await db
    .select({ id: conversions.id })
    .from(conversions)
    .where(and(eq(conversions.state, "approved"), isNull(conversions.eligibleAt), lte(conversions.eligibleFrom, now)));
  const result = { released: 0, waitingBrandPayment: 0, blockedByDivergence: 0 };
  for (const { id } of candidates) {
    await db.transaction(async (tx) => {
      const [c] = await tx.select().from(conversions).where(eq(conversions.id, id)).for("update");
      if (!c || c.state !== "approved" || c.eligibleAt) return;
      const [open] = await tx.select({ id: reconciliationItems.id }).from(reconciliationItems).where(and(eq(reconciliationItems.conversionId, id), eq(reconciliationItems.status, "open"), inArray(reconciliationItems.kind, ["ledger_mismatch", "invoice_diff"]))).limit(1);
      if (open) {
        result.blockedByDivergence++;
        return;
      }
      if (c.ruleSnapshot?.eligibilityPolicy.requireBrandPaymentReceived) {
        const [paid] = await tx
          .select({ id: brandInvoiceItems.id })
          .from(brandInvoiceItems)
          .innerJoin(brandInvoices, eq(brandInvoices.id, brandInvoiceItems.invoiceId))
          .where(and(eq(brandInvoiceItems.conversionId, id), eq(brandInvoices.status, "paid")))
          .limit(1);
        if (!paid) {
          result.waitingBrandPayment++;
          return;
        }
      }
      const posted = await conversionPosted(tx, id);
      await postTransaction(tx, {
        idempotencyKey: `conv:${id}:eligible`,
        kind: "reward_eligible",
        reason: "Prazo de validação cumprido e condições da regra atendidas.",
        sourceType: "conversion",
        sourceId: id,
        conversionId: id,
        isDemo: c.isDemo,
        entries: [
          { account: "user_reward_pending", amountCents: posted.userPending, userId: c.userId },
          { account: "user_reward_eligible", amountCents: -posted.userPending, userId: c.userId },
        ],
      });
      await tx.update(conversions).set({ eligibleAt: now }).where(eq(conversions.id, id));
      await notify(
        { userId: c.userId, type: "reward_eligible", title: "Recompensa liberada", body: `${formatCents(posted.userPending)} já podem ser resgatados.`, link: "/app/recompensas", dedupeKey: `conv:${id}:eligible`, isDemo: c.isDemo },
        tx,
      );
      result.released++;
    });
  }
  return result;
}

// ===================== Faturas e pagamentos das marcas =====================

export async function issueInvoice(actor: Principal, brandId: string, periodEnd: Date) {
  assertCan(actor, "brand_payments.record");
  if (!isUuid(brandId)) throw new FinanceError("Marca não encontrada.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('brand_invoices'))`);
    const brand = await tx.query.brands.findFirst({ where: eq(brands.id, brandId) });
    if (!brand) throw new FinanceError("Marca não encontrada.");
    const open = await tx
      .select({ id: conversions.id, commission: conversions.commissionCents, approvedAt: conversions.approvedAt, isDemo: conversions.isDemo })
      .from(conversions)
      .leftJoin(brandInvoiceItems, eq(brandInvoiceItems.conversionId, conversions.id))
      .where(and(eq(conversions.brandId, brandId), eq(conversions.state, "approved"), isNull(brandInvoiceItems.id), lte(conversions.approvedAt, periodEnd), sql`${conversions.commissionCents} > 0`))
      .orderBy(asc(conversions.approvedAt));
    if (open.length === 0) throw new FinanceError("Não há vendas aprovadas a faturar neste período.");
    if (new Set(open.map((o) => o.isDemo)).size > 1) throw new FinanceError("Vendas reais e de demonstração não podem ser faturadas juntas.");
    const isDemo = open[0].isDemo;
    const [{ last }] = await tx.select({ last: max(brandInvoices.number) }).from(brandInvoices);
    const amount = open.reduce((s, o) => s + o.commission, 0);
    const [invoice] = await tx
      .insert(brandInvoices)
      .values({ brandId, number: (last ?? 0) + 1, periodStart: open[0].approvedAt!, periodEnd, amountCents: amount, issuedBy: actor.id, isDemo })
      .returning();
    await tx.insert(brandInvoiceItems).values(open.map((o) => ({ invoiceId: invoice.id, conversionId: o.id, amountCents: o.commission })));
    await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "invoice.issued", entityType: "brand_invoice", entityId: invoice.id, after: { brandId, amount, conversions: open.length, isDemo } }, tx);
    return invoice;
  });
}

// Registra o recebimento da marca. Exige o valor exato da fatura (pagamentos parciais viram divergência
// para análise). Em marcas fictícias, o pagamento é sempre SIMULADO.
export async function registerBrandPayment(actor: Principal, invoiceId: string, input: { amountCents: number; receivedAt: Date; reference: string }) {
  assertCan(actor, "brand_payments.record");
  if (!isUuid(invoiceId)) throw new FinanceError("Fatura não encontrada.");
  await db.transaction(async (tx) => {
    const [invoice] = await tx.select().from(brandInvoices).where(eq(brandInvoices.id, invoiceId)).for("update");
    if (!invoice) throw new FinanceError("Fatura não encontrada.");
    if (invoice.status !== "issued") throw new FinanceError("Esta fatura não está em aberto.");
    if (input.amountCents !== invoice.amountCents) {
      throw new FinanceError(`O valor informado (${formatCents(input.amountCents)}) difere da fatura (${formatCents(invoice.amountCents)}). Registre a divergência na conciliação e confirme com a marca.`);
    }
    let reference = input.reference.trim();
    if (invoice.isDemo) {
      assertDemoAllowed("Pagamento de marca simulado");
      reference = "SIMULADO — nenhum valor foi recebido";
    } else if (reference.length < 6) {
      throw new FinanceError("Informe a referência do comprovante bancário.");
    }
    await tx.insert(brandPayments).values({ invoiceId, amountCents: input.amountCents, receivedAt: input.receivedAt, reference, simulated: invoice.isDemo, registeredBy: actor.id });
    const items = await tx.select().from(brandInvoiceItems).where(eq(brandInvoiceItems.invoiceId, invoiceId));
    for (const item of items) {
      await postTransaction(tx, {
        idempotencyKey: `invoice:${invoiceId}:paid:${item.conversionId}`,
        kind: "brand_payment",
        reason: `Recebimento da fatura ${invoice.number}${invoice.isDemo ? " (simulado)" : ""}.`,
        sourceType: "brand_invoice",
        sourceId: invoiceId,
        conversionId: item.conversionId,
        isDemo: invoice.isDemo,
        createdBy: actor.id,
        occurredAt: input.receivedAt,
        entries: [
          { account: "cash", amountCents: item.amountCents, brandId: invoice.brandId },
          { account: "brand_receivable_confirmed", amountCents: -item.amountCents, brandId: invoice.brandId },
        ],
      });
    }
    await tx.update(brandInvoices).set({ status: "paid" }).where(eq(brandInvoices.id, invoiceId));
    await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "invoice.paid", entityType: "brand_invoice", entityId: invoiceId, after: { amount: input.amountCents, reference, simulated: invoice.isDemo } }, tx);
  });
}

export async function listInvoices(actor: Principal) {
  assertCan(actor, "ledger.read");
  return db
    .select({ invoice: brandInvoices, brandName: brands.name })
    .from(brandInvoices)
    .innerJoin(brands, eq(brands.id, brandInvoices.brandId))
    .orderBy(desc(brandInvoices.number));
}

// ===================== Dados de recebimento e resgates =====================

export function isValidCpf(raw: string): boolean {
  const cpf = raw.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export const payoutAccountSchema = z
  .object({
    holderName: z.string().trim().min(3, "Informe o nome completo.").max(120),
    cpf: z.string().trim().refine(isValidCpf, "CPF inválido."),
    pixKeyType: z.enum(["cpf", "email", "telefone", "aleatoria"]),
    pixKey: z.string().trim().min(3, "Informe a chave PIX.").max(140),
  })
  .superRefine((v, ctx) => {
    const ok =
      v.pixKeyType === "cpf"
        ? isValidCpf(v.pixKey)
        : v.pixKeyType === "email"
          ? z.email().safeParse(v.pixKey).success
          : v.pixKeyType === "telefone"
            ? /^\+?55?\s?\(?\d{2}\)?\s?9?\d{4}-?\d{4}$/.test(v.pixKey)
            : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.pixKey);
    if (!ok) ctx.addIssue({ code: "custom", path: ["pixKey"], message: "Chave PIX inválida para o tipo escolhido." });
  });

// CPF e chave PIX ficam criptografados; o hash do CPF impede o mesmo CPF em contas diferentes.
export async function savePayoutAccount(userId: string, input: z.input<typeof payoutAccountSchema>) {
  const data = payoutAccountSchema.parse(input);
  const cpfDigits = data.cpf.replace(/\D/g, "");
  const cpfHash = hmac(`cpf:${cpfDigits}`);
  const [other] = await db.select({ userId: payoutAccounts.userId }).from(payoutAccounts).where(eq(payoutAccounts.cpfHash, cpfHash));
  if (other && other.userId !== userId) throw new FinanceError("Este CPF já está vinculado a outra conta. Fale com o suporte.");
  const values = { pixKeyType: data.pixKeyType, pixKeyEnc: encryptPii(data.pixKey), pixKeyHint: maskTail(data.pixKey), cpfEnc: encryptPii(cpfDigits), cpfHash, holderName: data.holderName };
  await db.insert(payoutAccounts).values({ userId, ...values }).onConflictDoUpdate({ target: payoutAccounts.userId, set: values });
  await recordAudit({ actorId: userId, action: "payout_account.saved", entityType: "user", entityId: userId, after: { pixKeyType: data.pixKeyType, pixKeyHint: values.pixKeyHint } });
}

export async function getPayoutAccount(userId: string) {
  const row = await db.query.payoutAccounts.findFirst({ where: eq(payoutAccounts.userId, userId) });
  return row ? { holderName: row.holderName, pixKeyType: row.pixKeyType, pixKeyHint: row.pixKeyHint } : null;
}

export async function requestPayout(userId: string, amountCents: number) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new FinanceError("Valor inválido.");
  const min = await getSetting("payout.min_cents");
  if (amountCents < min) throw new FinanceError(`O valor mínimo para resgate é ${formatCents(min)}.`);
  const account = await db.query.payoutAccounts.findFirst({ where: eq(payoutAccounts.userId, userId) });
  if (!account) throw new FinanceError("Cadastre seus dados de recebimento antes de solicitar o resgate.");

  return db.transaction(async (tx) => {
    // Serializa solicitações da mesma usuária para o saldo não ser usado duas vezes.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"payout:" + userId}))`);
    const [real, demo] = await Promise.all([userBalances(userId, { demo: false }), userBalances(userId, { demo: true })]);
    let isDemo: boolean;
    if (real.eligibleCents >= amountCents) isDemo = false;
    else if (demo.eligibleCents >= amountCents) {
      assertDemoAllowed("Resgate de demonstração");
      isDemo = true;
    } else throw new FinanceError(`Saldo disponível insuficiente (${formatCents(Math.max(real.eligibleCents, demo.eligibleCents))}).`);

    const [open] = await tx.select({ id: payoutRequests.id }).from(payoutRequests).where(and(eq(payoutRequests.userId, userId), inArray(payoutRequests.status, ["requested", "approved"])));
    if (open) throw new FinanceError("Você já tem um resgate em andamento.");

    const [request] = await tx.insert(payoutRequests).values({ userId, amountCents, pixKeyHint: account.pixKeyHint, isDemo }).returning();
    await postTransaction(tx, {
      idempotencyKey: `payout:${request.id}:requested`,
      kind: "payout_requested",
      reason: "Resgate solicitado pela usuária; valor reservado.",
      sourceType: "payout_request",
      sourceId: request.id,
      isDemo,
      createdBy: userId,
      entries: [
        { account: "user_reward_eligible", amountCents, userId },
        { account: "user_reward_in_payout", amountCents: -amountCents, userId },
      ],
    });
    await recordAudit({ actorId: userId, action: "payout.requested", entityType: "payout_request", entityId: request.id, after: { amountCents, isDemo } }, tx);
    return request;
  });
}

async function closePayout(payoutId: string, fn: (p: typeof payoutRequests.$inferSelect, tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<void>) {
  if (!isUuid(payoutId)) throw new FinanceError("Resgate não encontrado.");
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(payoutRequests).where(eq(payoutRequests.id, payoutId)).for("update");
    if (!p) throw new FinanceError("Resgate não encontrado.");
    await fn(p, tx);
  });
}

function releaseEntries(p: typeof payoutRequests.$inferSelect) {
  return [
    { account: "user_reward_in_payout" as const, amountCents: p.amountCents, userId: p.userId },
    { account: "user_reward_eligible" as const, amountCents: -p.amountCents, userId: p.userId },
  ];
}

export async function cancelPayout(userId: string, payoutId: string) {
  await closePayout(payoutId, async (p, tx) => {
    if (p.userId !== userId) throw new FinanceError("Resgate não encontrado.");
    if (p.status !== "requested") throw new FinanceError("Só é possível cancelar resgates ainda não analisados.");
    await tx.update(payoutRequests).set({ status: "canceled" }).where(eq(payoutRequests.id, p.id));
    await postTransaction(tx, { idempotencyKey: `payout:${p.id}:canceled`, kind: "payout_canceled", reason: "Resgate cancelado pela usuária; valor devolvido ao saldo.", sourceType: "payout_request", sourceId: p.id, isDemo: p.isDemo, createdBy: userId, entries: releaseEntries(p) });
  });
}

export async function reviewPayout(actor: Principal, payoutId: string, decision: "approve" | "reject", note?: string) {
  assertCan(actor, decision === "approve" ? "payouts.approve" : "payouts.review");
  await closePayout(payoutId, async (p, tx) => {
    if (p.status !== "requested") throw new FinanceError("Este resgate já foi analisado.");
    assertDifferentApprover(p.userId, actor.id);
    if (decision === "reject") {
      if (!note || note.trim().length < 5) throw new FinanceError("Informe o motivo da recusa.");
      await tx.update(payoutRequests).set({ status: "rejected", reviewedBy: actor.id, reviewedAt: new Date(), reviewNote: note.trim() }).where(eq(payoutRequests.id, p.id));
      await postTransaction(tx, { idempotencyKey: `payout:${p.id}:rejected`, kind: "payout_rejected", reason: `Resgate recusado: ${note.trim()}`, sourceType: "payout_request", sourceId: p.id, isDemo: p.isDemo, createdBy: actor.id, entries: releaseEntries(p) });
      await notify({ userId: p.userId, type: "payout_rejected", title: "Resgate recusado", body: `Seu resgate de ${formatCents(p.amountCents)} foi recusado: ${note.trim()}. O valor voltou ao seu saldo.`, link: "/app/recompensas", dedupeKey: `payout:${p.id}:rejected`, isDemo: p.isDemo }, tx);
    } else {
      await tx.update(payoutRequests).set({ status: "approved", reviewedBy: actor.id, reviewedAt: new Date(), reviewNote: note?.trim() || null }).where(eq(payoutRequests.id, p.id));
      await notify({ userId: p.userId, type: "payout_approved", title: "Resgate aprovado", body: `Seu resgate de ${formatCents(p.amountCents)} foi aprovado e será pago em breve.`, link: "/app/recompensas", dedupeKey: `payout:${p.id}:approved`, isDemo: p.isDemo }, tx);
    }
    await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: `payout.${decision === "approve" ? "approved" : "rejected"}`, entityType: "payout_request", entityId: p.id, after: { note: note ?? null } }, tx);
  });
}

// Registro do pagamento: em dados reais exige o identificador do comprovante PIX (pagamento feito fora
// da plataforma); em demonstração, marca como SIMULADO e nunca gera comprovante.
export async function markPayoutPaid(actor: Principal, payoutId: string, reference: string | null) {
  assertCan(actor, "payouts.mark_paid");
  await closePayout(payoutId, async (p, tx) => {
    if (p.status !== "approved") throw new FinanceError("Só resgates aprovados podem ser marcados como pagos.");
    assertDifferentApprover(p.userId, actor.id);
    const provider = await payoutProvider(p.isDemo);
    const confirmation = await provider.confirmPayment({ payoutRequestId: p.id, amountCents: p.amountCents, reference });
    await tx
      .update(payoutRequests)
      .set({ status: "paid", paidBy: actor.id, paidAt: new Date(), paymentReference: confirmation.reference, simulated: confirmation.simulated })
      .where(eq(payoutRequests.id, p.id));
    await postTransaction(tx, {
      idempotencyKey: `payout:${p.id}:paid`,
      kind: "payout_paid",
      reason: confirmation.simulated ? "Pagamento SIMULADO (demonstração): nenhum valor transferido." : `Pagamento PIX registrado (${confirmation.reference}).`,
      sourceType: "payout_request",
      sourceId: p.id,
      isDemo: p.isDemo,
      createdBy: actor.id,
      entries: [
        { account: "user_reward_in_payout", amountCents: p.amountCents, userId: p.userId },
        { account: "cash", amountCents: -p.amountCents },
      ],
    });
    await notify({ userId: p.userId, type: "payout_paid", title: confirmation.simulated ? "Resgate pago (simulação)" : "Resgate pago", body: confirmation.simulated ? `Demonstração: o resgate de ${formatCents(p.amountCents)} foi marcado como pago, mas nenhum valor foi transferido.` : `O PIX de ${formatCents(p.amountCents)} foi enviado.`, link: "/app/recompensas", dedupeKey: `payout:${p.id}:paid`, isDemo: p.isDemo }, tx);
    await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "payout.paid", entityType: "payout_request", entityId: p.id, after: { reference: confirmation.reference, simulated: confirmation.simulated } }, tx);
  });
}

// ===================== Ajustes manuais (quatro olhos) =====================

export async function proposeAdjustment(actor: Principal, input: { userId: string; amountCents: number; reason: string; conversionId?: string | null; isDemo: boolean }) {
  assertCan(actor, "ledger.adjust.propose");
  if (!isUuid(input.userId)) throw new FinanceError("Usuária não encontrada.");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents === 0) throw new FinanceError("Informe um valor diferente de zero.");
  if (input.reason.trim().length < 10) throw new FinanceError("Explique o motivo do ajuste (mínimo de 10 caracteres).");
  if (input.isDemo) assertDemoAllowed("Ajuste de demonstração");
  const [row] = await db
    .insert(ledgerAdjustments)
    .values({ userId: input.userId, amountCents: input.amountCents, reason: input.reason.trim(), conversionId: input.conversionId ?? null, proposedBy: actor.id, isDemo: input.isDemo })
    .returning();
  await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "adjustment.proposed", entityType: "ledger_adjustment", entityId: row.id, after: row });
  return row;
}

export async function reviewAdjustment(actor: Principal, adjustmentId: string, approve: boolean) {
  assertCan(actor, "ledger.adjust.approve");
  if (!isUuid(adjustmentId)) throw new FinanceError("Ajuste não encontrado.");
  await db.transaction(async (tx) => {
    const [a] = await tx.select().from(ledgerAdjustments).where(eq(ledgerAdjustments.id, adjustmentId)).for("update");
    if (!a || a.status !== "proposed") throw new FinanceError("Ajuste não encontrado ou já revisado.");
    assertDifferentApprover(a.proposedBy, actor.id);
    await tx.update(ledgerAdjustments).set({ status: approve ? "approved" : "rejected", reviewedBy: actor.id, reviewedAt: new Date() }).where(eq(ledgerAdjustments.id, a.id));
    if (approve) {
      await postTransaction(tx, {
        idempotencyKey: `adj:${a.id}`,
        kind: "manual_adjustment",
        reason: a.reason,
        sourceType: "ledger_adjustment",
        sourceId: a.id,
        isDemo: a.isDemo,
        createdBy: a.proposedBy,
        approvedBy: actor.id,
        entries: [
          { account: "user_reward_eligible", amountCents: -a.amountCents, userId: a.userId },
          { account: "adjustments", amountCents: a.amountCents },
        ],
      });
      await notify({ userId: a.userId, type: "adjustment", title: "Ajuste no seu saldo", body: `${a.amountCents > 0 ? "Crédito" : "Débito"} de ${formatCents(Math.abs(a.amountCents))}: ${a.reason}`, link: "/app/recompensas", dedupeKey: `adj:${a.id}`, isDemo: a.isDemo }, tx);
    }
    await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: approve ? "adjustment.approved" : "adjustment.rejected", entityType: "ledger_adjustment", entityId: a.id }, tx);
  });
}

// ===================== Conciliação =====================

const fp = (...parts: string[]) => createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);

// Procura divergências entre loja, conversões, livro-razão e recebimentos. Nunca corrige nada sozinha:
// cada achado vira um item aberto para investigação, sem duplicar achados já registrados.
export async function runReconciliation(now = new Date()) {
  const found: (typeof reconciliationItems.$inferInsert)[] = [];

  // 1. Valor da conversão diferente do lançado no livro-razão.
  const ledgerByConversion = await db
    .select({
      conversionId: ledgerTransactions.conversionId,
      commission: sql<string>`sum(case when ${ledgerEntries.account} in ('brand_receivable_estimated','brand_receivable_confirmed','cash') then ${ledgerEntries.amountCents} else 0 end)`,
    })
    .from(ledgerEntries)
    .innerJoin(ledgerTransactions, eq(ledgerTransactions.id, ledgerEntries.transactionId))
    .where(sql`${ledgerTransactions.conversionId} is not null`)
    .groupBy(ledgerTransactions.conversionId);
  const posted = new Map(ledgerByConversion.map((r) => [r.conversionId!, Number(r.commission)]));
  const convs = await db.select().from(conversions).where(ne(conversions.state, "rejected"));
  for (const c of convs) {
    const p = posted.get(c.id) ?? 0;
    if (p !== c.commissionCents) {
      found.push({ fingerprint: fp("ledger_mismatch", c.id, String(c.commissionCents), String(p)), kind: "ledger_mismatch", description: "Comissão da conversão difere do valor lançado no livro-razão.", conversionId: c.id, orderId: c.orderId, expectedCents: c.commissionCents, observedCents: p, isDemo: c.isDemo });
    }
  }

  // 2. Pedidos com identificador de clique que não geraram conversão.
  const orphan = await db
    .select({ id: orders.id, clickId: sql<string>`${orders.attribution}->>'clickId'`, isDemo: orders.isDemo })
    .from(orders)
    .leftJoin(conversions, eq(conversions.orderId, orders.id))
    .where(and(isNull(conversions.id), sql`${orders.attribution}->>'clickId' is not null`));
  for (const o of orphan) {
    found.push({ fingerprint: fp("unmatched_click", o.id), kind: "unmatched_click", description: `Pedido traz identificador de clique (${o.clickId}) sem clique correspondente na plataforma.`, orderId: o.id, isDemo: o.isDemo });
  }

  // 3. Vendas aprovadas há muito tempo e ainda não faturadas.
  const days = await getSetting("reconciliation.uninvoiced_days");
  const stale = await db
    .select({ id: conversions.id, orderId: conversions.orderId, commission: conversions.commissionCents, isDemo: conversions.isDemo })
    .from(conversions)
    .leftJoin(brandInvoiceItems, eq(brandInvoiceItems.conversionId, conversions.id))
    .where(and(eq(conversions.state, "approved"), isNull(brandInvoiceItems.id), lte(conversions.approvedAt, new Date(now.getTime() - days * 86_400_000)), sql`${conversions.commissionCents} > 0`));
  for (const s of stale) {
    found.push({ fingerprint: fp("uninvoiced", s.id), kind: "uninvoiced", description: `Venda aprovada há mais de ${days} dias sem fatura emitida à marca.`, conversionId: s.id, orderId: s.orderId, expectedCents: s.commission, isDemo: s.isDemo });
  }

  // 4. Faturas em que a comissão das conversões mudou depois da emissão (ex.: devolução após faturar).
  const invoiceDiff = await db
    .select({ invoiceId: brandInvoiceItems.invoiceId, conversionId: brandInvoiceItems.conversionId, billed: brandInvoiceItems.amountCents, current: conversions.commissionCents, orderId: conversions.orderId, isDemo: conversions.isDemo })
    .from(brandInvoiceItems)
    .innerJoin(conversions, eq(conversions.id, brandInvoiceItems.conversionId))
    .where(sql`${brandInvoiceItems.amountCents} <> ${conversions.commissionCents}`);
  for (const d of invoiceDiff) {
    found.push({ fingerprint: fp("invoice_diff", d.conversionId, String(d.current)), kind: "invoice_diff", description: "Comissão faturada difere da comissão atual (pedido alterado após a fatura): crédito ou cobrança complementar à marca.", conversionId: d.conversionId, orderId: d.orderId, expectedCents: d.current, observedCents: d.billed, isDemo: d.isDemo });
  }

  // 5. Usuárias com saldo elegível negativo (estorno após resgate): compensação futura, sem confisco.
  const negatives = await db
    .select({ userId: ledgerEntries.userId, total: sql<string>`sum(${ledgerEntries.amountCents})`, isDemo: ledgerEntries.isDemo })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.account, "user_reward_eligible"))
    .groupBy(ledgerEntries.userId, ledgerEntries.isDemo)
    .having(sql`sum(${ledgerEntries.amountCents}) > 0`);
  for (const n of negatives) {
    found.push({ fingerprint: fp("negative_balance", n.userId!, n.total), kind: "negative_balance", description: `Saldo elegível negativo de ${formatCents(Number(n.total))}: será compensado com recompensas futuras, conforme regulamento.`, observedCents: -Number(n.total), isDemo: n.isDemo });
  }

  let created = 0;
  for (const item of found) {
    const r = await db.insert(reconciliationItems).values(item).onConflictDoNothing({ target: reconciliationItems.fingerprint }).returning({ id: reconciliationItems.id });
    created += r.length;
  }
  return { found: found.length, created };
}

export async function resolveReconciliationItem(actor: Principal, itemId: string, note: string) {
  assertCan(actor, "reconciliation.manage");
  if (note.trim().length < 10) throw new FinanceError("Descreva a explicação (mínimo de 10 caracteres).");
  if (!isUuid(itemId)) throw new FinanceError("Item não encontrado.");
  const [item] = await db
    .update(reconciliationItems)
    .set({ status: "explained", resolutionNote: note.trim(), resolvedBy: actor.id, resolvedAt: new Date() })
    .where(and(eq(reconciliationItems.id, itemId), eq(reconciliationItems.status, "open")))
    .returning();
  if (!item) throw new FinanceError("Item não encontrado ou já explicado.");
  await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "reconciliation.explained", entityType: "reconciliation_item", entityId: itemId, after: { note: note.trim() } });
}

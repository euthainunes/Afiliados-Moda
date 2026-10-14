import { and, eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { auditLogs, conversions, ledgerEntries, ledgerTransactions, notifications, orders, payoutRequests, reconciliationItems } from "@/lib/db/schema";
import { resetEnvCache } from "@/lib/env";
import { AccessDeniedError } from "@/modules/access/can";
import { conversionPosted, platformTotals, userBalances } from "@/modules/finance/ledger";
import {
  FinanceError,
  issueInvoice,
  markPayoutPaid,
  proposeAdjustment,
  registerBrandPayment,
  requestPayout,
  reviewAdjustment,
  reviewPayout,
  runEligibility,
  runReconciliation,
  savePayoutAccount,
} from "@/modules/finance/operations";
import { reprocessOrder } from "@/modules/orders/sync";
import { fictitiousCpf } from "@/demo/seed";
import { createUser } from "../support/factories";
import { DAY, financeScenario, withStatus } from "../support/finance";

const VALID_CPF = "529.982.247-25";

async function ledgerCount() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(ledgerTransactions);
  return n;
}

afterEach(() => {
  delete process.env.APP_ENV;
  resetEnvCache();
});

describe("atribuição e cálculo", () => {
  it("registra a venda com 25% / 20 p.p. / 5 p.p. sobre a base líquida e lança transação balanceada", async () => {
    const s = await financeScenario();
    const clickId = await s.click({ daysAgo: 2 });
    const r = await s.ingest(s.order(clickId, { items: [{ externalSku: "A", title: "Vestido", quantity: 1, unitPriceCents: 20000, listPriceCents: 20000, discountCents: 2000, returnedQuantity: 0 }, { externalSku: "B", title: "Bolsa", quantity: 1, unitPriceCents: 10000, listPriceCents: 10000, discountCents: 0, returnedQuantity: 0 }] }));
    expect(r.outcome).toMatchObject({ kind: "processed", state: "registered" });
    const [c] = await db.select().from(conversions).where(eq(conversions.orderId, r.orderId));
    // Base: 200 - 20 (desconto) + 100 = R$ 280 (frete fora da base)
    expect(c).toMatchObject({ baseAmountCents: 28000, commissionCents: 7000, userRewardCents: 5600, platformCents: 1400, state: "registered", isDemo: true });
    expect(c.ruleSnapshot).toMatchObject({ commissionBps: 2500, userShareBps: 2000, platformShareBps: 500 });
    expect(await userBalances(s.creator.id)).toMatchObject({ pendingCents: 5600, eligibleCents: 0 });
    const [{ total }] = await db.select({ total: sql<number>`sum(${ledgerEntries.amountCents})::int` }).from(ledgerEntries);
    expect(total).toBe(0);
    const [notif] = await db.select().from(notifications).where(and(eq(notifications.userId, s.creator.id), eq(notifications.type, "conversion_registered")));
    expect(notif.body).toMatch(/R\$\s56,00/);
  });

  it("é idempotente: o mesmo pedido recebido de novo não duplica pedido, comissão nem recompensa", async () => {
    const s = await financeScenario();
    const o = s.order(await s.click({ daysAgo: 1 }));
    await s.ingest(o);
    const before = await ledgerCount();
    expect((await s.ingest(o)).status).toBe("unchanged");
    const [{ orderId }] = [await s.ingest(o)];
    await reprocessOrder(orderId);
    await reprocessOrder(orderId);
    expect(await ledgerCount()).toBe(before);
    expect(await db.select().from(orders).where(eq(orders.externalOrderId, o.externalId))).toHaveLength(1);
    expect((await userBalances(s.creator.id)).pendingCents).toBe(6000);
  });

  it("aprova no faturamento, ajusta em devolução parcial e reverte no cancelamento", async () => {
    const s = await financeScenario();
    let o = s.order(await s.click({ daysAgo: 3 }), { createdAt: new Date(Date.now() - 2 * DAY) });
    const { orderId } = await s.ingest(o);

    o = withStatus(o, [{ status: "paid", daysAfter: 0.1 }]);
    await s.ingest(o);
    expect((await db.select().from(conversions).where(eq(conversions.orderId, orderId)))[0].state).toBe("in_validation");

    o = withStatus(o, [{ status: "invoiced", daysAfter: 1 }]);
    await s.ingest(o);
    let [c] = await db.select().from(conversions).where(eq(conversions.orderId, orderId));
    expect(c.state).toBe("approved");
    expect(c.eligibleFrom!.getTime()).toBe(o.createdAt.getTime() + 1 * DAY + 30 * DAY);
    const posted = await conversionPosted(db, c.id);
    expect(posted).toMatchObject({ brandEstimated: 0, brandConfirmed: 7500, platformConfirmed: 1500, userPending: 6000 });

    // Devolução da bolsa (R$ 100): nova base R$ 200.
    o = { ...o, items: o.items.map((i) => (i.externalSku === "B" ? { ...i, returnedQuantity: 1 } : i)) };
    await s.ingest(o);
    [c] = await db.select().from(conversions).where(eq(conversions.orderId, orderId));
    expect(c).toMatchObject({ baseAmountCents: 20000, commissionCents: 5000, userRewardCents: 4000, state: "approved" });
    expect((await userBalances(s.creator.id)).pendingCents).toBe(4000);

    o = withStatus(o, [{ status: "canceled", daysAfter: 3 }]);
    await s.ingest(o);
    [c] = await db.select().from(conversions).where(eq(conversions.orderId, orderId));
    expect(c).toMatchObject({ state: "canceled", commissionCents: 0, userRewardCents: 0 });
    expect(await conversionPosted(db, c.id)).toMatchObject({ commission: 0, userPending: 0, platformConfirmed: 0 });
  });

  it("não atribui sem evidência e recusa autocompra, clique fora da janela e venda sem regra", async () => {
    const s = await financeScenario();
    expect((await s.ingest(s.order(null))).outcome).toMatchObject({ kind: "unattributed" });
    expect((await s.ingest(s.order("01HZZZZZZZZZZZZZZZZZZZZZZZ"))).outcome).toMatchObject({ kind: "unattributed" });

    const self = await s.ingest(s.order(await s.click({ daysAgo: 1, viewerUserId: s.creator.id })));
    expect(self.outcome).toMatchObject({ kind: "rejected", reason: expect.stringContaining("autocompra") });

    const old = await s.click({ daysAgo: 20 });
    const late = await s.ingest(s.order(old, { createdAt: new Date(Date.now() - 2 * DAY) }));
    expect(late.outcome).toMatchObject({ kind: "rejected", reason: expect.stringContaining("janela") });

    const beforeRule = await s.click({ daysAgo: 150 });
    const noRule = await s.ingest(s.order(beforeRule, { createdAt: new Date(Date.now() - 149 * DAY) }));
    expect(noRule.outcome).toMatchObject({ kind: "rejected", reason: expect.stringContaining("sem regra") });

    expect((await userBalances(s.creator.id)).pendingCents).toBe(0);
  });
});

describe("elegibilidade, cobrança da marca e resgate", () => {
  it("não libera só pelo tempo quando a regra exige pagamento da marca; libera após o recebimento", async () => {
    const s = await financeScenario({ requireBrandPayment: true, waitDays: 30 });
    let o = s.order(await s.click({ daysAgo: 50 }), { createdAt: new Date(Date.now() - 49 * DAY) });
    o = withStatus(o, [{ status: "paid", daysAfter: 0.1 }, { status: "invoiced", daysAfter: 2 }]);
    await s.ingest(o);
    expect((await runEligibility()).waitingBrandPayment).toBeGreaterThanOrEqual(1);
    expect((await userBalances(s.creator.id)).eligibleCents).toBe(0);

    const op = await createUser({ roles: ["user", "operator"] });
    await expect(issueInvoice(op.principal, s.t.brand.id, new Date())).rejects.toBeInstanceOf(AccessDeniedError);
    const invoice = await issueInvoice(s.admin.principal, s.t.brand.id, new Date());
    expect(invoice).toMatchObject({ amountCents: 7500, isDemo: true });
    await expect(registerBrandPayment(s.admin.principal, invoice.id, { amountCents: 7000, receivedAt: new Date(), reference: "x" })).rejects.toThrow(/difere/);
    await registerBrandPayment(s.admin.principal, invoice.id, { amountCents: 7500, receivedAt: new Date(), reference: "qualquer" });

    await runEligibility();
    expect(await userBalances(s.creator.id)).toMatchObject({ pendingCents: 0, eligibleCents: 6000 });
    await runEligibility(); // não libera duas vezes
    expect(await userBalances(s.creator.id)).toMatchObject({ pendingCents: 0, eligibleCents: 6000 });
  });

  it("respeita o prazo: antes da data, nada é liberado", async () => {
    const s = await financeScenario({ waitDays: 30 });
    let o = s.order(await s.click({ daysAgo: 3 }), { createdAt: new Date(Date.now() - 2 * DAY) });
    o = withStatus(o, [{ status: "invoiced", daysAfter: 1 }]);
    await s.ingest(o);
    await runEligibility();
    expect((await userBalances(s.creator.id)).eligibleCents).toBe(0);
    await runEligibility(new Date(Date.now() + 40 * DAY));
    expect(await userBalances(s.creator.id)).toMatchObject({ pendingCents: 0, eligibleCents: 6000 });
  });

  it("ciclo de resgate: validações, quatro olhos, recusa devolve saldo e pagamento simulado em demonstração", async () => {
    const s = await financeScenario({ waitDays: 0 });
    for (let i = 0; i < 2; i++) {
      let o = s.order(await s.click({ daysAgo: 5 }), { createdAt: new Date(Date.now() - 4 * DAY) });
      o = withStatus(o, [{ status: "invoiced", daysAfter: 1 }]);
      await s.ingest(o);
    }
    await runEligibility();
    expect((await userBalances(s.creator.id)).eligibleCents).toBe(12000);

    await expect(requestPayout(s.creator.id, 5000)).rejects.toThrow(/dados de recebimento/);
    await expect(savePayoutAccount(s.creator.id, { holderName: "Pessoa Fictícia", cpf: "111.111.111-11", pixKeyType: "email", pixKey: "pessoa@exemplo.test" })).rejects.toThrow();
    await savePayoutAccount(s.creator.id, { holderName: "Pessoa Fictícia", cpf: VALID_CPF, pixKeyType: "email", pixKey: "pessoa@exemplo.test" });
    await expect(requestPayout(s.creator.id, 1000)).rejects.toThrow(/mínimo/);
    await expect(requestPayout(s.creator.id, 999_999)).rejects.toThrow(/insuficiente/);

    const p1 = await requestPayout(s.creator.id, 5000);
    expect(p1).toMatchObject({ isDemo: true, status: "requested" });
    await expect(requestPayout(s.creator.id, 1000 + 2000)).rejects.toThrow(/andamento/);
    expect(await userBalances(s.creator.id)).toMatchObject({ eligibleCents: 7000, inPayoutCents: 5000 });

    await expect(reviewPayout(s.creator.principal, p1.id, "approve")).rejects.toBeInstanceOf(AccessDeniedError);
    await reviewPayout(s.admin.principal, p1.id, "reject", "Dados bancários divergentes (teste)");
    expect(await userBalances(s.creator.id)).toMatchObject({ eligibleCents: 12000, inPayoutCents: 0 });

    const p2 = await requestPayout(s.creator.id, 10000);
    await expect(markPayoutPaid(s.admin.principal, p2.id, null)).rejects.toThrow(/aprovados/);
    await reviewPayout(s.admin.principal, p2.id, "approve");
    await markPayoutPaid(s.admin.principal, p2.id, null);
    const [paid] = await db.select().from(payoutRequests).where(eq(payoutRequests.id, p2.id));
    expect(paid).toMatchObject({ status: "paid", simulated: true, paymentReference: expect.stringContaining("SIMULADO") });
    expect(await userBalances(s.creator.id)).toMatchObject({ eligibleCents: 2000, inPayoutCents: 0, paidCents: 10000 });
    await expect(db.update(payoutRequests).set({ status: "requested" }).where(eq(payoutRequests.id, p2.id))).rejects.toThrow();
  });

  it("estorno depois do resgate deixa saldo a compensar (sem confisco) e gera item de conciliação", async () => {
    const s = await financeScenario({ waitDays: 0 });
    let o = s.order(await s.click({ daysAgo: 5 }), { createdAt: new Date(Date.now() - 4 * DAY) });
    o = withStatus(o, [{ status: "invoiced", daysAfter: 1 }]);
    await s.ingest(o);
    await runEligibility();
    await savePayoutAccount(s.creator.id, { holderName: "Pessoa Fictícia", cpf: "714.602.380-01", pixKeyType: "cpf", pixKey: "714.602.380-01" });
    const p = await requestPayout(s.creator.id, 6000);
    await reviewPayout(s.admin.principal, p.id, "approve");
    await markPayoutPaid(s.admin.principal, p.id, null);

    await s.ingest(withStatus(o, [{ status: "canceled", daysAfter: 3 }]));
    expect(await userBalances(s.creator.id)).toMatchObject({ eligibleCents: -6000, paidCents: 6000 });
    await runReconciliation();
    const items = await db.select().from(reconciliationItems).where(eq(reconciliationItems.kind, "negative_balance"));
    expect(items.some((i) => i.observedCents === -6000)).toBe(true);
  });
});

describe("dados de recebimento", () => {
  it("CPF de outra conta é recusado sem revelar o motivo, fica na auditoria e há limite diário", async () => {
    const a = await createUser();
    const b = await createUser();
    const cpf = fictitiousCpf(7171);
    await savePayoutAccount(a.id, { holderName: "Pessoa A", cpf, pixKeyType: "email", pixKey: "a@exemplo.test" });
    await expect(savePayoutAccount(b.id, { holderName: "Pessoa B", cpf, pixKeyType: "email", pixKey: "b@exemplo.test" })).rejects.toThrow(/Não foi possível confirmar/);
    const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.actorId, b.id), eq(auditLogs.action, "payout_account.cpf_conflict")));
    expect(logs).toHaveLength(1);
    for (let i = 0; i < 4; i++) await savePayoutAccount(b.id, { holderName: "Pessoa B", cpf: fictitiousCpf(7200 + i), pixKeyType: "email", pixKey: "b@exemplo.test" });
    await expect(savePayoutAccount(b.id, { holderName: "Pessoa B", cpf: fictitiousCpf(7300), pixKeyType: "email", pixKey: "b@exemplo.test" })).rejects.toThrow(/Muitas alterações/);
  });
});

describe("ajustes, integridade e proteção de produção", () => {
  it("ajuste manual exige proposta e aprovação por pessoas diferentes", async () => {
    const s = await financeScenario();
    const op = await createUser({ roles: ["user", "operator"] });
    const adm2 = await createUser({ roles: ["user", "admin"] });
    await expect(proposeAdjustment(s.creator.principal, { userId: s.creator.id, amountCents: 500, reason: "tentativa indevida", isDemo: true })).rejects.toBeInstanceOf(AccessDeniedError);
    const adj = await proposeAdjustment(op.principal, { userId: s.creator.id, amountCents: 1500, reason: "Crédito por erro de cálculo (teste)", isDemo: true });
    await expect(reviewAdjustment(op.principal, adj.id, true)).rejects.toBeInstanceOf(AccessDeniedError);
    await reviewAdjustment(adm2.principal, adj.id, true);
    expect((await userBalances(s.creator.id)).eligibleCents).toBe(1500);
    await expect(reviewAdjustment(adm2.principal, adj.id, true)).rejects.toThrow(FinanceError);

    // Conflito de interesse: ninguém propõe nem aprova ajuste no próprio saldo.
    await expect(proposeAdjustment(op.principal, { userId: op.id, amountCents: 900, reason: "crédito para mim mesma", isDemo: true })).rejects.toBeInstanceOf(AccessDeniedError);
    const forAdmin = await proposeAdjustment(op.principal, { userId: adm2.id, amountCents: 900, reason: "crédito para a aprovadora", isDemo: true });
    await expect(reviewAdjustment(adm2.principal, forAdmin.id, true)).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("o banco recusa lançamentos desbalanceados e alterações no livro-razão", async () => {
    const s = await financeScenario();
    await s.ingest(s.order(await s.click({ daysAgo: 1 })));
    await expect(
      db.transaction(async (tx) => {
        const [t] = await tx.insert(ledgerTransactions).values({ idempotencyKey: `teste-${Math.random()}`, kind: "teste", sourceType: "teste", sourceId: "x", reason: "teste" }).returning();
        await tx.insert(ledgerEntries).values({ transactionId: t.id, account: "cash", amountCents: 100 });
      }),
    ).rejects.toThrow();
    await expect(db.update(ledgerEntries).set({ amountCents: 1 })).rejects.toThrow();
    await expect(db.delete(ledgerTransactions)).rejects.toThrow();
  });

  it("conciliação detecta divergência entre conversão e livro-razão e bloqueia a liberação", async () => {
    const s = await financeScenario({ waitDays: 0 });
    let o = s.order(await s.click({ daysAgo: 5 }), { createdAt: new Date(Date.now() - 4 * DAY) });
    o = withStatus(o, [{ status: "invoiced", daysAfter: 1 }]);
    const { orderId } = await s.ingest(o);
    await db.update(conversions).set({ commissionCents: 9999, userRewardCents: 8000, platformCents: 1999 }).where(eq(conversions.orderId, orderId));
    await runReconciliation();
    const [item] = await db.select().from(reconciliationItems).where(and(eq(reconciliationItems.kind, "ledger_mismatch"), eq(reconciliationItems.orderId, orderId)));
    expect(item).toMatchObject({ expectedCents: 9999, observedCents: 7500, status: "open" });
    expect((await runEligibility()).blockedByDivergence).toBeGreaterThanOrEqual(1);
  });

  it("em produção, recusa fonte de demonstração, resgate simulado e gravação de dados fictícios no banco", async () => {
    const s = await financeScenario({ waitDays: 0 });
    process.env.APP_ENV = "production";
    process.env.MAIL_DRIVER = "resend";
    process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    resetEnvCache();
    const { DemoOrderSource } = await import("@/integrations/demo/order-source");
    expect(() => new DemoOrderSource(s.t.brand.id)).toThrow(/produção/);
    delete process.env.APP_ENV;
    process.env.MAIL_DRIVER = "memory";
    delete process.env.PII_ENCRYPTION_KEY;
    resetEnvCache();

    const error = await db
      .transaction(async (tx) => {
        await tx.execute(sql`set local app.environment = 'production'`);
        await tx.insert(orders).values({ brandId: s.t.brand.id, externalOrderId: `X-${Math.random()}`, storeCreatedAt: new Date(), status: "created", statusRaw: "x", statusChangedAt: new Date(), itemsTotalCents: 1, attribution: { clickId: null, method: "x" }, contentHash: "x", isDemo: true });
      })
      .catch((e: Error & { cause?: Error }) => e);
    expect(String((error as Error & { cause?: Error })?.cause?.message)).toMatch(/demonstração não são permitidos no banco de produção/);
  });

  it("separa totais de demonstração dos reais", async () => {
    const s = await financeScenario();
    await s.ingest(s.order(await s.click({ daysAgo: 1 })));
    const demo = await platformTotals(true);
    const real = await platformTotals(false);
    expect(demo.userPendingCents).toBeGreaterThan(0);
    expect(real.userPendingCents).toBe(0);
  });
});

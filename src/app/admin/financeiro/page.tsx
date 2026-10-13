import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { DemoBadge, Money, StatTile } from "@/components/finance/money";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageTitle } from "@/components/ui/card";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { brands, profiles, userRoles } from "@/lib/db/schema";
import { dateFmt, dateTimeFmt } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { can } from "@/modules/access/can";
import { listAdjustments, recentLedger } from "@/modules/finance/admin-queries";
import { platformTotals } from "@/modules/finance/ledger";
import { listInvoices } from "@/modules/finance/operations";
import { reviewAdjustmentAction } from "./actions";
import { IssueInvoiceForm, ProposeAdjustmentForm, RegisterPaymentForm, RunRoutinesForm } from "./forms";

export const metadata: Metadata = { title: "Financeiro" };

const ACCOUNT: Record<string, string> = {
  brand_receivable_estimated: "A receber (estimado)",
  brand_receivable_confirmed: "A receber (confirmado)",
  cash: "Caixa",
  user_reward_pending: "Usuária: pendente",
  user_reward_eligible: "Usuária: disponível",
  user_reward_in_payout: "Usuária: em resgate",
  platform_revenue_estimated: "Receita estimada",
  platform_revenue_confirmed: "Receita confirmada",
  adjustments: "Ajustes",
};

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ origem?: string }> }) {
  const session = await requirePermission("ledger.read", "/admin/financeiro");
  const principal = toPrincipal(session);
  const demo = (await searchParams).origem === "demonstracao";
  const [t, invoices, ledger, adjustments, brandRows, userRows] = await Promise.all([
    platformTotals(demo),
    listInvoices(principal),
    recentLedger(principal),
    listAdjustments(principal),
    db.select({ id: brands.id, name: brands.name }).from(brands).orderBy(asc(brands.name)),
    db.select({ id: profiles.userId, name: profiles.displayName }).from(profiles).innerJoin(userRoles, eq(userRoles.userId, profiles.userId)).where(eq(userRoles.role, "user")).orderBy(asc(profiles.displayName)).limit(500),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <PageTitle description="Tudo deriva do livro-razão. Valores devidos às usuárias são passivo — nunca receita da plataforma.">Financeiro</PageTitle>
        <nav aria-label="Origem dos dados" className="flex gap-2 text-sm">
          <a href="/admin/financeiro" className={`rounded-lg px-3 py-1.5 ${!demo ? "bg-ink text-white" : "border border-line"}`}>Dados reais</a>
          <a href="/admin/financeiro?origem=demonstracao" className={`rounded-lg px-3 py-1.5 ${demo ? "bg-ink text-white" : "border border-line"}`}>Demonstração</a>
        </nav>
      </div>

      <section aria-labelledby="totais">
        <h2 id="totais" className="mb-3 text-lg font-semibold">Posição {demo && <DemoBadge />}</h2>
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Comissão a receber (estimada)" value={<Money cents={t.commissionEstimatedCents} />} nature="estimado" help="Vendas ainda não aprovadas" />
          <StatTile label="Comissão a receber (confirmada)" value={<Money cents={t.commissionConfirmedOpenCents} />} nature="confirmado" help="Aprovadas, ainda não pagas pela marca" />
          <StatTile label="Caixa" value={<Money cents={t.cashCents} />} help={demo ? "Simulado: nenhum valor real" : "Recebido das marcas menos resgates pagos"} />
          <StatTile label="Receita confirmada da plataforma" value={<Money cents={t.platformRevenueConfirmedCents} />} nature="confirmado" help={`Estimada: ${formatCents(t.platformRevenueEstimatedCents)}`} />
          <StatTile label="Recompensas pendentes" value={<Money cents={t.userPendingCents} />} help="Devidas às usuárias, em validação" />
          <StatTile label="Recompensas disponíveis" value={<Money cents={t.userEligibleCents} />} help="Podem ser resgatadas" />
          <StatTile label="Em resgate" value={<Money cents={t.userInPayoutCents} />} />
          <StatTile label="Ajustes manuais" value={<Money cents={t.adjustmentsCents} />} />
        </dl>
      </section>

      <Card aria-labelledby="rotinas">
        <h2 id="rotinas" className="mb-2 text-lg font-semibold">Rotinas</h2>
        <p className="mb-3 text-sm text-muted">Rodam automaticamente todo dia; podem ser executadas manualmente.</p>
        {can(principal, "reconciliation.manage") && <RunRoutinesForm />}
      </Card>

      <Card aria-labelledby="faturas">
        <h2 id="faturas" className="mb-3 text-lg font-semibold">Faturas das marcas</h2>
        {can(principal, "brand_payments.record") && <IssueInvoiceForm brands={Object.fromEntries(brandRows.map((b) => [b.id, b.name]))} />}
        <ul className="mt-4 divide-y divide-line">
          {invoices.map(({ invoice, brandName }) => (
            <li key={invoice.id} className="flex flex-col gap-2 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  Fatura nº {invoice.number} · {brandName} · <Money cents={invoice.amountCents} /> {invoice.isDemo && <DemoBadge />}
                </p>
                <Badge tone={invoice.status === "paid" ? "success" : invoice.status === "issued" ? "warning" : "neutral"}>
                  {invoice.status === "paid" ? "Paga" : invoice.status === "issued" ? "Em aberto" : "Cancelada"}
                </Badge>
              </div>
              <p className="text-muted">Emitida em {dateFmt.format(invoice.issuedAt)}</p>
              {invoice.status === "issued" && can(principal, "brand_payments.record") && (
                <RegisterPaymentForm invoiceId={invoice.id} amountLabel={formatCents(invoice.amountCents)} isDemo={invoice.isDemo} />
              )}
            </li>
          ))}
          {invoices.length === 0 && <li className="py-3 text-sm text-muted">Nenhuma fatura emitida.</li>}
        </ul>
      </Card>

      <Card aria-labelledby="ajustes">
        <h2 id="ajustes" className="mb-3 text-lg font-semibold">Ajustes manuais</h2>
        <p className="mb-4 text-sm text-muted">Toda correção de saldo é um novo lançamento, com motivo, proposto por uma pessoa e aprovado por outra.</p>
        {can(principal, "ledger.adjust.propose") && <ProposeAdjustmentForm users={Object.fromEntries(userRows.map((u) => [u.id, u.name]))} />}
        <ul className="mt-4 divide-y divide-line text-sm">
          {adjustments.map(({ adjustment: a, userName }) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="font-medium">{userName} · <Money cents={a.amountCents} /> {a.isDemo && <DemoBadge />}</p>
                <p className="text-muted">{a.reason}</p>
              </div>
              {a.status === "proposed" && can(principal, "ledger.adjust.approve") && a.proposedBy !== session.user.id ? (
                <div className="flex gap-2">
                  <ActionForm action={reviewAdjustmentAction} hidden={{ adjustmentId: a.id, decision: "approve" }}>
                    <Button type="submit" size="sm">Aprovar</Button>
                  </ActionForm>
                  <ActionForm action={reviewAdjustmentAction} hidden={{ adjustmentId: a.id, decision: "reject" }}>
                    <Button type="submit" size="sm" variant="ghost">Rejeitar</Button>
                  </ActionForm>
                </div>
              ) : (
                <Badge tone={a.status === "approved" ? "success" : a.status === "rejected" ? "danger" : "warning"}>
                  {a.status === "approved" ? "Aprovado" : a.status === "rejected" ? "Rejeitado" : "Aguardando outra pessoa"}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <section aria-labelledby="razao">
        <h2 id="razao" className="mb-3 text-lg font-semibold">Livro-razão (lançamentos recentes)</h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-3 py-3 font-medium">Quando</th>
                <th scope="col" className="px-3 py-3 font-medium">Evento</th>
                <th scope="col" className="px-3 py-3 font-medium">Partidas (débito + / crédito −)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ledger.map(({ tx, entries }) => (
                <tr key={tx.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums">{dateTimeFmt.format(tx.occurredAt)}</td>
                  <td className="px-3 py-3">
                    <span className="font-mono text-xs">{tx.kind}</span> {tx.isDemo && <DemoBadge />}
                    <p className="text-xs text-muted">{tx.reason}</p>
                  </td>
                  <td className="px-3 py-3">
                    <ul className="text-xs">
                      {entries.map((e) => (
                        <li key={e.id} className="flex justify-between gap-4">
                          <span>{ACCOUNT[e.account] ?? e.account}</span>
                          <Money cents={e.amountCents} />
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

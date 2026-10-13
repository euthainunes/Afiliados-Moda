import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge, Money, StatTile } from "@/components/finance/money";
import { PayoutStatusBadge } from "@/components/finance/status";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireSession } from "@/lib/auth/current";
import { dateFmt, dateTimeFmt } from "@/lib/dates";
import { userBalances } from "@/modules/finance/ledger";
import { payoutsForUser, statementForUser } from "@/modules/finance/queries";
import { getSetting } from "@/modules/settings/service";
import { cancelPayoutAction } from "./actions";

export const metadata: Metadata = { title: "Recompensas" };

const ACCOUNT_LABEL: Record<string, string> = {
  user_reward_pending: "Pendente",
  user_reward_eligible: "Disponível",
  user_reward_in_payout: "Em resgate",
};

export default async function RewardsPage() {
  const session = await requireSession("/app/recompensas");
  const [b, statement, payouts, min] = await Promise.all([userBalances(session.user.id), statementForUser(session.user.id), payoutsForUser(session.user.id), getSetting("payout.min_cents")]);
  const anyDemo = statement.some((s) => s.isDemo) || payouts.some((p) => p.isDemo);
  const open = payouts.find((p) => p.status === "requested" || p.status === "approved");

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageTitle description="Saldos calculados a partir do histórico de lançamentos — cada valor tem origem e motivo.">Recompensas {anyDemo && <DemoBadge />}</PageTitle>
        {b.eligibleCents >= min && !open && <ButtonLink href="/app/recompensas/resgatar">Solicitar resgate</ButtonLink>}
      </div>
      {anyDemo && (
        <div className="mb-6">
          <Alert tone="warning" title="Valores de demonstração">Estes valores são fictícios e servem para testar a plataforma. Nenhum pagamento real é feito.</Alert>
        </div>
      )}
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Pendente" value={<Money cents={b.pendingCents} />} help="Vendas ainda no prazo de validação" nature="estimado" />
        <StatTile label="Disponível para resgate" value={<Money cents={b.eligibleCents} />} help={b.eligibleCents < 0 ? "Saldo a compensar com recompensas futuras" : `Mínimo para resgate: ${(min / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`} nature="confirmado" />
        <StatTile label="Em resgate" value={<Money cents={b.inPayoutCents} />} help="Aguardando análise ou pagamento" />
        <StatTile label="Já recebido" value={<Money cents={b.paidCents} />} nature="confirmado" />
      </dl>

      <section className="mt-8" aria-labelledby="resgates">
        <h2 id="resgates" className="text-lg font-semibold">Resgates</h2>
        {payouts.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nenhum resgate solicitado.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
            {payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium"><Money cents={p.amountCents} /> · PIX {p.pixKeyHint} {p.isDemo && <DemoBadge />}</p>
                  <p className="text-muted">Solicitado em {dateTimeFmt.format(p.requestedAt)}{p.reviewNote ? ` · ${p.reviewNote}` : ""}</p>
                  {p.status === "paid" && <p className="text-muted">{p.simulated ? "Pagamento simulado: nenhum valor foi transferido." : `Comprovante: ${p.paymentReference}`}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <PayoutStatusBadge status={p.status} simulated={p.simulated} />
                  {p.status === "requested" && (
                    <ActionForm action={cancelPayoutAction} hidden={{ payoutId: p.id }}>
                      <SubmitButton size="sm" variant="ghost" pendingLabel="Cancelando…">Cancelar</SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-labelledby="extrato">
        <h2 id="extrato" className="text-lg font-semibold">Extrato</h2>
        <p className="mt-1 text-sm text-muted">Lançamentos nunca são apagados ou editados: correções aparecem como novos lançamentos, com motivo.</p>
        {statement.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Sem lançamentos ainda.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Data</th>
                  <th scope="col" className="px-4 py-3 font-medium">Descrição</th>
                  <th scope="col" className="px-4 py-3 font-medium">Saldo</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {statement.map((s, i) => (
                  <tr key={`${s.transactionId}-${i}`}>
                    <td className="px-4 py-3 tabular-nums">{dateFmt.format(s.occurredAt)}</td>
                    <td className="px-4 py-3">{s.reason} {s.isDemo && <DemoBadge />}</td>
                    <td className="px-4 py-3 text-muted">{ACCOUNT_LABEL[s.account] ?? s.account}</td>
                    <td className="px-4 py-3 text-right"><Money cents={s.amountForUser} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">
          Regras de liberação no <Link href="/regulamento" className="underline">regulamento</Link>.
        </p>
      </section>
    </>
  );
}

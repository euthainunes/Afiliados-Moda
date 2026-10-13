import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge, Money, StatTile } from "@/components/finance/money";
import { PayoutStatusBadge } from "@/components/finance/status";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/card";
import { SimplePager } from "@/components/ui/pagination";
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

const PAGE = 20;

export default async function RewardsPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const session = await requireSession("/app/recompensas");
  const page = Math.max(1, Math.min(500, Number((await searchParams).pagina) || 1));
  const [b, rows, payouts, min] = await Promise.all([userBalances(session.user.id), statementForUser(session.user.id, { page, pageSize: PAGE }), payoutsForUser(session.user.id), getSetting("payout.min_cents")]);
  const hasNext = rows.length > PAGE;
  const statement = rows.slice(0, PAGE);
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
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface text-sm">
            {statement.map((s, i) => (
              <li key={`${s.transactionId}-${i}`} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p>{s.reason} {s.isDemo && <DemoBadge />}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {dateFmt.format(s.occurredAt)} · {ACCOUNT_LABEL[s.account] ?? s.account}
                  </p>
                </div>
                <Money cents={s.amountForUser} className="shrink-0 font-medium" />
              </li>
            ))}
          </ul>
        )}
        <SimplePager page={page} hasNext={hasNext} href={(p) => `/app/recompensas?pagina=${p}#extrato`} />
        <p className="mt-3 text-xs text-muted">
          Regras de liberação no <Link href="/regulamento" className="underline">regulamento</Link>.
        </p>
      </section>
    </>
  );
}

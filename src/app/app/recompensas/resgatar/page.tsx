import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Card, PageTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/current";
import { formatCents } from "@/lib/money";
import { userBalances } from "@/modules/finance/ledger";
import { getPayoutAccount } from "@/modules/finance/operations";
import { getSetting } from "@/modules/settings/service";
import { PayoutAccountForm, RequestPayoutForm } from "./forms";

export const metadata: Metadata = { title: "Solicitar resgate" };

export default async function PayoutPage() {
  const session = await requireSession("/app/recompensas/resgatar");
  const [b, account, min] = await Promise.all([userBalances(session.user.id), getPayoutAccount(session.user.id), getSetting("payout.min_cents")]);
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <Link href="/app/recompensas" className="text-sm text-muted hover:underline">← Recompensas</Link>
        <PageTitle description="O pagamento é feito por PIX depois da análise da equipe.">Solicitar resgate</PageTitle>
      </div>
      <Card aria-labelledby="dados">
        <h2 id="dados" className="mb-1 text-lg font-semibold">Dados de recebimento</h2>
        {account ? (
          <p className="mb-4 text-sm text-muted">Cadastrado: {account.holderName} · PIX ({account.pixKeyType}) {account.pixKeyHint}. Para alterar, preencha de novo.</p>
        ) : (
          <p className="mb-4 text-sm text-muted">Pedimos estes dados apenas no primeiro resgate.</p>
        )}
        <PayoutAccountForm defaults={account ?? undefined} />
      </Card>
      <Card aria-labelledby="valor">
        <h2 id="valor" className="mb-4 text-lg font-semibold">Valor</h2>
        {!account ? (
          <Alert tone="info">Cadastre os dados de recebimento acima para continuar.</Alert>
        ) : b.eligibleCents < min ? (
          <Alert tone="info">Seu saldo disponível ({formatCents(b.eligibleCents)}) ainda não atingiu o mínimo de {formatCents(min)}.</Alert>
        ) : (
          <RequestPayoutForm maxLabel={formatCents(b.eligibleCents)} />
        )}
      </Card>
    </div>
  );
}

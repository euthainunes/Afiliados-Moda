import type { Metadata } from "next";
import { DemoBadge, Money } from "@/components/finance/money";
import { PayoutStatusBadge } from "@/components/finance/status";
import { Alert } from "@/components/ui/alert";
import { PageTitle } from "@/components/ui/card";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { dateTimeFmt } from "@/lib/dates";
import { can } from "@/modules/access/can";
import { listPayoutsAdmin } from "@/modules/finance/admin-queries";
import { MarkPaidForm, ReviewPayoutForms } from "./forms";

export const metadata: Metadata = { title: "Resgates" };

const FILTERS = { "": "Todos", requested: "Solicitados", approved: "Aprovados", paid: "Pagos", rejected: "Recusados" } as const;

const NOTICES = { aprovado: "Resgate aprovado.", recusado: "Resgate recusado; valor devolvido ao saldo.", pago: "Pagamento registrado." } as const;

export default async function PayoutsAdminPage({ searchParams }: { searchParams: Promise<{ status?: string; aviso?: string }> }) {
  const session = await requirePermission("payouts.review", "/admin/resgates");
  const principal = toPrincipal(session);
  const { status, aviso } = await searchParams;
  const notice = aviso && aviso in NOTICES ? NOTICES[aviso as keyof typeof NOTICES] : null;
  const rows = await listPayoutsAdmin(principal, status);
  return (
    <>
      <PageTitle description="O pagamento é feito por PIX fora da plataforma e registrado aqui com o comprovante. Quem solicita nunca aprova o próprio resgate.">Resgates</PageTitle>
      {notice && (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}
      <nav aria-label="Filtro" className="mb-4 flex flex-wrap gap-2 text-sm">
        {Object.entries(FILTERS).map(([k, label]) => (
          <a key={k} href={k ? `/admin/resgates?status=${k}` : "/admin/resgates"} className={`rounded-lg px-3 py-1.5 ${(status ?? "") === k ? "bg-ink text-white" : "border border-line"}`}>{label}</a>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">Nenhum resgate.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(({ payout: p, userName, username }) => (
            <li key={p.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  <Money cents={p.amountCents} /> · {userName} (@{username}) · PIX {p.pixKeyHint} {p.isDemo && <DemoBadge />}
                </p>
                <PayoutStatusBadge status={p.status} simulated={p.simulated} />
              </div>
              <p className="mt-1 text-sm text-muted">
                Solicitado em {dateTimeFmt.format(p.requestedAt)}
                {p.reviewNote && ` · ${p.reviewNote}`}
                {p.paymentReference && ` · ${p.paymentReference}`}
              </p>
              {p.status === "requested" && (can(principal, "payouts.approve") || can(principal, "payouts.review")) && (
                <div className="mt-3 border-t border-line pt-3">
                  <ReviewPayoutForms payoutId={p.id} />
                </div>
              )}
              {p.status === "approved" && can(principal, "payouts.mark_paid") && (
                <div className="mt-3 border-t border-line pt-3">
                  <MarkPaidForm payoutId={p.id} isDemo={p.isDemo} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

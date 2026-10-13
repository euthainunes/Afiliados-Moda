import type { Metadata } from "next";
import { DemoBadge, Money } from "@/components/finance/money";
import { ActionForm } from "@/components/ui/action-form";
import { PageTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { dateTimeFmt } from "@/lib/dates";
import { listReconciliation } from "@/modules/finance/admin-queries";
import { resolveItemAction } from "../financeiro/actions";
import { RunRoutinesForm } from "../financeiro/forms";

export const metadata: Metadata = { title: "Conciliação" };

const KIND: Record<string, string> = {
  ledger_mismatch: "Conversão × livro-razão",
  unmatched_click: "Clique não encontrado",
  uninvoiced: "Venda sem fatura",
  invoice_diff: "Fatura × comissão atual",
  negative_balance: "Saldo a compensar",
};

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const session = await requirePermission("reconciliation.manage", "/admin/conciliacao");
  const explained = (await searchParams).ver === "explicadas";
  const items = await listReconciliation(toPrincipal(session), explained ? "explained" : "open");
  return (
    <>
      <PageTitle description="Divergências entre lojas, conversões, livro-razão e recebimentos. Nada é corrigido automaticamente: cada item precisa de explicação, e correções de valor viram ajustes aprovados.">Conciliação</PageTitle>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <a href="/admin/conciliacao" className={`rounded-lg px-3 py-1.5 ${!explained ? "bg-ink text-white" : "border border-line"}`}>Abertas</a>
        <a href="/admin/conciliacao?ver=explicadas" className={`rounded-lg px-3 py-1.5 ${explained ? "bg-ink text-white" : "border border-line"}`}>Explicadas</a>
        <RunRoutinesForm />
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">Nenhuma divergência {explained ? "explicada" : "aberta"}.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((i) => (
            <li key={i.id} className="rounded-xl border border-line bg-surface p-4 text-sm">
              <p className="font-medium">{KIND[i.kind] ?? i.kind} {i.isDemo && <DemoBadge />}</p>
              <p className="mt-1">{i.description}</p>
              <p className="mt-1 text-muted">
                Detectada em {dateTimeFmt.format(i.detectedAt)}
                {i.expectedCents != null && <> · esperado <Money cents={i.expectedCents} /></>}
                {i.observedCents != null && <> · observado <Money cents={i.observedCents} /></>}
              </p>
              {i.status === "open" ? (
                <ActionForm action={resolveItemAction} hidden={{ itemId: i.id }} className="mt-3">
                  <label htmlFor={`exp-${i.id}`} className="text-sm font-medium">Explicação</label>
                  <input id={`exp-${i.id}`} name="note" required minLength={10} className="h-10 rounded-lg border border-line px-3" />
                  <SubmitButton size="sm" variant="secondary" className="self-start" pendingLabel="Salvando…">Marcar como explicada</SubmitButton>
                </ActionForm>
              ) : (
                <p className="mt-2 text-muted">Explicação: {i.resolutionNote}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

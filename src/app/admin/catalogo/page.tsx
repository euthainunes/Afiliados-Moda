import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, PageTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { listFeedsWithRuns } from "@/modules/catalog/admin";
import { importFeedAction } from "./actions";

export const metadata: Metadata = { title: "Catálogo e importações" };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const STATUS = { running: ["Em andamento", "neutral"], succeeded: ["Concluída", "success"], failed: ["Falhou", "danger"] } as const;

export default async function CatalogAdminPage() {
  const session = await requirePermission("catalog.manage", "/admin/catalogo");
  const feeds = await listFeedsWithRuns(toPrincipal(session));
  return (
    <>
      <PageTitle description="Feeds de produtos das marcas e histórico de importações.">Catálogo e importações</PageTitle>
      {feeds.length === 0 && <p className="text-muted">Nenhum feed cadastrado.</p>}
      <div className="flex flex-col gap-6">
        {feeds.map(({ feed, brandName, brandFictitious, runs }) => (
          <Card key={feed.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">
                  {brandName} {brandFictitious && <Badge tone="warning">fictícia</Badge>}
                </h2>
                <p className="mt-1 break-all font-mono text-xs text-muted">{feed.source}</p>
              </div>
              <ActionForm action={importFeedAction} hidden={{ feedId: feed.id }} className="items-end">
                <SubmitButton size="sm" pendingLabel="Importando…">Importar agora</SubmitButton>
              </ActionForm>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line text-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-4 font-medium">Início</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {runs.map((run) => {
                    const [label, tone] = STATUS[run.status];
                    const s = run.stats;
                    return (
                      <tr key={run.id} className="align-top">
                        <td className="py-2 pr-4 tabular-nums">{dateFmt.format(run.startedAt)}</td>
                        <td className="py-2 pr-4"><Badge tone={tone}>{label}</Badge></td>
                        <td className="py-2 pr-4 text-muted">
                          {s && (
                            <>
                              {s.itemsRead} itens lidos · {s.productsUpserted} produtos novos/alterados · {s.productsUnchanged} sem mudança ·{" "}
                              {s.productsUnlisted} retirados · {s.priceChanges} mudanças de preço · {s.itemsRejected} rejeitados
                              {s.unlistingSkipped && <p className="text-warning">Feed com muito menos produtos que o esperado: nenhum produto foi retirado.</p>}
                            </>
                          )}
                          {run.errorMessage && <p className="text-danger">{run.errorMessage}</p>}
                          {run.errors && run.errors.length > 0 && (
                            <details className="mt-1">
                              <summary className="cursor-pointer">Ver itens rejeitados ({run.errors.length})</summary>
                              <ul className="mt-1 list-disc pl-5 font-mono text-xs">
                                {run.errors.map((e, i) => <li key={i}>{e.itemId}: {e.reason}</li>)}
                              </ul>
                            </details>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

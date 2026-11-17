import type { Metadata } from "next";
import { DemoBadge, Money } from "@/components/finance/money";
import { ConversionStateBadge } from "@/components/finance/status";
import { Badge } from "@/components/ui/badge";
import { PageTitle } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { dateFmt } from "@/lib/dates";
import { portalSales } from "@/modules/brand-portal/service";
import { portalContext } from "../../brand";

export const metadata: Metadata = { title: "Vendas" };

export default async function BrandSalesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ pagina?: string }> }) {
  const { slug } = await params;
  const page = Math.max(1, Math.min(1000, Number((await searchParams).pagina) || 1));
  const { principal, brand } = await portalContext(slug);
  const { rows, pages, total } = await portalSales(principal, brand.id, { page });

  return (
    <>
      <PageTitle description="Pedidos da loja atribuídos a looks da plataforma. Mostramos o número do pedido para conferência, nunca dados de quem comprou.">Vendas atribuídas</PageTitle>
      <p className="mb-3 text-sm text-muted">{total.toLocaleString("pt-BR")} venda(s) no total.</p>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">Nenhuma venda atribuída ainda.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Data</th>
                <th scope="col" className="px-4 py-3 font-medium">Pedido</th>
                <th scope="col" className="px-4 py-3 font-medium">Look</th>
                <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Base</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Comissão</th>
                <th scope="col" className="px-4 py-3 font-medium">Fatura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 tabular-nums">{dateFmt.format(r.registeredAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.externalOrderId} {r.isDemo && <DemoBadge />}</td>
                  <td className="px-4 py-3">{r.lookTitle}<p className="text-muted">@{r.creator}</p></td>
                  <td className="px-4 py-3"><ConversionStateBadge state={r.state} />{r.rejectionReason && <p className="mt-1 text-xs text-muted">{r.rejectionReason}</p>}</td>
                  <td className="px-4 py-3 text-right tabular-nums"><Money cents={r.baseCents} /></td>
                  <td className="px-4 py-3 text-right tabular-nums"><Money cents={r.commissionCents} /></td>
                  <td className="px-4 py-3">{r.invoiceId ? <Badge tone="success">Faturada</Badge> : <span className="text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4">
        <Pagination page={page} pages={pages} href={(p) => `/marca/${slug}/vendas?pagina=${p}`} />
      </div>
    </>
  );
}

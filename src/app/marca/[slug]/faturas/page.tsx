import type { Metadata } from "next";
import { DemoBadge, Money } from "@/components/finance/money";
import { Badge } from "@/components/ui/badge";
import { PageTitle } from "@/components/ui/card";
import { dateFmt } from "@/lib/dates";
import { portalInvoices } from "@/modules/brand-portal/service";
import { portalContext } from "../../brand";

export const metadata: Metadata = { title: "Faturas" };

const STATUS = {
  issued: { label: "Em aberto", tone: "warning" },
  paid: { label: "Paga", tone: "success" },
  canceled: { label: "Cancelada", tone: "neutral" },
} as const;

export default async function BrandInvoicesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { principal, brand } = await portalContext(slug);
  const invoices = await portalInvoices(principal, brand.id);

  return (
    <>
      <PageTitle description="Comissão cobrada pela plataforma sobre as vendas confirmadas de cada período. Dúvidas sobre uma fatura: fale com a equipe da plataforma.">Faturas</PageTitle>
      {invoices.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">Nenhuma fatura emitida ainda.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Nº</th>
                <th scope="col" className="px-4 py-3 font-medium">Período</th>
                <th scope="col" className="px-4 py-3 font-medium">Vendas</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Valor</th>
                <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                <th scope="col" className="px-4 py-3 font-medium">Emitida em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-3 tabular-nums">{i.number} {i.isDemo && <DemoBadge />}</td>
                  <td className="px-4 py-3 tabular-nums">{dateFmt.format(i.periodStart)} a {dateFmt.format(i.periodEnd)}</td>
                  <td className="px-4 py-3 tabular-nums">{i.items}</td>
                  <td className="px-4 py-3 text-right tabular-nums"><Money cents={i.amountCents} /></td>
                  <td className="px-4 py-3"><Badge tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Badge></td>
                  <td className="px-4 py-3 tabular-nums">{dateFmt.format(i.issuedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

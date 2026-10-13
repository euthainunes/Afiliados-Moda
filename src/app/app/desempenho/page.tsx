import type { Metadata } from "next";
import { ColumnChart } from "@/components/finance/column-chart";
import { DemoBadge, Money, StatTile } from "@/components/finance/money";
import { ConversionStateBadge } from "@/components/finance/status";
import { PageTitle } from "@/components/ui/card";
import { SimplePager } from "@/components/ui/pagination";
import { requireSession } from "@/lib/auth/current";
import { dateFmt } from "@/lib/dates";
import { conversionsForUser, performanceSeries } from "@/modules/finance/queries";

export const metadata: Metadata = { title: "Desempenho" };

const PAGE = 20;

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const session = await requireSession("/app/desempenho");
  const page = Math.max(1, Math.min(500, Number((await searchParams).pagina) || 1));
  const [series, rows] = await Promise.all([performanceSeries(session.user.id, 30), conversionsForUser(session.user.id, { page, pageSize: PAGE })]);
  const hasNext = rows.length > PAGE;
  const convs = rows.slice(0, PAGE);
  const clicks = series.reduce((s, d) => s + d.clicks, 0);
  const sales = series.reduce((s, d) => s + d.conversions, 0);
  const reward = series.reduce((s, d) => s + d.rewardCents, 0);
  const label = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
  const anyDemo = convs.some((c) => c.isDemo);

  return (
    <>
      <PageTitle description="Últimos 30 dias. Cliques sem robôs e sem os seus próprios; vendas conforme informadas pela loja.">Desempenho</PageTitle>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Cliques nas peças" value={clicks.toLocaleString("pt-BR")} nature="confirmado" />
        <StatTile label="Vendas atribuídas" value={sales.toLocaleString("pt-BR")} help="Registradas, em validação ou aprovadas" />
        <StatTile label="Conversão" value={clicks ? `${((sales / clicks) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"} help="Vendas ÷ cliques" />
        <StatTile label="Recompensa gerada" value={<Money cents={reward} />} nature="estimado" help="Pode mudar com cancelamentos e devoluções" />
      </dl>

      <section className="mt-6 grid gap-6 rounded-xl border border-line bg-surface p-5 lg:grid-cols-2" aria-label="Gráficos">
        <ColumnChart title="Cliques por dia" unit="cliques" points={series.map((d) => ({ label: label(d.day), value: d.clicks, display: String(d.clicks) }))} />
        <ColumnChart title="Vendas atribuídas por dia" unit="vendas" color="var(--accent)" points={series.map((d) => ({ label: label(d.day), value: d.conversions, display: String(d.conversions) }))} />
      </section>

      <section className="mt-8" aria-labelledby="vendas">
        <h2 id="vendas" className="text-lg font-semibold">Vendas atribuídas {anyDemo && <DemoBadge />}</h2>
        <p className="mt-1 text-sm text-muted">Não mostramos dados de quem comprou — apenas o pedido, o look de origem e a sua recompensa.</p>
        {convs.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line p-8 text-center text-muted">Nenhuma venda atribuída ainda. Compartilhe seus looks!</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Data</th>
                  <th scope="col" className="px-4 py-3 font-medium">Look</th>
                  <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Base</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Sua recompensa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {convs.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className="px-4 py-3 tabular-nums">{dateFmt.format(c.registeredAt)}</td>
                    <td className="px-4 py-3">{c.lookTitle}<p className="text-xs text-muted">{c.brandName}</p></td>
                    <td className="px-4 py-3">
                      <ConversionStateBadge state={c.state} eligible={!!c.eligibleAt} />
                      {c.rejectionReason && <p className="mt-1 text-xs text-muted">{c.rejectionReason}</p>}
                      {c.state === "approved" && !c.eligibleAt && c.eligibleFrom && <p className="mt-1 text-xs text-muted">Liberação prevista a partir de {dateFmt.format(c.eligibleFrom)}</p>}
                    </td>
                    <td className="px-4 py-3 text-right"><Money cents={c.baseCents} /></td>
                    <td className="px-4 py-3 text-right font-medium"><Money cents={c.rewardCents} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <SimplePager page={page} hasNext={hasNext} href={(p) => `/app/desempenho?pagina=${p}`} />
      </section>
    </>
  );
}

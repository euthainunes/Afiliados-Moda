import type { Metadata } from "next";
import { ColumnChart } from "@/components/finance/column-chart";
import { DemoBadge, Money, StatTile } from "@/components/finance/money";
import { Card, PageTitle } from "@/components/ui/card";
import { portalOverview } from "@/modules/brand-portal/service";
import { portalContext } from "../brand";

export const metadata: Metadata = { title: "Visão geral" };

export default async function BrandOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { principal, brand } = await portalContext(slug);
  const o = await portalOverview(principal, brand.id);
  const label = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
  const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

  return (
    <>
      <PageTitle
        description={
          <>
            Últimos {o.days} dias. Cliques sem robôs e sem cliques das próprias autoras; vendas conforme informadas pela loja. Dados de quem comprou nunca são exibidos.{" "}
            {(o.hasDemo || brand.isFictitious) && <DemoBadge />}
          </>
        }
      >
        {brand.name}
      </PageTitle>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Cliques para a loja" value={o.clicks.toLocaleString("pt-BR")} nature="confirmado" help={`De ${o.creators} criadora(s)`} />
        <StatTile label="Vendas atribuídas" value={o.sales.toLocaleString("pt-BR")} help={`Conversão: ${o.clicks ? pct(o.conversionRate) : "—"}`} />
        <StatTile label="Valor das vendas" value={<Money cents={o.salesBaseCents} />} help="Base de cálculo da comissão" nature="estimado" />
        <StatTile label="Comissão do período" value={<Money cents={o.commissionCents} />} nature="estimado" help="Pode mudar com cancelamentos e devoluções" />
      </dl>

      <section className="mt-6 grid gap-6 rounded-xl border border-line bg-surface p-5 lg:grid-cols-2" aria-label="Gráficos">
        <ColumnChart title="Cliques por dia" unit="cliques" points={o.series.map((d) => ({ label: label(d.day), value: d.clicks, display: String(d.clicks) }))} />
        <ColumnChart title="Vendas atribuídas por dia" unit="vendas" color="var(--accent)" points={o.series.map((d) => ({ label: label(d.day), value: d.sales, display: String(d.sales) }))} />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card aria-labelledby="a-faturar">
          <h2 id="a-faturar" className="text-lg font-semibold">A faturar</h2>
          <p className="mt-2 text-2xl font-semibold tabular-nums"><Money cents={o.approvedUninvoicedCents} /></p>
          <p className="mt-1 text-sm text-muted">Comissão de vendas já confirmadas que ainda não entraram em fatura (todo o período).</p>
        </Card>
        <Card aria-labelledby="pecas">
          <h2 id="pecas" className="mb-3 text-lg font-semibold">Peças mais clicadas</h2>
          {o.topProducts.length === 0 ? <p className="text-sm text-muted">Sem cliques no período.</p> : (
            <ol className="flex flex-col gap-2 text-sm">
              {o.topProducts.map((p) => (
                <li key={p.title} className="flex justify-between gap-3"><span className="min-w-0 truncate">{p.title}</span><span className="tabular-nums text-muted">{p.clicks}</span></li>
              ))}
            </ol>
          )}
        </Card>
        <Card aria-labelledby="looks">
          <h2 id="looks" className="mb-3 text-lg font-semibold">Looks que mais venderam</h2>
          {o.topLooks.length === 0 ? <p className="text-sm text-muted">Sem vendas no período.</p> : (
            <ol className="flex flex-col gap-2 text-sm">
              {o.topLooks.map((l) => (
                <li key={`${l.slug}-${l.creator}`} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{l.slug ? <a href={`/l/${l.slug}`} className="underline">{l.title}</a> : l.title} <span className="text-muted">· @{l.creator}</span></span>
                  <span className="tabular-nums text-muted">{l.sales}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/card";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { can } from "@/modules/access/can";
import { clickReport } from "@/modules/reporting/metrics";
import { parsePeriod } from "./period";

export const metadata: Metadata = { title: "Relatórios" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const session = await requirePermission("reports.read", "/admin/relatorios");
  const principal = toPrincipal(session);
  const period = parsePeriod(await searchParams);
  const rows = await clickReport(principal, period);
  const total = rows.reduce((s, r) => s + r.clicks, 0);
  const qs = new URLSearchParams({ de: period.fromStr, ate: period.toStr });

  return (
    <>
      <PageTitle description="Cliques válidos de saída para as lojas (sem robôs e sem cliques da própria autora). Vendas e comissões entram quando a atribuição for comprovada.">
        Relatório de cliques
      </PageTitle>
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-muted">De</span>
          <input type="date" name="de" defaultValue={period.fromStr} className="h-10 rounded-lg border border-line bg-surface px-3" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Até</span>
          <input type="date" name="ate" defaultValue={period.toStr} className="h-10 rounded-lg border border-line bg-surface px-3" />
        </label>
        <Button type="submit" variant="secondary" size="sm" className="h-10">Aplicar</Button>
        {can(principal, "reports.export") && (
          <Link href={`/admin/relatorios/exportar?${qs}`} className={buttonClasses("ghost", "sm", "h-10")} prefetch={false}>
            Exportar CSV
          </Link>
        )}
      </form>
      <p className="mb-3 text-sm text-muted">
        {total.toLocaleString("pt-BR")} clique(s) válidos · indicador <strong>confirmado</strong> (eventos registrados) · fonte: tabela de cliques
      </p>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">Nenhum clique no período.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Marca</th>
                <th scope="col" className="px-4 py-3 font-medium">Campanha</th>
                <th scope="col" className="px-4 py-3 font-medium">Look</th>
                <th scope="col" className="px-4 py-3 font-medium">Autora</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Cliques</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">{r.brand}</td>
                  <td className="px-4 py-3">{r.campaign ?? <span className="text-muted">sem campanha</span>}</td>
                  <td className="px-4 py-3">{r.lookSlug ? <Link href={`/l/${r.lookSlug}`} className="underline" target="_blank">{r.look}</Link> : r.look}</td>
                  <td className="px-4 py-3">{r.creator}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.clicks.toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

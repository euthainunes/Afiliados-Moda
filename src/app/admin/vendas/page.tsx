import type { Metadata } from "next";
import { DemoBadge, Money } from "@/components/finance/money";
import { ConversionStateBadge } from "@/components/finance/status";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { SubmitButton } from "@/components/ui/submit-button";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { dateFmt } from "@/lib/dates";
import { can } from "@/modules/access/can";
import { listConversionsAdmin, listOrdersWithoutConversion } from "@/modules/finance/admin-queries";
import { reprocessOrderAction } from "../financeiro/actions";

export const metadata: Metadata = { title: "Vendas" };

const ORDER_STATUS: Record<string, string> = { created: "Criado", paid: "Pago", invoiced: "Faturado", delivered: "Entregue", canceled: "Cancelado", returned: "Devolvido" };
const sel = "h-10 rounded-lg border border-line bg-surface px-3 text-sm";

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ estado?: string; marca?: string; demo?: "sim" | "nao"; pagina?: string }> }) {
  const session = await requirePermission("orders.read", "/admin/vendas");
  const principal = toPrincipal(session);
  const sp = await searchParams;
  const { rows, total, page, pages } = await listConversionsAdmin(principal, { state: sp.estado, brand: sp.marca, demo: sp.demo, page: Number(sp.pagina) || 1 });
  const unmatched = await listOrdersWithoutConversion(principal, 20);
  const canReprocess = can(principal, "events.reprocess");
  const qs = (p: number) => `/admin/vendas?${new URLSearchParams({ ...(sp.estado ? { estado: sp.estado } : {}), ...(sp.marca ? { marca: sp.marca } : {}), ...(sp.demo ? { demo: sp.demo } : {}), pagina: String(p) })}`;

  return (
    <>
      <PageTitle description="Pedidos recebidos das lojas e a atribuição de cada um. Vendas sem evidência de clique não são atribuídas.">Vendas e conversões</PageTitle>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-muted">Situação</span>
          <select name="estado" defaultValue={sp.estado ?? ""} className={sel}>
            <option value="">Todas</option>
            <option value="registered">Registrada</option>
            <option value="in_validation">Em validação</option>
            <option value="approved">Aprovada</option>
            <option value="rejected">Não elegível</option>
            <option value="canceled">Cancelada</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Marca (identificador)</span>
          <input name="marca" defaultValue={sp.marca} className={sel} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Origem</span>
          <select name="demo" defaultValue={sp.demo ?? ""} className={sel}>
            <option value="">Todas</option>
            <option value="nao">Reais</option>
            <option value="sim">Demonstração</option>
          </select>
        </label>
        <Button type="submit" size="sm" variant="secondary" className="h-10">Filtrar</Button>
      </form>
      <p className="mb-3 text-sm text-muted">{total.toLocaleString("pt-BR")} conversão(ões)</p>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th scope="col" className="px-3 py-3 font-medium">Pedido</th>
              <th scope="col" className="px-3 py-3 font-medium">Look / autora</th>
              <th scope="col" className="px-3 py-3 font-medium">Situação</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Base</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Comissão</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Usuária</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Plataforma</th>
              {canReprocess && <th scope="col" className="px-3 py-3 font-medium">Ação</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.conversion.id} className="align-top">
                <td className="px-3 py-3">
                  <span className="font-mono text-xs">{r.externalOrderId}</span> {r.conversion.isDemo && <DemoBadge />}
                  <p className="text-xs text-muted">{r.brandName} · {ORDER_STATUS[r.orderStatus]} · {dateFmt.format(r.conversion.registeredAt)}</p>
                </td>
                <td className="px-3 py-3">{r.lookTitle}<p className="text-xs text-muted">{r.creator}</p></td>
                <td className="px-3 py-3">
                  <ConversionStateBadge state={r.conversion.state} eligible={!!r.conversion.eligibleAt} />
                  {r.conversion.rejectionReason && <p className="mt-1 text-xs text-muted">{r.conversion.rejectionReason}</p>}
                  {r.invoiced && <p className="mt-1 text-xs text-muted">faturada</p>}
                </td>
                <td className="px-3 py-3 text-right"><Money cents={r.conversion.baseAmountCents} /></td>
                <td className="px-3 py-3 text-right"><Money cents={r.conversion.commissionCents} /></td>
                <td className="px-3 py-3 text-right"><Money cents={r.conversion.userRewardCents} /></td>
                <td className="px-3 py-3 text-right"><Money cents={r.conversion.platformCents} /></td>
                {canReprocess && (
                  <td className="px-3 py-3">
                    <ActionForm action={reprocessOrderAction} hidden={{ orderId: r.conversion.orderId }}>
                      <SubmitButton size="sm" variant="ghost" pendingLabel="…">Reprocessar</SubmitButton>
                    </ActionForm>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pages={pages} href={qs} />

      <section className="mt-10" aria-labelledby="sem-atribuicao">
        <h2 id="sem-atribuicao" className="text-lg font-semibold">Pedidos sem atribuição (recentes)</h2>
        <p className="mt-1 text-sm text-muted">Pedidos recebidos sem identificador de clique válido. Não geram comissão nem recompensa.</p>
        {unmatched.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nenhum.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface text-sm">
            {unmatched.map(({ order, brandName }) => (
              <li key={order.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span className="font-mono text-xs">{order.externalOrderId} {order.isDemo && <DemoBadge />}</span>
                <span className="text-muted">{brandName} · {ORDER_STATUS[order.status]} · {order.attribution.clickId ? `clique ${order.attribution.clickId} não encontrado` : "sem identificador"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

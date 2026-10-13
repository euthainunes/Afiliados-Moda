import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/card";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { listAuditLogs } from "@/modules/audit/queries";

export const metadata: Metadata = { title: "Auditoria" };

const PAGE_SIZE = 50;
const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" });

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const session = await requirePermission("audit.read", "/admin/auditoria");
  const page = Math.max(1, Number((await searchParams).pagina) || 1);
  const { items, total } = await listAuditLogs(toPrincipal(session), { page, pageSize: PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageTitle description="Registro imutável das ações sensíveis. Campos pessoais aparecem mascarados.">Auditoria</PageTitle>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">Nenhum registro ainda.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Quando</th>
                <th scope="col" className="px-4 py-3 font-medium">Quem</th>
                <th scope="col" className="px-4 py-3 font-medium">Ação</th>
                <th scope="col" className="px-4 py-3 font-medium">Alvo</th>
                <th scope="col" className="px-4 py-3 font-medium">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">{dateFmt.format(e.occurredAt)}</td>
                  <td className="px-4 py-3">{e.actorName ?? "Sistema"}<p className="text-xs text-muted">{e.actorRoles.join(", ")}</p></td>
                  <td className="px-4 py-3 font-mono text-xs">{e.action}</td>
                  <td className="px-4 py-3 font-mono text-xs">{e.entityType}{e.entityId ? `:${e.entityId.slice(0, 8)}` : ""}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {e.before != null && <p>antes: {JSON.stringify(e.before)}</p>}
                    {e.after != null && <p>depois: {JSON.stringify(e.after)}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <nav aria-label="Paginação" className="mt-4 flex items-center gap-2 text-sm">
          {page > 1 && <Link className={buttonClasses("secondary", "sm")} href={`/admin/auditoria?pagina=${page - 1}`}>Anterior</Link>}
          <span className="text-muted">Página {page} de {pages}</span>
          {page < pages && <Link className={buttonClasses("secondary", "sm")} href={`/admin/auditoria?pagina=${page + 1}`}>Próxima</Link>}
        </nav>
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/card";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { can } from "@/modules/access/can";
import { listUsers } from "@/modules/identity/admin";
import { setUserStatusAction } from "./actions";

export const metadata: Metadata = { title: "Usuárias" };

const PAGE_SIZE = 25;
const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });
const statusLabel = { active: ["Ativa", "success"], suspended: ["Suspensa", "danger"], deleted: ["Excluída", "neutral"] } as const;

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; pagina?: string }> }) {
  const session = await requirePermission("users.read", "/admin/usuarias");
  const principal = toPrincipal(session);
  const { q, pagina } = await searchParams;
  const page = Math.max(1, Number(pagina) || 1);
  const { items, total } = await listUsers(principal, { query: q, page, pageSize: PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canSuspend = can(principal, "users.suspend");

  const pageHref = (p: number) => `/admin/usuarias?${new URLSearchParams({ ...(q ? { q } : {}), pagina: String(p) })}`;

  return (
    <>
      <PageTitle description={`${total.toLocaleString("pt-BR")} conta(s)`}>Usuárias</PageTitle>
      <form className="mb-4 flex gap-2" role="search">
        <label htmlFor="busca" className="sr-only">Buscar por nome ou @usuária</label>
        <input id="busca" name="q" defaultValue={q} placeholder="Buscar por nome ou @usuária" className="h-10 w-full max-w-sm rounded-lg border border-line bg-surface px-3" />
        <Button type="submit" variant="secondary" size="sm" className="h-10">Buscar</Button>
      </form>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">Nenhuma conta encontrada.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Nome</th>
                <th scope="col" className="px-4 py-3 font-medium">E-mail</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Cadastro</th>
                {canSuspend && <th scope="col" className="px-4 py-3 font-medium">Ação</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((u) => {
                const [label, tone] = statusLabel[u.status];
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{u.displayName}</p>
                      <p className="text-muted">@{u.username}</p>
                    </td>
                    <td className="px-4 py-3">
                      {u.email} {!u.emailVerified && <Badge tone="warning">não confirmado</Badge>}
                    </td>
                    <td className="px-4 py-3"><Badge tone={tone}>{label}</Badge></td>
                    <td className="px-4 py-3 tabular-nums">{dateFmt.format(u.createdAt)}</td>
                    {canSuspend && (
                      <td className="px-4 py-3">
                        {u.id !== session.user.id && u.status !== "deleted" && (
                          <form action={setUserStatusAction} className="flex items-center gap-2">
                            <input type="hidden" name="userId" value={u.id} />
                            <input type="hidden" name="status" value={u.status === "active" ? "suspended" : "active"} />
                            <label className="sr-only" htmlFor={`motivo-${u.id}`}>Motivo</label>
                            <input id={`motivo-${u.id}`} name="reason" required minLength={5} placeholder="Motivo (obrigatório)" className="h-9 w-44 rounded-lg border border-line px-2" />
                            <Button type="submit" size="sm" variant={u.status === "active" ? "danger" : "secondary"}>
                              {u.status === "active" ? "Suspender" : "Reativar"}
                            </Button>
                          </form>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Paginação" className="mt-4 flex items-center gap-2 text-sm">
          {page > 1 && <Link className={buttonClasses("secondary", "sm")} href={pageHref(page - 1)}>Anterior</Link>}
          <span className="text-muted">Página {page} de {pages}</span>
          {page < pages && <Link className={buttonClasses("secondary", "sm")} href={pageHref(page + 1)}>Próxima</Link>}
        </nav>
      )}
    </>
  );
}

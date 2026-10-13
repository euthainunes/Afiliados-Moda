import type { Metadata } from "next";
import Link from "next/link";
import { TicketStatusBadge } from "@/components/support/ticket-thread";
import { PageTitle } from "@/components/ui/card";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { dateTimeFmt } from "@/lib/dates";
import { CATEGORY_LABELS, listTicketsForStaff } from "@/modules/support/service";

export const metadata: Metadata = { title: "Suporte" };

export default async function SupportAdminPage({ searchParams }: { searchParams: Promise<{ status?: "open" | "answered" | "closed" }> }) {
  const session = await requirePermission("users.read", "/admin/suporte");
  const { status } = await searchParams;
  const rows = await listTicketsForStaff(toPrincipal(session), status && ["open", "answered", "closed"].includes(status) ? status : undefined);
  return (
    <>
      <PageTitle description="Atendimentos de usuárias e contatos do site.">Suporte</PageTitle>
      <nav aria-label="Filtro" className="mb-4 flex gap-2 text-sm">
        {[["", "Todos"], ["open", "Abertos"], ["answered", "Respondidos"], ["closed", "Encerrados"]].map(([k, l]) => (
          <a key={k} href={k ? `/admin/suporte?status=${k}` : "/admin/suporte"} className={`rounded-lg px-3 py-1.5 ${(status ?? "") === k ? "bg-ink text-white" : "border border-line"}`}>{l}</a>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">Nenhum atendimento.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {rows.map(({ ticket: t, userName }) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <Link href={`/admin/suporte/${t.id}`} className="font-medium underline">{t.subject}</Link>
                <p className="text-sm text-muted">
                  {userName ?? `${t.contactName ?? "Visitante"} (contato do site)`} · {CATEGORY_LABELS[t.category]} · {dateTimeFmt.format(t.updatedAt)}
                </p>
              </div>
              <TicketStatusBadge status={t.status} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

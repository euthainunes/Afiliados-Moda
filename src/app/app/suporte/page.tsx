import type { Metadata } from "next";
import Link from "next/link";
import { TicketStatusBadge } from "@/components/support/ticket-thread";
import { ButtonLink } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/current";
import { dateTimeFmt } from "@/lib/dates";
import { CATEGORY_LABELS, listMyTickets } from "@/modules/support/service";

export const metadata: Metadata = { title: "Suporte" };

export default async function SupportPage() {
  const session = await requireSession("/app/suporte");
  const tickets = await listMyTickets(session.user.id);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageTitle description="Fale com a equipe sobre sua conta, looks, vendas, resgates ou privacidade.">Suporte</PageTitle>
        <ButtonLink href="/app/suporte/novo">Novo atendimento</ButtonLink>
      </div>
      <p className="mb-4 text-sm text-muted">
        Dúvidas comuns estão nas <Link href="/faq" className="underline">perguntas frequentes</Link>.
      </p>
      {tickets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">Você ainda não abriu nenhum atendimento.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {tickets.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <Link href={`/app/suporte/${t.id}`} className="font-medium underline">{t.subject}</Link>
                <p className="text-sm text-muted">{CATEGORY_LABELS[t.category]} · atualizado em {dateTimeFmt.format(t.updatedAt)}</p>
              </div>
              <TicketStatusBadge status={t.status} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

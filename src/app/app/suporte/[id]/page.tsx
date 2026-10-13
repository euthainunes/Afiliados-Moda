import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReplyForm } from "@/components/support/ticket-forms";
import { TicketStatusBadge, TicketThread } from "@/components/support/ticket-thread";
import { ActionForm } from "@/components/ui/action-form";
import { PageTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireSession } from "@/lib/auth/current";
import { getTicket } from "@/modules/support/service";
import { closeTicketAction, replyTicketAction } from "../actions";

export const metadata: Metadata = { title: "Atendimento" };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(`/app/suporte/${id}`);
  // Só a dona do atendimento o vê pela área da usuária (a equipe usa o painel).
  const data = await getTicket({ id: session.user.id, roles: ["user"] }, id);
  if (!data || data.ticket.userId !== session.user.id) notFound();
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Link href="/app/suporte" className="text-sm text-muted hover:underline">← Suporte</Link>
      <PageTitle>{data.ticket.subject} <TicketStatusBadge status={data.ticket.status} /></PageTitle>
      <TicketThread messages={data.messages} />
      {data.ticket.status !== "closed" && (
        <>
          <ReplyForm action={replyTicketAction} ticketId={id} />
          <ActionForm action={closeTicketAction} hidden={{ ticketId: id }}>
            <SubmitButton size="sm" variant="ghost" className="self-start" pendingLabel="Encerrando…">Encerrar atendimento</SubmitButton>
          </ActionForm>
        </>
      )}
    </div>
  );
}

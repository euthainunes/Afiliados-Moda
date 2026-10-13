import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { closeTicketAction, replyTicketAction } from "@/app/app/suporte/actions";
import { ReplyForm } from "@/components/support/ticket-forms";
import { TicketStatusBadge, TicketThread } from "@/components/support/ticket-thread";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { PageTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { getTicket } from "@/modules/support/service";

export const metadata: Metadata = { title: "Atendimento" };

export default async function SupportTicketAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission("users.read", `/admin/suporte/${id}`);
  const data = await getTicket(toPrincipal(session), id);
  if (!data) notFound();
  const fromSite = !data.ticket.userId;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Link href="/admin/suporte" className="text-sm text-muted hover:underline">← Suporte</Link>
      <PageTitle>{data.ticket.subject} <TicketStatusBadge status={data.ticket.status} /></PageTitle>
      {fromSite && (
        <Alert tone="info">
          Contato do site: {data.ticket.contactName} &lt;{data.ticket.contactEmail}&gt;. Responda por e-mail; esta pessoa não tem conta para ler respostas aqui.
        </Alert>
      )}
      <TicketThread messages={data.messages} />
      {data.ticket.status !== "closed" && (
        <>
          {!fromSite && <ReplyForm action={replyTicketAction} ticketId={id} />}
          <ActionForm action={closeTicketAction} hidden={{ ticketId: id }}>
            <SubmitButton size="sm" variant="ghost" className="self-start" pendingLabel="Encerrando…">Encerrar atendimento</SubmitButton>
          </ActionForm>
        </>
      )}
    </div>
  );
}

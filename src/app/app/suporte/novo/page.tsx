import type { Metadata } from "next";
import Link from "next/link";
import { NewTicketForm } from "@/components/support/ticket-forms";
import { Card, PageTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/current";
import { CATEGORY_LABELS } from "@/modules/support/service";
import { openTicketAction } from "../actions";

export const metadata: Metadata = { title: "Novo atendimento" };

export default async function NewTicketPage() {
  await requireSession("/app/suporte/novo");
  return (
    <div className="max-w-2xl">
      <Link href="/app/suporte" className="text-sm text-muted hover:underline">← Suporte</Link>
      <PageTitle>Novo atendimento</PageTitle>
      <Card>
        <NewTicketForm action={openTicketAction} categories={CATEGORY_LABELS} />
      </Card>
    </div>
  );
}

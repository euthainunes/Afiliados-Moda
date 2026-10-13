import type { Metadata } from "next";
import { NewTicketForm } from "@/components/support/ticket-forms";
import { CATEGORY_LABELS } from "@/modules/support/service";
import { publicContactAction } from "./actions";

export const metadata: Metadata = { title: "Contato" };

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-display text-3xl font-semibold">Contato</h1>
      <p className="mt-2 text-muted">Dúvidas, sugestões ou pedidos sobre seus dados pessoais. Se você tem conta, prefira o suporte dentro da área logada.</p>
      <div className="mt-8 rounded-2xl border border-line bg-surface p-6">
        <NewTicketForm action={publicContactAction} categories={CATEGORY_LABELS} withContact />
      </div>
      <p className="mt-4 text-xs text-muted">Usamos seu nome e e-mail apenas para responder a esta mensagem.</p>
    </div>
  );
}

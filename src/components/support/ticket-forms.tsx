"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SelectField, TextareaField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState, type FormState } from "@/lib/form-state";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

export function NewTicketForm({ action, categories, withContact }: { action: Action; categories: Record<string, string>; withContact?: boolean }) {
  const [state, formAction] = useActionState(action, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      {withContact && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field idPrefix="contato" name="name" label="Seu nome" required defaultValue={v.name} errors={e.name} autoComplete="name" />
          <Field idPrefix="contato" name="email" label="Seu e-mail" type="email" required defaultValue={v.email} errors={e.email} autoComplete="email" />
        </div>
      )}
      <SelectField idPrefix="contato" name="category" label="Assunto" defaultValue={v.category ?? "outro"} options={categories} errors={e.category} />
      <Field idPrefix="contato" name="subject" label="Resumo" required maxLength={120} defaultValue={v.subject} errors={e.subject} />
      <TextareaField idPrefix="contato" name="body" label="Mensagem" rows={6} required defaultValue={v.body} errors={e.body} />
      <SubmitButton className="self-start" pendingLabel="Enviando…">Enviar</SubmitButton>
    </form>
  );
}

export function ReplyForm({ action, ticketId }: { action: Action; ticketId: string }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <TextareaField idPrefix="resposta" name="body" label="Responder" rows={4} required />
      <SubmitButton className="self-start" pendingLabel="Enviando…">Enviar mensagem</SubmitButton>
    </form>
  );
}

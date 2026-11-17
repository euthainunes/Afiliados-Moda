"use client";

import { useActionState } from "react";
import { CheckboxField, Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { TextareaField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { deleteAccountAction, updateEmailPreferenceAction, updateProfileAction } from "./actions";

export function ProfileForm({ defaults }: { defaults: { displayName: string; username: string; bio: string } }) {
  const [state, action] = useActionState(updateProfileAction, initialFormState);
  const v = { ...defaults, ...state.values };
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <FormMessage state={state} />
      <Field idPrefix="perfil" name="displayName" label="Nome exibido" required defaultValue={v.displayName} errors={e.displayName} />
      <Field idPrefix="perfil" name="username" label="Nome de usuária (@)" required defaultValue={v.username} errors={e.username} hint="Aparece no endereço do seu perfil público." />
      <TextareaField idPrefix="perfil" name="bio" label="Bio (opcional)" rows={3} maxLength={300} defaultValue={v.bio} errors={e.bio} />
      <SubmitButton variant="secondary" className="self-start" pendingLabel="Salvando…">Salvar perfil</SubmitButton>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccountAction, initialFormState);
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <FormMessage state={state} />
      <Field idPrefix="excluir" name="password" label="Sua senha" type="password" required autoComplete="current-password" />
      <Field idPrefix="excluir" name="confirmation" label='Digite "EXCLUIR" para confirmar' required autoComplete="off" />
      <SubmitButton variant="danger" className="self-start" pendingLabel="Excluindo…">Excluir minha conta</SubmitButton>
    </form>
  );
}

export function EmailPreferenceForm({ enabled }: { enabled: boolean }) {
  const [state, action] = useActionState(updateEmailPreferenceAction, initialFormState);
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <FormMessage state={state} />
      <CheckboxField idPrefix="avisos" name="emailNotifications" defaultChecked={enabled}>
        Receber por e-mail os avisos importantes: venda confirmada ou cancelada, recompensa liberada, resgate aprovado ou pago e respostas do suporte.
      </CheckboxField>
      <SubmitButton variant="secondary" className="self-start" pendingLabel="Salvando…">Salvar preferência</SubmitButton>
    </form>
  );
}

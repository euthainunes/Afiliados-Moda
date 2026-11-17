"use client";

import { useActionState } from "react";
import { CheckboxField, Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { TextareaField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { deleteAccountAction, requestDeletionLinkAction, updateEmailPreferenceAction, updateProfileAction } from "./actions";

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

export function DeleteAccountForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action] = useActionState(deleteAccountAction, initialFormState);
  return (
    <div className="flex max-w-xl flex-col gap-6">
      {hasPassword && (
        <form action={action} className="flex flex-col gap-4">
          <FormMessage state={state} />
          <Field idPrefix="excluir" name="password" label="Sua senha" type="password" required autoComplete="current-password" />
          <Field idPrefix="excluir" name="confirmation" label='Digite "EXCLUIR" para confirmar' required autoComplete="off" />
          <SubmitButton variant="danger" className="self-start" pendingLabel="Excluindo…">Excluir minha conta</SubmitButton>
        </form>
      )}
      <DeletionLinkForm hasPassword={hasPassword} />
    </div>
  );
}

function DeletionLinkForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action] = useActionState(requestDeletionLinkAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {hasPassword
          ? "Esqueceu a senha? Você também pode confirmar a exclusão por um link enviado ao seu e-mail."
          : "Sua conta não tem senha (você entra pelo Google). Para confirmar que é você, enviamos um link ao seu e-mail, válido por 30 minutos."}
      </p>
      <FormMessage state={state} />
      <SubmitButton variant={hasPassword ? "ghost" : "danger"} className="self-start" pendingLabel="Enviando…">Enviar link de exclusão por e-mail</SubmitButton>
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

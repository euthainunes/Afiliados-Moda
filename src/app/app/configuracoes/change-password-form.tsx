"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { changePasswordAction } from "./actions";

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex max-w-md flex-col gap-4" noValidate>
      {state.message && <Alert tone={state.status === "success" ? "success" : "danger"}>{state.message}</Alert>}
      <Field name="currentPassword" label="Senha atual" type="password" autoComplete="current-password" required errors={e.currentPassword} />
      <Field name="password" label="Nova senha" type="password" autoComplete="new-password" required minLength={10} hint="Mínimo de 10 caracteres." errors={e.password} />
      <Field name="confirmPassword" label="Repita a nova senha" type="password" autoComplete="new-password" required errors={e.confirmPassword} />
      <SubmitButton pendingLabel="Salvando…" className="self-start">Alterar senha</SubmitButton>
    </form>
  );
}

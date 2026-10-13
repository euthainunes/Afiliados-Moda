"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { resetPasswordAction } from "../actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.message && (
        <Alert tone="danger">
          {state.message} <Link href="/recuperar-senha" className="underline">Pedir novo link</Link>
        </Alert>
      )}
      <input type="hidden" name="token" value={token} />
      <Field name="password" label="Nova senha" type="password" autoComplete="new-password" required minLength={10} hint="Mínimo de 10 caracteres." errors={e.password} />
      <Field name="confirmPassword" label="Repita a nova senha" type="password" autoComplete="new-password" required errors={e.confirmPassword} />
      <SubmitButton pendingLabel="Salvando…">Salvar nova senha</SubmitButton>
    </form>
  );
}

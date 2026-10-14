"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CheckboxField, Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { completeGoogleSignupAction } from "./actions";

export function CompleteGoogleSignupForm({ defaultName }: { defaultName: string }) {
  const [state, action] = useActionState(completeGoogleSignupAction, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <Field name="displayName" label="Nome" autoComplete="name" required maxLength={60} defaultValue={state.values?.displayName ?? defaultName} errors={e.displayName} />
      <CheckboxField name="isAdult" required errors={e.isAdult}>Tenho 18 anos ou mais.</CheckboxField>
      <CheckboxField name="acceptTerms" required errors={e.acceptTerms}>
        Li e aceito os <Link href="/termos" className="underline" target="_blank">termos de uso</Link>, a{" "}
        <Link href="/privacidade" className="underline" target="_blank">política de privacidade</Link> e o{" "}
        <Link href="/regulamento" className="underline" target="_blank">regulamento de recompensas</Link>.
      </CheckboxField>
      <SubmitButton pendingLabel="Criando conta…">Criar conta</SubmitButton>
    </form>
  );
}

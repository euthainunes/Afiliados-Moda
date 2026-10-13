"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { CheckboxField, Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { signUpAction } from "../actions";

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, initialFormState);

  if (state.status === "success") {
    return (
      <Alert tone="success" title="Quase lá!">
        <p>{state.message}</p>
        <p className="mt-2">
          Não recebeu? Verifique o spam ou <Link href="/entrar" className="underline">peça um novo link na tela de login</Link>.
        </p>
      </Alert>
    );
  }

  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <Field name="displayName" label="Nome" autoComplete="name" required maxLength={60} defaultValue={state.values?.displayName} errors={e.displayName} />
      <Field name="email" label="E-mail" type="email" autoComplete="email" inputMode="email" required defaultValue={state.values?.email} errors={e.email} />
      <Field name="password" label="Senha" type="password" autoComplete="new-password" required minLength={10} maxLength={128} hint="Mínimo de 10 caracteres. Uma frase fácil de lembrar funciona bem." errors={e.password} />
      <CheckboxField name="isAdult" required errors={e.isAdult}>
        Tenho 18 anos ou mais.
      </CheckboxField>
      <CheckboxField name="acceptTerms" required errors={e.acceptTerms}>
        Li e aceito os <Link href="/termos" className="underline" target="_blank">termos de uso</Link>, a{" "}
        <Link href="/privacidade" className="underline" target="_blank">política de privacidade</Link> e o{" "}
        <Link href="/regulamento" className="underline" target="_blank">regulamento de recompensas</Link>.
      </CheckboxField>
      <SubmitButton pendingLabel="Criando conta…">Criar conta</SubmitButton>
    </form>
  );
}

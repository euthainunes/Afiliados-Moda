"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { loginAction, resendVerificationAction } from "../actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      {next && <input type="hidden" name="next" value={next} />}
      <Field name="email" label="E-mail" type="email" autoComplete="email" inputMode="email" required defaultValue={state.values?.email} errors={e.email} />
      <Field name="password" label="Senha" type="password" autoComplete="current-password" required errors={e.password} />
      <div className="-mt-1 text-right text-sm">
        <Link href="/recuperar-senha" className="underline">Esqueci minha senha</Link>
      </div>
      <SubmitButton pendingLabel="Entrando…">Entrar</SubmitButton>
    </form>
  );
}

export function ResendVerificationForm() {
  const [state, action] = useActionState(resendVerificationAction, initialFormState);
  return (
    <details className="mt-6 rounded-lg border border-line p-4 text-sm">
      <summary className="cursor-pointer font-medium">Não recebeu o e-mail de confirmação?</summary>
      <form action={action} className="mt-4 flex flex-col gap-3" noValidate>
        {state.message && <Alert tone={state.status === "success" ? "success" : "danger"}>{state.message}</Alert>}
        <Field name="email" label="E-mail" type="email" autoComplete="email" required errors={state.fieldErrors?.email} />
        <SubmitButton variant="secondary" size="sm" pendingLabel="Enviando…">Reenviar link</SubmitButton>
      </form>
    </details>
  );
}

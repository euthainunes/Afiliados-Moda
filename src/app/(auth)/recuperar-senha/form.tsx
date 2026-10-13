"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { requestResetAction } from "../actions";

export function RequestResetForm() {
  const [state, action] = useActionState(requestResetAction, initialFormState);
  if (state.status === "success") return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <Field name="email" label="E-mail da conta" type="email" autoComplete="email" required errors={state.fieldErrors?.email} />
      <SubmitButton pendingLabel="Enviando…">Enviar link</SubmitButton>
    </form>
  );
}

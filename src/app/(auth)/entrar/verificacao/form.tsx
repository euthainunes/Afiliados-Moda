"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { mfaChallengeAction } from "../../actions";

export function MfaChallengeForm({ next }: { next?: string }) {
  const [state, action] = useActionState(mfaChallengeAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      {next && <input type="hidden" name="next" value={next} />}
      <Field
        name="code"
        label="Código"
        autoComplete="one-time-code"
        inputMode="text"
        autoFocus
        required
        maxLength={20}
        hint="6 dígitos do app ou um código de recuperação."
        errors={state.fieldErrors?.code}
      />
      <SubmitButton pendingLabel="Verificando…">Verificar</SubmitButton>
    </form>
  );
}

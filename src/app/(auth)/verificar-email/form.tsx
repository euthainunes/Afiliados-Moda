"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { verifyEmailAction } from "../actions";

export function ConfirmEmailForm({ token }: { token: string }) {
  const [state, action] = useActionState(verifyEmailAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingLabel="Confirmando…">Confirmar meu e-mail</SubmitButton>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { deleteWithLinkAction } from "./actions";

export function DeleteWithLinkForm({ token }: { token: string }) {
  const [state, action] = useActionState(deleteWithLinkAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <Field idPrefix="excluir" name="confirmation" label='Digite "EXCLUIR" para confirmar' required autoComplete="off" />
      <SubmitButton variant="danger" pendingLabel="Excluindo…">Excluir minha conta</SubmitButton>
    </form>
  );
}

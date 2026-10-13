"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { grantRoleAction, resetMfaAction } from "./actions";

export function GrantRoleForm() {
  const [state, action] = useActionState(grantRoleAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
        <Field idPrefix="conceder" name="email" label="E-mail da conta" type="email" required />
        <SelectField idPrefix="conceder" name="role" label="Papel" options={{ operator: "Operadora", admin: "Administradora" }} />
        <SubmitButton pendingLabel="Concedendo…">Conceder</SubmitButton>
      </div>
    </form>
  );
}

export function ResetMfaForm() {
  const [state, action] = useActionState(resetMfaAction, initialFormState);
  const v = state.values ?? {};
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field idPrefix="redefinir" name="email" label="E-mail da conta" type="email" required defaultValue={v.email} />
        <Field idPrefix="redefinir" name="reason" label="Como a identidade foi confirmada" required minLength={10} defaultValue={v.reason} />
      </div>
      <SubmitButton variant="secondary" className="self-start" pendingLabel="Redefinindo…">Remover verificação em duas etapas</SubmitButton>
    </form>
  );
}

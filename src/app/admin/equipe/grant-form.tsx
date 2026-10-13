"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { grantRoleAction } from "./actions";

export function GrantRoleForm() {
  const [state, action] = useActionState(grantRoleAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
        <Field name="email" label="E-mail da conta" type="email" required />
        <SelectField name="role" label="Papel" options={{ operator: "Operadora", admin: "Administradora" }} />
        <SubmitButton pendingLabel="Concedendo…">Conceder</SubmitButton>
      </div>
    </form>
  );
}

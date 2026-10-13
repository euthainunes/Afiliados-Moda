"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { requestPayoutAction, savePayoutAccountAction } from "../actions";

export function PayoutAccountForm({ defaults }: { defaults?: { holderName: string; pixKeyType: string } }) {
  const [state, action] = useActionState(savePayoutAccountAction, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field idPrefix="conta" name="holderName" label="Nome completo da titular" required defaultValue={state.values?.holderName ?? defaults?.holderName} errors={e.holderName} autoComplete="name" />
        <Field idPrefix="conta" name="cpf" label="CPF" required inputMode="numeric" placeholder="000.000.000-00" errors={e.cpf} hint="Usado só para o pagamento e obrigações fiscais; guardado criptografado." />
        <SelectField idPrefix="conta" name="pixKeyType" label="Tipo de chave PIX" defaultValue={state.values?.pixKeyType ?? defaults?.pixKeyType ?? "cpf"} options={{ cpf: "CPF", email: "E-mail", telefone: "Telefone", aleatoria: "Chave aleatória" }} errors={e.pixKeyType} />
        <Field idPrefix="conta" name="pixKey" label="Chave PIX" required errors={e.pixKey} />
      </div>
      <SubmitButton variant="secondary" className="self-start" pendingLabel="Salvando…">Salvar dados de recebimento</SubmitButton>
    </form>
  );
}

export function RequestPayoutForm({ maxLabel }: { maxLabel: string }) {
  const [state, action] = useActionState(requestPayoutAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <Field idPrefix="resgate" name="amount" label="Valor do resgate (R$)" required inputMode="decimal" placeholder="50,00" hint={`Disponível: ${maxLabel}`} errors={state.fieldErrors?.amount} />
      <SubmitButton className="self-start" pendingLabel="Solicitando…">Solicitar resgate</SubmitButton>
    </form>
  );
}

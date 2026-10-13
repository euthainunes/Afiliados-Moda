"use client";

import { useActionState } from "react";
import { CheckboxField, Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { issueInvoiceAction, proposeAdjustmentAction, registerPaymentAction, runRoutinesAction } from "./actions";

export function IssueInvoiceForm({ brands }: { brands: Record<string, string> }) {
  const [state, action] = useActionState(issueInvoiceAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <SelectField idPrefix="fatura" name="brandId" label="Marca" options={brands} />
        <SubmitButton pendingLabel="Emitindo…">Emitir fatura das vendas aprovadas</SubmitButton>
      </div>
    </form>
  );
}

export function RegisterPaymentForm({ invoiceId, amountLabel, isDemo }: { invoiceId: string; amountLabel: string; isDemo: boolean }) {
  const [state, action] = useActionState(registerPaymentAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <FormMessage state={state} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Field idPrefix={`pg-${invoiceId}`} name="amount" label="Valor recebido (R$)" required placeholder={amountLabel} />
        {!isDemo && <Field idPrefix={`pg-${invoiceId}`} name="reference" label="Referência do comprovante" required />}
      </div>
      <CheckboxField idPrefix={`pg-${invoiceId}`} name="confirm">
        {isDemo ? "Entendo que este registro é uma SIMULAÇÃO: nenhum valor foi recebido." : "Confirmo que o valor consta no extrato bancário da empresa."}
      </CheckboxField>
      <SubmitButton size="sm" variant="secondary" className="self-start" pendingLabel="Registrando…">{isDemo ? "Registrar recebimento simulado" : "Registrar recebimento"}</SubmitButton>
    </form>
  );
}

export function ProposeAdjustmentForm({ users }: { users: Record<string, string> }) {
  const [state, action] = useActionState(proposeAdjustmentAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField idPrefix="ajuste" name="userId" label="Usuária" options={users} />
        <Field idPrefix="ajuste" name="amount" label="Valor (R$, negativo para débito)" required placeholder="10,00" />
      </div>
      <Field idPrefix="ajuste" name="reason" label="Motivo (aparece no extrato da usuária)" required minLength={10} />
      <CheckboxField idPrefix="ajuste" name="isDemo">Ajuste em dados de demonstração</CheckboxField>
      <SubmitButton variant="secondary" className="self-start" pendingLabel="Enviando…">Propor ajuste</SubmitButton>
    </form>
  );
}

export function RunRoutinesForm() {
  const [state, action] = useActionState(runRoutinesAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <FormMessage state={state} />
      <SubmitButton size="sm" variant="secondary" className="self-start" pendingLabel="Executando…">Executar conciliação e liberação agora</SubmitButton>
    </form>
  );
}

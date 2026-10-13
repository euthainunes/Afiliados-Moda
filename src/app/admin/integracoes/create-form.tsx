"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SelectField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { createIntegrationAction } from "./actions";

export function CreateIntegrationForm({ brands }: { brands: Record<string, string> }) {
  const [state, action] = useActionState(createIntegrationAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField idPrefix="integ" name="brandId" label="Marca" options={brands} />
        <SelectField idPrefix="integ" name="provider" label="Plataforma" options={{ vtex: "VTEX (pedidos)", demo: "Loja de demonstração (marcas fictícias)" }} />
        <Field idPrefix="integ" name="account" label="Conta VTEX (accountName)" hint="Somente para VTEX." />
        <Field idPrefix="integ" name="environment" label="Ambiente VTEX" placeholder="vtexcommercestable" />
        <Field idPrefix="integ" name="clickIdField" label="Campo do pedido com o click_id" placeholder="ex.: utmiCampaign" hint="Definido somente após o teste de ponta a ponta com a marca." />
      </div>
      <SubmitButton variant="secondary" className="self-start" pendingLabel="Criando…">Criar fonte de pedidos</SubmitButton>
    </form>
  );
}

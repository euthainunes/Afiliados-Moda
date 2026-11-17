"use client";

import { useActionState } from "react";
import { CheckboxField, Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SelectField, TextareaField } from "@/components/ui/select-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { grantBrandAccessAction, proposeRuleAction, saveBrandAction, saveCampaignAction, saveFeedAction } from "./actions";

export type BrandDefaults = {
  brandId?: string;
  name: string;
  slug: string;
  status: string;
  website: string;
  allowedDomains: string;
  trackingParams: string;
};

export function BrandForm({ defaults }: { defaults: BrandDefaults }) {
  const [state, action] = useActionState(saveBrandAction, initialFormState);
  const v = { ...defaults, ...state.values };
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      {defaults.brandId && <input type="hidden" name="brandId" value={defaults.brandId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field idPrefix="marca" name="name" label="Nome" required defaultValue={v.name} errors={e.name} />
        <Field idPrefix="marca" name="slug" label="Identificador (URL)" required defaultValue={v.slug} hint="Ex.: suntime" errors={e.slug} />
        <Field idPrefix="marca" name="website" label="Site" type="url" defaultValue={v.website} placeholder="https://" errors={e.website} />
        <SelectField idPrefix="marca" name="status" label="Status" defaultValue={v.status} options={{ active: "Ativa", inactive: "Inativa" }} errors={e.status} />
      </div>
      <TextareaField
        name="allowedDomains"
        label="Domínios autorizados"
        rows={2}
        defaultValue={v.allowedDomains}
        hint="Um por linha. Os links de produtos e o redirecionador só aceitam esses domínios (e subdomínios)."
        errors={e.allowedDomains}
      />
      <TextareaField
        name="trackingParams"
        label="Parâmetros de rastreamento"
        rows={4}
        defaultValue={v.trackingParams}
        hint="Uma linha por parâmetro, no formato chave=valor. Marcadores: {click_id} e {campaign}. Para lojas reais, preencha somente depois da auditoria técnica (docs/05 §6)."
        errors={e.trackingParams}
      />
      <SubmitButton className="self-start" pendingLabel="Salvando…">Salvar marca</SubmitButton>
    </form>
  );
}

export function FeedForm({ brandId, feedId, source }: { brandId: string; feedId?: string; source?: string }) {
  const [state, action] = useActionState(saveFeedAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="brandId" value={brandId} />
      {feedId && <input type="hidden" name="feedId" value={feedId} />}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field idPrefix={`feed-${feedId ?? "novo"}`} name="source" label={feedId ? "URL do feed" : "Novo feed (URL https)"} defaultValue={state.values?.source ?? source} required className="flex-1" />
        <SubmitButton variant="secondary" pendingLabel="Salvando…">{feedId ? "Atualizar" : "Adicionar"}</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function CampaignForm({
  brandId,
  defaults,
}: {
  brandId: string;
  defaults?: { campaignId: string; name: string; slug: string; status: string; startsAt: string; endsAt: string };
}) {
  const [state, action] = useActionState(saveCampaignAction, initialFormState);
  const v = { name: "", slug: "", status: "draft", startsAt: "", endsAt: "", ...defaults, ...state.values };
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="brandId" value={brandId} />
      {defaults && <input type="hidden" name="campaignId" value={defaults.campaignId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field idPrefix={defaults ? `campanha-${defaults.campaignId}` : "campanha-nova"} name="name" label="Nome" required defaultValue={v.name} errors={e.name} />
        <Field idPrefix={defaults ? `campanha-${defaults.campaignId}` : "campanha-nova"} name="slug" label="Identificador" required defaultValue={v.slug} hint="Vai para o parâmetro {campaign}." errors={e.slug} />
        <SelectField idPrefix={defaults ? `campanha-${defaults.campaignId}` : "campanha-nova"} name="status" label="Status" defaultValue={v.status} options={{ draft: "Rascunho", active: "Ativa", ended: "Encerrada" }} errors={e.status} />
        <div />
        <Field idPrefix={defaults ? `campanha-${defaults.campaignId}` : "campanha-nova"} name="startsAt" label="Início" type="date" required defaultValue={v.startsAt} errors={e.startsAt} />
        <Field idPrefix={defaults ? `campanha-${defaults.campaignId}` : "campanha-nova"} name="endsAt" label="Fim (opcional)" type="date" defaultValue={v.endsAt} errors={e.endsAt} />
      </div>
      <SubmitButton className="self-start" pendingLabel="Salvando…">{defaults ? "Salvar campanha" : "Criar campanha"}</SubmitButton>
    </form>
  );
}

export function RuleForm({ brandId, campaignId, baseLabels, startLabels }: { brandId: string; campaignId: string; baseLabels: Record<string, string>; startLabels: Record<string, string> }) {
  const [state, action] = useActionState(proposeRuleAction, initialFormState);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField idPrefix="regra" name="baseType" label="Base de cálculo" defaultValue={v.baseType ?? "item_net_paid"} options={baseLabels} errors={e.baseType} />
        <Field idPrefix="regra" name="validFrom" label="Vale a partir de" type="date" required defaultValue={v.validFrom} hint="Nunca retroativa: precisa ser hoje ou depois na aprovação." errors={e.validFrom} />
        <Field idPrefix="regra" name="commission" label="Comissão total (%)" inputMode="decimal" required defaultValue={v.commission} placeholder="25" errors={e.commission} />
        <Field idPrefix="regra" name="userShare" label="Parcela da usuária (% da base)" inputMode="decimal" required defaultValue={v.userShare} placeholder="20" hint="A plataforma fica com a diferença." errors={e.userShare} />
        <Field idPrefix="regra" name="attributionWindowDays" label="Janela de atribuição (dias)" type="number" min={1} max={90} required defaultValue={v.attributionWindowDays ?? "7"} errors={e.attributionWindowDays} />
        <SelectField idPrefix="regra" name="startEvent" label="Contagem do prazo começa em" defaultValue={v.startEvent ?? "order_invoiced"} options={startLabels} errors={e.startEvent} />
        <Field idPrefix="regra" name="waitDays" label="Prazo para elegibilidade (dias)" type="number" min={0} max={365} required defaultValue={v.waitDays ?? "30"} errors={e.waitDays} />
      </div>
      <CheckboxField idPrefix="regra" name="requireBrandPaymentReceived" defaultChecked={v.requireBrandPaymentReceived ? v.requireBrandPaymentReceived === "on" : true}>
        Liberar recompensa somente depois que a marca pagar a comissão (recomendado, D5)
      </CheckboxField>
      <Field idPrefix="regra" name="contractReference" label="Referência do contrato ou confirmação formal" defaultValue={v.contractReference} hint="Obrigatória para aprovar. Ex.: contrato assinado em dd/mm/aaaa, cláusula X." errors={e.contractReference} />
      <TextareaField idPrefix="regra" name="notes" label="Observações" rows={2} defaultValue={v.notes} errors={e.notes} />
      <SubmitButton className="self-start" pendingLabel="Enviando…">Propor regra</SubmitButton>
    </form>
  );
}

export function BrandAccessForm({ brandId }: { brandId: string }) {
  const [state, action] = useActionState(grantBrandAccessAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="brandId" value={brandId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field idPrefix="acesso-marca" name="email" label="E-mail da pessoa da marca" type="email" required />
        <SubmitButton pendingLabel="Concedendo…">Conceder acesso</SubmitButton>
      </div>
    </form>
  );
}

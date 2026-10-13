"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { approveRuleAction, rejectRuleAction } from "../../../actions";

export function ReviewForms({ brandId, campaignId, ruleId }: { brandId: string; campaignId: string; ruleId: string }) {
  const [approveState, approve] = useActionState(approveRuleAction, initialFormState);
  const [rejectState, reject] = useActionState(rejectRuleAction, initialFormState);
  const hidden = (
    <>
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="ruleId" value={ruleId} />
    </>
  );
  return (
    <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
      <form action={approve} className="flex flex-col gap-2">
        {hidden}
        <FormMessage state={approveState} />
        <label htmlFor={`aprovar-${ruleId}`} className="text-sm font-medium">Observação da aprovação (opcional)</label>
        <input id={`aprovar-${ruleId}`} name="note" className="h-10 rounded-lg border border-line px-3" />
        <SubmitButton size="sm" className="self-start" pendingLabel="Aprovando…">Aprovar regra</SubmitButton>
      </form>
      <form action={reject} className="flex flex-col gap-2">
        {hidden}
        <FormMessage state={rejectState} />
        <label htmlFor={`rejeitar-${ruleId}`} className="text-sm font-medium">Motivo da rejeição</label>
        <input id={`rejeitar-${ruleId}`} name="note" required minLength={5} className="h-10 rounded-lg border border-line px-3" />
        <SubmitButton size="sm" variant="danger" className="self-start" pendingLabel="Rejeitando…">Rejeitar</SubmitButton>
      </form>
    </div>
  );
}

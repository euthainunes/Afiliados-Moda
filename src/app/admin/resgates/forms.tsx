"use client";

import { useActionState } from "react";
import { CheckboxField, Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { markPaidAction, reviewPayoutAction } from "../financeiro/actions";

export function ReviewPayoutForms({ payoutId }: { payoutId: string }) {
  const [approveState, approve] = useActionState(reviewPayoutAction, initialFormState);
  const [rejectState, reject] = useActionState(reviewPayoutAction, initialFormState);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <form action={approve} className="flex flex-col gap-2">
        <FormMessage state={approveState} />
        <input type="hidden" name="payoutId" value={payoutId} />
        <input type="hidden" name="decision" value="approve" />
        <SubmitButton size="sm" className="self-start" pendingLabel="Aprovando…">Aprovar</SubmitButton>
      </form>
      <form action={reject} className="flex flex-col gap-2">
        <FormMessage state={rejectState} />
        <input type="hidden" name="payoutId" value={payoutId} />
        <input type="hidden" name="decision" value="reject" />
        <Field idPrefix={`recusa-${payoutId}`} name="note" label="Motivo da recusa" required minLength={5} />
        <SubmitButton size="sm" variant="danger" className="self-start" pendingLabel="Recusando…">Recusar</SubmitButton>
      </form>
    </div>
  );
}

export function MarkPaidForm({ payoutId, isDemo }: { payoutId: string; isDemo: boolean }) {
  const [state, action] = useActionState(markPaidAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <FormMessage state={state} />
      <input type="hidden" name="payoutId" value={payoutId} />
      {!isDemo && <Field idPrefix={`pago-${payoutId}`} name="reference" label="Identificador da transação PIX (E2E ID)" required />}
      <CheckboxField idPrefix={`pago-${payoutId}`} name="confirm">
        {isDemo ? "Entendo que isto é uma SIMULAÇÃO: nenhum valor será transferido." : "Confirmo que o PIX foi enviado pela conta da empresa."}
      </CheckboxField>
      <SubmitButton size="sm" className="self-start" pendingLabel="Registrando…">{isDemo ? "Registrar pagamento simulado" : "Registrar pagamento"}</SubmitButton>
    </form>
  );
}

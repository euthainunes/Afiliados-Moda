"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { saveDetailsAction } from "../actions";

export function DetailsForm({ lookId, title, description }: { lookId: string; title: string; description: string | null }) {
  const [state, action] = useActionState(saveDetailsAction, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="lookId" value={lookId} />
      <Field name="title" label="Título" required maxLength={80} placeholder="Ex.: Fim de semana na praia" defaultValue={state.values?.title ?? title} errors={e.title} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="campo-description" className="text-sm font-medium">Descrição (opcional)</label>
        <textarea
          id="campo-description"
          name="description"
          maxLength={500}
          rows={3}
          defaultValue={state.values?.description ?? description ?? ""}
          className="rounded-lg border border-line bg-surface px-3 py-2"
          aria-describedby={e.description ? "campo-description-erro" : undefined}
        />
        {e.description && <p id="campo-description-erro" className="text-sm text-danger">{e.description[0]}</p>}
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton variant="secondary" pendingLabel="Salvando…">Salvar</SubmitButton>
        {state.message && (
          <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-sm text-danger" : "text-sm text-accent"}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

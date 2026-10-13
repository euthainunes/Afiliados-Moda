"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { addToLookAction } from "@/app/app/looks/actions";

export function AddToLookForm({ productId, looks }: { productId: string; looks: { id: string; title: string }[] }) {
  const [state, action] = useActionState(addToLookAction, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="productId" value={productId} />
      <label htmlFor="lookId" className="text-sm font-medium">Adicionar a</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select id="lookId" name="lookId" defaultValue="novo" className="h-11 flex-1 rounded-lg border border-line bg-surface px-3">
          <option value="novo">Um novo look</option>
          {looks.map((l) => (
            <option key={l.id} value={l.id}>{l.title || "Look sem título"}</option>
          ))}
        </select>
        <SubmitButton pendingLabel="Adicionando…">Adicionar ao look</SubmitButton>
      </div>
      {state.message && (
        <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-sm text-danger" : "text-sm text-accent"}>
          {state.message}
        </p>
      )}
    </form>
  );
}

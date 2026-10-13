"use client";

import { useActionState } from "react";
import { initialFormState, type FormState } from "@/lib/form-state";
import { cn } from "@/lib/cn";

// Formulário de uma ação curta (remover, mover, publicar...) com mensagem de erro/sucesso no próprio lugar.
export function ActionForm({
  action,
  children,
  className,
  hidden,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className={cn("flex flex-col gap-2", className)}>
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      {state.message && (
        <p role={state.status === "error" ? "alert" : "status"} className={cn("text-sm", state.status === "error" ? "text-danger" : "text-accent")}>
          {state.message}
        </p>
      )}
    </form>
  );
}

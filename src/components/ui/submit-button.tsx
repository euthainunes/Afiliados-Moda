"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { Button } from "./button";

// Botão de envio com estado de carregamento acessível (aria-busy) e proteção contra duplo clique.
export function SubmitButton({
  children,
  pendingLabel = "Enviando…",
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState } from "@/lib/form-state";
import { confirmEnrollmentAction, disableMfaAction, regenerateCodesAction, type CodesState } from "./actions";

function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <div className="flex flex-col gap-3">
      <Alert tone="warning" title="Guarde estes códigos agora">
        Eles só aparecem esta vez. Cada um permite entrar uma vez sem o celular. Salve num gerenciador de senhas ou imprima.
      </Alert>
      <ul aria-label="Códigos de recuperação" className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-canvas p-4 font-mono text-sm sm:grid-cols-5">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <Link href="/app/configuracoes/seguranca" className="self-start text-sm font-medium underline">Concluir</Link>
    </div>
  );
}

export function ConfirmEnrollmentForm() {
  const [state, action] = useActionState<CodesState, FormData>(confirmEnrollmentAction, initialFormState);
  if (state.codes) {
    return (
      <div className="flex flex-col gap-3">
        <FormMessage state={state} />
        <RecoveryCodes codes={state.codes} />
      </div>
    );
  }
  return (
    <form action={action} className="flex max-w-sm flex-col gap-3" noValidate>
      <Field idPrefix="ativar" name="code" label="Código de 6 dígitos" autoComplete="one-time-code" inputMode="numeric" maxLength={7} required errors={state.fieldErrors?.code} />
      <SubmitButton className="self-start" pendingLabel="Confirmando…">Confirmar e ativar</SubmitButton>
    </form>
  );
}

export function RegenerateCodesForm() {
  const [state, action] = useActionState<CodesState, FormData>(regenerateCodesAction, initialFormState);
  if (state.codes) {
    return (
      <div className="flex flex-col gap-3">
        <FormMessage state={state} />
        <RecoveryCodes codes={state.codes} />
      </div>
    );
  }
  return (
    <form action={action} className="flex max-w-sm flex-col gap-3" noValidate>
      <Field idPrefix="novos-codigos" name="code" label="Código atual do app" autoComplete="one-time-code" inputMode="numeric" maxLength={7} required errors={state.fieldErrors?.code} />
      <SubmitButton variant="secondary" className="self-start" pendingLabel="Gerando…">Gerar novos códigos</SubmitButton>
    </form>
  );
}

export function DisableMfaForm() {
  const [state, action] = useActionState(disableMfaAction, initialFormState);
  return (
    <form action={action} className="flex max-w-sm flex-col gap-3" noValidate>
      <FormMessage state={state} />
      <Field idPrefix="desativar" name="code" label="Código do app ou de recuperação" autoComplete="one-time-code" maxLength={20} required errors={state.fieldErrors?.code} />
      <SubmitButton variant="secondary" className="self-start" pendingLabel="Desativando…">Desativar verificação</SubmitButton>
    </form>
  );
}

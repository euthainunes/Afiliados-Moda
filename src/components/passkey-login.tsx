"use client";

import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { useState, useSyncExternalStore } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { passkeyLoginAction, passkeyLoginOptionsAction } from "@/app/(auth)/passkey-actions";

const noopSubscribe = () => () => {};

// Só aparece em navegadores com suporte a chaves de acesso.
export function PasskeyLogin({ next }: { next?: string }) {
  // No servidor responde "não suportado"; no navegador, consulta a API WebAuthn.
  const supported = useSyncExternalStore(noopSubscribe, browserSupportsWebAuthn, () => false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!supported) return null;

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const optionsJSON = await passkeyLoginOptionsAction();
      const response = await startAuthentication({ optionsJSON });
      const result = await passkeyLoginAction(response, next);
      if (result.ok) window.location.assign(result.redirectTo);
      else setError(result.message);
    } catch (e) {
      // Cancelar a janela do aparelho não é erro a exibir.
      if (!(e instanceof Error && e.name === "NotAllowedError")) setError("Não foi possível usar a chave de acesso agora. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="button" variant="secondary" className="w-full" onClick={signIn} disabled={busy}>
        {busy ? "Aguardando o aparelho…" : "Entrar com chave de acesso"}
      </Button>
    </div>
  );
}

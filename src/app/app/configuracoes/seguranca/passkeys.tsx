"use client";

import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { useState, useSyncExternalStore } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { passkeyRegisterAction, passkeyRegisterOptionsAction } from "./actions";

const noopSubscribe = () => () => {};

export function AddPasskey() {
  const supported = useSyncExternalStore(noopSubscribe, browserSupportsWebAuthn, () => false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!supported) return <p className="text-sm text-muted">Este navegador não oferece chaves de acesso. Use um navegador atualizado no celular ou no computador.</p>;

  async function add() {
    setBusy(true);
    setMessage(null);
    try {
      const start = await passkeyRegisterOptionsAction();
      if (!start.ok) return setMessage({ ok: false, text: start.message });
      const response = await startRegistration({ optionsJSON: start.options });
      const result = await passkeyRegisterAction(response, name);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) setName("");
    } catch (e) {
      if (!(e instanceof Error && e.name === "NotAllowedError")) setMessage({ ok: false, text: "Não foi possível criar a chave agora. Tente de novo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-sm flex-col gap-3">
      {message && <Alert tone={message.ok ? "success" : "danger"}>{message.text}</Alert>}
      <Field idPrefix="chave" name="passkeyName" label="Nome da chave (opcional)" placeholder="Ex.: Celular, Notebook" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="button" className="self-start" onClick={add} disabled={busy}>{busy ? "Aguardando o aparelho…" : "Criar chave de acesso"}</Button>
    </div>
  );
}

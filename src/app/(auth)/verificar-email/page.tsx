import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmEmailForm } from "./form";

export const metadata: Metadata = { title: "Confirmar e-mail", referrer: "no-referrer" };

// A confirmação exige um clique (POST): pré-visualizadores de link em apps de e-mail fazem GET e não devem consumir o token.
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Confirmar e-mail</h1>
      {token ? (
        <>
          <p className="mb-6 mt-1 text-muted">Clique no botão para ativar sua conta.</p>
          <ConfirmEmailForm token={token} />
        </>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <Alert tone="danger">Link inválido.</Alert>
          <ButtonLink href="/entrar" variant="secondary">Ir para o login</ButtonLink>
        </div>
      )}
    </>
  );
}

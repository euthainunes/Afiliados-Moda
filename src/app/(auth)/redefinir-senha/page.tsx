import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { ResetPasswordForm } from "./form";

export const metadata: Metadata = { title: "Nova senha", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Criar nova senha</h1>
      <p className="mb-6 mt-1 text-muted">Ao salvar, você será desconectada de todos os dispositivos.</p>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert tone="danger">
          Link inválido. <Link href="/recuperar-senha" className="underline">Peça um novo link</Link>.
        </Alert>
      )}
    </>
  );
}

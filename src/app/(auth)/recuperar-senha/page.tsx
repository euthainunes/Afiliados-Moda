import type { Metadata } from "next";
import Link from "next/link";
import { RequestResetForm } from "./form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function RequestResetPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Recuperar senha</h1>
      <p className="mb-6 mt-1 text-muted">Informe seu e-mail e enviaremos um link para criar uma nova senha.</p>
      <RequestResetForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/entrar" className="underline">Voltar para o login</Link>
      </p>
    </>
  );
}

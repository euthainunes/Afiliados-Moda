import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { safeNext } from "@/lib/auth/current";
import { redirectIfAuthenticated } from "../actions";
import { LoginForm, ResendVerificationForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const next = params.next ? safeNext(params.next) : undefined;
  await redirectIfAuthenticated(next);
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Entrar</h1>
      <p className="mb-6 mt-1 text-muted">Bom te ver de novo.</p>
      {params.senha === "redefinida" && (
        <div className="mb-4">
          <Alert tone="success">Senha redefinida. Entre com a nova senha.</Alert>
        </div>
      )}
      {params.email === "confirmado" && (
        <div className="mb-4">
          <Alert tone="success">E-mail confirmado! Agora é só entrar.</Alert>
        </div>
      )}
      <LoginForm next={next} />
      <ResendVerificationForm />
      <p className="mt-6 text-center text-sm text-muted">
        Ainda não tem conta? <Link href="/cadastro" className="font-medium text-ink underline">Criar conta</Link>
      </p>
    </>
  );
}

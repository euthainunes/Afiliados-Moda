import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { safeNext } from "@/lib/auth/current";
import { redirectIfAuthenticated } from "../actions";
import { GoogleButton } from "@/components/google-button";
import { PasskeyLogin } from "@/components/passkey-login";
import { LoginForm, ResendVerificationForm } from "./login-form";

const GOOGLE_MESSAGES: Record<string, string> = {
  cancelado: "O login com Google foi cancelado.",
  expirado: "O login com Google expirou. Tente de novo.",
  suspensa: "Esta conta está suspensa. Fale com o suporte pela página de contato.",
  indisponivel: "Não foi possível entrar com esta conta Google.",
  limite: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  erro: "Não foi possível entrar com o Google agora. Tente de novo ou use e-mail e senha.",
};

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
      {params.google && GOOGLE_MESSAGES[params.google] && (
        <div className="mb-4">
          <Alert tone="danger">{GOOGLE_MESSAGES[params.google]}</Alert>
        </div>
      )}
      <div className="mb-5 flex flex-col gap-3">
        <PasskeyLogin next={next} />
      </div>
      <GoogleButton next={next} />
      <LoginForm next={next} />
      <ResendVerificationForm />
      <p className="mt-6 text-center text-sm text-muted">
        Ainda não tem conta? <Link href="/cadastro" className="font-medium text-ink underline">Criar conta</Link>
      </p>
    </>
  );
}

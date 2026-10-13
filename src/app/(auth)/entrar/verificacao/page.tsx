import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPendingMfaSession, getSession, safeNext } from "@/lib/auth/current";
import { logoutAction } from "../../actions";
import { MfaChallengeForm } from "./form";

export const metadata: Metadata = { title: "Verificação em duas etapas", robots: { index: false } };

export default async function MfaChallengePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const next = params.next ? safeNext(params.next) : undefined;
  if (await getSession()) redirect(safeNext(next, "/app"));
  if (!(await getPendingMfaSession())) redirect("/entrar");
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Verificação em duas etapas</h1>
      <p className="mb-6 mt-1 text-muted">Abra o app autenticador no celular e digite o código de 6 dígitos desta conta.</p>
      <MfaChallengeForm next={next} />
      <details className="mt-6 rounded-lg border border-line p-4 text-sm">
        <summary className="cursor-pointer font-medium">Sem acesso ao celular?</summary>
        <p className="mt-3 text-muted">
          Digite no mesmo campo um dos códigos de recuperação que você guardou ao ativar a verificação (formato <code>abcde-23456</code>). Cada código vale uma vez.
          Se também perdeu os códigos, fale com o suporte: a equipe confirma sua identidade antes de remover a verificação.
        </p>
      </details>
      <form action={logoutAction} className="mt-6 text-center text-sm">
        <button type="submit" className="underline">Cancelar e sair</button>
      </form>
    </>
  );
}

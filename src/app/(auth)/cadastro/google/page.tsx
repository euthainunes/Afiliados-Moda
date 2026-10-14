import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readGooglePending } from "@/lib/auth/oauth-cookies";
import { readPending } from "@/modules/identity/social";
import { redirectIfAuthenticated } from "../../actions";
import { CompleteGoogleSignupForm } from "./form";

export const metadata: Metadata = { title: "Concluir cadastro", robots: { index: false } };

export default async function CompleteGoogleSignupPage() {
  await redirectIfAuthenticated();
  const claims = readPending(await readGooglePending());
  if (!claims) redirect("/entrar?google=expirado");
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Concluir cadastro</h1>
      <p className="mb-6 mt-1 text-muted">
        Você entrou com o Google como <strong className="text-ink">{claims.email}</strong>. Falta só confirmar alguns dados.
      </p>
      <CompleteGoogleSignupForm defaultName={claims.name ?? ""} />
    </>
  );
}

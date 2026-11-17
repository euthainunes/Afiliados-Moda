import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { deletionLinkIsValid } from "@/modules/privacy/service";
import { DeleteWithLinkForm } from "./form";

export const metadata: Metadata = { title: "Excluir conta", robots: { index: false } };

// Aberta pelo link enviado ao e-mail. O link é consumido só ao confirmar (pré-visualizadores de
// e-mail que abrem o endereço não excluem nada).
export default async function DeleteAccountWithLinkPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const token = (await searchParams).token ?? "";
  const valid = await deletionLinkIsValid(token);
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Excluir conta</h1>
      {valid ? (
        <>
          <p className="mb-6 mt-1 text-muted">
            Seus dados pessoais serão apagados ou anonimizados e seus looks deixam de ficar públicos. Registros financeiros ficam guardados sem identificar você, pelo prazo exigido em lei. Não é possível desfazer.
          </p>
          <DeleteWithLinkForm token={token} />
        </>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <Alert tone="danger">Este link expirou ou já foi usado.</Alert>
          <p className="text-sm text-muted">
            Entre na sua conta e peça um novo em <Link href="/app/configuracoes" className="underline">Conta e privacidade</Link>.
          </p>
        </div>
      )}
    </>
  );
}

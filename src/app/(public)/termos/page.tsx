import type { Metadata } from "next";
import { DraftLegalPage } from "@/components/draft-legal";
import { LEGAL_VERSIONS } from "@/modules/identity/policies";

export const metadata: Metadata = { title: "Termos de uso" };

export default function TermsPage() {
  return (
    <DraftLegalPage
      title="Termos de uso"
      version={LEGAL_VERSIONS.terms}
      topics={[
        "Quem pode usar a plataforma (maiores de 18 anos).",
        "Regras de conteúdo dos looks e moderação.",
        "Uso de imagens e marcas de terceiros.",
        "Suspensão e encerramento de contas.",
        "Limitações de responsabilidade sobre compras feitas nas lojas parceiras.",
      ]}
    />
  );
}

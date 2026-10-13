import type { Metadata } from "next";
import { DraftLegalPage } from "@/components/draft-legal";
import { LEGAL_VERSIONS } from "@/modules/identity/policies";

export const metadata: Metadata = { title: "Política de privacidade" };

export default function PrivacyPage() {
  return (
    <DraftLegalPage
      title="Política de privacidade"
      version={LEGAL_VERSIONS.privacy}
      topics={[
        "Dados coletados (cadastro, uso, cliques) e finalidades.",
        "Bases legais da LGPD aplicáveis a cada tratamento.",
        "Dados de recebimento (CPF e chave PIX) coletados apenas no primeiro resgate.",
        "Compartilhamento com marcas parceiras (somente dados agregados ou necessários à atribuição).",
        "Prazos de retenção e exclusão; retenção de registros financeiros por obrigação legal.",
        "Direitos da titular e canal do encarregado de dados.",
      ]}
    />
  );
}

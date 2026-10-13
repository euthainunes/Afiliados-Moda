import type { Metadata } from "next";
import { DraftLegalPage } from "@/components/draft-legal";
import { LEGAL_VERSIONS } from "@/modules/identity/policies";

export const metadata: Metadata = { title: "Regulamento de recompensas" };

export default function RewardsRulesPage() {
  return (
    <DraftLegalPage
      title="Regulamento de recompensas"
      version={LEGAL_VERSIONS.rewards_rules}
      topics={[
        "Como uma venda é atribuída a um look (e quando não é).",
        "Percentuais por marca e campanha, e como mudanças afetam apenas vendas futuras.",
        "Estados da recompensa: pendente, elegível, em resgate e paga.",
        "Prazo de validação e o evento que inicia a contagem (em definição).",
        "Cancelamentos, devoluções e estornos, inclusive após o resgate.",
        "Valor mínimo, forma de pagamento e dados necessários para o resgate.",
      ]}
    />
  );
}

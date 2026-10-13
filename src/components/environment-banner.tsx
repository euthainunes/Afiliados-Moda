import { env } from "@/lib/env";

// Faixa fixa fora de produção: deixa claro que os dados são fictícios e que nada é pago de verdade.
export function EnvironmentBanner() {
  const appEnv = env().APP_ENV;
  if (appEnv === "production") return null;
  return (
    <div role="note" className="bg-ink px-4 py-1.5 text-center text-xs font-medium text-white">
      {appEnv === "staging" ? "Homologação" : "Ambiente de demonstração"} · dados fictícios · nenhuma venda, cobrança ou pagamento é real
    </div>
  );
}

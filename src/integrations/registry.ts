import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, integrations } from "@/lib/db/schema";
import { assertDemoAllowed, isProduction } from "@/lib/env";
import type { OrderSource, PayoutProvider } from "./contracts";
import { DemoOrderSource } from "./demo/order-source";
import { IntegrationConfigError } from "./errors";
import { DemoPayoutProvider, ManualPixPayoutProvider } from "./payouts";
import { VtexOrderSource } from "./vtex/order-source";

type IntegrationRow = typeof integrations.$inferSelect;

// Lê segredos apenas de variáveis de ambiente cujos nomes estão registrados na integração.
function secret(row: IntegrationRow, index: number, label: string): string {
  const name = row.secretEnv[index];
  const value = name ? process.env[name] : undefined;
  if (!value) throw new IntegrationConfigError(`Segredo "${label}" não configurado (variável ${name ?? "não definida"}).`);
  return value;
}

// Ponto único de escolha do adaptador: as páginas e serviços nunca sabem se o dado é de demonstração.
export async function orderSourceFor(row: IntegrationRow): Promise<OrderSource> {
  if (row.kind !== "order_source" || !row.brandId) throw new IntegrationConfigError("Integração não é uma fonte de pedidos.");
  if (row.mode === "disabled") throw new IntegrationConfigError("Integração desativada.");
  if (row.mode === "demo") {
    assertDemoAllowed("Fonte de pedidos");
    const brand = await db.query.brands.findFirst({ where: eq(brands.id, row.brandId) });
    if (!brand?.isFictitious) throw new IntegrationConfigError("O modo demonstração só pode ser usado com marcas fictícias.");
    return new DemoOrderSource(row.brandId);
  }
  if (row.provider === "vtex") {
    return new VtexOrderSource({
      account: row.config.account ?? "",
      environment: row.config.environment ?? "vtexcommercestable",
      clickIdField: row.config.clickIdField ?? "",
      appKey: secret(row, 0, "AppKey"),
      appToken: secret(row, 1, "AppToken"),
    });
  }
  throw new IntegrationConfigError(`Provedor ${row.provider} não suporta pedidos.`);
}

export async function payoutProvider(isDemoPayout: boolean): Promise<PayoutProvider> {
  if (isDemoPayout) return new DemoPayoutProvider();
  const [row] = await db.select().from(integrations).where(and(eq(integrations.kind, "payouts")));
  if (row && row.mode === "disabled" && isProduction()) throw new IntegrationConfigError("Pagamentos de resgate desativados.");
  return new ManualPixPayoutProvider();
}

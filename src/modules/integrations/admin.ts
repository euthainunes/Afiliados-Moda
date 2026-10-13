import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { brands, integrations, integrationSyncLogs } from "@/lib/db/schema";
import { isProduction } from "@/lib/env";
import { assertCan, type Principal } from "@/modules/access/can";
import { recordAudit } from "@/modules/audit/service";
import { syncOrderIntegration } from "@/modules/orders/sync";

export class IntegrationAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationAdminError";
  }
}

// O que cada provedor exige para ser ativado em modo real (exibido no painel e no guia de integrações).
export const PROVIDER_REQUIREMENTS: Record<string, { config: string[]; secrets: string[]; notes: string }> = {
  vtex: {
    config: ["account", "environment", "clickIdField"],
    secrets: ["AppKey", "AppToken"],
    notes: "Requer auditoria técnica com a marca, perfil de acesso mínimo (leitura de pedidos) e teste de ponta a ponta da atribuição (docs/05 §6).",
  },
  demo: { config: [], secrets: [], notes: "Loja simulada para marcas fictícias. Proibida em produção." },
};

export async function listIntegrations(actor: Principal) {
  assertCan(actor, "integrations.manage");
  const rows = await db
    .select({ integration: integrations, brandName: brands.name, brandFictitious: brands.isFictitious })
    .from(integrations)
    .leftJoin(brands, eq(brands.id, integrations.brandId))
    .orderBy(integrations.kind, brands.name);
  const ids = rows.map((r) => r.integration.id);
  const logs = ids.length ? await db.select().from(integrationSyncLogs).where(inArray(integrationSyncLogs.integrationId, ids)).orderBy(desc(integrationSyncLogs.startedAt)).limit(200) : [];
  return rows.map((r) => ({
    ...r,
    missingSecrets: r.integration.secretEnv.filter((name) => !process.env[name]),
    logs: logs.filter((l) => l.integrationId === r.integration.id).slice(0, 10),
  }));
}

export const createOrderIntegrationSchema = z.object({
  brandId: z.uuid(),
  provider: z.enum(["demo", "vtex"]),
  account: z.string().trim().max(60).optional(),
  environment: z.string().trim().max(60).optional(),
  clickIdField: z.string().trim().max(60).optional(),
});

export async function createOrderIntegration(actor: Principal, input: z.input<typeof createOrderIntegrationSchema>) {
  assertCan(actor, "integrations.manage");
  const data = createOrderIntegrationSchema.parse(input);
  const brand = await db.query.brands.findFirst({ where: eq(brands.id, data.brandId) });
  if (!brand) throw new IntegrationAdminError("Marca não encontrada.");
  if (data.provider === "demo" && !brand.isFictitious) throw new IntegrationAdminError("A loja de demonstração só pode ser usada com marcas fictícias.");
  const slug = brand.slug.toUpperCase().replace(/-/g, "_");
  const [row] = await db
    .insert(integrations)
    .values({
      kind: "order_source",
      provider: data.provider,
      brandId: brand.id,
      name: `Pedidos — ${brand.name}`,
      mode: "disabled",
      config: data.provider === "vtex" ? { account: data.account ?? "", environment: data.environment || "vtexcommercestable", clickIdField: data.clickIdField ?? "" } : {},
      // Apenas os NOMES das variáveis de ambiente; os valores ficam no cofre/ambiente de hospedagem.
      secretEnv: data.provider === "vtex" ? [`VTEX_${slug}_APP_KEY`, `VTEX_${slug}_APP_TOKEN`] : [],
      updatedBy: actor.id,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new IntegrationAdminError("Esta marca já tem uma fonte de pedidos configurada.");
  await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "integration.created", entityType: "integration", entityId: row.id, after: { provider: row.provider, config: row.config, secretEnv: row.secretEnv } });
  return row;
}

// Ativar/desativar. Regras: demonstração nunca em produção; modo real só com configuração e segredos presentes.
export async function setIntegrationMode(actor: Principal, integrationId: string, mode: "disabled" | "demo" | "live") {
  assertCan(actor, "integrations.manage");
  if (!z.uuid().safeParse(integrationId).success) throw new IntegrationAdminError("Integração não encontrada.");
  const row = await db.query.integrations.findFirst({ where: eq(integrations.id, integrationId) });
  if (!row) throw new IntegrationAdminError("Integração não encontrada.");
  if (mode === "demo") {
    if (isProduction()) throw new IntegrationAdminError("Modo demonstração não é permitido em produção.");
    if (row.provider !== "demo") throw new IntegrationAdminError("Somente a loja de demonstração pode operar em modo demonstração.");
  }
  if (mode === "live") {
    if (row.provider === "demo") throw new IntegrationAdminError("A loja de demonstração não pode operar em modo real.");
    const req = PROVIDER_REQUIREMENTS[row.provider];
    const missingConfig = (req?.config ?? []).filter((k) => !row.config[k]);
    const missingSecrets = row.secretEnv.filter((name) => !process.env[name]);
    if (missingConfig.length || missingSecrets.length) {
      throw new IntegrationAdminError(`Faltam dados para ativar: ${[...missingConfig.map((k) => `configuração "${k}"`), ...missingSecrets.map((s) => `segredo ${s}`)].join(", ")}.`);
    }
  }
  await db.update(integrations).set({ mode, updatedBy: actor.id }).where(eq(integrations.id, integrationId));
  await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "integration.mode_changed", entityType: "integration", entityId: integrationId, before: { mode: row.mode }, after: { mode } });
}

export async function triggerSync(actor: Principal, integrationId: string) {
  assertCan(actor, "events.reprocess");
  const row = await db.query.integrations.findFirst({ where: eq(integrations.id, integrationId) });
  if (!row || row.kind !== "order_source") throw new IntegrationAdminError("Integração não encontrada.");
  if (row.mode === "disabled") throw new IntegrationAdminError("Ative a integração antes de sincronizar.");
  const result = await syncOrderIntegration(integrationId);
  await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "integration.sync_triggered", entityType: "integration", entityId: integrationId, after: { status: result.status, counters: result.counters } });
  return result;
}

// Usado pelo agendador: sincroniza todas as fontes de pedidos ativas.
export async function syncAllOrderSources() {
  const rows = await db.select().from(integrations).where(eq(integrations.kind, "order_source"));
  const results = [];
  for (const row of rows) {
    if (row.mode === "disabled" || (row.mode === "demo" && isProduction())) continue;
    results.push({ integrationId: row.id, name: row.name, ...(await syncOrderIntegration(row.id)) });
  }
  return results;
}

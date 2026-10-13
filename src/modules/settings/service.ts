import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { assertCan, type Principal } from "@/modules/access/can";
import { recordAudit } from "@/modules/audit/service";

// Parâmetros editáveis no painel. Cada um tem tipo validado, valor padrão e descrição.
export const SETTINGS = {
  "payout.min_cents": {
    label: "Valor mínimo de resgate (centavos)",
    help: "Decisão D12. Padrão: R$ 20,00.",
    schema: z.coerce.number().int().min(100).max(1_000_000),
    default: 2000,
  },
  "attribution.reject_self_purchase": {
    label: "Recusar vendas originadas de clique da própria autora",
    help: "Decisão D8 (autocompra) ainda pendente. Padrão: recusar.",
    schema: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()),
    default: true,
  },
  "reconciliation.uninvoiced_days": {
    label: "Alertar conversões aprovadas sem fatura após (dias)",
    help: "Usado pela conciliação.",
    schema: z.coerce.number().int().min(7).max(365),
    default: 60,
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
type SettingValue<K extends SettingKey> = (typeof SETTINGS)[K]["default"];

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
  if (!row) return SETTINGS[key].default;
  const parsed = SETTINGS[key].schema.safeParse(row.value);
  return (parsed.success ? parsed.data : SETTINGS[key].default) as SettingValue<K>;
}

export async function listSettings(actor: Principal) {
  assertCan(actor, "settings.manage");
  return Promise.all(
    (Object.keys(SETTINGS) as SettingKey[]).map(async (key) => ({ key, ...SETTINGS[key], value: await getSetting(key) })),
  );
}

export async function updateSetting(actor: Principal, key: string, raw: unknown): Promise<void> {
  assertCan(actor, "settings.manage");
  if (!(key in SETTINGS)) throw new Error("Parâmetro desconhecido.");
  const k = key as SettingKey;
  const value = SETTINGS[k].schema.parse(raw);
  const before = await getSetting(k);
  await db.transaction(async (tx) => {
    await tx.insert(settings).values({ key: k, value, updatedBy: actor.id }).onConflictDoUpdate({ target: settings.key, set: { value, updatedBy: actor.id } });
    await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "settings.updated", entityType: "setting", entityId: k, before: { value: before }, after: { value } }, tx);
  });
}

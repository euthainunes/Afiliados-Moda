import { and, asc, desc, eq, gt, isNull, lte, max, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { brands, campaigns, commissionRules, productFeeds, type EligibilityPolicy } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { assertCan, assertDifferentApprover, type Principal } from "@/modules/access/can";
import { recordAudit } from "@/modules/audit/service";

export class CommercialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommercialError";
  }
}

const isUuid = (v: string) => z.uuid().safeParse(v).success;
const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífens.")
  .min(2, "Mínimo de 2 caracteres.")
  .max(60, "Máximo de 60 caracteres.");

// ---- Marcas ----

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Domínio inválido (ex.: loja.com.br).");

// Parâmetros de rastreamento: uma linha por parâmetro, no formato chave=valor.
export function parseTrackingParams(text: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) throw new CommercialError(`Linha inválida: "${line}". Use chave=valor.`);
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!/^[A-Za-z0-9_.-]{1,40}$/.test(key)) throw new CommercialError(`Chave inválida: "${key}".`);
    if (!value || value.length > 100 || /[\s<>"]/.test(value)) throw new CommercialError(`Valor inválido para "${key}".`);
    const unknown = value.match(/\{([^}]*)\}/g)?.filter((p) => p !== "{click_id}" && p !== "{campaign}");
    if (unknown?.length) throw new CommercialError(`Marcador desconhecido em "${key}": ${unknown.join(", ")}. Use {click_id} ou {campaign}.`);
    params[key] = value;
  }
  if (Object.keys(params).length > 10) throw new CommercialError("No máximo 10 parâmetros.");
  return params;
}

export const brandInputSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(80),
  slug: slugSchema,
  status: z.enum(["active", "inactive"]),
  website: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null)
    .refine((v) => !v || v.startsWith("https://"), "O site precisa começar com https://"),
  allowedDomains: z
    .string()
    .transform((t) => t.split(/[\s,]+/).filter(Boolean))
    .pipe(z.array(domainSchema).min(1, "Informe ao menos um domínio autorizado.").max(10)),
  trackingParams: z.string().max(2000).default(""),
});
export type BrandInput = z.input<typeof brandInputSchema>;

export async function listBrands(actor: Principal) {
  assertCan(actor, "brands.manage");
  return db.select().from(brands).orderBy(asc(brands.name));
}

export async function getBrand(actor: Principal, brandId: string) {
  assertCan(actor, "brands.manage");
  if (!isUuid(brandId)) return null;
  const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
  if (!brand) return null;
  const [feeds, campaignRows] = await Promise.all([
    db.select().from(productFeeds).where(eq(productFeeds.brandId, brandId)).orderBy(asc(productFeeds.createdAt)),
    db.select().from(campaigns).where(eq(campaigns.brandId, brandId)).orderBy(desc(campaigns.startsAt)),
  ]);
  return { brand, feeds, campaigns: campaignRows };
}

export async function saveBrand(actor: Principal, input: BrandInput, brandId?: string): Promise<string> {
  assertCan(actor, "brands.manage");
  const data = brandInputSchema.parse(input);
  const trackingConfig = { params: parseTrackingParams(data.trackingParams) };
  const values = {
    name: data.name,
    slug: data.slug,
    status: data.status,
    website: data.website,
    allowedDomains: data.allowedDomains,
    trackingConfig,
  };
  return db.transaction(async (tx) => {
    const clash = await tx.query.brands.findFirst({ where: eq(brands.slug, data.slug) });
    if (clash && clash.id !== brandId) throw new CommercialError("Já existe uma marca com este identificador.");
    if (brandId) {
      if (!isUuid(brandId)) throw new CommercialError("Marca não encontrada.");
      const before = await tx.query.brands.findFirst({ where: eq(brands.id, brandId) });
      if (!before) throw new CommercialError("Marca não encontrada.");
      await tx.update(brands).set(values).where(eq(brands.id, brandId));
      await recordAudit(
        {
          actorId: actor.id,
          actorRoles: actor.roles,
          action: "brand.updated",
          entityType: "brand",
          entityId: brandId,
          before: { name: before.name, slug: before.slug, status: before.status, website: before.website, allowedDomains: before.allowedDomains, trackingConfig: before.trackingConfig },
          after: values,
        },
        tx,
      );
      return brandId;
    }
    const [created] = await tx.insert(brands).values(values).returning({ id: brands.id });
    await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "brand.created", entityType: "brand", entityId: created.id, after: values }, tx);
    return created.id;
  });
}

// ---- Feeds ----

export function validateFeedSource(source: string): string {
  const value = source.trim();
  if (value.startsWith("file:")) {
    if (env().NODE_ENV === "production") throw new CommercialError("Arquivos locais não são permitidos em produção.");
    if (!/^file:[A-Za-z0-9_./-]+\.xml$/.test(value) || value.includes("..")) throw new CommercialError("Caminho de arquivo inválido.");
    return value;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CommercialError("Informe uma URL válida.");
  }
  if (url.protocol !== "https:" || url.username || url.password) throw new CommercialError("A URL do feed precisa usar https, sem usuário e senha.");
  return url.toString();
}

export async function saveFeed(actor: Principal, brandId: string, source: string, feedId?: string): Promise<void> {
  assertCan(actor, "integrations.manage");
  const value = validateFeedSource(source);
  if (!isUuid(brandId)) throw new CommercialError("Marca não encontrada.");
  await db.transaction(async (tx) => {
    if (feedId) {
      const before = await tx.query.productFeeds.findFirst({ where: and(eq(productFeeds.id, feedId), eq(productFeeds.brandId, brandId)) });
      if (!before) throw new CommercialError("Feed não encontrado.");
      await tx.update(productFeeds).set({ source: value }).where(eq(productFeeds.id, feedId));
      await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "feed.updated", entityType: "product_feed", entityId: feedId, before: { source: before.source }, after: { source: value } }, tx);
    } else {
      const [created] = await tx.insert(productFeeds).values({ brandId, source: value }).returning({ id: productFeeds.id });
      await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "feed.created", entityType: "product_feed", entityId: created.id, after: { brandId, source: value } }, tx);
    }
  });
}

// ---- Campanhas ----

const dateInput = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  // Datas informadas no fuso de São Paulo, início do dia.
  .transform((d) => new Date(`${d}T00:00:00-03:00`));

export const campaignInputSchema = z
  .object({
    name: z.string().trim().min(2, "Informe o nome.").max(80),
    slug: slugSchema,
    status: z.enum(["draft", "active", "ended"]),
    startsAt: dateInput,
    endsAt: z.union([z.literal("").transform(() => null), dateInput]).optional().transform((v) => v ?? null),
  })
  .refine((c) => !c.endsAt || c.endsAt > c.startsAt, { path: ["endsAt"], message: "O fim precisa ser depois do início." });
export type CampaignInput = z.input<typeof campaignInputSchema>;

export async function saveCampaign(actor: Principal, brandId: string, input: CampaignInput, campaignId?: string): Promise<string> {
  assertCan(actor, "campaigns.manage");
  const data = campaignInputSchema.parse(input);
  if (!isUuid(brandId)) throw new CommercialError("Marca não encontrada.");
  return db.transaction(async (tx) => {
    const clash = await tx.query.campaigns.findFirst({ where: and(eq(campaigns.brandId, brandId), eq(campaigns.slug, data.slug)) });
    if (clash && clash.id !== campaignId) throw new CommercialError("Já existe uma campanha com este identificador nesta marca.");
    if (campaignId) {
      const before = await tx.query.campaigns.findFirst({ where: and(eq(campaigns.id, campaignId), eq(campaigns.brandId, brandId)) });
      if (!before) throw new CommercialError("Campanha não encontrada.");
      await tx.update(campaigns).set(data).where(eq(campaigns.id, campaignId));
      await recordAudit(
        { actorId: actor.id, actorRoles: actor.roles, action: "campaign.updated", entityType: "campaign", entityId: campaignId, before: { name: before.name, slug: before.slug, status: before.status, startsAt: before.startsAt, endsAt: before.endsAt }, after: data },
        tx,
      );
      return campaignId;
    }
    const [created] = await tx.insert(campaigns).values({ brandId, ...data }).returning({ id: campaigns.id });
    await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "campaign.created", entityType: "campaign", entityId: created.id, after: { brandId, ...data } }, tx);
    return created.id;
  });
}

// ---- Regras de comissão ----

// Percentual digitado ("25", "25,5", "20.25") → pontos-base inteiros, sem ponto flutuante.
export function percentToBps(value: string): number | null {
  const m = value.trim().replace(",", ".").match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return bps <= 10000 ? bps : null;
}

export function bpsToPercent(bps: number): string {
  return (bps / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export const BASE_LABELS = {
  item_net_paid: "Valor pago pelos itens (líquido de descontos, sem frete)",
  item_list_price: "Preço de tabela dos itens",
  order_total_excl_shipping: "Total do pedido sem frete",
} as const;

export const START_LABELS = {
  order_created: "Data do pedido",
  order_invoiced: "Faturamento do pedido",
  order_delivered: "Entrega do pedido",
} as const;

const bpsField = (label: string) =>
  z.string().transform((v, ctx) => {
    const bps = percentToBps(v);
    if (bps == null) {
      ctx.addIssue({ code: "custom", message: `${label}: use um número entre 0 e 100 com até 2 casas decimais.` });
      return z.NEVER;
    }
    return bps;
  });

export const ruleInputSchema = z
  .object({
    baseType: z.enum(["item_net_paid", "item_list_price", "order_total_excl_shipping"]),
    commission: bpsField("Comissão"),
    userShare: bpsField("Parcela da usuária"),
    attributionWindowDays: z.coerce.number().int().min(1, "Mínimo de 1 dia.").max(90, "Máximo de 90 dias."),
    startEvent: z.enum(["order_created", "order_invoiced", "order_delivered"]),
    waitDays: z.coerce.number().int().min(0).max(365),
    requireBrandPaymentReceived: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()),
    validFrom: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
      .transform((d) => new Date(`${d}T00:00:00-03:00`)),
    contractReference: z.string().trim().max(300).optional().transform((v) => v || null),
    notes: z.string().trim().max(1000).optional().transform((v) => v || null),
  })
  .refine((r) => r.userShare <= r.commission, { path: ["userShare"], message: "A parcela da usuária não pode ser maior que a comissão." });
export type RuleInput = z.input<typeof ruleInputSchema>;

export async function listRules(actor: Principal, campaignId: string) {
  assertCan(actor, "brands.manage");
  if (!isUuid(campaignId)) return [];
  return db.select().from(commissionRules).where(eq(commissionRules.campaignId, campaignId)).orderBy(desc(commissionRules.version));
}

export async function proposeRule(actor: Principal, campaignId: string, input: RuleInput): Promise<string> {
  assertCan(actor, "commission_rules.propose");
  const data = ruleInputSchema.parse(input);
  if (!isUuid(campaignId)) throw new CommercialError("Campanha não encontrada.");
  return db.transaction(async (tx) => {
    const campaign = await tx.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
    if (!campaign) throw new CommercialError("Campanha não encontrada.");
    // Trava a campanha para numerar versões sem colisão.
    await tx.execute(sql`select id from campaigns where id = ${campaignId} for update`);
    const [{ last }] = await tx.select({ last: max(commissionRules.version) }).from(commissionRules).where(eq(commissionRules.campaignId, campaignId));
    const policy: EligibilityPolicy = {
      startEvent: data.startEvent,
      waitDays: data.waitDays,
      requireBrandPaymentReceived: data.requireBrandPaymentReceived,
    };
    const [rule] = await tx
      .insert(commissionRules)
      .values({
        campaignId,
        version: (last ?? 0) + 1,
        baseType: data.baseType,
        commissionBps: data.commission,
        userShareBps: data.userShare,
        platformShareBps: data.commission - data.userShare,
        attributionWindowDays: data.attributionWindowDays,
        eligibilityPolicy: policy,
        validFrom: data.validFrom,
        contractReference: data.contractReference,
        notes: data.notes,
        proposedBy: actor.id,
      })
      .returning();
    await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "commission_rule.proposed", entityType: "commission_rule", entityId: rule.id, after: rule }, tx);
    return rule.id;
  });
}

async function lockedRule(tx: Tx, ruleId: string) {
  if (!isUuid(ruleId)) throw new CommercialError("Regra não encontrada.");
  const [rule] = await tx.select().from(commissionRules).where(eq(commissionRules.id, ruleId)).for("update");
  if (!rule) throw new CommercialError("Regra não encontrada.");
  return rule;
}

// Aprovação com "quatro olhos": quem aprova não pode ser quem propôs. A regra não vale retroativamente
// e encerra a vigência da versão aprovada anterior, sem alterar vendas já feitas sob ela.
export async function approveRule(actor: Principal, ruleId: string, note?: string, now = new Date()): Promise<void> {
  assertCan(actor, "commission_rules.approve");
  await db.transaction(async (tx) => {
    const rule = await lockedRule(tx, ruleId);
    if (rule.status !== "draft") throw new CommercialError("Esta regra já foi revisada.");
    assertDifferentApprover(rule.proposedBy, actor.id);
    if (!rule.contractReference?.trim()) {
      throw new CommercialError("Informe a referência do contrato ou da confirmação formal antes de aprovar.");
    }
    if (rule.validFrom.getTime() < now.getTime() - 60_000) {
      throw new CommercialError("O início da vigência já passou. Regras não podem valer retroativamente: proponha uma nova data.");
    }
    // Versões aprovadas que alcançariam a nova vigência têm a vigência encerrada nela.
    const overlapping = await tx
      .select()
      .from(commissionRules)
      .where(
        and(
          eq(commissionRules.campaignId, rule.campaignId),
          eq(commissionRules.status, "approved"),
          or(isNull(commissionRules.validTo), gt(commissionRules.validTo, rule.validFrom)),
        ),
      );
    for (const prev of overlapping) {
      if (prev.validFrom >= rule.validFrom) {
        throw new CommercialError(`A versão ${prev.version} começa na mesma data ou depois desta. Ajuste a data de início.`);
      }
      await tx.update(commissionRules).set({ validTo: rule.validFrom }).where(eq(commissionRules.id, prev.id));
      await recordAudit(
        { actorId: actor.id, actorRoles: actor.roles, action: "commission_rule.superseded", entityType: "commission_rule", entityId: prev.id, before: { validTo: prev.validTo }, after: { validTo: rule.validFrom, supersededBy: rule.id } },
        tx,
      );
    }
    await tx
      .update(commissionRules)
      .set({ status: "approved", reviewedBy: actor.id, reviewedAt: now, reviewNote: note?.trim() || null })
      .where(eq(commissionRules.id, ruleId));
    await recordAudit(
      { actorId: actor.id, actorRoles: actor.roles, action: "commission_rule.approved", entityType: "commission_rule", entityId: ruleId, before: { status: "draft" }, after: { status: "approved", note: note?.trim() || null } },
      tx,
    );
  });
}

export async function rejectRule(actor: Principal, ruleId: string, note: string): Promise<void> {
  assertCan(actor, "commission_rules.approve");
  if (note.trim().length < 5) throw new CommercialError("Informe o motivo (mínimo de 5 caracteres).");
  await db.transaction(async (tx) => {
    const rule = await lockedRule(tx, ruleId);
    if (rule.status !== "draft") throw new CommercialError("Esta regra já foi revisada.");
    await tx.update(commissionRules).set({ status: "rejected", reviewedBy: actor.id, reviewedAt: new Date(), reviewNote: note.trim() }).where(eq(commissionRules.id, ruleId));
    await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "commission_rule.rejected", entityType: "commission_rule", entityId: ruleId, after: { status: "rejected", note: note.trim() } }, tx);
  });
}

// Regra aprovada que vale num instante (usada pela atribuição na Fase 6).
export async function ruleInEffect(campaignId: string, at: Date) {
  const [rule] = await db
    .select()
    .from(commissionRules)
    .where(
      and(
        eq(commissionRules.campaignId, campaignId),
        eq(commissionRules.status, "approved"),
        lte(commissionRules.validFrom, at),
        or(isNull(commissionRules.validTo), gt(commissionRules.validTo, at)),
      ),
    )
    .limit(1);
  return rule ?? null;
}

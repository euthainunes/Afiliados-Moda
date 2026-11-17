import { and, asc, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { brandInvoiceItems, brandInvoices, brandMembers, brands, clicks, conversions, looks, orders, products, profiles, userRoles, users } from "@/lib/db/schema";
import { AccessDeniedError, assertCan, can, isStaff, type Principal } from "@/modules/access/can";
import type { Role } from "@/modules/access/permissions";
import { recordAudit } from "@/modules/audit/service";
import { revokeAllSessions } from "@/modules/identity/sessions";

// Portal da marca: SOMENTE LEITURA e restrito às marcas vinculadas à conta (brand_members).
// Administradoras (brands.manage) podem abrir o portal de qualquer marca para conferir o que a marca vê.
// Nunca expõe dados de quem comprou nem a divisão interna da comissão (parte da criadora × plataforma).

export class BrandPortalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrandPortalError";
  }
}

const ACTIVE_STATES = ["registered", "in_validation", "approved"] as const;
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export async function brandsVisibleTo(actor: Principal) {
  assertCan(actor, "brand_portal.access");
  const cols = { id: brands.id, name: brands.name, slug: brands.slug, isFictitious: brands.isFictitious };
  if (can(actor, "brands.manage")) return db.select(cols).from(brands).orderBy(asc(brands.name));
  return db
    .select(cols)
    .from(brandMembers)
    .innerJoin(brands, eq(brands.id, brandMembers.brandId))
    .where(eq(brandMembers.userId, actor.id))
    .orderBy(asc(brands.name));
}

export async function assertBrandAccess(actor: Principal, brandId: string): Promise<void> {
  assertCan(actor, "brand_portal.access");
  if (!isUuid(brandId)) throw new AccessDeniedError();
  if (can(actor, "brands.manage")) return;
  const [member] = await db.select().from(brandMembers).where(and(eq(brandMembers.brandId, brandId), eq(brandMembers.userId, actor.id)));
  if (!member) throw new AccessDeniedError();
}

function sinceDays(days: number, now: Date) {
  const since = new Date(now.getTime() - (days - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  return since;
}

export async function portalOverview(actor: Principal, brandId: string, { days = 30, now = new Date() } = {}) {
  await assertBrandAccess(actor, brandId);
  const since = sinceDays(days, now);
  const dayExpr = (col: unknown) => sql<string>`to_char(${col} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`;
  const validClick = and(eq(clicks.brandId, brandId), eq(clicks.isBot, false), eq(clicks.isSelfClick, false), gte(clicks.occurredAt, since));
  const activeConv = and(eq(conversions.brandId, brandId), inArray(conversions.state, [...ACTIVE_STATES]), gte(conversions.registeredAt, since));

  const [clickRows, convRows, [totals], [approved], topProducts, topLooks, [creators]] = await Promise.all([
    db.select({ day: dayExpr(clicks.occurredAt), n: sql<number>`count(*)::int` }).from(clicks).where(validClick).groupBy(sql`1`),
    db.select({ day: dayExpr(conversions.registeredAt), n: sql<number>`count(*)::int` }).from(conversions).where(activeConv).groupBy(sql`1`),
    db
      .select({ sales: sql<number>`count(*)::int`, baseCents: sql<number>`coalesce(sum(${conversions.baseAmountCents}), 0)::bigint`, commissionCents: sql<number>`coalesce(sum(${conversions.commissionCents}), 0)::bigint`, demo: sql<boolean>`coalesce(bool_or(${conversions.isDemo}), false)` })
      .from(conversions)
      .where(activeConv),
    db
      .select({ commissionCents: sql<number>`coalesce(sum(${conversions.commissionCents}), 0)::bigint` })
      .from(conversions)
      .leftJoin(brandInvoiceItems, eq(brandInvoiceItems.conversionId, conversions.id))
      .where(and(eq(conversions.brandId, brandId), eq(conversions.state, "approved"), isNull(brandInvoiceItems.invoiceId))),
    db
      .select({ title: products.title, clicks: sql<number>`count(*)::int` })
      .from(clicks)
      .innerJoin(products, eq(products.id, clicks.productId))
      .where(validClick)
      .groupBy(products.id, products.title)
      .orderBy(desc(sql`count(*)`))
      .limit(5),
    db
      .select({ title: looks.title, slug: looks.slug, creator: profiles.username, sales: sql<number>`count(*)::int` })
      .from(conversions)
      .innerJoin(looks, eq(looks.id, conversions.lookId))
      .innerJoin(profiles, eq(profiles.userId, conversions.userId))
      .where(activeConv)
      .groupBy(looks.id, looks.title, looks.slug, profiles.username)
      .orderBy(desc(sql`count(*)`))
      .limit(5),
    db.select({ n: sql<number>`count(distinct ${clicks.userId})::int` }).from(clicks).where(validClick),
  ]);

  const totalClicks = clickRows.reduce((s, r) => s + r.n, 0);
  const series: { day: string; clicks: number; sales: number }[] = [];
  for (let i = 0; i < days; i++) {
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(since.getTime() + i * 86_400_000 + 12 * 3_600_000));
    series.push({ day: key, clicks: clickRows.find((r) => r.day === key)?.n ?? 0, sales: convRows.find((r) => r.day === key)?.n ?? 0 });
  }
  return {
    days,
    clicks: totalClicks,
    creators: creators.n,
    sales: totals.sales,
    salesBaseCents: Number(totals.baseCents),
    commissionCents: Number(totals.commissionCents),
    conversionRate: totalClicks ? totals.sales / totalClicks : 0,
    approvedUninvoicedCents: Number(approved.commissionCents),
    hasDemo: totals.demo,
    series,
    topProducts,
    topLooks,
  };
}

export async function portalSales(actor: Principal, brandId: string, { page = 1, pageSize = 25 }: { page?: number; pageSize?: number } = {}) {
  await assertBrandAccess(actor, brandId);
  const p = Math.max(1, page);
  const where = eq(conversions.brandId, brandId);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: conversions.id,
        registeredAt: conversions.registeredAt,
        state: conversions.state,
        rejectionReason: conversions.rejectionReason,
        externalOrderId: orders.externalOrderId,
        baseCents: conversions.baseAmountCents,
        commissionCents: conversions.commissionCents,
        lookTitle: looks.title,
        creator: profiles.username,
        invoiceId: brandInvoiceItems.invoiceId,
        isDemo: conversions.isDemo,
      })
      .from(conversions)
      .innerJoin(orders, eq(orders.id, conversions.orderId))
      .innerJoin(looks, eq(looks.id, conversions.lookId))
      .innerJoin(profiles, eq(profiles.userId, conversions.userId))
      .leftJoin(brandInvoiceItems, eq(brandInvoiceItems.conversionId, conversions.id))
      .where(where)
      .orderBy(desc(conversions.registeredAt), desc(conversions.id))
      .limit(pageSize)
      .offset((p - 1) * pageSize),
    db.select({ total: count() }).from(conversions).where(where),
  ]);
  return { rows, page: p, pages: Math.max(1, Math.ceil(total / pageSize)), total };
}

export async function portalInvoices(actor: Principal, brandId: string) {
  await assertBrandAccess(actor, brandId);
  return db
    .select({
      id: brandInvoices.id,
      number: brandInvoices.number,
      periodStart: brandInvoices.periodStart,
      periodEnd: brandInvoices.periodEnd,
      amountCents: brandInvoices.amountCents,
      status: brandInvoices.status,
      issuedAt: brandInvoices.issuedAt,
      isDemo: brandInvoices.isDemo,
      items: sql<number>`(select count(*)::int from brand_invoice_items i where i.invoice_id = ${brandInvoices.id})`,
    })
    .from(brandInvoices)
    .where(eq(brandInvoices.brandId, brandId))
    .orderBy(desc(brandInvoices.issuedAt))
    .limit(100);
}

// ---------- Gestão de acesso (administradoras) ----------

export async function listBrandMembers(actor: Principal, brandId: string) {
  assertCan(actor, "brands.manage");
  return db
    .select({ userId: users.id, email: users.email, name: profiles.displayName, grantedAt: brandMembers.grantedAt })
    .from(brandMembers)
    .innerJoin(users, eq(users.id, brandMembers.userId))
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(brandMembers.brandId, brandId))
    .orderBy(asc(profiles.displayName));
}

// Concede o portal de uma marca a uma conta existente e confirmada. A pessoa precisa entrar de novo
// (sessões encerradas) e, onde a verificação em duas etapas é obrigatória, ativá-la antes de ver os dados.
export async function grantBrandAccess(actor: Principal, brandId: string, email: string): Promise<void> {
  assertCan(actor, "brands.manage");
  if (!isUuid(brandId)) throw new BrandPortalError("Marca não encontrada.");
  const target = await db.query.users.findFirst({ where: eq(users.email, email.trim().toLowerCase()) });
  if (!target || target.status !== "active") throw new BrandPortalError("Não há conta ativa com este e-mail. A pessoa precisa se cadastrar antes.");
  if (!target.emailVerifiedAt) throw new BrandPortalError("A conta ainda não confirmou o e-mail.");
  const roles = (await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, target.id))).map((r) => r.role as Role);
  // Conflito de interesse: quem opera a plataforma não representa marca.
  if (isStaff(roles)) throw new BrandPortalError("Contas da equipe interna não podem representar marcas.");
  await db.transaction(async (tx) => {
    const inserted = await tx.insert(brandMembers).values({ brandId, userId: target.id, grantedBy: actor.id }).onConflictDoNothing().returning();
    if (inserted.length === 0) throw new BrandPortalError("Esta pessoa já tem acesso a esta marca.");
    await tx.insert(userRoles).values({ userId: target.id, role: "brand_rep", grantedBy: actor.id }).onConflictDoNothing();
    await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "brand.access_granted", entityType: "brand", entityId: brandId, after: { userId: target.id } }, tx);
  });
  await revokeAllSessions(target.id);
}

export async function revokeBrandAccess(actor: Principal, brandId: string, userId: string): Promise<void> {
  assertCan(actor, "brands.manage");
  if (!isUuid(brandId) || !isUuid(userId)) throw new BrandPortalError("Acesso não encontrado.");
  await db.transaction(async (tx) => {
    const removed = await tx.delete(brandMembers).where(and(eq(brandMembers.brandId, brandId), eq(brandMembers.userId, userId))).returning();
    if (removed.length === 0) throw new BrandPortalError("Acesso não encontrado.");
    const [{ left }] = await tx.select({ left: count() }).from(brandMembers).where(eq(brandMembers.userId, userId));
    if (left === 0) await tx.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.role, "brand_rep")));
    await recordAudit({ actorId: actor.id, actorRoles: actor.roles, action: "brand.access_revoked", entityType: "brand", entityId: brandId, before: { userId } }, tx);
  });
  await revokeAllSessions(userId);
}

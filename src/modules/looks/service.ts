import { and, asc, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { brands, lookItems, looks, products, profiles, trackingLinks, clicks } from "@/lib/db/schema";
import { randomToken } from "@/lib/crypto";
import { slugify } from "@/lib/text";
import { assertCan, type Principal } from "@/modules/access/can";
import { recordAudit } from "@/modules/audit/service";
import { newTrackingCode } from "@/modules/tracking/ids";

// Regras de composição e publicação (docs/02 §4.2). Ajustáveis aqui, num único lugar.
export const LOOK_RULES = {
  maxItems: 12,
  minItemsToPublish: 2,
  titleMin: 3,
  titleMax: 80,
  descriptionMax: 500,
} as const;

export class LookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LookError";
  }
}

export const lookDetailsSchema = z.object({
  title: z.string().trim().max(LOOK_RULES.titleMax, `O título pode ter no máximo ${LOOK_RULES.titleMax} caracteres.`),
  description: z
    .string()
    .trim()
    .max(LOOK_RULES.descriptionMax, `A descrição pode ter no máximo ${LOOK_RULES.descriptionMax} caracteres.`)
    .optional()
    .transform((v) => (v ? v : null)),
});

const isUuid = (v: string) => z.uuid().safeParse(v).success;

// Carrega um look garantindo que pertence à usuária e que pode ser editado.
async function ownedLook(tx: Tx | typeof db, userId: string, lookId: string, { forUpdate = false } = {}) {
  if (!isUuid(lookId)) throw new LookError("Look não encontrado.");
  const query = tx.select().from(looks).where(and(eq(looks.id, lookId), eq(looks.userId, userId)));
  const [look] = forUpdate ? await query.for("update") : await query;
  if (!look) throw new LookError("Look não encontrado.");
  if (look.status === "removed") throw new LookError("Este look foi removido pela moderação e não pode ser editado.");
  return look;
}

async function ensureTrackingLink(tx: Tx, look: { id: string; userId: string }, productId: string) {
  await tx
    .insert(trackingLinks)
    .values({ code: newTrackingCode(), userId: look.userId, lookId: look.id, productId })
    .onConflictDoNothing({ target: [trackingLinks.lookId, trackingLinks.productId] });
}

export async function createLook(userId: string, firstProductId?: string): Promise<string> {
  return db.transaction(async (tx) => {
    const [look] = await tx.insert(looks).values({ userId }).returning({ id: looks.id });
    if (firstProductId) await addItemTx(tx, userId, look.id, firstProductId);
    return look.id;
  });
}

async function addItemTx(tx: Tx, userId: string, lookId: string, productId: string) {
  const look = await ownedLook(tx, userId, lookId, { forUpdate: true });
  if (!isUuid(productId)) throw new LookError("Produto não encontrado.");
  const product = await tx.query.products.findFirst({ where: eq(products.id, productId) });
  if (!product || product.status !== "listed") throw new LookError("Este produto não está mais no catálogo.");

  const items = await tx.select({ productId: lookItems.productId, position: lookItems.position }).from(lookItems).where(eq(lookItems.lookId, lookId));
  if (items.some((i) => i.productId === productId)) throw new LookError("Esta peça já está no look.");
  if (items.length >= LOOK_RULES.maxItems) throw new LookError(`Um look pode ter no máximo ${LOOK_RULES.maxItems} peças.`);

  await tx.insert(lookItems).values({
    lookId,
    productId,
    position: Math.max(0, ...items.map((i) => i.position)) + 1,
    priceAtAddCents: product.salePriceCents ?? product.priceCents,
  });
  await tx.update(looks).set({ updatedAt: new Date() }).where(eq(looks.id, lookId));
  if (look.status === "published") await ensureTrackingLink(tx, look, productId);
}

export async function addItem(userId: string, lookId: string, productId: string): Promise<void> {
  await db.transaction((tx) => addItemTx(tx, userId, lookId, productId));
}

export async function removeItem(userId: string, lookId: string, productId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const look = await ownedLook(tx, userId, lookId, { forUpdate: true });
    const [{ n }] = await tx.select({ n: count() }).from(lookItems).where(eq(lookItems.lookId, lookId));
    if (look.status === "published" && n <= LOOK_RULES.minItemsToPublish) {
      throw new LookError(`Um look publicado precisa de ao menos ${LOOK_RULES.minItemsToPublish} peças. Adicione outra antes de remover, ou despublique.`);
    }
    await tx.delete(lookItems).where(and(eq(lookItems.lookId, lookId), eq(lookItems.productId, productId)));
    await tx.update(looks).set({ updatedAt: new Date() }).where(eq(looks.id, lookId));
  });
}

export async function moveItem(userId: string, lookId: string, productId: string, direction: "up" | "down"): Promise<void> {
  await db.transaction(async (tx) => {
    await ownedLook(tx, userId, lookId, { forUpdate: true });
    const items = await tx
      .select({ id: lookItems.id, productId: lookItems.productId, position: lookItems.position })
      .from(lookItems)
      .where(eq(lookItems.lookId, lookId))
      .orderBy(asc(lookItems.position));
    const index = items.findIndex((i) => i.productId === productId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    // Regrava as posições em sequência (1..n), o que também corrige lacunas.
    for (const [i, item] of reordered.entries()) {
      await tx.update(lookItems).set({ position: i + 1 }).where(eq(lookItems.id, item.id));
    }
    await tx.update(looks).set({ updatedAt: new Date() }).where(eq(looks.id, lookId));
  });
}

export async function updateDetails(userId: string, lookId: string, input: { title: string; description?: string | null }) {
  const data = lookDetailsSchema.parse(input);
  await db.transaction(async (tx) => {
    const look = await ownedLook(tx, userId, lookId, { forUpdate: true });
    if (look.status === "published" && data.title.length < LOOK_RULES.titleMin) {
      throw new LookError(`O título precisa ter ao menos ${LOOK_RULES.titleMin} caracteres.`);
    }
    await tx.update(looks).set({ title: data.title, description: data.description }).where(eq(looks.id, lookId));
  });
}

export type PublishProblem = { field: "title" | "items"; message: string };

export async function publishLook(userId: string, lookId: string): Promise<{ ok: true; slug: string } | { ok: false; problems: PublishProblem[] }> {
  return db.transaction(async (tx) => {
    const look = await ownedLook(tx, userId, lookId, { forUpdate: true });
    const items = await tx
      .select({ productId: lookItems.productId, title: products.title, status: products.status, availability: products.availability })
      .from(lookItems)
      .innerJoin(products, eq(products.id, lookItems.productId))
      .where(eq(lookItems.lookId, lookId));

    const problems: PublishProblem[] = [];
    if (look.title.trim().length < LOOK_RULES.titleMin) {
      problems.push({ field: "title", message: `Dê um título com ao menos ${LOOK_RULES.titleMin} caracteres.` });
    }
    const unavailable = items.filter((i) => i.status !== "listed" || i.availability !== "in_stock");
    if (unavailable.length > 0) {
      problems.push({ field: "items", message: `Remova as peças indisponíveis: ${unavailable.map((i) => i.title).join(", ")}.` });
    }
    if (items.length < LOOK_RULES.minItemsToPublish) {
      problems.push({ field: "items", message: `Adicione ao menos ${LOOK_RULES.minItemsToPublish} peças.` });
    }
    if (problems.length > 0) return { ok: false as const, problems };

    // O slug é criado uma única vez; republicar mantém a mesma URL.
    const slug = look.slug ?? `${slugify(look.title, 50) || "look"}-${randomToken(4).replace(/[-_]/g, "x").slice(0, 6).toLowerCase()}`;
    await tx
      .update(looks)
      .set({ status: "published", slug, publishedAt: look.publishedAt ?? new Date() })
      .where(eq(looks.id, lookId));
    for (const item of items) await ensureTrackingLink(tx, look, item.productId);
    return { ok: true as const, slug };
  });
}

export async function unpublishLook(userId: string, lookId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const look = await ownedLook(tx, userId, lookId, { forUpdate: true });
    if (look.status !== "published") return;
    await tx.update(looks).set({ status: "unpublished" }).where(eq(looks.id, lookId));
  });
}

// Só rascunhos nunca publicados podem ser apagados: looks já compartilhados têm cliques associados.
export async function deleteDraft(userId: string, lookId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const look = await ownedLook(tx, userId, lookId, { forUpdate: true });
    if (look.slug) throw new LookError("Looks que já foram publicados não podem ser apagados; despublique-o.");
    await tx.delete(looks).where(eq(looks.id, lookId));
  });
}

// ---- Leitura ----

export type LookItemView = {
  productId: string;
  title: string;
  brandName: string;
  brandFictitious: boolean;
  imageUrl: string | null;
  priceCents: number;
  salePriceCents: number | null;
  currency: string;
  available: boolean;
  trackingCode: string | null;
};

async function itemsFor(lookIds: string[]): Promise<Map<string, LookItemView[]>> {
  const map = new Map<string, LookItemView[]>();
  if (lookIds.length === 0) return map;
  const rows = await db
    .select({
      lookId: lookItems.lookId,
      productId: products.id,
      title: products.title,
      brandName: brands.name,
      brandFictitious: brands.isFictitious,
      imageUrls: products.imageUrls,
      priceCents: products.priceCents,
      salePriceCents: products.salePriceCents,
      currency: products.currency,
      status: products.status,
      availability: products.availability,
      brandStatus: brands.status,
      trackingCode: trackingLinks.code,
    })
    .from(lookItems)
    .innerJoin(products, eq(products.id, lookItems.productId))
    .innerJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(trackingLinks, and(eq(trackingLinks.lookId, lookItems.lookId), eq(trackingLinks.productId, lookItems.productId)))
    .where(inArray(lookItems.lookId, lookIds))
    .orderBy(asc(lookItems.position));
  for (const { lookId, imageUrls, status, availability, brandStatus, ...r } of rows) {
    const list = map.get(lookId) ?? [];
    list.push({
      ...r,
      imageUrl: imageUrls[0] ?? null,
      available: status === "listed" && availability === "in_stock" && brandStatus === "active",
    });
    map.set(lookId, list);
  }
  return map;
}

export async function getEditableLook(userId: string, lookId: string) {
  const look = await ownedLook(db, userId, lookId);
  const items = (await itemsFor([look.id])).get(look.id) ?? [];
  return { look, items };
}

export async function listMyLooks(userId: string) {
  const rows = await db.select().from(looks).where(eq(looks.userId, userId)).orderBy(desc(looks.updatedAt));
  const [items, clickCounts] = await Promise.all([
    itemsFor(rows.map((r) => r.id)),
    rows.length
      ? db
          .select({ lookId: clicks.lookId, n: count() })
          .from(clicks)
          .where(and(inArray(clicks.lookId, rows.map((r) => r.id)), eq(clicks.isBot, false), eq(clicks.isSelfClick, false)))
          .groupBy(clicks.lookId)
      : Promise.resolve([]),
  ]);
  const clickMap = new Map(clickCounts.map((c) => [c.lookId, c.n]));
  return rows.map((look) => ({ look, items: items.get(look.id) ?? [], clicks: clickMap.get(look.id) ?? 0 }));
}

// Cliques válidos por peça (sem robôs e sem cliques da própria autora).
export async function clickStatsForLook(userId: string, lookId: string) {
  await ownedLook(db, userId, lookId).catch(async (e) => {
    // Looks removidos continuam mostrando estatísticas à autora.
    const [own] = await db.select({ id: looks.id }).from(looks).where(and(eq(looks.id, lookId), eq(looks.userId, userId)));
    if (!own) throw e;
  });
  const rows = await db
    .select({ productId: clicks.productId, n: count() })
    .from(clicks)
    .where(and(eq(clicks.lookId, lookId), eq(clicks.isBot, false), eq(clicks.isSelfClick, false)))
    .groupBy(clicks.productId);
  return new Map(rows.map((r) => [r.productId, r.n]));
}

const creatorColumns = { displayName: profiles.displayName, username: profiles.username, avatarUrl: profiles.avatarUrl };

export async function getPublicLook(slug: string) {
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return null;
  const [row] = await db
    .select({ look: looks, creator: creatorColumns })
    .from(looks)
    .innerJoin(profiles, eq(profiles.userId, looks.userId))
    .where(and(eq(looks.slug, slug), eq(looks.status, "published")))
    .limit(1);
  if (!row) return null;
  const items = (await itemsFor([row.look.id])).get(row.look.id) ?? [];
  return { ...row, items };
}

export async function listPublishedLooks({ page = 1, pageSize = 24, username }: { page?: number; pageSize?: number; username?: string } = {}) {
  const where = and(
    eq(looks.status, "published"),
    isNotNull(looks.slug),
    username ? sql`lower(${profiles.username}) = ${username.toLowerCase()}` : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ look: looks, creator: creatorColumns })
      .from(looks)
      .innerJoin(profiles, eq(profiles.userId, looks.userId))
      .where(where)
      .orderBy(desc(looks.publishedAt), asc(looks.id))
      .limit(pageSize)
      .offset((Math.max(1, page) - 1) * pageSize),
    db.select({ total: count() }).from(looks).innerJoin(profiles, eq(profiles.userId, looks.userId)).where(where),
  ]);
  const items = await itemsFor(rows.map((r) => r.look.id));
  return {
    total,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    looks: rows.map((r) => ({ ...r, items: items.get(r.look.id) ?? [] })),
  };
}

export async function getPublicProfile(username: string) {
  if (!/^[a-zA-Z0-9_]{2,40}$/.test(username)) return null;
  const [profile] = await db
    .select({ ...creatorColumns, bio: profiles.bio })
    .from(profiles)
    .where(sql`lower(${profiles.username}) = ${username.toLowerCase()}`)
    .limit(1);
  return profile ?? null;
}

// ---- Moderação ----

export async function listLooksForModeration(actor: Principal, { page = 1, pageSize = 30 } = {}) {
  assertCan(actor, "looks.moderate");
  const rows = await db
    .select({ look: looks, creator: creatorColumns })
    .from(looks)
    .innerJoin(profiles, eq(profiles.userId, looks.userId))
    .where(inArray(looks.status, ["published", "removed"]))
    .orderBy(desc(looks.publishedAt))
    .limit(pageSize)
    .offset((Math.max(1, page) - 1) * pageSize);
  return rows;
}

export async function removeLook(actor: Principal, lookId: string, reason: string): Promise<void> {
  assertCan(actor, "looks.moderate");
  if (reason.trim().length < 5) throw new LookError("Informe o motivo (mínimo de 5 caracteres).");
  if (!isUuid(lookId)) throw new LookError("Look não encontrado.");
  await db.transaction(async (tx) => {
    const [look] = await tx.select().from(looks).where(eq(looks.id, lookId)).for("update");
    if (!look) throw new LookError("Look não encontrado.");
    if (look.status === "removed") return;
    await tx
      .update(looks)
      .set({ status: "removed", removedReason: reason.trim(), removedBy: actor.id })
      .where(eq(looks.id, lookId));
    await recordAudit(
      {
        actorId: actor.id,
        actorRoles: actor.roles,
        action: "look.removed",
        entityType: "look",
        entityId: lookId,
        before: { status: look.status },
        after: { status: "removed", reason: reason.trim() },
      },
      tx,
    );
  });
}

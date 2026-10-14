import { and, asc, count, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { brands, categories, favorites, products, productVariants } from "@/lib/db/schema";
import { normalizeText } from "@/lib/text";
import { RATE_LIMITS } from "@/modules/identity/policies";
import { consumeRateLimit } from "@/modules/identity/rate-limit";

export const SORTS = ["relevancia", "menor-preco", "maior-preco", "novidades"] as const;

// Campos vazios do formulário (?max=) chegam como "" e não podem virar zero.
const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

// Filtros vindos da URL: tudo é validado e limitado antes de chegar ao banco.
export const catalogFiltersSchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  categoria: z.string().trim().max(80).optional().catch(undefined),
  marca: z.string().trim().max(80).optional().catch(undefined),
  min: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(1_000_000).optional()).catch(undefined),
  max: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(1_000_000).optional()).catch(undefined),
  disponivel: z.preprocess((v) => v === "1" || v === "true", z.boolean()).optional().catch(undefined),
  ordem: z.preprocess(emptyToUndefined, z.enum(SORTS).optional()).catch(undefined),
  pagina: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(500).optional()).catch(undefined),
});
export type CatalogFilters = z.infer<typeof catalogFiltersSchema>;

export type ProductCard = {
  id: string;
  title: string;
  brandName: string;
  brandSlug: string;
  brandFictitious: boolean;
  imageUrl: string | null;
  priceCents: number;
  salePriceCents: number | null;
  currency: string;
  inStock: boolean;
};

const effectivePrice = sql<number>`coalesce(${products.salePriceCents}, ${products.priceCents})`;

const cardColumns = {
  id: products.id,
  title: products.title,
  brandName: brands.name,
  brandSlug: brands.slug,
  brandFictitious: brands.isFictitious,
  imageUrls: products.imageUrls,
  priceCents: products.priceCents,
  salePriceCents: products.salePriceCents,
  currency: products.currency,
  availability: products.availability,
};

type CardRow = { imageUrls: string[]; availability: "in_stock" | "out_of_stock" } & Omit<ProductCard, "imageUrl" | "inStock">;

function toCard({ imageUrls, availability, ...r }: CardRow): ProductCard {
  return { ...r, imageUrl: imageUrls[0] ?? null, inStock: availability === "in_stock" };
}

export async function searchProducts(filters: CatalogFilters, pageSize = 24) {
  const page = filters.pagina ?? 1;
  const terms = filters.q ? normalizeText(filters.q).split(" ").filter((t) => t.length > 0).slice(0, 6) : [];

  const conditions: SQL[] = [eq(products.status, "listed"), eq(brands.status, "active")];
  for (const term of terms) {
    // Escapa curingas do LIKE vindos da busca.
    const escaped = term.replace(/[\\%_]/g, (c) => `\\${c}`);
    conditions.push(sql`${products.searchText} like ${"%" + escaped + "%"}`);
  }
  if (filters.categoria) conditions.push(eq(categories.slug, filters.categoria));
  if (filters.marca) conditions.push(eq(brands.slug, filters.marca));
  if (filters.min != null) conditions.push(gte(effectivePrice, filters.min * 100));
  if (filters.max != null) conditions.push(lte(effectivePrice, filters.max * 100));
  if (filters.disponivel) conditions.push(eq(products.availability, "in_stock"));
  const where = and(...conditions);

  const sort = filters.ordem ?? (terms.length ? "relevancia" : "novidades");
  const orderBy =
    sort === "menor-preco"
      ? [asc(effectivePrice), asc(products.id)]
      : sort === "maior-preco"
        ? [desc(effectivePrice), asc(products.id)]
        : sort === "relevancia" && terms.length
          ? [desc(sql`similarity(${products.searchText}, ${terms.join(" ")})`), asc(products.id)]
          : [desc(products.createdAt), asc(products.id)];

  const base = db
    .select(cardColumns)
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(categories, eq(categories.id, products.categoryId));

  const [rows, [{ total }]] = await Promise.all([
    base.where(where).orderBy(...orderBy).limit(pageSize).offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(products)
      .innerJoin(brands, eq(brands.id, products.brandId))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(where),
  ]);

  return { items: rows.map(toCard), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), sort };
}

export async function listFacets() {
  const [cats, brandRows] = await Promise.all([
    db
      .select({ slug: categories.slug, name: categories.name, n: count() })
      .from(categories)
      .innerJoin(products, and(eq(products.categoryId, categories.id), eq(products.status, "listed")))
      .groupBy(categories.id)
      .orderBy(asc(categories.name)),
    db
      .select({ slug: brands.slug, name: brands.name, n: count() })
      .from(brands)
      .innerJoin(products, and(eq(products.brandId, brands.id), eq(products.status, "listed")))
      .where(eq(brands.status, "active"))
      .groupBy(brands.id)
      .orderBy(asc(brands.name)),
  ]);
  return { categories: cats, brands: brandRows };
}

export async function getProduct(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await db
    .select({
      product: products,
      brandName: brands.name,
      brandSlug: brands.slug,
      brandFictitious: brands.isFictitious,
      categoryName: categories.name,
      categorySlug: categories.slug,
    })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(eq(products.id, id))
    .limit(1);
  if (!row) return null;
  const variants = await db
    .select({ size: productVariants.size, availability: productVariants.availability })
    .from(productVariants)
    .where(eq(productVariants.productId, id))
    .orderBy(asc(productVariants.createdAt));
  return { ...row, variants };
}

export async function getProductCards(ids: string[]): Promise<ProductCard[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select(cardColumns)
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .where(inArray(products.id, ids));
  return rows.map(toCard);
}

// ---- Favoritos (sempre escopados à própria usuária) ----

export async function toggleFavorite(userId: string, productId: string): Promise<boolean> {
  const removed = await db
    .delete(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.productId, productId)))
    .returning({ productId: favorites.productId });
  if (removed.length > 0) return false;
  // Remover é sempre permitido; adicionar tem teto por hora contra automação.
  if (!(await consumeRateLimit(`favorites:user:${userId}`, RATE_LIMITS.favoritesPerUser)).ok) return false;
  const product = await db.query.products.findFirst({ where: eq(products.id, productId) });
  if (!product) throw new Error("Produto não encontrado.");
  await db.insert(favorites).values({ userId, productId }).onConflictDoNothing();
  return true;
}

export async function favoriteIds(userId: string, productIds?: string[]): Promise<Set<string>> {
  const rows = await db
    .select({ productId: favorites.productId })
    .from(favorites)
    .where(productIds ? and(eq(favorites.userId, userId), inArray(favorites.productId, productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"])) : eq(favorites.userId, userId));
  return new Set(rows.map((r) => r.productId));
}

export async function listFavorites(userId: string): Promise<ProductCard[]> {
  const rows = await db
    .select(cardColumns)
    .from(favorites)
    .innerJoin(products, eq(products.id, favorites.productId))
    .innerJoin(brands, eq(brands.id, products.brandId))
    .where(eq(favorites.userId, userId))
    .orderBy(desc(favorites.createdAt));
  return rows.map(toCard);
}

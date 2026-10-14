import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import {
  brands,
  categories,
  importRuns,
  productFeeds,
  productPriceHistory,
  products,
  productVariants,
  type ImportStats,
} from "@/lib/db/schema";
import { sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { normalizeText, slugify } from "@/lib/text";
import { assertCan, type Principal } from "@/modules/access/can";
import { recordAudit } from "@/modules/audit/service";
import { parseGoogleMerchantFeed, type FeedItem, type FeedRejection } from "./feed-parser";
import { isAllowedDomain, isAllowedImageUrl, isPublicHttpsUrl } from "./domains";

const MAX_FEED_BYTES = 50 * 1024 * 1024;
const MAX_STORED_ERRORS = 200;
// Se o feed trouxer menos da metade dos produtos ativos, provavelmente veio truncado: não despublica nada.
const MIN_SEEN_RATIO_TO_UNLIST = 0.5;
const FIXTURES_DIR = path.join(process.cwd(), "db", "fixtures");

async function loadSource(source: string): Promise<string> {
  if (source.startsWith("file:")) {
    if (env().NODE_ENV === "production") throw new Error("Feeds locais não são permitidos em produção.");
    const resolved = path.resolve(FIXTURES_DIR, source.slice("file:".length));
    if (!resolved.startsWith(FIXTURES_DIR + path.sep)) throw new Error("Arquivo de feed fora de db/fixtures.");
    return readFile(resolved, "utf8");
  }
  if (!isPublicHttpsUrl(source)) throw new Error("O feed precisa usar https num endereço público.");
  // Redirecionamentos são seguidos manualmente (até 3) para validar cada destino.
  let url = source;
  let res: Response | undefined;
  for (let hop = 0; hop <= 3; hop++) {
    res = await fetch(url, { signal: AbortSignal.timeout(60_000), redirect: "manual" });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) break;
    url = new URL(location, url).toString();
    if (!isPublicHttpsUrl(url)) throw new Error("O feed redirecionou para um endereço não permitido.");
    if (hop === 3) throw new Error("O feed redirecionou vezes demais.");
  }
  if (!res) throw new Error("Falha ao baixar o feed.");
  if (!res.ok) throw new Error(`Falha ao baixar o feed: HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_FEED_BYTES) throw new Error("Feed maior que o limite de 50 MB.");
  const text = await res.text();
  if (text.length > MAX_FEED_BYTES) throw new Error("Feed maior que o limite de 50 MB.");
  return text;
}

// Feeds costumam repetir o tamanho no título de cada SKU ("Vestido Midi - P"): remove esse sufixo.
function baseTitle(item: FeedItem): string {
  if (!item.size) return item.title;
  const suffix = new RegExp(`\\s*[-–|/]\\s*(tam(anho)?\\.?\\s*)?${item.size.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
  return item.title.replace(suffix, "").trim() || item.title;
}

function categoryName(productType: string | null): string | null {
  if (!productType) return null;
  const parts = productType.split(/[>|/]/).map((p) => p.trim()).filter(Boolean);
  return parts.at(-1) ?? null;
}

type ProductGroup = {
  externalId: string;
  title: string;
  description: string | null;
  url: string;
  images: string[];
  priceCents: number;
  salePriceCents: number | null;
  currency: string;
  inStock: boolean;
  category: string | null;
  externalCategory: string | null;
  color: string | null;
  gender: string | null;
  variants: FeedItem[];
};

export function groupItems(items: FeedItem[]): ProductGroup[] {
  const groups = new Map<string, FeedItem[]>();
  for (const item of items) {
    const list = groups.get(item.groupId) ?? [];
    // SKU repetido no mesmo feed: mantém a primeira ocorrência.
    if (!list.some((v) => v.id === item.id)) list.push(item);
    groups.set(item.groupId, list);
  }
  return [...groups.entries()].map(([externalId, variants]) => {
    const first = variants[0];
    const available = variants.filter((v) => v.inStock);
    const effective = (v: FeedItem) => v.salePriceCents ?? v.priceCents;
    const cheapest = [...(available.length ? available : variants)].sort((a, b) => effective(a) - effective(b))[0];
    return {
      externalId,
      title: baseTitle(first),
      description: first.description,
      url: (available[0] ?? first).link,
      images: [...new Set(variants.flatMap((v) => v.images))].slice(0, 8),
      priceCents: cheapest.priceCents,
      salePriceCents: cheapest.salePriceCents,
      currency: first.currency,
      inStock: available.length > 0,
      category: categoryName(first.productType),
      externalCategory: first.productType,
      color: first.color,
      gender: first.gender,
      variants,
    };
  });
}

async function ensureCategory(tx: Tx, name: string, cache: Map<string, string>): Promise<string> {
  const slug = slugify(name) || "outros";
  const cached = cache.get(slug);
  if (cached) return cached;
  const [row] = await tx
    .insert(categories)
    .values({ name, slug })
    .onConflictDoUpdate({ target: categories.slug, set: { slug } })
    .returning({ id: categories.id });
  cache.set(slug, row.id);
  return row.id;
}

export type ImportResult = { runId: string; status: "succeeded" | "failed"; stats?: ImportStats; error?: string };

export async function importFeed(feedId: string, triggeredBy: string | null): Promise<ImportResult> {
  const feed = await db.query.productFeeds.findFirst({ where: eq(productFeeds.id, feedId) });
  if (!feed) throw new Error("Feed não encontrado.");
  const brand = await db.query.brands.findFirst({ where: eq(brands.id, feed.brandId) });
  if (!brand) throw new Error("Marca não encontrada.");

  const [run] = await db.insert(importRuns).values({ feedId, triggeredBy }).returning({ id: importRuns.id });
  const finish = async (status: "succeeded" | "failed", data: Partial<typeof importRuns.$inferInsert>) => {
    await db.update(importRuns).set({ status, finishedAt: new Date(), ...data }).where(eq(importRuns.id, run.id));
  };

  try {
    const xml = await loadSource(feed.source);
    const parsed = parseGoogleMerchantFeed(xml);
    const rejected: FeedRejection[] = [...parsed.rejected];
    const accepted = parsed.items.filter((item) => {
      if (!isAllowedDomain(item.link, brand.allowedDomains)) {
        rejected.push({ itemId: item.id, reason: "link fora dos domínios autorizados da marca" });
        return false;
      }
      if (!brand.isFictitious && item.images.some((u) => !isAllowedImageUrl(u, brand.allowedDomains))) {
        rejected.push({ itemId: item.id, reason: "imagem fora dos domínios da marca e de IMAGE_REMOTE_HOSTS (ou sem https)" });
        return false;
      }
      return true;
    });
    const groups = groupItems(accepted);

    const stats: ImportStats = {
      itemsRead: parsed.items.length + parsed.rejected.length,
      productsUpserted: 0,
      productsUnchanged: 0,
      variantsUpserted: 0,
      itemsRejected: rejected.length,
      productsUnlisted: 0,
      priceChanges: 0,
    };

    // Tudo ou nada: a importação inteira roda numa transação, protegida contra execuções simultâneas.
    await db.transaction(async (tx) => {
      const [{ locked }] = await tx.execute<{ locked: boolean }>(
        sql`select pg_try_advisory_xact_lock(hashtext(${"feed:" + feedId})) as locked`,
      );
      if (!locked) throw new Error("Já existe uma importação deste feed em andamento.");

      const categoryCache = new Map<string, string>();
      const now = new Date();

      for (const group of groups) {
        const categoryId = group.category ? await ensureCategory(tx, group.category, categoryCache) : null;
        const contentHash = sha256(JSON.stringify(group));
        const searchText = normalizeText([group.title, brand.name, group.category, group.color].filter(Boolean).join(" "));
        const existing = await tx.query.products.findFirst({
          where: and(eq(products.brandId, brand.id), eq(products.externalId, group.externalId)),
        });

        let productId: string;
        if (existing && existing.contentHash === contentHash) {
          await tx
            .update(products)
            .set({ lastSeenRunId: run.id, lastSeenAt: now, status: "listed" })
            .where(eq(products.id, existing.id));
          stats.productsUnchanged++;
          continue;
        }

        const values = {
          brandId: brand.id,
          externalId: group.externalId,
          title: group.title,
          description: group.description,
          categoryId,
          externalCategory: group.externalCategory,
          url: group.url,
          imageUrls: group.images,
          priceCents: group.priceCents,
          salePriceCents: group.salePriceCents,
          currency: group.currency,
          availability: group.inStock ? ("in_stock" as const) : ("out_of_stock" as const),
          status: "listed" as const,
          color: group.color,
          gender: group.gender,
          searchText,
          contentHash,
          lastSeenRunId: run.id,
          lastSeenAt: now,
        };

        if (existing) {
          await tx.update(products).set(values).where(eq(products.id, existing.id));
          productId = existing.id;
          if (existing.priceCents !== group.priceCents || existing.salePriceCents !== group.salePriceCents) {
            await tx.insert(productPriceHistory).values({ productId, priceCents: group.priceCents, salePriceCents: group.salePriceCents });
            stats.priceChanges++;
          }
        } else {
          const [created] = await tx.insert(products).values(values).returning({ id: products.id });
          productId = created.id;
          await tx.insert(productPriceHistory).values({ productId, priceCents: group.priceCents, salePriceCents: group.salePriceCents });
        }
        stats.productsUpserted++;

        for (const v of group.variants) {
          const variant = {
            size: v.size,
            color: v.color,
            availability: v.inStock ? ("in_stock" as const) : ("out_of_stock" as const),
            priceCents: v.priceCents,
            salePriceCents: v.salePriceCents,
            url: v.link,
          };
          await tx
            .insert(productVariants)
            .values({ productId, externalSku: v.id, ...variant })
            .onConflictDoUpdate({ target: [productVariants.productId, productVariants.externalSku], set: variant });
          stats.variantsUpserted++;
        }
        // SKUs que sumiram do feed ficam indisponíveis.
        const skus = group.variants.map((v) => v.id);
        await tx
          .update(productVariants)
          .set({ availability: "out_of_stock" })
          .where(and(eq(productVariants.productId, productId), notInArray(productVariants.externalSku, skus)));
      }

      // Produtos ausentes do feed saem do catálogo (mas continuam nos looks, como indisponíveis).
      const [{ listed }] = await tx.execute<{ listed: number }>(
        sql`select count(*)::int as listed from products where brand_id = ${brand.id} and status = 'listed'`,
      );
      const missing = and(
        eq(products.brandId, brand.id),
        eq(products.status, "listed"),
        or(isNull(products.lastSeenRunId), ne(products.lastSeenRunId, run.id)),
      );
      const seen = groups.length;
      if (listed > 0 && seen / listed < MIN_SEEN_RATIO_TO_UNLIST) {
        stats.unlistingSkipped = true;
      } else {
        const unlisted = await tx
          .update(products)
          .set({ status: "unlisted" })
          .where(missing)
          .returning({ id: products.id });
        stats.productsUnlisted = unlisted.length;
      }
    });

    await finish("succeeded", { stats, errors: rejected.slice(0, MAX_STORED_ERRORS) });
    return { runId: run.id, status: "succeeded", stats };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    await finish("failed", { errorMessage: message.slice(0, 500) });
    return { runId: run.id, status: "failed", error: message };
  }
}

// Disparo manual pelo painel: exige permissão e fica registrado na auditoria.
export async function triggerImport(actor: Principal, feedId: string): Promise<ImportResult> {
  assertCan(actor, "catalog.manage");
  const result = await importFeed(feedId, actor.id);
  await recordAudit({
    actorId: actor.id,
    actorRoles: actor.roles,
    action: "catalog.import_triggered",
    entityType: "product_feed",
    entityId: feedId,
    after: { runId: result.runId, status: result.status, stats: result.stats ?? null },
  });
  return result;
}

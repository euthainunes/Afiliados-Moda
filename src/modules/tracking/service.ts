import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, campaigns, clicks, looks, products, trackingLinks, type TrackingConfig } from "@/lib/db/schema";
import { isAllowedDomain } from "@/modules/catalog/domains";
import { consumeRateLimit } from "@/modules/identity/rate-limit";
import { ulid } from "./ids";
import { reportError } from "@/lib/observability";

// Agentes de pré-visualização de links e robôs: o clique é registrado como robô e não recebe click_id.
const BOT_UA = /bot|crawler|spider|slurp|facebookexternalhit|whatsapp|telegram|discord|preview|embedly|curl|wget|python-requests/i;
const CLICKS_PER_IP_PER_MINUTE = 60;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  return !ua || BOT_UA.test(ua);
}

// Monta a URL de destino com os parâmetros configurados para a marca.
// Atenção (docs/05 §6): a preservação desses parâmetros até o pedido NÃO é presumida; depende de teste E2E na loja real.
export function buildDestination(productUrl: string, config: TrackingConfig, values: { clickId: string | null; campaign: string | null }) {
  const url = new URL(productUrl);
  for (const [key, template] of Object.entries(config.params ?? {})) {
    if (template.includes("{click_id}") && !values.clickId) continue;
    if (template.includes("{campaign}") && !values.campaign) continue;
    url.searchParams.set(key, template.replace("{click_id}", values.clickId ?? "").replace("{campaign}", values.campaign ?? ""));
  }
  return url.toString();
}

export type ClickContext = {
  ipHash: string | null;
  uaHash: string | null;
  userAgent: string | null;
  referrer: string | null;
  viewerUserId: string | null;
};

function referrerDomain(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.slice(0, 100);
  } catch {
    return null;
  }
}

// Resolve o destino de /r/{code} e registra o clique. Retorna null se o código não existir
// ou se o destino não for permitido. Falhas no registro nunca impedem o redirecionamento.
export async function resolveClick(code: string, ctx: ClickContext): Promise<{ url: string; clickId: string | null } | null> {
  if (!/^[0-9A-Za-z]{10}$/.test(code)) return null;
  const [row] = await db
    .select({
      link: trackingLinks,
      productUrl: products.url,
      productStatus: products.status,
      lookStatus: looks.status,
      brand: brands,
    })
    .from(trackingLinks)
    .innerJoin(products, eq(products.id, trackingLinks.productId))
    .innerJoin(looks, eq(looks.id, trackingLinks.lookId))
    .innerJoin(brands, eq(brands.id, products.brandId))
    .where(eq(trackingLinks.code, code))
    .limit(1);
  if (!row) return null;
  if (!isAllowedDomain(row.productUrl, row.brand.allowedDomains)) return null;

  const plain = row.productUrl;
  // Só looks publicados geram cliques atribuíveis; nos demais casos a pessoa segue para a loja sem rastreamento.
  if (row.lookStatus !== "published" || row.brand.status !== "active") return { url: plain, clickId: null };

  try {
    const bot = isBotUserAgent(ctx.userAgent);
    if (ctx.ipHash) {
      const limit = await consumeRateLimit(`click:ip:${ctx.ipHash}`, { limit: CLICKS_PER_IP_PER_MINUTE, windowSec: 60 });
      if (!limit.ok) return { url: plain, clickId: null };
    }
    const now = new Date();
    const [campaign] = await db
      .select({ id: campaigns.id, slug: campaigns.slug })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.brandId, row.brand.id),
          eq(campaigns.status, "active"),
          lte(campaigns.startsAt, now),
          or(isNull(campaigns.endsAt), gte(campaigns.endsAt, now)),
        ),
      )
      .orderBy(desc(campaigns.startsAt))
      .limit(1);

    const clickId = bot ? null : ulid();
    const url = buildDestination(plain, row.brand.trackingConfig, { clickId, campaign: campaign?.slug ?? null });
    await db.insert(clicks).values({
      clickId: clickId ?? `bot-${ulid()}`,
      trackingLinkId: row.link.id,
      userId: row.link.userId,
      lookId: row.link.lookId,
      productId: row.link.productId,
      brandId: row.brand.id,
      campaignId: campaign?.id ?? null,
      ipHash: ctx.ipHash,
      uaHash: ctx.uaHash,
      referrerDomain: referrerDomain(ctx.referrer),
      isBot: bot,
      isSelfClick: ctx.viewerUserId === row.link.userId,
      destinationUrl: url,
    });
    return { url, clickId };
  } catch (error) {
    reportError(error, { event: "rastreamento.falha_clique", link: code });
    return { url: plain, clickId: null };
  }
}

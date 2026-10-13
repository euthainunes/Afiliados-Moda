import { XMLParser } from "fast-xml-parser";
import { parsePrice } from "@/lib/money";

// Leitor de feed no formato Google Merchant (RSS 2.0 com namespace g:), formato comum de exportação de lojas VTEX.
// O formato real da Suntime ainda precisa ser confirmado (docs/06): outros formatos entram como novos leitores.

export type FeedItem = {
  id: string;
  groupId: string;
  title: string;
  description: string | null;
  link: string;
  images: string[];
  priceCents: number;
  salePriceCents: number | null;
  currency: string;
  inStock: boolean;
  productType: string | null;
  brand: string | null;
  color: string | null;
  size: string | null;
  gender: string | null;
};

export type FeedRejection = { itemId: string; reason: string };

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
  isArray: (name) => name === "item" || name === "additional_image_link",
  processEntities: true,
});

function str(value: unknown): string | null {
  if (value == null) return null;
  const s = String(typeof value === "object" ? "" : value).trim();
  return s.length > 0 ? s : null;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function parseGoogleMerchantFeed(xml: string): { items: FeedItem[]; rejected: FeedRejection[] } {
  const doc = parser.parse(xml);
  const rawItems: Record<string, unknown>[] = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? [];
  if (!Array.isArray(rawItems)) throw new Error("Feed sem itens reconhecíveis (esperado rss > channel > item).");

  const items: FeedItem[] = [];
  const rejected: FeedRejection[] = [];

  for (const raw of rawItems) {
    const id = str(raw.id);
    const reject = (reason: string) => rejected.push({ itemId: id ?? "(sem id)", reason });
    if (!id) {
      reject("item sem g:id");
      continue;
    }
    const title = str(raw.title);
    const link = str(raw.link);
    const image = str(raw.image_link);
    const price = parsePrice(str(raw.price));
    const sale = parsePrice(str(raw.sale_price));
    if (!title) {
      reject("sem título");
      continue;
    }
    if (!link || !isHttpsUrl(link)) {
      reject("link ausente ou sem https");
      continue;
    }
    if (!image || !isHttpsUrl(image) && !image.startsWith("/")) {
      reject("imagem ausente ou sem https");
      continue;
    }
    if (!price) {
      reject("preço inválido");
      continue;
    }
    const additional = ((raw.additional_image_link as unknown[]) ?? [])
      .map(str)
      .filter((u): u is string => !!u && (isHttpsUrl(u) || u.startsWith("/")));

    items.push({
      id,
      groupId: str(raw.item_group_id) ?? id,
      title,
      description: str(raw.description),
      link,
      images: [image, ...additional].slice(0, 8),
      priceCents: price.cents,
      // Preço promocional só vale se for menor que o preço cheio.
      salePriceCents: sale && sale.cents < price.cents ? sale.cents : null,
      currency: price.currency,
      inStock: (str(raw.availability) ?? "").toLowerCase().replace(/_/g, " ") === "in stock",
      productType: str(raw.product_type),
      brand: str(raw.brand),
      color: str(raw.color),
      size: str(raw.size),
      gender: str(raw.gender),
    });
  }
  return { items, rejected };
}

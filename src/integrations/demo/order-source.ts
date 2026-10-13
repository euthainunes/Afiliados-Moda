import { createHash } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, clicks, products, productVariants } from "@/lib/db/schema";
import { assertDemoAllowed } from "@/lib/env";
import type { ExternalOrder, NormalizedOrderStatus, OrderSource } from "../contracts";

// LOJA DE DEMONSTRAÇÃO
// Simula a API de pedidos de uma loja para marcas FICTÍCIAS. Os pedidos são derivados de forma
// determinística dos cliques registrados (mesmo clique → mesmo pedido), e a situação de cada pedido
// avança com o tempo, como numa loja real. Supõe-se que a loja preservou o click_id — exatamente o
// que, para lojas reais, ainda precisa ser comprovado (docs/05 §6).
// Nada aqui representa pedidos, compradoras ou pagamentos reais.

const DAY = 86_400_000;
const HOUR = 3_600_000;

function bytes(seed: string): Buffer {
  return createHash("sha256").update(seed).digest();
}

type Timeline = { status: NormalizedOrderStatus; at: Date }[];

export function demoTimeline(createdAt: Date, h: Buffer, hasItems: { returnable: boolean }): Timeline {
  const timeline: Timeline = [{ status: "created", at: createdAt }];
  const at = (days: number) => new Date(createdAt.getTime() + days * DAY);
  const canceled = h[6] < 26; // ~10%
  if (canceled) {
    timeline.push({ status: "canceled", at: at(1) });
    return timeline;
  }
  timeline.push({ status: "paid", at: at(0.25) }, { status: "invoiced", at: at(2) }, { status: "delivered", at: at(6) });
  if (hasItems.returnable && h[7] < 13) timeline.push({ status: "returned", at: at(12) }); // ~5%
  return timeline;
}

export class DemoOrderSource implements OrderSource {
  readonly provider = "demo";
  readonly isDemo = true;

  constructor(
    private readonly brandId: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    assertDemoAllowed("Fonte de pedidos de demonstração");
  }

  private async build(sinceClicks: Date): Promise<ExternalOrder[]> {
    const brand = await db.query.brands.findFirst({ where: eq(brands.id, this.brandId) });
    if (!brand?.isFictitious) throw new Error("A loja de demonstração só atende marcas fictícias.");
    const now = this.now();

    const rows = await db
      .select({ click: clicks, product: products })
      .from(clicks)
      .innerJoin(products, eq(products.id, clicks.productId))
      .where(and(eq(clicks.brandId, this.brandId), eq(clicks.isBot, false), gte(clicks.occurredAt, sinceClicks)));
    const catalog = await db.select().from(products).where(eq(products.brandId, this.brandId));
    const variants = await db.select().from(productVariants);
    const skuOf = (productId: string, pick: number) => {
      const list = variants.filter((v) => v.productId === productId);
      return list.length ? list[pick % list.length].externalSku : `${productId.slice(0, 8)}-UN`;
    };

    const orders: ExternalOrder[] = [];
    for (const { click, product } of rows) {
      const h = bytes(click.clickId);
      if (h[0] >= 72) continue; // ~28% dos cliques viram pedido
      const createdAt = new Date(click.occurredAt.getTime() + (1 + (h[1] % 70)) * HOUR);
      if (createdAt > now) continue;

      const price = (p: typeof product) => p.salePriceCents ?? p.priceCents;
      const items = [
        {
          externalSku: skuOf(product.id, h[8]),
          title: product.title,
          quantity: h[2] < 40 ? 2 : 1,
          unitPriceCents: price(product),
          listPriceCents: product.priceCents,
          discountCents: 0,
          returnedQuantity: 0,
        },
      ];
      if (h[4] < 70 && catalog.length > 1) {
        const extra = catalog[h[3] % catalog.length];
        if (extra.id !== product.id) {
          items.push({ externalSku: skuOf(extra.id, h[9]), title: extra.title, quantity: 1, unitPriceCents: price(extra), listPriceCents: extra.priceCents, discountCents: 0, returnedQuantity: 0 });
        }
      }
      if (h[5] < 50) {
        // Cupom fictício de 10% no primeiro item.
        items[0].discountCents = Math.round(items[0].unitPriceCents * items[0].quantity * 0.1);
      }

      const timeline = demoTimeline(createdAt, h, { returnable: true }).filter((t) => t.at <= now);
      const last = timeline[timeline.length - 1];
      if (last.status === "returned") items[items.length - 1].returnedQuantity = 1;
      const subtotal = items.reduce((s, i) => s + i.unitPriceCents * i.quantity - i.discountCents, 0);

      orders.push({
        externalId: `DEMO-${h.subarray(10, 16).toString("hex").toUpperCase()}`,
        createdAt,
        status: last.status,
        statusRaw: `demo-${last.status}`,
        statusChangedAt: last.at,
        statusHistory: timeline.map((t) => ({ status: t.status, statusRaw: `demo-${t.status}`, at: t.at })),
        currency: "BRL",
        items,
        shippingCents: subtotal >= 29_900 ? 0 : 1_990,
        attribution: { clickId: click.clickId, method: "demo_click_id", raw: { utmi_cp: click.clickId } },
        isTest: false,
      });
    }
    return orders;
  }

  async fetchOrdersUpdatedSince(since: Date): Promise<ExternalOrder[]> {
    // Cliques dos últimos 180 dias cobrem todos os pedidos que ainda podem mudar de situação.
    const all = await this.build(new Date(this.now().getTime() - 180 * DAY));
    return all.filter((o) => o.statusChangedAt >= since || o.createdAt >= since);
  }

  async getOrder(externalId: string): Promise<ExternalOrder | null> {
    const all = await this.build(new Date(this.now().getTime() - 180 * DAY));
    return all.find((o) => o.externalId === externalId) ?? null;
  }
}

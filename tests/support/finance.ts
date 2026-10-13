import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns, clicks, commissionRules, integrations } from "@/lib/db/schema";
import type { ExternalOrder } from "@/integrations/contracts";
import { addItem, createLook, publishLook, updateDetails, getPublicLook } from "@/modules/looks/service";
import { upsertExternalOrder } from "@/modules/orders/sync";
import { processOrderConversion } from "@/modules/finance/conversions";
import { resolveClick } from "@/modules/tracking/service";
import { createBrandWithFeed, createUser, productBySku } from "./factories";

export const DAY = 86_400_000;
const BROWSER = "Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0 Safari/537.36";

// Cenário FICTÍCIO completo: marca, campanha ativa, regra aprovada 25/20/5 válida desde 120 dias atrás,
// criadora com look publicado e integração de pedidos de demonstração.
export async function financeScenario(opts: { requireBrandPayment?: boolean; waitDays?: number; startEvent?: "order_created" | "order_invoiced" | "order_delivered" } = {}) {
  const t = await createBrandWithFeed(
    [
      { sku: "A", title: "Vestido Teste", price: "200.00 BRL" },
      { sku: "B", title: "Bolsa Teste", price: "100.00 BRL" },
    ],
    { trackingParams: { utmi_cp: "{click_id}" } },
  );
  await t.importNow();
  const admin = await createUser({ roles: ["user", "admin"] });
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.brandId, t.brand.id));
  await db.update(campaigns).set({ startsAt: new Date(Date.now() - 200 * DAY) }).where(eq(campaigns.id, campaign.id));
  const [rule] = await db
    .insert(commissionRules)
    .values({
      campaignId: campaign.id,
      version: 1,
      status: "approved",
      baseType: "item_net_paid",
      commissionBps: 2500,
      userShareBps: 2000,
      platformShareBps: 500,
      attributionWindowDays: 7,
      eligibilityPolicy: { startEvent: opts.startEvent ?? "order_invoiced", waitDays: opts.waitDays ?? 30, requireBrandPaymentReceived: opts.requireBrandPayment ?? false },
      validFrom: new Date(Date.now() - 120 * DAY),
      contractReference: "DEMONSTRAÇÃO — sem contrato",
      proposedBy: admin.id,
      reviewedBy: admin.id,
      reviewedAt: new Date(),
    })
    .returning();
  const creator = await createUser();
  const productA = await productBySku(t.brand.id, "A");
  const productB = await productBySku(t.brand.id, "B");
  const lookId = await createLook(creator.id, productA.id);
  await addItem(creator.id, lookId, productB.id);
  await updateDetails(creator.id, lookId, { title: "Look financeiro" });
  const pub = await publishLook(creator.id, lookId);
  if (!pub.ok) throw new Error("falha ao publicar");
  const look = await getPublicLook(pub.slug);
  const [integration] = await db.insert(integrations).values({ kind: "order_source", provider: "demo", brandId: t.brand.id, name: "Pedidos teste", mode: "demo" }).returning();

  // Gera um clique real pelo redirecionador e, opcionalmente, o move no tempo.
  const click = async ({ daysAgo = 0, viewerUserId = null as string | null } = {}) => {
    const r = await resolveClick(look!.items[0].trackingCode!, { ipHash: `ip-${Math.random()}`, uaHash: "ua", userAgent: BROWSER, referrer: null, viewerUserId });
    if (!r?.clickId) throw new Error("clique não registrado");
    if (daysAgo) await db.update(clicks).set({ occurredAt: new Date(Date.now() - daysAgo * DAY) }).where(eq(clicks.clickId, r.clickId));
    return r.clickId;
  };

  let seq = 0;
  // Pedido fictício da "loja" com 1x Vestido (R$ 200) e 1x Bolsa (R$ 100).
  const order = (clickId: string | null, over: Partial<ExternalOrder> = {}): ExternalOrder => {
    const createdAt = over.createdAt ?? new Date(Date.now() - 1 * DAY);
    return {
      externalId: over.externalId ?? `T-${Date.now()}-${seq++}`,
      createdAt,
      status: "created",
      statusRaw: "created",
      statusChangedAt: createdAt,
      statusHistory: [{ status: "created", statusRaw: "created", at: createdAt }],
      currency: "BRL",
      items: [
        { externalSku: "A", title: "Vestido Teste", quantity: 1, unitPriceCents: 20000, listPriceCents: 20000, discountCents: 0, returnedQuantity: 0 },
        { externalSku: "B", title: "Bolsa Teste", quantity: 1, unitPriceCents: 10000, listPriceCents: 10000, discountCents: 0, returnedQuantity: 0 },
      ],
      shippingCents: 1990,
      attribution: { clickId, method: "teste" },
      isTest: false,
      ...over,
    };
  };

  const ingest = async (o: ExternalOrder) =>
    db.transaction(async (tx) => {
      const r = await upsertExternalOrder(tx, t.brand.id, integration.id, o, true);
      const outcome = r.status === "unchanged" ? null : await processOrderConversion(tx, r.orderId);
      return { ...r, outcome };
    });

  return { t, admin, campaign, rule, creator, lookId, look: look!, integration, click, order, ingest };
}

// Avança a situação de um pedido acrescentando eventos ao histórico.
export function withStatus(o: ExternalOrder, steps: { status: ExternalOrder["status"]; daysAfter: number }[]): ExternalOrder {
  const history = [...o.statusHistory];
  for (const s of steps) history.push({ status: s.status, statusRaw: s.status, at: new Date(o.createdAt.getTime() + s.daysAfter * DAY) });
  const last = history[history.length - 1];
  return { ...o, status: last.status, statusRaw: last.statusRaw, statusChangedAt: last.at, statusHistory: history };
}

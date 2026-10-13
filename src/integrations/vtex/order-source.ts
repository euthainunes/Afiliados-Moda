import type { ExternalOrder, ExternalOrderItem, NormalizedOrderStatus, OrderSource } from "../contracts";
import { HttpError, IntegrationConfigError, throttle, withRetry } from "../errors";

// ADAPTADOR VTEX (OMS) — PREPARADO, NÃO VALIDADO EM LOJA REAL.
// Usa a API de pedidos documentada publicamente pela VTEX (listagem e detalhe de pedidos, autenticação por
// X-VTEX-API-AppKey / X-VTEX-API-AppToken). Antes de ativar em modo "live", é obrigatório (docs/05 §6):
//   1. Auditoria técnica com a Suntime (conta, ambiente, perfil de acesso mínimo, mecanismo de notificação).
//   2. Confirmar em qual campo do pedido o identificador de clique é preservado (configurável em `clickIdField`).
//   3. Validar o mapeamento de situações e de devoluções com pedidos de teste.
// Nenhum desses pontos é presumido aqui; o mapeamento abaixo é isolado e coberto por testes com dados de exemplo.

export type VtexConfig = {
  account: string; // nome da conta VTEX
  environment: string; // ex.: "vtexcommercestable"
  clickIdField: string; // campo de marketingData com o click_id (ex.: "utmiCampaign"), a validar
  appKey: string;
  appToken: string;
};

type VtexItem = { id: string; name?: string; quantity: number; sellingPrice: number; listPrice?: number; price?: number };
type VtexOrder = {
  orderId: string;
  creationDate: string;
  status: string;
  lastChange?: string;
  isTest?: boolean;
  items?: VtexItem[];
  totals?: { id: string; value: number }[];
  marketingData?: Record<string, string | null> | null;
};

// Situações da VTEX → situação normalizada. Devoluções não são inferidas daqui (dependem de validação).
export function mapVtexStatus(status: string): NormalizedOrderStatus {
  switch (status) {
    case "canceled":
      return "canceled";
    case "invoiced":
      return "invoiced";
    case "payment-approved":
    case "ready-for-handling":
    case "start-handling":
    case "handling":
    case "window-to-cancel":
      return "paid";
    default:
      return "created";
  }
}

export function mapVtexOrder(o: VtexOrder, clickIdField: string): ExternalOrder {
  const status = mapVtexStatus(o.status);
  const items: ExternalOrderItem[] = (o.items ?? []).map((i) => {
    const list = i.listPrice ?? i.price ?? i.sellingPrice;
    return {
      externalSku: String(i.id),
      title: i.name ?? null,
      quantity: i.quantity,
      unitPriceCents: i.sellingPrice,
      listPriceCents: list,
      discountCents: Math.max(0, (i.price ?? i.sellingPrice) - i.sellingPrice) * i.quantity,
      returnedQuantity: 0,
    };
  });
  const shipping = o.totals?.find((t) => t.id === "Shipping")?.value ?? 0;
  const marketing = Object.fromEntries(Object.entries(o.marketingData ?? {}).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const clickId = marketing[clickIdField];
  const changedAt = new Date(o.lastChange ?? o.creationDate);
  return {
    externalId: o.orderId,
    createdAt: new Date(o.creationDate),
    status,
    statusRaw: o.status,
    statusChangedAt: changedAt,
    statusHistory: [{ status, statusRaw: o.status, at: changedAt }],
    currency: "BRL",
    items,
    shippingCents: shipping,
    attribution: { clickId: clickId && /^[0-9A-Z]{26}$/.test(clickId) ? clickId : null, method: `vtex_marketing_data.${clickIdField}`, raw: marketing },
    isTest: !!o.isTest,
  };
}

export class VtexOrderSource implements OrderSource {
  readonly provider = "vtex";
  readonly isDemo = false;
  private readonly wait = throttle(250); // no máximo ~4 requisições por segundo

  constructor(private readonly config: VtexConfig) {
    if (!/^[a-z0-9-]+$/.test(config.account)) throw new IntegrationConfigError("Conta VTEX inválida.");
    if (!/^[a-z0-9-]+$/.test(config.environment)) throw new IntegrationConfigError("Ambiente VTEX inválido.");
    if (!config.appKey || !config.appToken) throw new IntegrationConfigError("Credenciais VTEX ausentes.");
  }

  private async request<T>(path: string): Promise<T> {
    const url = `https://${this.config.account}.${this.config.environment}.com.br${path}`;
    const { value } = await withRetry(async () => {
      await this.wait();
      const res = await fetch(url, {
        headers: { Accept: "application/json", "X-VTEX-API-AppKey": this.config.appKey, "X-VTEX-API-AppToken": this.config.appToken },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const retryAfter = Number(res.headers.get("retry-after")) * 1000 || undefined;
        throw new HttpError(res.status, `VTEX respondeu HTTP ${res.status} em ${path.split("?")[0]}`, retryAfter);
      }
      return (await res.json()) as T;
    });
    return value;
  }

  async getOrder(externalId: string): Promise<ExternalOrder | null> {
    try {
      const o = await this.request<VtexOrder>(`/api/oms/pvt/orders/${encodeURIComponent(externalId)}`);
      return mapVtexOrder(o, this.config.clickIdField);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return null;
      throw error;
    }
  }

  async fetchOrdersUpdatedSince(since: Date): Promise<ExternalOrder[]> {
    // A listagem traz resumos; o detalhe de cada pedido é buscado para obter itens e marketingData.
    const to = new Date().toISOString();
    const ids: string[] = [];
    for (let page = 1; page <= 30; page++) {
      const q = new URLSearchParams({ f_creationDate: `creationDate:[${since.toISOString()} TO ${to}]`, page: String(page), per_page: "100" });
      const res = await this.request<{ list: { orderId: string }[]; paging?: { pages: number } }>(`/api/oms/pvt/orders?${q}`);
      ids.push(...res.list.map((o) => o.orderId));
      if (!res.paging || page >= res.paging.pages) break;
    }
    const orders: ExternalOrder[] = [];
    for (const id of ids) {
      const order = await this.getOrder(id);
      if (order) orders.push(order);
    }
    return orders;
  }
}

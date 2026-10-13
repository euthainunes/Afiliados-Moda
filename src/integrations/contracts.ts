// Contratos das integrações externas. Serviços e páginas dependem só destes tipos;
// a escolha entre demonstração e serviço real fica no registro (registry.ts).

export type NormalizedOrderStatus = "created" | "paid" | "invoiced" | "delivered" | "canceled" | "returned";

export type ExternalOrderItem = {
  externalSku: string;
  title: string | null;
  quantity: number;
  unitPriceCents: number; // preço pago por unidade (após descontos do item)
  listPriceCents: number; // preço de tabela por unidade
  discountCents: number; // desconto total do item
  returnedQuantity: number;
};

export type ExternalOrder = {
  externalId: string;
  createdAt: Date;
  status: NormalizedOrderStatus;
  statusRaw: string;
  statusChangedAt: Date;
  // Transições conhecidas (quando a fonte informa); usadas para datar faturamento e entrega.
  statusHistory: { status: NormalizedOrderStatus; statusRaw: string; at: Date }[];
  currency: string;
  items: ExternalOrderItem[];
  shippingCents: number;
  // Evidência de origem lida do pedido. Sem evidência, a venda NÃO é atribuída.
  attribution: { clickId: string | null; method: string; raw?: Record<string, string> };
  isTest: boolean;
};

export interface OrderSource {
  readonly provider: string;
  readonly isDemo: boolean;
  // Pedidos criados ou alterados desde `since` (inclusive).
  fetchOrdersUpdatedSince(since: Date): Promise<ExternalOrder[]>;
  getOrder(externalId: string): Promise<ExternalOrder | null>;
}

export type OutgoingEmail = { to: string; subject: string; text: string };

export interface EmailProvider {
  readonly provider: string;
  send(mail: OutgoingEmail): Promise<{ id: string | null }>;
}

// Pagamento de resgates. No MVP o pagamento é manual (PIX feito fora da plataforma) e apenas registrado.
export interface PayoutProvider {
  readonly provider: string;
  readonly isDemo: boolean;
  // Valida o comprovante informado (ou gera o marcador de simulação, em demonstração).
  confirmPayment(input: { payoutRequestId: string; amountCents: number; reference: string | null }): Promise<{ reference: string; simulated: boolean }>;
}

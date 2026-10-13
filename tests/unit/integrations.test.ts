import { describe, expect, it, vi } from "vitest";
import { fictitiousCpf } from "@/demo/seed";
import { demoTimeline } from "@/integrations/demo/order-source";
import { HttpError, IntegrationConfigError, withRetry } from "@/integrations/errors";
import { mapVtexOrder, mapVtexStatus, VtexOrderSource } from "@/integrations/vtex/order-source";
import { baseAmount, divRoundHalfEven, splitCommission } from "@/modules/finance/calc";
import { isValidCpf } from "@/modules/finance/operations";

describe("cálculo financeiro", () => {
  it("arredonda meio para o par sem ponto flutuante", () => {
    expect(divRoundHalfEven(25n, 10n)).toBe(2n);
    expect(divRoundHalfEven(35n, 10n)).toBe(4n);
    expect(divRoundHalfEven(26n, 10n)).toBe(3n);
    expect(divRoundHalfEven(-25n, 10n)).toBe(-2n);
  });

  it("divide R$ 100 em 25 / 20 / 5 e mantém usuária + plataforma = comissão em qualquer valor", () => {
    expect(splitCommission(10_000, { commissionBps: 2500, userShareBps: 2000 })).toEqual({ baseCents: 10_000, commissionCents: 2500, userCents: 2000, platformCents: 500 });
    for (const base of [1, 3, 7, 99, 101, 12_345, 99_999, 1_000_003]) {
      const s = splitCommission(base, { commissionBps: 2500, userShareBps: 2000 });
      expect(s.userCents + s.platformCents).toBe(s.commissionCents);
      expect(s.platformCents).toBeGreaterThanOrEqual(0);
    }
  });

  it("calcula a base líquida, retirando devoluções com desconto proporcional; frete nunca entra", () => {
    const items = [
      { quantity: 2, returnedQuantity: 1, unitPriceCents: 10_000, listPriceCents: 12_000, discountCents: 2_000 },
      { quantity: 1, returnedQuantity: 0, unitPriceCents: 5_000, listPriceCents: 5_000, discountCents: 0 },
    ];
    expect(baseAmount(items, "item_net_paid", 1990)).toBe(10_000 - 1_000 + 5_000);
    expect(baseAmount(items, "item_list_price")).toBe(12_000 + 5_000);
  });
});

describe("integrações", () => {
  it("repete apenas erros transitórios", async () => {
    const transient = vi.fn().mockRejectedValueOnce(new HttpError(503, "fora")).mockResolvedValue("ok");
    expect(await withRetry(transient, { baseDelayMs: 1 })).toEqual({ value: "ok", attempts: 2 });
    const permanent = vi.fn().mockRejectedValue(new HttpError(401, "credencial inválida"));
    await expect(withRetry(permanent, { baseDelayMs: 1 })).rejects.toThrow("credencial inválida");
    expect(permanent).toHaveBeenCalledTimes(1);
    const always = vi.fn().mockRejectedValue(new HttpError(429, "limite"));
    await expect(withRetry(always, { attempts: 3, baseDelayMs: 1 })).rejects.toThrow("limite");
    expect(always).toHaveBeenCalledTimes(3);
  });

  it("mapeia pedido VTEX (exemplo baseado na documentação pública, não em loja real)", () => {
    const o = mapVtexOrder(
      {
        orderId: "1234567890-01",
        creationDate: "2026-09-01T12:00:00.000Z",
        status: "invoiced",
        lastChange: "2026-09-03T10:00:00.000Z",
        items: [{ id: "SKU1", name: "Vestido", quantity: 2, price: 10000, listPrice: 12000, sellingPrice: 9000 }],
        totals: [{ id: "Items", value: 20000 }, { id: "Discounts", value: -2000 }, { id: "Shipping", value: 1500 }],
        marketingData: { utmSource: "afiliadosmoda", utmiCampaign: "01HZXABCDEFGHJKMNPQRSTVWXY" },
      },
      "utmiCampaign",
    );
    expect(o).toMatchObject({ externalId: "1234567890-01", status: "invoiced", shippingCents: 1500, attribution: { clickId: "01HZXABCDEFGHJKMNPQRSTVWXY" } });
    expect(o.items[0]).toMatchObject({ externalSku: "SKU1", quantity: 2, unitPriceCents: 9000, listPriceCents: 12000, discountCents: 2000 });
    // identificador fora do formato esperado não é aceito como evidência
    expect(mapVtexOrder({ orderId: "x", creationDate: "2026-09-01T00:00:00Z", status: "handling", marketingData: { utmiCampaign: "qualquer" } }, "utmiCampaign").attribution.clickId).toBeNull();
    expect(mapVtexStatus("canceled")).toBe("canceled");
    expect(mapVtexStatus("payment-pending")).toBe("created");
  });

  it("não cria o adaptador VTEX sem configuração e credenciais", () => {
    expect(() => new VtexOrderSource({ account: "", environment: "vtexcommercestable", clickIdField: "x", appKey: "a", appToken: "b" })).toThrow(IntegrationConfigError);
    expect(() => new VtexOrderSource({ account: "loja", environment: "vtexcommercestable", clickIdField: "x", appKey: "", appToken: "" })).toThrow(IntegrationConfigError);
  });

  it("a linha do tempo da loja de demonstração é determinística e coerente", () => {
    const created = new Date("2026-01-10T00:00:00Z");
    const h = Buffer.alloc(32, 200);
    const t = demoTimeline(created, h, { returnable: true });
    expect(t.map((s) => s.status)).toEqual(["created", "paid", "invoiced", "delivered"]);
    const canceled = demoTimeline(created, Buffer.from([...Array(6).fill(0), 1, ...Array(25).fill(0)]), { returnable: true });
    expect(canceled.map((s) => s.status)).toEqual(["created", "canceled"]);
  });

  it("CPFs fictícios da demonstração têm dígitos verificadores válidos", () => {
    for (let i = 1; i < 20; i++) expect(isValidCpf(fictitiousCpf(i))).toBe(true);
    expect(isValidCpf("123.456.789-00")).toBe(false);
  });
});

import type { RuleSnapshot } from "@/lib/db/schema";

// Divisão inteira com arredondamento "meio para o par" (bancário), sem ponto flutuante.
export function divRoundHalfEven(numerator: bigint, denominator: bigint): bigint {
  const q = numerator / denominator;
  const r = numerator % denominator;
  const twice = 2n * (r < 0n ? -r : r);
  if (twice < denominator) return q;
  if (twice > denominator) return q + (numerator < 0n ? -1n : 1n);
  return q % 2n === 0n ? q : q + (numerator < 0n ? -1n : 1n);
}

export type CalcItem = { quantity: number; returnedQuantity: number; unitPriceCents: number; listPriceCents: number; discountCents: number };

// Base de cálculo conforme o tipo definido na regra (decisão D1). Itens devolvidos saem da base,
// proporcionalmente (o desconto do item é rateado pela quantidade).
export function baseAmount(items: CalcItem[], baseType: string, orderShippingCents = 0): number {
  let total = 0n;
  for (const i of items) {
    const kept = BigInt(i.quantity - i.returnedQuantity);
    if (kept <= 0n) continue;
    const qty = BigInt(i.quantity);
    if (baseType === "item_list_price") {
      total += BigInt(i.listPriceCents) * kept;
    } else {
      const gross = BigInt(i.unitPriceCents) * kept;
      const discount = divRoundHalfEven(BigInt(i.discountCents) * kept, qty);
      total += gross - discount;
    }
  }
  // "order_total_excl_shipping" usa os mesmos itens líquidos; o frete nunca entra na base.
  void orderShippingCents;
  return Number(total < 0n ? 0n : total);
}

export type Split = { baseCents: number; commissionCents: number; userCents: number; platformCents: number };

// Comissão e parcela da usuária arredondadas; a plataforma fica com a diferença,
// garantindo usuária + plataforma = comissão em todos os casos.
export function splitCommission(baseCents: number, rule: Pick<RuleSnapshot, "commissionBps" | "userShareBps">): Split {
  const base = BigInt(baseCents);
  const commission = divRoundHalfEven(base * BigInt(rule.commissionBps), 10_000n);
  const user = divRoundHalfEven(base * BigInt(rule.userShareBps), 10_000n);
  const userCapped = user > commission ? commission : user;
  return { baseCents, commissionCents: Number(commission), userCents: Number(userCapped), platformCents: Number(commission - userCapped) };
}

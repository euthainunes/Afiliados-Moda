const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatCents(cents: number, currency = "BRL"): string {
  if (currency === "BRL") return brl.format(cents / 100);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}

// Converte textos de preço de feeds ("199.90 BRL", "1.299,90 BRL", "R$ 89,90") em centavos inteiros,
// sem passar por ponto flutuante. Retorna null se o valor for inválido.
export function parsePrice(raw: string | undefined | null): { cents: number; currency: string } | null {
  if (!raw) return null;
  const text = String(raw).trim();
  const currency = text.match(/\b([A-Z]{3})\b/)?.[1] ?? "BRL";
  const numeric = text.replace(/[A-Z]{3}|R\$|\s/g, "");
  if (!/^\d[\d.,]*$/.test(numeric)) return null;

  const lastDot = numeric.lastIndexOf(".");
  const lastComma = numeric.lastIndexOf(",");
  // Separador decimal: o último separador, exceto quando é um ponto seguido de exatamente 3 dígitos ("1.299").
  const decimalAt =
    lastDot >= 0 && lastComma >= 0
      ? Math.max(lastDot, lastComma)
      : lastComma >= 0
        ? lastComma
        : lastDot >= 0 && numeric.length - lastDot - 1 !== 3
          ? lastDot
          : -1;
  const integerRaw = decimalAt >= 0 ? numeric.slice(0, decimalAt) : numeric;
  const fraction = decimalAt >= 0 ? numeric.slice(decimalAt + 1) : "";
  // Separadores de milhar só são aceitos em grupos de 3 dígitos ("1.299.000"); "1,2,3" é ambíguo e rejeitado.
  if (/[.,]/.test(integerRaw) && !/^\d{1,3}([.,]\d{3})+$/.test(integerRaw)) return null;
  const integerPart = integerRaw.replace(/[.,]/g, "");
  if (fraction.length > 2 || !/^\d*$/.test(integerPart + fraction)) return null;
  const cents = Number(integerPart || "0") * 100 + Number(fraction.padEnd(2, "0") || "0");
  return Number.isSafeInteger(cents) && cents > 0 ? { cents, currency } : null;
}

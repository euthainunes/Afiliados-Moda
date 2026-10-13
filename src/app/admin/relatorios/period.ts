import { toDateInput } from "@/lib/dates";

// Período do relatório a partir da URL (?de=AAAA-MM-DD&ate=AAAA-MM-DD), limitado a 366 dias. Padrão: últimos 30 dias.
export function parsePeriod(params: { de?: string; ate?: string }, now = new Date()) {
  const valid = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  const toStr = valid(params.ate) ?? toDateInput(now);
  const fromStr = valid(params.de) ?? toDateInput(new Date(now.getTime() - 29 * 86_400_000));
  const from = new Date(`${fromStr}T00:00:00-03:00`);
  const to = new Date(new Date(`${toStr}T00:00:00-03:00`).getTime() + 86_400_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > 366 * 86_400_000) {
    return parsePeriod({}, now);
  }
  return { from, to, fromStr, toStr };
}

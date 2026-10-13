import { formatCents } from "@/lib/money";
import { cn } from "@/lib/cn";

export function Price({
  priceCents,
  salePriceCents,
  currency = "BRL",
  className,
}: {
  priceCents: number;
  salePriceCents: number | null;
  currency?: string;
  className?: string;
}) {
  if (salePriceCents != null && salePriceCents < priceCents) {
    return (
      <p className={cn("flex flex-wrap items-baseline gap-x-2", className)}>
        <span className="font-semibold text-brand">{formatCents(salePriceCents, currency)}</span>
        <span className="text-sm text-muted line-through">
          <span className="sr-only">de </span>
          {formatCents(priceCents, currency)}
        </span>
      </p>
    );
  }
  return <p className={cn("font-semibold", className)}>{formatCents(priceCents, currency)}</p>;
}

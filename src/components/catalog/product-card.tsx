import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { ProductCard as Card } from "@/modules/catalog/queries";
import { Price } from "./price";
import { ProductImage } from "./product-image";

export function ProductCard({ product, href, action }: { product: Card; href?: string; action?: React.ReactNode }) {
  const body = (
    <>
      <ProductImage src={product.imageUrl} alt={product.title} sizes="(min-width: 1024px) 22vw, (min-width: 640px) 30vw, 48vw" className="rounded-lg" />
      <div className="mt-2 flex flex-col gap-0.5">
        <p className="text-xs uppercase tracking-wide text-muted">
          {product.brandName} {product.brandFictitious && <span className="normal-case">(fictícia)</span>}
        </p>
        <h3 className="line-clamp-2 text-sm font-medium">{product.title}</h3>
        <Price priceCents={product.priceCents} salePriceCents={product.salePriceCents} currency={product.currency} className="text-sm" />
        {!product.inStock && (
          <span>
            <Badge tone="warning">Esgotado</Badge>
          </span>
        )}
      </div>
    </>
  );
  return (
    <article className="relative flex flex-col">
      {href ? (
        <Link href={href} className="flex flex-col rounded-lg">
          {body}
        </Link>
      ) : (
        body
      )}
      {action && <div className="mt-2">{action}</div>}
    </article>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FavoriteButton } from "@/components/catalog/favorite-button";
import { Price } from "@/components/catalog/price";
import { ProductImage } from "@/components/catalog/product-image";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/auth/current";
import { favoriteIds, getProduct } from "@/modules/catalog/queries";
import { listMyLooks } from "@/modules/looks/service";
import { AddToLookForm } from "./add-to-look-form";

export const metadata: Metadata = { title: "Produto" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(`/app/produtos/${id}`);
  const data = await getProduct(id);
  if (!data) notFound();
  const { product, variants } = data;
  const [favs, myLooks] = await Promise.all([favoriteIds(session.user.id, [product.id]), listMyLooks(session.user.id)]);
  const editable = myLooks.filter((l) => l.look.status !== "removed" && !l.items.some((i) => i.productId === product.id));
  const available = product.status === "listed" && product.availability === "in_stock";
  const sizes = variants.filter((v) => v.size);

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="flex flex-col gap-3">
        <ProductImage src={product.imageUrls[0] ?? null} alt={product.title} sizes="(min-width: 768px) 45vw, 100vw" priority className="rounded-xl" />
        {product.imageUrls.length > 1 && (
          <div className="grid grid-cols-4 gap-2">
            {product.imageUrls.slice(1, 5).map((src) => (
              <ProductImage key={src} src={src} alt="" sizes="12vw" className="rounded-lg" />
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <nav aria-label="Trilha" className="text-sm text-muted">
          <Link href="/app/catalogo" className="hover:underline">Catálogo</Link>
          {data.categoryName && (
            <>
              {" / "}
              <Link href={`/app/catalogo?categoria=${data.categorySlug}`} className="hover:underline">{data.categoryName}</Link>
            </>
          )}
        </nav>
        <div>
          <p className="text-sm uppercase tracking-wide text-muted">
            {data.brandName} {data.brandFictitious && <Badge tone="warning">marca fictícia</Badge>}
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold">{product.title}</h1>
        </div>
        <Price priceCents={product.priceCents} salePriceCents={product.salePriceCents} currency={product.currency} className="text-xl" />
        {!available && <Alert tone="warning">{product.status === "listed" ? "Esgotado no momento." : "Esta peça saiu do catálogo da marca."}</Alert>}
        {sizes.length > 0 && (
          <div>
            <p className="text-sm font-medium">Tamanhos</p>
            <ul className="mt-2 flex flex-wrap gap-2" aria-label="Tamanhos e disponibilidade">
              {sizes.map((v) => (
                <li key={v.size} className={v.availability === "in_stock" ? "rounded-md border border-line px-3 py-1 text-sm" : "rounded-md border border-dashed border-line px-3 py-1 text-sm text-muted line-through"}>
                  {v.size}
                  {v.availability !== "in_stock" && <span className="sr-only"> (esgotado)</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {product.description && <p className="text-muted">{product.description}</p>}
        {available && <AddToLookForm productId={product.id} looks={editable.map((l) => ({ id: l.look.id, title: l.look.title }))} />}
        <div className="flex flex-wrap items-center gap-3">
          <FavoriteButton productId={product.id} active={favs.has(product.id)} />
          <p className="text-xs text-muted">Preços e estoque são informados pela marca e podem mudar.</p>
        </div>
      </div>
    </div>
  );
}

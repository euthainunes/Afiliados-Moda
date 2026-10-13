import type { Metadata } from "next";
import { FavoriteButton } from "@/components/catalog/favorite-button";
import { ProductCard } from "@/components/catalog/product-card";
import { ButtonLink } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/current";
import { listFavorites } from "@/modules/catalog/queries";

export const metadata: Metadata = { title: "Favoritos" };

export default async function FavoritesPage() {
  const session = await requireSession("/app/favoritos");
  const items = await listFavorites(session.user.id);
  return (
    <>
      <PageTitle description="Peças salvas para usar nos seus looks.">Favoritos</PageTitle>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center">
          <p className="font-medium">Você ainda não favoritou nenhuma peça.</p>
          <ButtonLink href="/app/catalogo" variant="secondary" className="mt-4">Explorar o catálogo</ButtonLink>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} href={`/app/produtos/${p.id}`} action={<FavoriteButton productId={p.id} active />} />
          ))}
        </div>
      )}
    </>
  );
}

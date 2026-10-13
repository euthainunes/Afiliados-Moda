import Link from "next/link";
import type { LookItemView } from "@/modules/looks/service";
import { ProductImage } from "@/components/catalog/product-image";

// Capa do look: colagem automática das 4 primeiras peças.
export function LookCollage({ items, sizes }: { items: LookItemView[]; sizes: string }) {
  const cover = items.slice(0, 4);
  return (
    <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-xl bg-line/40">
      {cover.map((item) => (
        <ProductImage key={item.productId} src={item.imageUrl} alt="" sizes={sizes} />
      ))}
      {Array.from({ length: Math.max(0, 4 - cover.length) }).map((_, i) => (
        <div key={`vazio-${i}`} className="aspect-[3/4] bg-line/40" />
      ))}
    </div>
  );
}

export function LookCard({
  slug,
  title,
  creator,
  items,
}: {
  slug: string;
  title: string;
  creator: { displayName: string; username: string };
  items: LookItemView[];
}) {
  return (
    <article>
      <Link href={`/l/${slug}`} className="flex flex-col gap-2 rounded-xl">
        <LookCollage items={items} sizes="(min-width: 1024px) 12vw, (min-width: 640px) 16vw, 24vw" />
        <h3 className="font-medium">{title}</h3>
      </Link>
      <p className="text-sm text-muted">
        por{" "}
        <Link href={`/perfil/${creator.username}`} className="hover:underline">
          {creator.displayName}
        </Link>{" "}
        · {items.length} peças
      </p>
    </article>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Price } from "@/components/catalog/price";
import { ProductImage } from "@/components/catalog/product-image";
import { ShareBox } from "@/components/looks/share-box";
import { Badge } from "@/components/ui/badge";
import { buttonClasses, ButtonLink } from "@/components/ui/button";
import { site } from "@/config/site";
import { env } from "@/lib/env";
import { getPublicLook } from "@/modules/looks/service";

// Renderizada a cada acesso para refletir na hora preço, estoque e despublicação.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicLook(slug);
  if (!data) return { title: "Look não encontrado", robots: { index: false } };
  const description =
    data.look.description ?? `${data.items.length} peças selecionadas por ${data.creator.displayName}. Veja e compre as peças do look.`;
  const url = `${env().APP_URL}/l/${slug}`;
  return {
    title: data.look.title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", url, title: data.look.title, description, siteName: site.name, locale: "pt_BR" },
    twitter: { card: "summary_large_image", title: data.look.title, description },
  };
}

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" });

export default async function PublicLookPage({ params }: Props) {
  const { slug } = await params;
  const data = await getPublicLook(slug);
  if (!data) notFound();
  const { look, creator, items } = data;
  const url = `${env().APP_URL}/l/${slug}`;

  return (
    <article className="mx-auto max-w-5xl px-4 py-10">
      <header className="max-w-2xl">
        <p className="text-sm text-muted">
          Look de{" "}
          <Link href={`/perfil/${creator.username}`} className="font-medium text-ink hover:underline">
            {creator.displayName}
          </Link>
          {look.publishedAt && <> · {dateFmt.format(look.publishedAt)}</>}
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">{look.title}</h1>
        {look.description && <p className="mt-3 text-lg text-muted">{look.description}</p>}
      </header>

      <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item, i) => (
          <li key={item.productId} className="flex flex-col gap-2">
            <ProductImage src={item.imageUrl} alt={item.title} sizes="(min-width: 1024px) 22vw, (min-width: 640px) 30vw, 48vw" priority={i < 2} className="rounded-lg" />
            <p className="text-xs uppercase tracking-wide text-muted">
              {item.brandName} {item.brandFictitious && <span className="normal-case">(fictícia)</span>}
            </p>
            <h2 className="text-sm font-medium">{item.title}</h2>
            {item.available ? (
              <>
                <Price priceCents={item.priceCents} salePriceCents={item.salePriceCents} currency={item.currency} className="text-sm" />
                {item.trackingCode && (
                  <a
                    href={`/r/${item.trackingCode}`}
                    target="_blank"
                    rel="sponsored nofollow noopener"
                    className={buttonClasses("primary", "sm", "mt-1")}
                    aria-label={`Ver ${item.title} na loja (abre em nova aba)`}
                  >
                    Ver na loja
                  </a>
                )}
              </>
            ) : (
              <span>
                <Badge tone="warning">Indisponível no momento</Badge>
              </span>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-8 max-w-2xl text-xs text-muted">
        Preços e disponibilidade são informados pelas lojas e podem mudar. Os links levam ao site de cada loja; quando você
        compra por eles, {creator.displayName} pode receber uma recompensa, sem custo adicional para você.{" "}
        <Link href="/regulamento" className="underline">Saiba mais</Link>.
      </p>

      <section className="mt-10 grid gap-6 rounded-2xl border border-line bg-surface p-6 sm:grid-cols-2" aria-labelledby="compartilhar">
        <div>
          <h2 id="compartilhar" className="font-display text-xl font-semibold">Gostou? Compartilhe</h2>
          <div className="mt-4">
            <ShareBox url={url} title={look.title} />
          </div>
        </div>
        <div className="flex flex-col justify-center gap-3">
          <p className="font-medium">Monte o seu também.</p>
          <p className="text-sm text-muted">Crie looks com peças reais e compartilhe com quem você quiser.</p>
          <ButtonLink href="/cadastro" variant="secondary" className="self-start">Criar meu look</ButtonLink>
        </div>
      </section>
    </article>
  );
}

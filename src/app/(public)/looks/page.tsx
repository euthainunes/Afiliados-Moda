import type { Metadata } from "next";
import { LookCard } from "@/components/looks/look-card";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { listPublishedLooks } from "@/modules/looks/service";

export const metadata: Metadata = { title: "Descobrir looks", description: "Looks montados por pessoas reais, com links para as peças." };
export const dynamic = "force-dynamic";

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ pagina?: string; link?: string }> }) {
  const { pagina, link } = await searchParams;
  const page = Math.max(1, Math.min(500, Number(pagina) || 1));
  const { looks, pages } = await listPublishedLooks({ page });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-4xl font-semibold">Descobrir looks</h1>
      <p className="mt-2 text-muted">Inspiração montada por pessoas reais, com as peças a um clique.</p>
      {link === "invalido" && (
        <div className="mt-6">
          <Alert tone="warning">Este link de produto não está mais disponível. Veja outros looks abaixo.</Alert>
        </div>
      )}
      {looks.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-line p-10 text-center">
          <p className="font-medium">Ainda não há looks publicados.</p>
          <ButtonLink href="/cadastro" className="mt-4">Seja a primeira a publicar</ButtonLink>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
          {looks.map(({ look, creator, items }) => (
            <li key={look.id}>
              <LookCard slug={look.slug!} title={look.title} creator={creator} items={items} />
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pages={pages} href={(p) => `/looks?pagina=${p}`} />
    </div>
  );
}

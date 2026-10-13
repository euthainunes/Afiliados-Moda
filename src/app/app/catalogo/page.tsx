import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/catalog/product-card";
import { Button, buttonClasses } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { requireSession } from "@/lib/auth/current";
import { catalogFiltersSchema, listFacets, searchProducts, type CatalogFilters } from "@/modules/catalog/queries";

export const metadata: Metadata = { title: "Catálogo" };

const SORT_LABELS = { relevancia: "Mais relevantes", "menor-preco": "Menor preço", "maior-preco": "Maior preço", novidades: "Novidades" } as const;

function queryString(filters: CatalogFilters, overrides: Partial<Record<keyof CatalogFilters, string | number | undefined>> = {}) {
  const params = new URLSearchParams();
  const merged = { ...filters, ...overrides } as Record<string, unknown>;
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === "" || v === false) continue;
    params.set(k, v === true ? "1" : String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

const selectClass = "h-10 rounded-lg border border-line bg-surface px-3 text-sm";

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSession("/app/catalogo");
  const filters = catalogFiltersSchema.parse(await searchParams);
  const [result, facets] = await Promise.all([searchProducts(filters), listFacets()]);
  const hasFilters = !!(filters.q || filters.categoria || filters.marca || filters.min || filters.max || filters.disponivel);

  return (
    <>
      <PageTitle description="Encontre peças para os seus looks.">Catálogo</PageTitle>

      <form method="get" className="mb-6 flex flex-col gap-3 rounded-xl border border-line bg-surface p-4" role="search">
        <div className="flex gap-2">
          <label htmlFor="q" className="sr-only">Buscar peças</label>
          <input id="q" name="q" type="search" defaultValue={filters.q} placeholder="Buscar: vestido, linho, jeans…" className="h-10 w-full rounded-lg border border-line px-3" />
          <Button type="submit" size="sm" className="h-10">Buscar</Button>
        </div>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-muted">Categoria</span>
            <select name="categoria" defaultValue={filters.categoria ?? ""} className={selectClass}>
              <option value="">Todas</option>
              {facets.categories.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name} ({c.n})</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Marca</span>
            <select name="marca" defaultValue={filters.marca ?? ""} className={selectClass}>
              <option value="">Todas</option>
              {facets.brands.map((b) => (
                <option key={b.slug} value={b.slug}>{b.name} ({b.n})</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Preço mín. (R$)</span>
            <input name="min" type="number" min={0} inputMode="numeric" defaultValue={filters.min} className={`${selectClass} w-28`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Preço máx. (R$)</span>
            <input name="max" type="number" min={0} inputMode="numeric" defaultValue={filters.max} className={`${selectClass} w-28`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Ordenar</span>
            <select name="ordem" defaultValue={filters.ordem ?? ""} className={selectClass}>
              <option value="">Padrão</option>
              {Object.entries(SORT_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className="flex h-10 items-center gap-2">
            <input type="checkbox" name="disponivel" value="1" defaultChecked={filters.disponivel} className="size-4 accent-brand" />
            Só disponíveis
          </label>
          <Button type="submit" variant="secondary" size="sm" className="h-10">Aplicar</Button>
          {hasFilters && <Link href="/app/catalogo" className={buttonClasses("ghost", "sm", "h-10")}>Limpar</Link>}
        </div>
      </form>

      <p className="mb-4 text-sm text-muted" aria-live="polite">
        {result.total.toLocaleString("pt-BR")} peça(s) encontrada(s)
      </p>

      {result.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center">
          <p className="font-medium">Nenhuma peça encontrada.</p>
          <p className="mt-1 text-sm text-muted">Tente outro termo ou remova alguns filtros.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {result.items.map((p) => (
            <ProductCard key={p.id} product={p} href={`/app/produtos/${p.id}`} />
          ))}
        </div>
      )}
      <Pagination page={result.page} pages={result.pages} href={(p) => `/app/catalogo${queryString(filters, { pagina: p })}`} />
    </>
  );
}

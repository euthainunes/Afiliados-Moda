"use client";

import { useEffect, useState } from "react";
import { Price } from "@/components/catalog/price";
import { ProductImage } from "@/components/catalog/product-image";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ProductCard } from "@/modules/catalog/queries";
import { addItemAction } from "../actions";

// Painel de busca do montador: consulta o catálogo (apenas peças disponíveis) com espera de 300 ms entre teclas.
export function ProductPicker({ lookId, excluded, full }: { lookId: string; excluded: string[]; full: boolean }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; items: ProductCard[] }>({ status: "loading", items: [] });

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState((s) => ({ ...s, status: "loading" }));
      try {
        const res = await fetch(`/api/produtos?${new URLSearchParams(query ? { q: query } : {})}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { items: ProductCard[] };
        setState({ status: "ready", items: data.items });
      } catch (error) {
        if ((error as Error).name !== "AbortError") setState({ status: "error", items: [] });
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const visible = state.items.filter((p) => !excluded.includes(p.id));

  return (
    <section aria-labelledby="buscar-pecas" className="flex flex-col gap-3">
      <h2 id="buscar-pecas" className="text-lg font-semibold">Adicionar peças</h2>
      <label htmlFor="busca-pecas" className="sr-only">Buscar peças</label>
      <input
        id="busca-pecas"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar no catálogo…"
        className="h-11 rounded-lg border border-line bg-surface px-3"
      />
      {full && <p className="text-sm text-warning">Este look atingiu o limite de peças.</p>}
      <div aria-live="polite" className="text-sm text-muted">
        {state.status === "loading" && "Buscando…"}
        {state.status === "error" && <span className="text-danger">Não foi possível buscar agora. Tente novamente.</span>}
        {state.status === "ready" && visible.length === 0 && (state.items.length > 0 ? "As peças encontradas já estão no look." : "Nenhuma peça disponível encontrada.")}
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {visible.map((p) => (
          <li key={p.id} className="flex flex-col gap-1">
            <ProductImage src={p.imageUrl} alt={p.title} sizes="(min-width: 1024px) 12vw, 30vw" className="rounded-lg" />
            <p className="line-clamp-2 text-sm font-medium">{p.title}</p>
            <Price priceCents={p.priceCents} salePriceCents={p.salePriceCents} currency={p.currency} className="text-sm" />
            <ActionForm action={addItemAction} hidden={{ lookId, productId: p.id }}>
              <SubmitButton size="sm" variant="secondary" disabled={full} pendingLabel="Adicionando…" aria-label={`Adicionar ${p.title}`}>
                + Adicionar
              </SubmitButton>
            </ActionForm>
          </li>
        ))}
      </ul>
    </section>
  );
}

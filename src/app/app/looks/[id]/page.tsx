import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Price } from "@/components/catalog/price";
import { ProductImage } from "@/components/catalog/product-image";
import { LookCollage } from "@/components/looks/look-card";
import { LookStatusBadge } from "@/components/looks/look-status";
import { ShareBox } from "@/components/looks/share-box";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireSession } from "@/lib/auth/current";
import { env } from "@/lib/env";
import { clickStatsForLook, getEditableLook, LOOK_RULES, LookError } from "@/modules/looks/service";
import { deleteDraftAction, moveItemAction, publishAction, removeItemAction, unpublishAction } from "../actions";
import { DetailsForm } from "./details-form";
import { ProductPicker } from "./product-picker";

export const metadata: Metadata = { title: "Montar look" };

export default async function LookEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(`/app/looks/${id}`);
  let data: Awaited<ReturnType<typeof getEditableLook>>;
  try {
    data = await getEditableLook(session.user.id, id);
  } catch (error) {
    if (error instanceof LookError) notFound();
    throw error;
  }
  const { look, items } = data;
  const published = look.status === "published";
  const clickStats = look.slug ? await clickStatsForLook(session.user.id, look.id) : new Map<string, number>();
  const publicUrl = look.slug ? `${env().APP_URL}/l/${look.slug}` : null;
  const unavailable = items.filter((i) => !i.available);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/app/looks" className="text-sm text-muted hover:underline">← Meus looks</Link>
          <h1 className="mt-1 font-display text-3xl font-semibold">{look.title || "Novo look"}</h1>
        </div>
        <LookStatusBadge status={look.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,26rem)]">
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="pecas">
            <div className="flex items-baseline justify-between">
              <h2 id="pecas" className="text-lg font-semibold">Peças do look</h2>
              <span className="text-sm text-muted">{items.length} de {LOOK_RULES.maxItems}</span>
            </div>
            {unavailable.length > 0 && (
              <div className="mt-3">
                <Alert tone="warning">
                  {unavailable.length === 1 ? "Uma peça está indisponível" : `${unavailable.length} peças estão indisponíveis`}. Substitua para manter o look comprável.
                </Alert>
              </div>
            )}
            {items.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
                Nenhuma peça ainda. Use a busca para adicionar ao menos {LOOK_RULES.minItemsToPublish}.
              </p>
            ) : (
              <ol className="mt-4 divide-y divide-line">
                {items.map((item, index) => (
                  <li key={item.productId} className="flex gap-3 py-3">
                    <ProductImage src={item.imageUrl} alt="" sizes="80px" className="w-20 shrink-0 rounded-md" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="text-xs uppercase tracking-wide text-muted">{item.brandName}</p>
                      <p className="font-medium">{item.title}</p>
                      <Price priceCents={item.priceCents} salePriceCents={item.salePriceCents} currency={item.currency} className="text-sm" />
                      <div className="flex flex-wrap gap-2">
                        {!item.available && <Badge tone="warning">Indisponível</Badge>}
                        {look.slug && <span className="text-xs text-muted">{clickStats.get(item.productId) ?? 0} clique(s)</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="flex gap-1">
                        <ActionForm action={moveItemAction} hidden={{ lookId: look.id, productId: item.productId, direction: "up" }}>
                          <Button type="submit" size="sm" variant="ghost" disabled={index === 0} aria-label={`Mover ${item.title} para cima`}>↑</Button>
                        </ActionForm>
                        <ActionForm action={moveItemAction} hidden={{ lookId: look.id, productId: item.productId, direction: "down" }}>
                          <Button type="submit" size="sm" variant="ghost" disabled={index === items.length - 1} aria-label={`Mover ${item.title} para baixo`}>↓</Button>
                        </ActionForm>
                      </div>
                      <ActionForm action={removeItemAction} hidden={{ lookId: look.id, productId: item.productId }} className="items-end">
                        <SubmitButton size="sm" variant="ghost" pendingLabel="Removendo…" aria-label={`Remover ${item.title}`}>Remover</SubmitButton>
                      </ActionForm>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card aria-labelledby="detalhes">
            <h2 id="detalhes" className="mb-4 text-lg font-semibold">Detalhes</h2>
            <DetailsForm lookId={look.id} title={look.title} description={look.description} />
          </Card>

          <Card>
            <ProductPicker lookId={look.id} excluded={items.map((i) => i.productId)} full={items.length >= LOOK_RULES.maxItems} />
          </Card>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          <Card aria-labelledby="previa">
            <h2 id="previa" className="mb-3 text-lg font-semibold">Prévia</h2>
            <LookCollage items={items} sizes="13rem" />
            <p className="mt-3 font-medium">{look.title || "Sem título"}</p>
            <p className="text-sm text-muted">{items.length} peça(s)</p>
          </Card>

          <Card aria-labelledby="publicacao">
            <h2 id="publicacao" className="mb-3 text-lg font-semibold">Publicação</h2>
            {published && publicUrl ? (
              <div className="flex flex-col gap-4">
                <Alert tone="success">Seu look está publicado. Compartilhe o link abaixo.</Alert>
                <ShareBox url={publicUrl} title={look.title} />
                <Link href={`/l/${look.slug}`} className="text-sm underline" target="_blank">Ver página pública</Link>
                <ActionForm action={unpublishAction} hidden={{ lookId: look.id }}>
                  <SubmitButton size="sm" variant="ghost" pendingLabel="Despublicando…" className="self-start">Despublicar</SubmitButton>
                </ActionForm>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">
                  Para publicar: título com ao menos {LOOK_RULES.titleMin} caracteres e {LOOK_RULES.minItemsToPublish} ou mais peças disponíveis.
                  {look.status === "unpublished" && " Ao republicar, o link anterior volta a funcionar."}
                </p>
                <ActionForm action={publishAction} hidden={{ lookId: look.id }}>
                  <SubmitButton pendingLabel="Publicando…">Publicar look</SubmitButton>
                </ActionForm>
                {!look.slug && (
                  <ActionForm action={deleteDraftAction} hidden={{ lookId: look.id }}>
                    <SubmitButton size="sm" variant="ghost" pendingLabel="Excluindo…" className="self-start">Excluir rascunho</SubmitButton>
                  </ActionForm>
                )}
              </div>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

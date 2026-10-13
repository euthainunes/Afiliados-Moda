import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, PageTitle } from "@/components/ui/card";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { dateFmt } from "@/lib/dates";
import { can } from "@/modules/access/can";
import { getBrand } from "@/modules/commercial/service";
import { BrandForm, CampaignForm, FeedForm } from "../forms";

export const metadata: Metadata = { title: "Marca" };

const CAMPAIGN_STATUS = { draft: ["Rascunho", "neutral"], active: ["Ativa", "success"], ended: ["Encerrada", "warning"] } as const;

export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission("brands.manage", `/admin/marcas/${id}`);
  const principal = toPrincipal(session);
  const data = await getBrand(principal, id);
  if (!data) notFound();
  const { brand, feeds, campaigns } = data;
  const params_ = Object.entries(brand.trackingConfig.params ?? {}).map(([k, v]) => `${k}=${v}`).join("\n");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/marcas" className="text-sm text-muted hover:underline">← Marcas</Link>
        <PageTitle>
          {brand.name} {brand.isFictitious && <Badge tone="warning">fictícia</Badge>}
        </PageTitle>
      </div>

      {Object.keys(brand.trackingConfig.params ?? {}).length === 0 && (
        <Alert tone="warning" title="Sem parâmetros de rastreamento">
          Os cliques são registrados, mas nenhum identificador é enviado à loja. Configure depois de validar o mecanismo com a marca (docs/05 §6).
        </Alert>
      )}

      <Card aria-labelledby="dados">
        <h2 id="dados" className="mb-4 text-lg font-semibold">Dados da marca</h2>
        <BrandForm
          defaults={{
            brandId: brand.id,
            name: brand.name,
            slug: brand.slug,
            status: brand.status,
            website: brand.website ?? "",
            allowedDomains: brand.allowedDomains.join("\n"),
            trackingParams: params_,
          }}
        />
      </Card>

      <Card aria-labelledby="feeds">
        <h2 id="feeds" className="mb-4 text-lg font-semibold">Feeds de produtos</h2>
        {can(principal, "integrations.manage") ? (
          <div className="flex flex-col gap-4">
            {feeds.map((f) => (
              <FeedForm key={f.id} brandId={brand.id} feedId={f.id} source={f.source} />
            ))}
            <FeedForm brandId={brand.id} />
          </div>
        ) : (
          <ul className="font-mono text-sm">{feeds.map((f) => <li key={f.id}>{f.source}</li>)}</ul>
        )}
        <p className="mt-3 text-sm text-muted">
          Importações e histórico em <Link href="/admin/catalogo" className="underline">Catálogo</Link>.
        </p>
      </Card>

      <Card aria-labelledby="campanhas">
        <h2 id="campanhas" className="mb-4 text-lg font-semibold">Campanhas</h2>
        {campaigns.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma campanha.</p>
        ) : (
          <ul className="divide-y divide-line">
            {campaigns.map((c) => {
              const [label, tone] = CAMPAIGN_STATUS[c.status];
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <Link href={`/admin/marcas/${brand.id}/campanhas/${c.id}`} className="font-medium underline">{c.name}</Link>
                    <p className="text-sm text-muted">
                      {dateFmt.format(c.startsAt)} {c.endsAt ? `até ${dateFmt.format(c.endsAt)}` : "sem data de fim"} · {c.slug}
                    </p>
                  </div>
                  <Badge tone={tone}>{label}</Badge>
                </li>
              );
            })}
          </ul>
        )}
        {can(principal, "campaigns.manage") && (
          <details className="mt-4 rounded-lg border border-line p-4">
            <summary className="cursor-pointer font-medium">+ Nova campanha</summary>
            <div className="mt-4">
              <CampaignForm brandId={brand.id} />
            </div>
          </details>
        )}
      </Card>
    </div>
  );
}

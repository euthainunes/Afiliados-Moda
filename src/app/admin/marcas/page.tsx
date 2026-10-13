import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/card";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { listBrands } from "@/modules/commercial/service";

export const metadata: Metadata = { title: "Marcas" };

export default async function BrandsPage() {
  const session = await requirePermission("brands.manage", "/admin/marcas");
  const brands = await listBrands(toPrincipal(session));
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageTitle description="Marcas parceiras, domínios, rastreamento, feeds e campanhas.">Marcas</PageTitle>
        <ButtonLink href="/admin/marcas/nova">+ Nova marca</ButtonLink>
      </div>
      {brands.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">Nenhuma marca cadastrada.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {brands.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <Link href={`/admin/marcas/${b.id}`} className="font-medium underline">{b.name}</Link>
                <p className="text-sm text-muted">{b.allowedDomains.join(", ")}</p>
              </div>
              <div className="flex gap-2">
                {b.isFictitious && <Badge tone="warning">fictícia</Badge>}
                <Badge tone={b.status === "active" ? "success" : "neutral"}>{b.status === "active" ? "Ativa" : "Inativa"}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

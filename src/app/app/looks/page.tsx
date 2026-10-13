import type { Metadata } from "next";
import Link from "next/link";
import { LookCollage } from "@/components/looks/look-card";
import { LookStatusBadge } from "@/components/looks/look-status";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/current";
import { listMyLooks } from "@/modules/looks/service";
import { createLookAction } from "./actions";

export const metadata: Metadata = { title: "Meus looks" };

export default async function MyLooksPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const session = await requireSession("/app/looks");
  const { aviso } = await searchParams;
  const looks = await listMyLooks(session.user.id);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageTitle description="Rascunhos, looks publicados e seus cliques.">Meus looks</PageTitle>
        <form action={createLookAction}>
          <Button type="submit">+ Novo look</Button>
        </form>
      </div>
      {aviso && (
        <div className="mb-4">
          <Alert tone="danger">{aviso}</Alert>
        </div>
      )}
      {looks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-10 text-center">
          <p className="font-medium">Você ainda não criou nenhum look.</p>
          <p className="mt-1 text-sm text-muted">Comece pelo catálogo ou crie um look em branco.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {looks.map(({ look, items, clicks }) => (
            <li key={look.id} className="flex flex-col gap-2">
              {look.status === "removed" ? (
                <div className="flex flex-col gap-2 opacity-60">
                  <LookCollage items={items} sizes="(min-width: 1024px) 12vw, 24vw" />
                  <span className="font-medium">{look.title || "Look sem título"}</span>
                </div>
              ) : (
                <Link href={`/app/looks/${look.id}`} className="flex flex-col gap-2">
                  <LookCollage items={items} sizes="(min-width: 1024px) 12vw, 24vw" />
                  <span className="font-medium">{look.title || "Look sem título"}</span>
                </Link>
              )}
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <LookStatusBadge status={look.status} />
                <span>{items.length} peças</span>
                {look.slug && <span>· {clicks} clique(s)</span>}
              </div>
              {look.status === "removed" && look.removedReason && <p className="text-sm text-danger">Motivo: {look.removedReason}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

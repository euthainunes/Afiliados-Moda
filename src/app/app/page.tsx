import type { Metadata } from "next";
import Link from "next/link";
import { LookCollage } from "@/components/looks/look-card";
import { LookStatusBadge } from "@/components/looks/look-status";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, PageTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/current";
import { listMyLooks } from "@/modules/looks/service";
import { createLookAction } from "./looks/actions";

export const metadata: Metadata = { title: "Início" };

export default async function DashboardPage() {
  const session = await requireSession("/app");
  const looks = await listMyLooks(session.user.id);
  const published = looks.filter((l) => l.look.status === "published");
  const totalClicks = looks.reduce((sum, l) => sum + l.clicks, 0);

  const tiles = [
    { label: "Looks publicados", value: published.length },
    { label: "Rascunhos", value: looks.filter((l) => l.look.status === "draft").length },
    { label: "Cliques nas peças", value: totalClicks, help: "Sem robôs e sem seus próprios cliques" },
  ];

  return (
    <>
      <PageTitle description="Monte, compartilhe e acompanhe seus looks.">Olá, {session.user.displayName.split(" ")[0]}!</PageTitle>
      <dl className="grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label}>
            <dt className="text-sm text-muted">{t.label}</dt>
            <dd className="mt-1 text-3xl font-semibold tabular-nums">{t.value.toLocaleString("pt-BR")}</dd>
            {t.help && <dd className="mt-1 text-xs text-muted">{t.help}</dd>}
          </Card>
        ))}
      </dl>

      <div className="mt-6 flex flex-wrap gap-3">
        <form action={createLookAction}>
          <Button type="submit">+ Novo look</Button>
        </form>
        <ButtonLink href="/app/catalogo" variant="secondary">Explorar o catálogo</ButtonLink>
      </div>

      <section className="mt-10" aria-labelledby="recentes">
        <h2 id="recentes" className="text-lg font-semibold">Seus looks recentes</h2>
        {looks.length === 0 ? (
          <p className="mt-3 text-muted">Você ainda não criou nenhum look. Comece pelo catálogo!</p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {looks.slice(0, 4).map(({ look, items }) => (
              <li key={look.id}>
                <Link href={look.status === "removed" ? "/app/looks" : `/app/looks/${look.id}`} className="flex flex-col gap-2">
                  <LookCollage items={items} sizes="(min-width: 640px) 12vw, 24vw" />
                  <span className="font-medium">{look.title || "Look sem título"}</span>
                </Link>
                <LookStatusBadge status={look.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-10 text-sm text-muted">
        Vendas atribuídas e recompensas aparecerão aqui quando o programa for ativado, depois da validação com as marcas.
      </p>
    </>
  );
}

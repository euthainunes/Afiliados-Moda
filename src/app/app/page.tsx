import type { Metadata } from "next";
import { Card, PageTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Início" };

const upcoming = [
  { title: "Catálogo", text: "Busque peças das marcas parceiras com filtros por categoria, cor e preço." },
  { title: "Montador de looks", text: "Combine peças, reordene, pré-visualize e publique com um link próprio." },
  { title: "Desempenho e recompensas", text: "Acompanhe cliques, vendas atribuídas e o extrato das suas recompensas." },
];

export default async function DashboardPage() {
  const session = await requireSession("/app");
  return (
    <>
      <PageTitle description="Este é o seu espaço. As ferramentas abaixo chegam nas próximas etapas.">
        Olá, {session.user.displayName.split(" ")[0]}!
      </PageTitle>
      <div className="grid gap-4 sm:grid-cols-3">
        {upcoming.map((u) => (
          <Card key={u.title}>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Em breve</p>
            <h2 className="mt-1 text-lg font-semibold">{u.title}</h2>
            <p className="mt-2 text-sm text-muted">{u.text}</p>
          </Card>
        ))}
      </div>
    </>
  );
}

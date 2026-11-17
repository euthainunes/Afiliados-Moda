import { redirect } from "next/navigation";
import { Card, PageTitle } from "@/components/ui/card";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { brandsVisibleTo } from "@/modules/brand-portal/service";

export default async function BrandPortalIndex() {
  const session = await requirePermission("brand_portal.access", "/marca");
  const visible = await brandsVisibleTo(toPrincipal(session));
  if (visible.length === 1) redirect(`/marca/${visible[0].slug}`);
  return (
    <main id="conteudo" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <PageTitle description="Escolha a marca.">Portal da marca</PageTitle>
      {visible.length === 0 ? (
        <Card><p className="text-sm text-muted">Nenhuma marca vinculada a esta conta. Peça o acesso à equipe da plataforma.</p></Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visible.map((b) => (
            <li key={b.id}>
              <a href={`/marca/${b.slug}`} className="block rounded-xl border border-line bg-surface p-4 font-medium hover:border-ink">
                {b.name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

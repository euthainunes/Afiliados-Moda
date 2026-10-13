import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { PageTitle } from "@/components/ui/card";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { systemHealth } from "@/modules/system/health";

export const metadata: Metadata = { title: "Saúde do sistema" };

export default async function HealthPage() {
  const session = await requirePermission("settings.manage", "/admin/saude");
  const { checks, environment } = await systemHealth(toPrincipal(session));
  return (
    <>
      <PageTitle description={`Ambiente: ${environment}. Verificações executadas agora, direto no servidor.`}>Saúde do sistema</PageTitle>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {checks.map((c) => (
          <li key={c.name} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{c.name}</p>
              <p className="text-muted">{c.detail}</p>
            </div>
            <Badge tone={c.ok ? "success" : "danger"}>{c.ok ? "OK" : "Atenção"}</Badge>
          </li>
        ))}
      </ul>
    </>
  );
}

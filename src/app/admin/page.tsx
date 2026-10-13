import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, PageTitle } from "@/components/ui/card";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { can } from "@/modules/access/can";
import { feedHealth } from "@/modules/catalog/scheduler";
import { overviewMetrics } from "@/modules/reporting/metrics";

export default async function AdminHome() {
  const session = await requirePermission("admin.access", "/admin");
  const principal = toPrincipal(session);
  const [metrics, health] = await Promise.all([
    can(principal, "reports.read") ? overviewMetrics(principal) : Promise.resolve([]),
    can(principal, "catalog.manage") ? feedHealth() : Promise.resolve([]),
  ]);
  const alerts = health.filter((h) => h.alert);

  return (
    <>
      <PageTitle description="Indicadores lidos diretamente do banco de dados. Passe o mouse ou toque em “definição” para ver o critério de cada um.">
        Visão geral
      </PageTitle>
      <div className="mb-6 flex flex-col gap-3">
        {alerts.map((a) => (
          <Alert key={a.feedId} tone="danger" title={`Catálogo de ${a.brand}`}>
            {a.alert} <Link href="/admin/catalogo" className="underline">Ver importações</Link>
          </Alert>
        ))}
        <Alert tone="warning" title="Antes de operar com usuárias reais">
          A verificação em duas etapas (MFA) do painel e o provedor de e-mail ainda precisam ser configurados (Fase 3b).
          Vendas, comissões e recompensas aparecem aqui quando a atribuição for comprovada com a marca (Fases 6 e 7).
        </Alert>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((m) => (
          <Card key={m.key}>
            <dt className="flex items-center justify-between gap-2 text-sm text-muted">
              {m.label} <Badge tone="success">{m.nature}</Badge>
            </dt>
            <dd className="mt-1 text-3xl font-semibold tabular-nums">{m.value.toLocaleString("pt-BR")}</dd>
            <dd className="mt-2 text-xs text-muted">
              <details>
                <summary className="cursor-pointer">definição</summary>
                {m.definition} Fonte: <code>{m.source}</code>.
              </details>
            </dd>
          </Card>
        ))}
      </dl>
    </>
  );
}

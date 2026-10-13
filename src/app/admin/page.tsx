import { Alert } from "@/components/ui/alert";
import { Card, PageTitle } from "@/components/ui/card";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { can } from "@/modules/access/can";
import { accountStats } from "@/modules/identity/stats";

export default async function AdminHome() {
  const session = await requirePermission("admin.access", "/admin");
  const principal = toPrincipal(session);
  const stats = can(principal, "users.read") ? await accountStats(principal) : null;

  const tiles = stats
    ? [
        { label: "Contas", value: stats.total, help: "Contas não excluídas" },
        { label: "E-mail confirmado", value: stats.verified, help: "Podem entrar na plataforma" },
        { label: "Novas (7 dias)", value: stats.recent, help: "Criadas nos últimos 7 dias" },
        { label: "Suspensas", value: stats.suspended, help: "Sem acesso até reativação" },
      ]
    : [];

  return (
    <>
      <PageTitle description="Indicadores confirmados, lidos diretamente do banco de dados.">Visão geral</PageTitle>
      <div className="mb-6">
        <Alert tone="warning" title="Ambiente em construção (Fase 3)">
          Catálogo, looks, pedidos e financeiro entram nas próximas fases. A autenticação em dois fatores (MFA) do
          painel é obrigatória antes de qualquer uso em produção e está planejada para a Fase 3b.
        </Alert>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <dt className="text-sm text-muted">{t.label}</dt>
            <dd className="mt-1 text-3xl font-semibold tabular-nums">{t.value.toLocaleString("pt-BR")}</dd>
            <dd className="mt-1 text-xs text-muted">{t.help}</dd>
          </Card>
        ))}
      </dl>
    </>
  );
}

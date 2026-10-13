import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, PageTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { brands } from "@/lib/db/schema";
import { dateTimeFmt } from "@/lib/dates";
import { env } from "@/lib/env";
import { can } from "@/modules/access/can";
import { listIntegrations, PROVIDER_REQUIREMENTS } from "@/modules/integrations/admin";
import { setModeAction, syncNowAction } from "./actions";
import { CreateIntegrationForm } from "./create-form";

export const metadata: Metadata = { title: "Integrações" };

const MODE = { disabled: ["Desativada", "neutral"], demo: ["Demonstração", "warning"], live: ["Real", "success"] } as const;
const LOG = { running: ["Em andamento", "neutral"], succeeded: ["Concluída", "success"], partial: ["Parcial", "warning"], failed: ["Falhou", "danger"] } as const;

export default async function IntegrationsPage() {
  const session = await requirePermission("integrations.manage", "/admin/integracoes");
  const principal = toPrincipal(session);
  const [rows, brandRows] = await Promise.all([listIntegrations(principal), db.select({ id: brands.id, name: brands.name }).from(brands).orderBy(asc(brands.name))]);
  const production = env().APP_ENV === "production";

  return (
    <div className="flex flex-col gap-6">
      <PageTitle description="Fontes de pedidos das lojas. Credenciais ficam no cofre de segredos da hospedagem; aqui aparece só o nome da variável.">Integrações</PageTitle>
      <Alert tone="info" title="E-mail e pagamentos">
        E-mail: provedor <strong>{env().MAIL_DRIVER}</strong> (definido por MAIL_DRIVER). Pagamentos de resgate: registro manual de PIX com comprovante; em demonstração, sempre simulados.
      </Alert>
      {rows.map(({ integration: i, brandName, brandFictitious, missingSecrets, logs }) => {
        const [modeLabel, modeTone] = MODE[i.mode];
        const req = PROVIDER_REQUIREMENTS[i.provider];
        return (
          <Card key={i.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{i.name} {brandFictitious && <Badge tone="warning">marca fictícia</Badge>}</h2>
                <p className="text-sm text-muted">Plataforma: {i.provider.toUpperCase()} · {brandName}</p>
              </div>
              <Badge tone={modeTone}>{modeLabel}</Badge>
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
              <dt className="text-muted">Último sucesso</dt>
              <dd>{i.lastSuccessAt ? dateTimeFmt.format(i.lastSuccessAt) : "—"}</dd>
              <dt className="text-muted">Falhas seguidas</dt>
              <dd>{i.consecutiveFailures}{i.lastError && <span className="text-danger"> · {i.lastError}</span>}</dd>
              {Object.keys(i.config).length > 0 && (
                <>
                  <dt className="text-muted">Configuração</dt>
                  <dd className="font-mono text-xs">{Object.entries(i.config).map(([k, v]) => `${k}=${v || "(vazio)"}`).join(" · ")}</dd>
                </>
              )}
              {i.secretEnv.length > 0 && (
                <>
                  <dt className="text-muted">Segredos (variáveis)</dt>
                  <dd className="font-mono text-xs">
                    {i.secretEnv.map((s) => `${s} ${missingSecrets.includes(s) ? "✗ ausente" : "✓"}`).join(" · ")}
                  </dd>
                </>
              )}
            </dl>
            {req && <p className="mt-2 text-xs text-muted">{req.notes}</p>}
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              {i.mode !== "disabled" && (
                <ActionForm action={setModeAction} hidden={{ integrationId: i.id, mode: "disabled" }}>
                  <SubmitButton size="sm" variant="ghost" pendingLabel="…">Desativar</SubmitButton>
                </ActionForm>
              )}
              {i.provider === "demo" && i.mode !== "demo" && !production && (
                <ActionForm action={setModeAction} hidden={{ integrationId: i.id, mode: "demo" }}>
                  <SubmitButton size="sm" variant="secondary" pendingLabel="…">Ativar demonstração</SubmitButton>
                </ActionForm>
              )}
              {i.provider !== "demo" && i.mode !== "live" && (
                <ActionForm action={setModeAction} hidden={{ integrationId: i.id, mode: "live" }}>
                  <SubmitButton size="sm" variant="secondary" pendingLabel="…">Ativar modo real</SubmitButton>
                </ActionForm>
              )}
              {i.mode !== "disabled" && can(principal, "events.reprocess") && (
                <ActionForm action={syncNowAction} hidden={{ integrationId: i.id }}>
                  <SubmitButton size="sm" pendingLabel="Sincronizando…">Sincronizar agora</SubmitButton>
                </ActionForm>
              )}
            </div>
            {logs.length > 0 && (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer font-medium">Histórico de sincronização ({logs.length})</summary>
                <ul className="mt-2 divide-y divide-line">
                  {logs.map((l) => {
                    const [label, tone] = LOG[l.status];
                    return (
                      <li key={l.id} className="py-2">
                        <Badge tone={tone}>{label}</Badge> <span className="tabular-nums">{dateTimeFmt.format(l.startedAt)}</span> · modo {l.mode} · tentativas {l.attempts}
                        {l.counters && <span className="text-muted"> · {l.counters.received} recebidos, {l.counters.created} novos, {l.counters.updated} atualizados, {l.counters.failed} com erro</span>}
                        {l.error && <p className="text-danger">{l.error}</p>}
                        {l.errorSample && l.errorSample.length > 0 && <p className="text-xs text-muted">{l.errorSample.slice(0, 3).map((e) => `${e.ref}: ${e.reason}`).join(" · ")}</p>}
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
          </Card>
        );
      })}
      <Card aria-labelledby="nova">
        <h2 id="nova" className="mb-4 text-lg font-semibold">Nova fonte de pedidos</h2>
        <CreateIntegrationForm brands={Object.fromEntries(brandRows.map((b) => [b.id, b.name]))} />
      </Card>
    </div>
  );
}

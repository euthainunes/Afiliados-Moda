import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, PageTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { dateFmt } from "@/lib/dates";
import { listTeam } from "@/modules/identity/team";
import { revokeRoleAction } from "./actions";
import { GrantRoleForm, ResetMfaForm } from "./grant-form";
import { staffMfaRequired } from "@/lib/env";

export const metadata: Metadata = { title: "Equipe" };

export default async function TeamPage() {
  const session = await requirePermission("team.manage", "/admin/equipe");
  const team = await listTeam(toPrincipal(session));
  const mfaRequired = staffMfaRequired();
  return (
    <div className="flex flex-col gap-6">
      <PageTitle description="Quem tem acesso ao painel interno. Toda mudança encerra as sessões da pessoa e fica na auditoria.">Equipe</PageTitle>
      <Card aria-labelledby="conceder">
        <h2 id="conceder" className="mb-2 text-lg font-semibold">Conceder acesso</h2>
        <p className="mb-4 text-sm text-muted">A pessoa precisa ter uma conta com e-mail confirmado. Operadoras não acessam financeiro, auditoria nem configurações.</p>
        <GrantRoleForm />
      </Card>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Pessoa</th>
              <th scope="col" className="px-4 py-3 font-medium">Papel</th>
              <th scope="col" className="px-4 py-3 font-medium">Duas etapas</th>
              <th scope="col" className="px-4 py-3 font-medium">Desde</th>
              <th scope="col" className="px-4 py-3 font-medium">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {team.map((m) => (
              <tr key={`${m.userId}-${m.role}`}>
                <td className="px-4 py-3">{m.displayName}<p className="text-muted">{m.email}</p></td>
                <td className="px-4 py-3"><Badge tone={m.role === "admin" ? "danger" : "neutral"}>{m.role === "admin" ? "Administradora" : "Operadora"}</Badge></td>
                <td className="px-4 py-3">{m.mfaEnabledAt ? <Badge tone="success">Ativa</Badge> : <Badge tone={mfaRequired ? "danger" : "warning"}>{mfaRequired ? "Pendente (painel bloqueado)" : "Desativada"}</Badge>}</td>
                <td className="px-4 py-3 tabular-nums">{dateFmt.format(m.grantedAt)}</td>
                <td className="px-4 py-3">
                  <ActionForm action={revokeRoleAction} hidden={{ userId: m.userId, role: m.role }}>
                    <SubmitButton size="sm" variant="ghost" pendingLabel="Removendo…" className="self-start">Remover acesso</SubmitButton>
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card aria-labelledby="redefinir-mfa">
        <h2 id="redefinir-mfa" className="mb-2 text-lg font-semibold">Redefinir verificação em duas etapas</h2>
        <p className="mb-4 text-sm text-muted">
          Para quem perdeu o celular e os códigos de recuperação (equipe ou criadora). Confirme a identidade fora da plataforma antes. A ação encerra as sessões da pessoa, fica na auditoria e não pode ser feita sobre a própria conta.
          {mfaRequired ? " Neste ambiente a equipe é obrigada a usar a verificação." : " Neste ambiente a verificação ainda não é obrigatória para a equipe (REQUIRE_STAFF_MFA)."}
        </p>
        <ResetMfaForm />
      </Card>
    </div>
  );
}

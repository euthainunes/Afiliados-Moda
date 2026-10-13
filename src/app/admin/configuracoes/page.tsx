import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { Card, PageTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { listSettings } from "@/modules/settings/service";
import { updateSettingAction } from "./actions";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsAdminPage() {
  const session = await requirePermission("settings.manage", "/admin/configuracoes");
  const items = await listSettings(toPrincipal(session));
  return (
    <>
      <PageTitle description="Parâmetros de funcionamento. Toda alteração fica registrada na auditoria. Percentuais de comissão são definidos por campanha, em Marcas.">Configurações</PageTitle>
      <div className="flex flex-col gap-4">
        {items.map((s) => (
          <Card key={s.key}>
            <ActionForm action={updateSettingAction} hidden={{ key: s.key }}>
              <p className="font-medium">{s.label}</p>
              <p className="text-sm text-muted">{s.help}</p>
              {typeof s.value === "boolean" ? (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" name="value" value="true" defaultChecked={s.value} className="size-4 accent-brand" />
                  Ativado
                </label>
              ) : (
                <input aria-label={s.label} name="value" type="number" defaultValue={String(s.value)} className="mt-2 h-10 w-48 rounded-lg border border-line px-3" />
              )}
              <SubmitButton size="sm" variant="secondary" className="self-start" pendingLabel="Salvando…">Salvar</SubmitButton>
            </ActionForm>
          </Card>
        ))}
      </div>
    </>
  );
}

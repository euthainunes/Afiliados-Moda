"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { scheduleNotificationEmails } from "@/modules/notifications/schedule";
import type { FormState } from "@/lib/form-state";
import { createOrderIntegration, IntegrationAdminError, setIntegrationMode, triggerSync } from "@/modules/integrations/admin";

async function handle(fn: () => Promise<string>): Promise<FormState> {
  try {
    const message = await fn();
    revalidatePath("/admin/integracoes");
    return { status: "success", message };
  } catch (error) {
    if (error instanceof IntegrationAdminError) return { status: "error", message: error.message };
    if (error instanceof z.ZodError) return { status: "error", message: "Dados inválidos." };
    throw error;
  }
}

export async function createIntegrationAction(_p: FormState, fd: FormData) {
  const session = await requirePermission("integrations.manage");
  return handle(async () => {
    await createOrderIntegration(toPrincipal(session), {
      brandId: String(fd.get("brandId") ?? ""),
      provider: String(fd.get("provider") ?? "") as "vtex",
      account: String(fd.get("account") ?? ""),
      environment: String(fd.get("environment") ?? ""),
      clickIdField: String(fd.get("clickIdField") ?? ""),
    });
    return "Integração criada (desativada). Configure os segredos e ative quando estiver validada.";
  });
}

export async function setModeAction(_p: FormState, fd: FormData) {
  const session = await requirePermission("integrations.manage");
  const mode = String(fd.get("mode") ?? "") as "disabled" | "demo" | "live";
  return handle(async () => {
    await setIntegrationMode(toPrincipal(session), String(fd.get("integrationId") ?? ""), mode);
    return { disabled: "Integração desativada.", demo: "Modo demonstração ativado.", live: "Integração real ativada." }[mode] ?? "Atualizado.";
  });
}

export async function syncNowAction(_p: FormState, fd: FormData) {
  const session = await requirePermission("events.reprocess");
  return handle(async () => {
    const r = await triggerSync(toPrincipal(session), String(fd.get("integrationId") ?? ""));
    scheduleNotificationEmails();
    const c = r.counters;
    return `Sincronização ${r.status === "succeeded" ? "concluída" : r.status === "partial" ? "parcial" : "falhou"}: ${c.received} recebidos, ${c.created} novos, ${c.updated} atualizados, ${c.unchanged} sem mudança, ${c.failed} com erro.${r.error ? ` ${r.error}` : ""}`;
  });
}

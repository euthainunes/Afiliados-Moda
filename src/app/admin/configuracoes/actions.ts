"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import type { FormState } from "@/lib/form-state";
import { updateSetting } from "@/modules/settings/service";

export async function updateSettingAction(_p: FormState, fd: FormData): Promise<FormState> {
  const session = await requirePermission("settings.manage");
  const key = String(fd.get("key") ?? "");
  const value = fd.has("value") ? String(fd.get("value")) : "false";
  try {
    await updateSetting(toPrincipal(session), key, value);
  } catch (error) {
    if (error instanceof ZodError) return { status: "error", message: "Valor fora do intervalo permitido." };
    if (error instanceof Error && error.message === "Parâmetro desconhecido.") return { status: "error", message: error.message };
    throw error;
  }
  revalidatePath("/admin/configuracoes");
  return { status: "success", message: "Salvo." };
}

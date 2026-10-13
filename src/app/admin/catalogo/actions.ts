"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import type { FormState } from "@/lib/form-state";
import { triggerImport } from "@/modules/catalog/importer";

export async function importFeedAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission("catalog.manage");
  const result = await triggerImport(toPrincipal(session), String(formData.get("feedId") ?? ""));
  revalidatePath("/admin/catalogo");
  return result.status === "succeeded"
    ? { status: "success", message: "Importação concluída." }
    : { status: "error", message: `A importação falhou: ${result.error}` };
}

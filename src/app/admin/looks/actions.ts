"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import type { FormState } from "@/lib/form-state";
import { LookError, removeLook } from "@/modules/looks/service";

export async function removeLookAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requirePermission("looks.moderate");
  try {
    await removeLook(toPrincipal(session), String(formData.get("lookId") ?? ""), String(formData.get("reason") ?? ""));
  } catch (error) {
    if (error instanceof LookError) return { status: "error", message: error.message };
    throw error;
  }
  revalidatePath("/admin/looks");
  return { status: "success", message: "Look removido." };
}

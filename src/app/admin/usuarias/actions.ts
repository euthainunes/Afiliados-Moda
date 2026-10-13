"use server";

import { revalidatePath } from "next/cache";
import { requestContext, requirePermission, toPrincipal } from "@/lib/auth/current";
import { setUserStatus } from "@/modules/identity/admin";

export async function setUserStatusAction(formData: FormData): Promise<void> {
  // A permissão é verificada de novo dentro do serviço; a action nunca confia na interface.
  const session = await requirePermission("users.suspend");
  const userId = String(formData.get("userId") ?? "");
  const status = formData.get("status") === "active" ? "active" : "suspended";
  const reason = String(formData.get("reason") ?? "");
  await setUserStatus(toPrincipal(session), userId, status, reason, await requestContext());
  revalidatePath("/admin/usuarias");
}

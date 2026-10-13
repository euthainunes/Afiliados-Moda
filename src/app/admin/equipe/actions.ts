"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import type { FormState } from "@/lib/form-state";
import { grantRole, revokeRole, TeamError, type StaffRole } from "@/modules/identity/team";

const role = (v: FormDataEntryValue | null): StaffRole => (v === "admin" ? "admin" : "operator");

export async function grantRoleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requirePermission("team.manage");
  try {
    await grantRole(toPrincipal(session), String(fd.get("email") ?? ""), role(fd.get("role")));
  } catch (error) {
    if (error instanceof TeamError) return { status: "error", message: error.message };
    throw error;
  }
  revalidatePath("/admin/equipe");
  return { status: "success", message: "Acesso concedido. A pessoa precisa entrar novamente." };
}

export async function revokeRoleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requirePermission("team.manage");
  try {
    await revokeRole(toPrincipal(session), String(fd.get("userId") ?? ""), role(fd.get("role")));
  } catch (error) {
    if (error instanceof TeamError) return { status: "error", message: error.message };
    throw error;
  }
  revalidatePath("/admin/equipe");
  return { status: "success", message: "Acesso removido." };
}

"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import type { FormState } from "@/lib/form-state";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { adminResetMfa, MfaError } from "@/modules/identity/mfa";
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

export async function resetMfaAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requirePermission("team.manage");
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const values = { email, reason: String(fd.get("reason") ?? "") };
  const target = email ? await db.query.users.findFirst({ where: eq(users.email, email) }) : undefined;
  if (!target) return { status: "error", message: "Não há conta com este e-mail.", values };
  try {
    await adminResetMfa(toPrincipal(session), target.id, values.reason);
  } catch (error) {
    if (error instanceof MfaError) return { status: "error", message: error.message, values };
    throw error;
  }
  revalidatePath("/admin/equipe");
  return { status: "success", message: "Verificação removida e sessões encerradas. A pessoa deve ativá-la de novo no próximo acesso." };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth/current";
import type { FormState } from "@/lib/form-state";
import { cancelPayout, FinanceError, requestPayout, savePayoutAccount } from "@/modules/finance/operations";
import { fieldErrors } from "@/modules/identity/validation";

export async function savePayoutAccountAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = { holderName: String(fd.get("holderName") ?? ""), cpf: String(fd.get("cpf") ?? ""), pixKeyType: String(fd.get("pixKeyType") ?? ""), pixKey: String(fd.get("pixKey") ?? "") };
  try {
    await savePayoutAccount(session.user.id, values as never);
  } catch (error) {
    if (error instanceof z.ZodError) return { status: "error", fieldErrors: fieldErrors(error), values: { holderName: values.holderName, pixKeyType: values.pixKeyType } };
    if (error instanceof FinanceError) return { status: "error", message: error.message };
    throw error;
  }
  revalidatePath("/app/recompensas/resgatar");
  return { status: "success", message: "Dados de recebimento salvos com segurança." };
}

// Valor digitado em reais ("50", "50,90") → centavos.
function parseReais(v: string): number | null {
  const m = v.trim().replace(/\./g, "").replace(",", ".").match(/^(\d{1,7})(?:\.(\d{1,2}))?$/);
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : null;
}

export async function requestPayoutAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireSession();
  const cents = parseReais(String(fd.get("amount") ?? ""));
  if (cents == null) return { status: "error", fieldErrors: { amount: ["Informe um valor como 50 ou 50,90."] } };
  try {
    await requestPayout(session.user.id, cents);
  } catch (error) {
    if (error instanceof FinanceError) return { status: "error", message: error.message };
    throw error;
  }
  revalidatePath("/app/recompensas");
  redirect("/app/recompensas");
}

export async function cancelPayoutAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireSession();
  try {
    await cancelPayout(session.user.id, String(fd.get("payoutId") ?? ""));
  } catch (error) {
    if (error instanceof FinanceError) return { status: "error", message: error.message };
    throw error;
  }
  revalidatePath("/app/recompensas");
  return { status: "success", message: "Resgate cancelado." };
}

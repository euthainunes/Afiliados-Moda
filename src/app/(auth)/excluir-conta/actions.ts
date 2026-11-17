"use server";

import { redirect } from "next/navigation";
import { clearSessionCookie } from "@/lib/auth/current";
import type { FormState } from "@/lib/form-state";
import { deleteAccountWithLink, PrivacyError } from "@/modules/privacy/service";

export async function deleteWithLinkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    await deleteAccountWithLink(String(formData.get("token") ?? ""), String(formData.get("confirmation") ?? ""));
  } catch (error) {
    if (error instanceof PrivacyError) return { status: "error", message: error.message };
    throw error;
  }
  await clearSessionCookie();
  redirect("/?conta=excluida");
}

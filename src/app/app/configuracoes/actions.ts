"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSessionCookie, requireSession } from "@/lib/auth/current";
import type { FormState } from "@/lib/form-state";
import { changePassword } from "@/modules/identity/service";
import { revokeAllSessions, revokeSession } from "@/modules/identity/sessions";
import { changePasswordSchema, fieldErrors } from "@/modules/identity/validation";
import { deleteMyAccount, PrivacyError, requestAccountDeletionLink, setEmailNotifications, updateProfile } from "@/modules/privacy/service";
import { ZodError } from "zod";

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  const result = await changePassword(session.user.id, parsed.data.currentPassword, parsed.data.password, session.sessionId);
  if (!result.ok) return { status: "error", fieldErrors: { currentPassword: ["Senha atual incorreta."] } };
  revalidatePath("/app/configuracoes");
  return { status: "success", message: "Senha alterada. As outras sessões foram encerradas." };
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("sessionId") ?? "");
  // A checagem de propriedade fica no serviço: só revoga sessões da própria conta.
  await revokeSession(session.user.id, id);
  if (id === session.sessionId) {
    await clearSessionCookie();
    redirect("/entrar");
  }
  revalidatePath("/app/configuracoes");
}

export async function revokeOtherSessionsAction(): Promise<void> {
  const session = await requireSession();
  await revokeAllSessions(session.user.id, session.sessionId);
  revalidatePath("/app/configuracoes");
}

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = { displayName: String(formData.get("displayName") ?? ""), username: String(formData.get("username") ?? ""), bio: String(formData.get("bio") ?? "") };
  try {
    await updateProfile(session.user.id, values);
  } catch (error) {
    if (error instanceof ZodError) return { status: "error", fieldErrors: fieldErrors(error), values };
    if (error instanceof PrivacyError) return { status: "error", message: error.message, values };
    throw error;
  }
  revalidatePath("/app", "layout");
  return { status: "success", message: "Perfil atualizado.", values };
}

export async function deleteAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  try {
    await deleteMyAccount(session.user.id, String(formData.get("password") ?? ""), String(formData.get("confirmation") ?? ""));
  } catch (error) {
    if (error instanceof PrivacyError) return { status: "error", message: error.message };
    throw error;
  }
  await clearSessionCookie();
  redirect("/?conta=excluida");
}

export async function updateEmailPreferenceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const enabled = formData.get("emailNotifications") === "on";
  await setEmailNotifications(session.user.id, enabled);
  revalidatePath("/app/configuracoes");
  return { status: "success", message: enabled ? "Você vai receber os avisos importantes por e-mail." : "Os avisos ficam só aqui na plataforma, sem e-mail." };
}

export async function requestDeletionLinkAction(): Promise<FormState> {
  const session = await requireSession();
  try {
    await requestAccountDeletionLink(session.user.id);
  } catch (error) {
    if (error instanceof PrivacyError) return { status: "error", message: error.message };
    throw error;
  }
  return { status: "success", message: `Enviamos o link para ${session.user.email}. Ele vale por 30 minutos.` };
}

"use server";

import { redirect } from "next/navigation";
import { clearSessionCookie, getSession, readSessionToken, requestContext, safeNext, setSessionCookie } from "@/lib/auth/current";
import type { FormState } from "@/lib/form-state";
import {
  login,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  signUp,
  verifyEmail,
} from "@/modules/identity/service";
import { revokeSessionByToken } from "@/modules/identity/sessions";
import {
  emailOnlySchema,
  fieldErrors,
  loginSchema,
  resetPasswordSchema,
  signUpSchema,
} from "@/modules/identity/validation";

const TOO_MANY = "Muitas tentativas. Aguarde alguns minutos e tente novamente.";

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(formData);
  const values = { displayName: String(raw.displayName ?? ""), email: String(raw.email ?? "") };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), values };

  const result = await signUp(parsed.data, await requestContext());
  if (!result.ok) return { status: "error", message: TOO_MANY, values };
  return {
    status: "success",
    message: `Enviamos um link de confirmação para ${parsed.data.email}. Abra o e-mail para ativar sua conta.`,
  };
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(formData);
  const values = { email: String(raw.email ?? "") };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), values };

  const result = await login(parsed.data.email, parsed.data.password, await requestContext());
  if (!result.ok) {
    const message = {
      invalid: "E-mail ou senha incorretos.",
      rate_limited: TOO_MANY,
      unverified: "Confirme seu e-mail antes de entrar. Se não encontrou o link, peça um novo abaixo.",
      suspended: "Esta conta está suspensa. Fale com o suporte pela página de contato.",
    }[result.error];
    return { status: "error", message, values };
  }

  await setSessionCookie(result.token, result.expiresAt);
  redirect(safeNext(raw.next, result.staff ? "/admin" : "/app"));
}

export async function resendVerificationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailOnlySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  const result = await resendVerification(parsed.data.email, await requestContext());
  if (!result.ok) return { status: "error", message: TOO_MANY };
  return { status: "success", message: "Se houver uma conta pendente de confirmação para este e-mail, enviamos um novo link." };
}

export async function requestResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailOnlySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  const result = await requestPasswordReset(parsed.data.email, await requestContext());
  if (!result.ok) return { status: "error", message: TOO_MANY };
  return {
    status: "success",
    message: "Se houver uma conta com este e-mail, você receberá um link para criar uma nova senha. O link vale por 30 minutos.",
  };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrors(parsed.error), message: parsed.error.issues.some((i) => i.path[0] === "token") ? "Link inválido." : undefined };
  }
  const ok = await resetPassword(parsed.data.token, parsed.data.password, await requestContext());
  if (!ok) return { status: "error", message: "Este link expirou ou já foi usado. Peça um novo link de redefinição." };
  redirect("/entrar?senha=redefinida");
}

export async function logoutAction(): Promise<void> {
  const token = await readSessionToken();
  if (token) await revokeSessionByToken(token);
  await clearSessionCookie();
  redirect("/");
}

// Usado pela página de login: quem já está autenticado é levado direto à sua área.
export async function redirectIfAuthenticated(next?: string) {
  const session = await getSession();
  if (session) redirect(safeNext(next, "/app"));
}

export async function verifyEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const ok = token.length >= 20 && token.length <= 200 && (await verifyEmail(token));
  if (!ok) {
    return { status: "error", message: "Este link expirou ou já foi usado. Peça um novo na tela de login." };
  }
  redirect("/entrar?email=confirmado");
}

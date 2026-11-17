"use server";

import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { WEBAUTHN_COOKIE, webauthnCookieOptions } from "@/lib/auth/oauth-cookies";
import { finishPasskeyRegistration, PasskeyError, removePasskey, startPasskeyRegistration } from "@/modules/identity/passkeys";
import { requestContext, requireSession } from "@/lib/auth/current";
import type { FormState } from "@/lib/form-state";
import { cancelEnrollment, confirmEnrollment, disableMfa, MfaError, regenerateRecoveryCodes, startEnrollment } from "@/modules/identity/mfa";

const PATH = "/app/configuracoes/seguranca";

// Estado com os códigos de recuperação, exibidos uma única vez logo após serem gerados.
export type CodesState = FormState & { codes?: string[] };

function code(formData: FormData) {
  return String(formData.get("code") ?? "").trim().slice(0, 40);
}

async function guard<T extends FormState>(fn: () => Promise<T>): Promise<T | FormState> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof MfaError) return { status: "error", fieldErrors: { code: [error.message] } };
    throw error;
  }
}

export async function startEnrollmentAction(): Promise<void> {
  const session = await requireSession(PATH);
  await startEnrollment(session.user.id);
  revalidatePath(PATH);
}

export async function cancelEnrollmentAction(): Promise<void> {
  const session = await requireSession(PATH);
  await cancelEnrollment(session.user.id);
  revalidatePath(PATH);
}

// Sem revalidatePath: a página continua mostrando os códigos até a pessoa clicar em "Concluir".
export async function confirmEnrollmentAction(_prev: CodesState, formData: FormData): Promise<CodesState> {
  const session = await requireSession(PATH);
  const { ipHash } = await requestContext();
  return guard(async () => {
    const codes = await confirmEnrollment(session.user.id, session.sessionId, code(formData), ipHash);
    return { status: "success" as const, message: "Verificação em duas etapas ativada.", codes };
  });
}

export async function regenerateCodesAction(_prev: CodesState, formData: FormData): Promise<CodesState> {
  const session = await requireSession(PATH);
  const { ipHash } = await requestContext();
  return guard(async () => {
    const codes = await regenerateRecoveryCodes(session.user.id, code(formData), ipHash);
    return { status: "success" as const, message: "Novos códigos gerados. Os anteriores deixaram de valer.", codes };
  });
}

export async function disableMfaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession(PATH);
  const { ipHash } = await requestContext();
  const result = await guard(async () => {
    await disableMfa(session.user.id, code(formData), ipHash);
    return { status: "success" as const, message: "Verificação em duas etapas desativada." };
  });
  if (result.status === "success") revalidatePath(PATH);
  return result;
}

export async function passkeyRegisterOptionsAction(): Promise<{ ok: true; options: Awaited<ReturnType<typeof startPasskeyRegistration>>["options"] } | { ok: false; message: string }> {
  const session = await requireSession(PATH);
  try {
    const { options, challengeId } = await startPasskeyRegistration(session.user.id);
    (await cookies()).set(WEBAUTHN_COOKIE, challengeId, webauthnCookieOptions);
    return { ok: true, options };
  } catch (error) {
    if (error instanceof PasskeyError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function passkeyRegisterAction(response: RegistrationResponseJSON, name: string): Promise<{ ok: boolean; message: string }> {
  const session = await requireSession(PATH);
  const jar = await cookies();
  const challengeId = jar.get(WEBAUTHN_COOKIE)?.value ?? "";
  jar.delete(WEBAUTHN_COOKIE);
  const { ipHash } = await requestContext();
  try {
    await finishPasskeyRegistration(session.user.id, session.sessionId, challengeId, response, String(name ?? ""), ipHash);
  } catch (error) {
    if (error instanceof PasskeyError) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath(PATH);
  return { ok: true, message: "Chave de acesso cadastrada. Na próxima vez, use \"Entrar com chave de acesso\"." };
}

export async function removePasskeyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession(PATH);
  const { ipHash } = await requestContext();
  try {
    await removePasskey(session.user.id, String(formData.get("passkeyId") ?? ""), ipHash);
  } catch (error) {
    if (error instanceof PasskeyError) return { status: "error", message: error.message };
    throw error;
  }
  revalidatePath(PATH);
  return { status: "success", message: "Chave removida." };
}

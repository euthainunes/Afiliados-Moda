"use server";

import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { cookies } from "next/headers";
import { requestContext, safeNext, setSessionCookie } from "@/lib/auth/current";
import { WEBAUTHN_COOKIE, webauthnCookieOptions } from "@/lib/auth/oauth-cookies";
import { finishPasskeyLogin, startPasskeyLogin } from "@/modules/identity/passkeys";

export async function passkeyLoginOptionsAction() {
  const { options, challengeId } = await startPasskeyLogin();
  (await cookies()).set(WEBAUTHN_COOKIE, challengeId, webauthnCookieOptions);
  return options;
}

export async function passkeyLoginAction(response: AuthenticationResponseJSON, next?: string): Promise<{ ok: true; redirectTo: string } | { ok: false; message: string }> {
  const jar = await cookies();
  const challengeId = jar.get(WEBAUTHN_COOKIE)?.value ?? "";
  jar.delete(WEBAUTHN_COOKIE);
  const result = await finishPasskeyLogin(challengeId, response, await requestContext());
  if (!result.ok) {
    const message = {
      invalid: "Não reconhecemos esta chave de acesso. Tente de novo ou entre com e-mail e senha.",
      rate_limited: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
      suspended: "Esta conta está suspensa. Fale com o suporte pela página de contato.",
    }[result.error];
    return { ok: false, message };
  }
  await setSessionCookie(result.token, result.expiresAt);
  return { ok: true, redirectTo: safeNext(next, result.home) };
}

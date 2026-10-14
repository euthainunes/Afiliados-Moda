import "server-only";
import { cookies } from "next/headers";

const secure = process.env.NODE_ENV === "production";
// Estado da ida ao Google (state, nonce, PKCE e destino), válido por 10 minutos e só nas rotas do Google.
export const OAUTH_COOKIE = secure ? "__Secure-am_oauth" : "am_oauth";
// Cadastro pendente (dados assinados do Google), lido pela página de conclusão de cadastro.
export const GOOGLE_PENDING_COOKIE = secure ? "__Secure-am_google_signup" : "am_google_signup";

export async function readGooglePending(): Promise<string | undefined> {
  return (await cookies()).get(GOOGLE_PENDING_COOKIE)?.value;
}

export async function clearGooglePending(): Promise<void> {
  (await cookies()).delete(GOOGLE_PENDING_COOKIE);
}

export const oauthCookieOptions = { httpOnly: true, secure, sameSite: "lax" as const, path: "/api/auth/google", maxAge: 600 };
export const pendingCookieOptions = { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: 900 };

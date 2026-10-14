import { NextResponse, type NextRequest } from "next/server";
import { googleConfigured, startGoogleAuth } from "@/integrations/google/oidc";
import { safeNext } from "@/lib/auth/safe-next";
import { OAUTH_COOKIE, oauthCookieOptions } from "@/lib/auth/oauth-cookies";

// Início do login com Google: guarda state/nonce/PKCE num cookie e envia a pessoa ao Google.
export async function GET(request: NextRequest) {
  if (!googleConfigured()) return NextResponse.json({ error: "Login com Google não está disponível." }, { status: 404 });
  const { state, nonce, codeVerifier, url } = startGoogleAuth();
  const next = safeNext(request.nextUrl.searchParams.get("next"), "");
  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, nonce, codeVerifier, next }), oauthCookieOptions);
  return response;
}

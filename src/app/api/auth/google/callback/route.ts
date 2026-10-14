import { NextResponse, type NextRequest } from "next/server";
import { exchangeGoogleCode, googleConfigured, validateIdToken } from "@/integrations/google/oidc";
import { safeEqual, hmac } from "@/lib/crypto";
import { env } from "@/lib/env";
import { reportError } from "@/lib/observability";
import { safeNext } from "@/lib/auth/safe-next";
import { SESSION_COOKIE } from "@/lib/auth/current";
import { GOOGLE_PENDING_COOKIE, OAUTH_COOKIE, oauthCookieOptions, pendingCookieOptions } from "@/lib/auth/oauth-cookies";
import { RATE_LIMITS } from "@/modules/identity/policies";
import { consumeRateLimit } from "@/modules/identity/rate-limit";
import { signInWithGoogle } from "@/modules/identity/social";

function to(path: string) {
  return new URL(path, env().APP_URL);
}

// Volta do Google. Qualquer falha leva ao login com uma mensagem genérica (detalhes só no registro).
export async function GET(request: NextRequest) {
  if (!googleConfigured()) return NextResponse.json({ error: "Login com Google não está disponível." }, { status: 404 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconhecido";
  const ipHash = hmac(ip);
  const fail = (motivo: string) => {
    const r = NextResponse.redirect(to(`/entrar?google=${motivo}`));
    r.cookies.set(OAUTH_COOKIE, "", { ...oauthCookieOptions, maxAge: 0 });
    return r;
  };

  const limit = await consumeRateLimit(`login:ip:${ipHash}`, RATE_LIMITS.loginPerIp);
  if (!limit.ok) return fail("limite");

  let saved: { state?: string; nonce?: string; codeVerifier?: string; next?: string } = {};
  try {
    saved = JSON.parse(request.cookies.get(OAUTH_COOKIE)?.value ?? "{}");
  } catch {
    saved = {};
  }
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return fail("cancelado");
  const state = params.get("state") ?? "";
  const code = params.get("code") ?? "";
  // O state amarra a resposta ao navegador que iniciou o login (impede login forçado em conta alheia).
  if (!saved.state || !saved.nonce || !saved.codeVerifier || !code || !safeEqual(state, saved.state)) return fail("expirado");

  try {
    const idToken = await exchangeGoogleCode(code, saved.codeVerifier);
    const claims = validateIdToken(idToken, { nonce: saved.nonce });
    const result = await signInWithGoogle(claims, { ipHash, userAgent: request.headers.get("user-agent") });

    if (result.kind === "refused") return fail(result.reason === "suspended" ? "suspensa" : "indisponivel");
    if (result.kind === "needs_signup") {
      const r = NextResponse.redirect(to("/cadastro/google"));
      r.cookies.set(OAUTH_COOKIE, "", { ...oauthCookieOptions, maxAge: 0 });
      r.cookies.set(GOOGLE_PENDING_COOKIE, result.pending, pendingCookieOptions);
      return r;
    }
    const next = saved.next ? safeNext(saved.next) : undefined;
    const destination = result.mfaRequired
      ? `/entrar/verificacao${next ? `?next=${encodeURIComponent(next)}` : ""}`
      : (next ?? (result.staff ? "/admin" : "/app"));
    const r = NextResponse.redirect(to(destination));
    r.cookies.set(OAUTH_COOKIE, "", { ...oauthCookieOptions, maxAge: 0 });
    r.cookies.set(SESSION_COOKIE, result.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: result.expiresAt });
    return r;
  } catch (error) {
    reportError(error, { event: "auth.google_falhou" });
    return fail("erro");
  }
}

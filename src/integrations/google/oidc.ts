import { createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { HttpError, IntegrationConfigError, withRetry } from "../errors";

// Login com Google via OpenID Connect (fluxo de código de autorização com PKCE), conforme a documentação
// pública do Google ("OpenID Connect" em developers.google.com/identity). Preparado e testado com respostas
// simuladas; só fica ativo com GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET configurados.
export const GOOGLE = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  issuers: ["https://accounts.google.com", "accounts.google.com"],
  scope: "openid email profile",
} as const;

export function googleConfigured(): boolean {
  const e = env();
  return !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
}

function credentials() {
  const e = env();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) throw new IntegrationConfigError("Login com Google não configurado.");
  return { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET };
}

export function googleRedirectUri(): string {
  return `${env().APP_URL}/api/auth/google/callback`;
}

export type OAuthStart = { state: string; nonce: string; codeVerifier: string; url: string };

export function startGoogleAuth(): OAuthStart {
  const { clientId } = credentials();
  const state = randomBytes(24).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE.scope,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return { state, nonce, codeVerifier, url: `${GOOGLE.authorizationEndpoint}?${params.toString()}` };
}

export type GoogleClaims = { sub: string; email: string; name: string | null };

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new GoogleAuthError("ID token malformado.");
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new GoogleAuthError("ID token ilegível.");
  }
}

// Validação das declarações do ID token (OpenID Connect Core §3.1.3.7). A assinatura não é conferida
// porque o token chega DIRETAMENTE do endpoint de token do Google, por TLS e com o segredo do cliente
// (item 6 da mesma seção permite usar a validação TLS nesse caso). Não aceite ID tokens por outro caminho.
export function validateIdToken(idToken: string, { nonce, now = Date.now() }: { nonce: string; now?: number }): GoogleClaims {
  const { clientId } = credentials();
  const c = decodeJwtPayload(idToken);
  if (!GOOGLE.issuers.includes(c.iss as (typeof GOOGLE.issuers)[number])) throw new GoogleAuthError("Emissor inválido.");
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(clientId)) throw new GoogleAuthError("Destinatário inválido.");
  if (Array.isArray(c.aud) && c.aud.length > 1 && c.azp !== clientId) throw new GoogleAuthError("azp inválido.");
  if (typeof c.exp !== "number" || c.exp * 1000 < now - 60_000) throw new GoogleAuthError("Token expirado.");
  if (c.nonce !== nonce) throw new GoogleAuthError("nonce não confere.");
  if (typeof c.sub !== "string" || !c.sub) throw new GoogleAuthError("Sem identificador.");
  if (typeof c.email !== "string" || c.email_verified !== true) throw new GoogleAuthError("E-mail do Google não verificado.");
  return { sub: c.sub, email: c.email.trim().toLowerCase(), name: typeof c.name === "string" ? c.name.slice(0, 60) : null };
}

export async function exchangeGoogleCode(code: string, codeVerifier: string): Promise<string> {
  const { clientId, clientSecret } = credentials();
  const { value } = await withRetry(async () => {
    const res = await fetch(GOOGLE.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: googleRedirectUri(),
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new HttpError(res.status, `Google respondeu HTTP ${res.status} na troca do código`);
    return (await res.json()) as { id_token?: string };
  }, { attempts: 2 });
  if (!value.id_token) throw new GoogleAuthError("Resposta sem ID token.");
  return value.id_token;
}

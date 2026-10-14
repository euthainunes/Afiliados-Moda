import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { userIdentities, userMfa, users } from "@/lib/db/schema";
import { resetEnvCache } from "@/lib/env";
import { exchangeGoogleCode, GoogleAuthError, googleConfigured, startGoogleAuth, validateIdToken } from "@/integrations/google/oidc";
import { login } from "@/modules/identity/service";
import { createSession, validateSessionToken } from "@/modules/identity/sessions";
import { completeGoogleSignup, readPending, signInWithGoogle, signPending, SocialSignupError } from "@/modules/identity/social";
import { createUser, fakeEmail, fakeIp, TEST_PASSWORD } from "../support/factories";

// Respostas do Google SIMULADAS (formato da documentação pública). Nenhuma chamada real é feita.
const CLIENT_ID = "cliente-ficticio.apps.googleusercontent.com";
const ctx = () => ({ ip: fakeIp() });

function idToken(claims: Record<string, unknown>) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "RS256" })}.${b64(claims)}.assinatura-ficticia`;
}

const baseClaims = (over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  sub: `sub-${Math.random().toString(36).slice(2)}`,
  email: fakeEmail("google"),
  email_verified: true,
  name: "Gabi Google (fictícia)",
  nonce: "n-123",
  exp: Math.floor(Date.now() / 1000) + 300,
  ...over,
});

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = "segredo-ficticio";
  resetEnvCache();
});

afterEach(() => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  resetEnvCache();
  vi.unstubAllGlobals();
});

describe("protocolo OpenID Connect", () => {
  it("fica desligado sem credenciais", () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    resetEnvCache();
    expect(googleConfigured()).toBe(false);
    expect(() => startGoogleAuth()).toThrow();
  });

  it("monta a URL com state, nonce e PKCE S256", () => {
    const start = startGoogleAuth();
    const url = new URL(start.url);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("state")).toBe(start.state);
    expect(url.searchParams.get("nonce")).toBe(start.nonce);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).not.toBe(start.codeVerifier);
    expect(url.searchParams.get("redirect_uri")).toMatch(/\/api\/auth\/google\/callback$/);
  });

  it("valida emissor, destinatário, validade, nonce e e-mail verificado", () => {
    const ok = baseClaims();
    expect(validateIdToken(idToken(ok), { nonce: "n-123" })).toMatchObject({ sub: ok.sub, email: ok.email });
    for (const bad of [
      baseClaims({ iss: "https://evil.example" }),
      baseClaims({ aud: "outro-cliente" }),
      baseClaims({ exp: Math.floor(Date.now() / 1000) - 3600 }),
      baseClaims({ nonce: "outro" }),
      baseClaims({ email_verified: false }),
      baseClaims({ sub: "" }),
    ]) {
      expect(() => validateIdToken(idToken(bad), { nonce: "n-123" })).toThrow(GoogleAuthError);
    }
    expect(() => validateIdToken("nao-e-jwt", { nonce: "n-123" })).toThrow(GoogleAuthError);
  });

  it("troca o código enviando o verificador PKCE e o segredo do cliente", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id_token: "abc" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await exchangeGoogleCode("codigo-ficticio", "verificador")).toBe("abc");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("code_verifier")).toBe("verificador");
    expect(body.get("client_secret")).toBe("segredo-ficticio");
    expect(body.get("grant_type")).toBe("authorization_code");
  });
});

describe("vínculo de contas", () => {
  it("pessoa nova conclui o cadastro (aceites obrigatórios) e depois entra pelo mesmo sub, mesmo se o e-mail mudar", async () => {
    const claims = { sub: `sub-${Date.now()}`, email: fakeEmail("nova"), name: "Nova Fictícia" };
    const first = await signInWithGoogle(claims, ctx());
    expect(first.kind).toBe("needs_signup");
    if (first.kind !== "needs_signup") return;

    await expect(completeGoogleSignup(first.pending, { displayName: "Nova", acceptTerms: "on" }, ctx())).rejects.toThrow(); // sem 18+
    const session = await completeGoogleSignup(first.pending, { displayName: "Nova", acceptTerms: "on", isAdult: "on" }, ctx());
    expect((await validateSessionToken(session.token))?.user.email).toBe(claims.email);
    const user = await db.query.users.findFirst({ where: eq(users.email, claims.email) });
    expect(user?.emailVerifiedAt).not.toBeNull();
    await expect(completeGoogleSignup(first.pending, { displayName: "Nova", acceptTerms: "on", isAdult: "on" }, ctx())).rejects.toThrow(SocialSignupError);

    const again = await signInWithGoogle({ ...claims, email: fakeEmail("trocado") }, ctx());
    expect(again).toMatchObject({ kind: "session", linked: false });
  });

  it("vincula conta existente com e-mail confirmado e mantém a senha", async () => {
    const u = await createUser();
    const r = await signInWithGoogle({ sub: `sub-${u.id}`, email: u.email, name: null }, ctx());
    expect(r).toMatchObject({ kind: "session", linked: true });
    expect(await db.select().from(userIdentities).where(eq(userIdentities.userId, u.id))).toHaveLength(1);
    expect((await login(u.email, TEST_PASSWORD, ctx())).ok).toBe(true);
  });

  it("conta pré-cadastrada sem confirmar e-mail: senha antiga e sessões deixam de valer ao vincular", async () => {
    const u = await createUser({ verified: false });
    const attackerSession = await createSession(u.id);
    const r = await signInWithGoogle({ sub: `sub-${u.id}`, email: u.email, name: null }, ctx());
    expect(r.kind).toBe("session");
    expect(await login(u.email, TEST_PASSWORD, ctx())).toMatchObject({ ok: false, error: "invalid" });
    expect(await validateSessionToken(attackerSession.token)).toBeNull();
    expect((await db.query.users.findFirst({ where: eq(users.id, u.id) }))?.emailVerifiedAt).not.toBeNull();
  });

  it("respeita suspensão e segundo fator", async () => {
    const suspended = await createUser();
    await db.update(users).set({ status: "suspended" }).where(eq(users.id, suspended.id));
    expect(await signInWithGoogle({ sub: `s-${suspended.id}`, email: suspended.email, name: null }, ctx())).toEqual({ kind: "refused", reason: "suspended" });

    const withMfa = await createUser();
    await db.insert(userMfa).values({ userId: withMfa.id, secretEnc: "x", enabledAt: new Date() });
    const r = await signInWithGoogle({ sub: `m-${withMfa.id}`, email: withMfa.email, name: null }, ctx());
    expect(r).toMatchObject({ kind: "session", mfaRequired: true });
    if (r.kind === "session") expect(await validateSessionToken(r.token)).toBeNull();
  });

  it("cadastro pendente é assinado e expira", () => {
    const claims = { sub: "s", email: "a@exemplo.test", name: null };
    const token = signPending(claims);
    expect(readPending(token)).toEqual(claims);
    const [body, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, email: "vitima@exemplo.test", exp: Date.now() + 1e6 })).toString("base64url");
    expect(readPending(`${forged}.${mac}`)).toBeNull();
    expect(readPending(`${body}.x${mac.slice(1)}`)).toBeNull();
    expect(readPending(signPending(claims, Date.now() - 16 * 60_000))).toBeNull();
  });
});

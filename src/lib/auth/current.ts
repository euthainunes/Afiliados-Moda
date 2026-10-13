import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { hmac } from "@/lib/crypto";
import { can, type Principal } from "@/modules/access/can";
import type { Permission } from "@/modules/access/permissions";
import { validateSessionToken, type AuthenticatedSession } from "@/modules/identity/sessions";
import type { RequestContext } from "@/modules/identity/service";

// Em produção o prefixo __Host- obriga Secure, Path=/ e ausência de Domain.
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-am_session" : "am_session";

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

// Uma leitura por requisição (React cache), reaproveitada por layouts, páginas e actions.
export const getSession = cache(async (): Promise<AuthenticatedSession | null> => {
  const token = await readSessionToken();
  return token ? validateSessionToken(token) : null;
});

export function toPrincipal(session: AuthenticatedSession): Principal {
  return { id: session.user.id, roles: session.roles };
}

export async function requireSession(next?: string): Promise<AuthenticatedSession> {
  const session = await getSession();
  if (!session) redirect(next ? `/entrar?next=${encodeURIComponent(next)}` : "/entrar");
  return session;
}

// Áreas internas respondem 404 a quem não tem permissão, para não revelar sua existência.
export async function requirePermission(permission: Permission, next?: string): Promise<AuthenticatedSession> {
  const session = await requireSession(next);
  if (!can(toPrincipal(session), permission)) notFound();
  return session;
}

export async function requestContext(): Promise<RequestContext> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ipHash: ip ? hmac(ip) : null, userAgent: h.get("user-agent") };
}

export { safeNext } from "./safe-next";

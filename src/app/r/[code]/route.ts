import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/current";
import { hmac } from "@/lib/crypto";
import { resolveClick } from "@/modules/tracking/service";

// Redirecionador de cliques: /r/{code} → página do produto na loja, com o identificador de origem.
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  const userAgent = request.headers.get("user-agent");
  const session = await getSession().catch(() => null);

  const result = await resolveClick(code, {
    ipHash: ip ? hmac(ip) : null,
    uaHash: userAgent ? hmac(userAgent) : null,
    userAgent,
    referrer: request.headers.get("referer"),
    viewerUserId: session?.user.id ?? null,
  });
  if (!result) return NextResponse.redirect(new URL("/looks?link=invalido", request.url), 302);

  const response = NextResponse.redirect(result.url, 302);
  // O redirecionamento nunca é armazenado em cache: cada clique precisa gerar um registro novo.
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer-when-downgrade");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

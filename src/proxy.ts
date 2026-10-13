import { NextResponse, type NextRequest } from "next/server";

// Checagem otimista: sem cookie de sessão, redireciona ao login antes de renderizar.
// A validação real (sessão, papel, permissão) acontece no servidor, em cada layout, página e action.
const COOKIE = process.env.NODE_ENV === "production" ? "__Host-am_session" : "am_session";

export function proxy(request: NextRequest) {
  if (!request.cookies.has(COOKIE)) {
    const url = new URL("/entrar", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*", "/admin/:path*"] };

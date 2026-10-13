import { NextResponse, type NextRequest } from "next/server";

const COOKIE = process.env.NODE_ENV === "production" ? "__Host-am_session" : "am_session";

// Hosts de imagens das marcas (mesma variável do next.config). As imagens otimizadas passam por /_next/image
// ('self'); a lista cobre imagens servidas diretamente pela CDN da marca.
const imageHosts = (process.env.IMAGE_REMOTE_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter((h) => /^[a-z0-9.-]+$/i.test(h))
  .map((h) => `https://${h}`);

// Content Security Policy com nonce por requisição (docs do Next: guides/content-security-policy).
// Scripts: só os que carregam o nonce desta resposta (e o que eles carregarem, via 'strict-dynamic').
// Estilos: 'unsafe-inline' é necessário para atributos style do React/next/image; com nonce no style-src
// o navegador ignoraria 'unsafe-inline', por isso o nonce não entra ali.
export function buildCsp(nonce: string, { dev = false, https = false } = {}): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    ["img-src 'self' data: blob:", ...imageHosts].join(" "),
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Áreas autenticadas: sem cookie, vai direto ao login (a validação real da sessão é feita no servidor).
  const protectedArea = ["/app", "/admin"].some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (protectedArea && !request.cookies.has(COOKIE)) {
    const url = new URL("/entrar", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, {
    dev: process.env.NODE_ENV === "development",
    https: (process.env.APP_URL ?? "").startsWith("https://"),
  });

  // O Next lê o nonce do cabeçalho da requisição e o aplica aos próprios scripts durante a renderização.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Páginas HTML. Ficam de fora: rotas de API, arquivos estáticos, otimizador de imagens, ícones e o
      // redirecionador de cliques (/r/*), que não renderiza HTML.
      source: "/((?!api|r/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt|xml)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

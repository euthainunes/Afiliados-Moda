import type { NextConfig } from "next";

// Cabeçalhos de segurança aplicados a todas as rotas.
// A CSP completa (com nonce) será configurada na Fase 8; aqui ficam os cabeçalhos sem risco de quebrar a aplicação.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

// Hosts de imagens de produtos (CDNs das marcas), separados por vírgula. Ex.: "suntime.vteximg.com.br".
const imageHosts = (process.env.IMAGE_REMOTE_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: imageHosts.map((hostname) => ({ protocol: "https" as const, hostname })),
  },
  // Cache Components fica desligado na fundação: as áreas autenticadas são renderizadas por requisição.
  // Será reavaliado na Fase 4 para as páginas públicas de looks.
  cacheComponents: false,
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

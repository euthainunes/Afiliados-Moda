// Um destino só é aceito se usar https e pertencer a um domínio autorizado da marca (ou subdomínio dele).
export function isAllowedDomain(url: string, allowedDomains: readonly string[]): boolean {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
    host = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }
  return allowedDomains.some((d) => {
    const domain = d.toLowerCase().replace(/^\.+/, "");
    return host === domain || host.endsWith(`.${domain}`);
  });
}

// Hosts de imagem aceitos: os domínios da marca e os configurados em IMAGE_REMOTE_HOSTS (CDNs).
// Limita a quais servidores a aplicação faz requisições ao gerar imagens de compartilhamento.
export function imageHosts(): string[] {
  return (process.env.IMAGE_REMOTE_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
}

export function isAllowedImageUrl(url: string, brandDomains: readonly string[] = []): boolean {
  return isAllowedDomain(url, [...brandDomains, ...imageHosts()]);
}

// Endereços públicos https: recusa IPs literais de redes internas e nomes locais (proteção contra SSRF).
// Nomes que resolvem para IPs internos via DNS não são detectados aqui; a hospedagem serverless não
// tem acesso a redes privadas, mas em outra infraestrutura use também um proxy de saída.
export function isPublicHttpsUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return false;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return false;
  }
  if (host.includes(":") && (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80") || host.startsWith("::ffff:"))) return false;
  return true;
}

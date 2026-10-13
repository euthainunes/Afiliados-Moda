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

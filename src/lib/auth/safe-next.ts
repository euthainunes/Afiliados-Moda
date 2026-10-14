// Aceita apenas caminhos internos como destino pós-login (evita redirecionamento aberto).
// Navegadores ignoram tabulações e quebras de linha em URLs ("/\t/site.com" vira "//site.com"),
// então qualquer caractere de controle, barra invertida ou espaço recusa o valor; por fim, o caminho é
// interpretado como URL e precisa continuar na mesma origem.
const ORIGIN = "http://interno.invalid";

export function safeNext(value: unknown, fallback = "/app"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || /[\u0000- \u007f\\]/.test(value)) return fallback;
  let url: URL;
  try {
    url = new URL(value, ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== ORIGIN) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

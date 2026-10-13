// Aceita apenas caminhos internos como destino pós-login (evita redirecionamento aberto).
export function safeNext(value: unknown, fallback = "/app"): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/\\") &&
    !/[\r\n]/.test(value)
    ? value
    : fallback;
}

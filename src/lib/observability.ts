// Registro estruturado (uma linha JSON por evento). A hospedagem (ex.: Vercel) coleta a saída padrão;
// uma ferramenta de monitoramento (ex.: Sentry) pode ser ligada depois sem mudar quem chama estas funções.

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

// Chaves cujo valor nunca vai para o log, em qualquer nível de aninhamento.
const SECRET_KEYS = /pass(word)?|senha|token|secret|segredo|authorization|cookie|cpf|pix|api[-_]?key|^(code|otp|codigo)$/i;
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+)/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[profundo]";
  if (typeof value === "string") return value.replace(EMAIL, "$1***@$2").slice(0, 2000);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1) };
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Fields).map(([k, v]) => [k, SECRET_KEYS.test(k) ? "[omitido]" : redact(v, depth + 1)]),
    );
  }
  return value;
}

export function logEvent(level: Level, event: string, fields: Fields = {}): void {
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), env: process.env.APP_ENV ?? "development", ...(redact(fields) as Fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export function errorDigest(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : undefined;
}

// Erro inesperado: registra mensagem, tipo, identificador (digest, o mesmo exibido à pessoa) e as
// primeiras linhas da pilha. Nunca registra corpo de requisição, cookies ou cabeçalhos.
export function reportError(error: unknown, context: Fields = {}): void {
  const err = error instanceof Error ? error : new Error(String(error));
  logEvent("error", "erro_inesperado", {
    ...context,
    name: err.name,
    message: err.message,
    digest: errorDigest(error),
    stack: err.stack?.split("\n").slice(0, 8).join("\n"),
  });
}

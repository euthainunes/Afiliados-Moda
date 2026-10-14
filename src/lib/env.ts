import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET precisa de ao menos 32 caracteres"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  // Ambiente lógico da aplicação. Em "production", dados e adaptadores de demonstração são recusados.
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  MAIL_DRIVER: z.enum(["console", "memory", "resend"]).default("console"),
  MAIL_FROM: z.string().default("Afiliados Moda <nao-responda@exemplo.test>"),
  RESEND_API_KEY: z.string().optional(),
  // Chave de 32 bytes (base64) para criptografar dados pessoais sensíveis (CPF, chave PIX).
  PII_ENCRYPTION_KEY: z.string().optional(),
  // Verificação em duas etapas obrigatória para a equipe (operadoras e administradoras).
  // Em produção é sempre obrigatória; fora dela, vale o que estiver configurado (padrão: não obrigatória).
  REQUIRE_STAFF_MFA: z.enum(["true", "false"]).optional(),
  // Login com Google (OpenID Connect). Sem as duas variáveis, o botão não aparece e as rotas respondem 404.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

// Validação preguiçosa: falha com mensagem clara na primeira utilização, não no import.
export function env(): Env {
  if (!cached) {
    const parsed = schema.parse(process.env);
    if (parsed.APP_ENV === "production") {
      if (parsed.MAIL_DRIVER !== "resend") throw new Error("Em produção, configure um provedor de e-mail real (MAIL_DRIVER).");
      if (!parsed.PII_ENCRYPTION_KEY) throw new Error("Em produção, PII_ENCRYPTION_KEY é obrigatória.");
      if (parsed.REQUIRE_STAFF_MFA === "false") throw new Error("Em produção, a verificação em duas etapas da equipe não pode ser desligada.");
    }
    cached = parsed;
  }
  return cached;
}

// Usado apenas por testes para recarregar variáveis alteradas.
export function resetEnvCache() {
  cached = undefined;
}

export function isProduction(): boolean {
  return env().APP_ENV === "production";
}

export function staffMfaRequired(): boolean {
  const e = env();
  return e.APP_ENV === "production" || e.REQUIRE_STAFF_MFA === "true";
}

export class DemoNotAllowedError extends Error {
  constructor(what: string) {
    super(`${what}: dados e integrações de demonstração não são permitidos em produção.`);
    this.name = "DemoNotAllowedError";
  }
}

// Barreira única: qualquer caminho que gere ou use dados fictícios chama esta função.
export function assertDemoAllowed(what: string): void {
  if (isProduction()) throw new DemoNotAllowedError(what);
}

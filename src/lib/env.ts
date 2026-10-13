import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET precisa de ao menos 32 caracteres"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  MAIL_DRIVER: z.enum(["console", "memory"]).default("console"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

// Validação preguiçosa: falha com mensagem clara na primeira utilização, não no import.
export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

import { z } from "zod";

// Esquemas compartilhados entre formulários (cliente) e serviços (servidor).

export const emailSchema = z
  .string({ error: "Informe seu e-mail." })
  .trim()
  .toLowerCase()
  .max(254, "E-mail muito longo.")
  .pipe(z.email({ error: "Informe um e-mail válido." }));

export const passwordSchema = z
  .string({ error: "Informe uma senha." })
  .min(10, "A senha precisa ter ao menos 10 caracteres.")
  .max(128, "A senha pode ter no máximo 128 caracteres.");

const checkbox = (message: string) =>
  z.preprocess((v) => v === true || v === "on" || v === "true", z.literal(true, { error: message }));

export const signUpSchema = z.object({
  displayName: z
    .string({ error: "Informe seu nome." })
    .trim()
    .min(2, "Informe seu nome.")
    .max(60, "O nome pode ter no máximo 60 caracteres."),
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: checkbox("É preciso aceitar os termos, a política de privacidade e o regulamento."),
  isAdult: checkbox("É preciso ter 18 anos ou mais."),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe sua senha.").max(128),
});

export const emailOnlySchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não coincidem.",
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual.").max(128),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não coincidem.",
  });

export type FieldErrors = Record<string, string[] | undefined>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  return z.flattenError(error).fieldErrors as FieldErrors;
}

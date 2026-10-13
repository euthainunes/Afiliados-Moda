import type { FieldErrors } from "@/modules/identity/validation";

export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: FieldErrors;
  // Valores devolvidos ao formulário após erro (nunca senhas).
  values?: Record<string, string>;
};

export const initialFormState: FormState = { status: "idle" };

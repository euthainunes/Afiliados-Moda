import type { FormState } from "@/lib/form-state";
import { Alert } from "./alert";

export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <Alert tone={state.status === "success" ? "success" : "danger"}>{state.message}</Alert>;
}

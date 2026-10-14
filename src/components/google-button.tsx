import { buttonClasses } from "@/components/ui/button";
import { googleConfigured } from "@/integrations/google/oidc";

// Só aparece quando o login com Google está configurado (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET).
// Link comum (GET), não formulário: a CSP limita destinos de formulários ao próprio site.
export function GoogleButton({ next, label = "Continuar com Google" }: { next?: string; label?: string }) {
  if (!googleConfigured()) return null;
  const href = `/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  return (
    <>
      <a href={href} className={buttonClasses("secondary", "md", "w-full")}>{label}</a>
      <p className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">ou</p>
    </>
  );
}

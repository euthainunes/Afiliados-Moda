import Link from "next/link";
import { site } from "@/config/site";
import { buttonClasses } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="whitespace-nowrap font-display text-lg font-semibold sm:text-xl">
          {site.name}
        </Link>
        <nav aria-label="Principal" className="flex items-center gap-1 sm:gap-2">
          <Link href="/looks" className={buttonClasses("ghost", "sm")}>
            Looks
          </Link>
          <Link href="/entrar" className={buttonClasses("ghost", "sm")}>
            Entrar
          </Link>
          <Link href="/cadastro" className={buttonClasses("primary", "sm")}>
            Criar conta
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} {site.name} · nome provisório</p>
        <nav aria-label="Institucional" className="flex flex-wrap gap-4">
          <Link href="/termos" className="hover:underline">Termos de uso</Link>
          <Link href="/privacidade" className="hover:underline">Privacidade</Link>
          <Link href="/regulamento" className="hover:underline">Regulamento de recompensas</Link>
        </nav>
      </div>
    </footer>
  );
}

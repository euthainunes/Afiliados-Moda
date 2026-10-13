import Link from "next/link";
import { site } from "@/config/site";
import { logoutAction } from "@/app/(auth)/actions";
import { buttonClasses } from "@/components/ui/button";

export type NavItem = { href: string; label: string };

// Estrutura comum à área da usuária e ao painel. A navegação inferior no celular entra na Fase 4 com o montador.
export function AppShell({
  nav,
  userName,
  area,
  children,
}: {
  nav: NavItem[];
  userName: string;
  area?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="font-display text-xl font-semibold">
            {site.name}
          </Link>
          {area && <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-medium text-white">{area}</span>}
          <nav aria-label="Área" className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className={buttonClasses("ghost", "sm")}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{userName}</span>
            <form action={logoutAction}>
              <button type="submit" className={buttonClasses("secondary", "sm")}>
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
    </>
  );
}

import Link from "next/link";
import { site } from "@/config/site";
import { logoutAction } from "@/app/(auth)/actions";
import { buttonClasses } from "@/components/ui/button";

export type NavItem = { href: string; label: string };

// Estrutura comum à área da usuária e ao painel. A navegação inferior no celular entra na Fase 4 com o montador.
export function AppShell({
  nav,
  mobileNav,
  userName,
  area,
  notifications,
  children,
}: {
  notifications?: { href: string; unread: number };
  nav: NavItem[];
  // Navegação inferior fixa no celular (área da usuária). Quando presente, o menu superior some em telas pequenas.
  mobileNav?: NavItem[];
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
          <nav
            aria-label="Área"
            className={mobileNav ? "hidden flex-wrap gap-1 sm:flex" : "order-last flex w-full gap-1 overflow-x-auto sm:flex-wrap"}
          >
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className={buttonClasses("ghost", "sm")}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {notifications && (
              <Link href={notifications.href} className={buttonClasses("ghost", "sm")} aria-label={`Notificações${notifications.unread ? `: ${notifications.unread} não lidas` : ""}`}>
                <span aria-hidden>🔔</span>
                {notifications.unread > 0 && <span className="rounded-full bg-brand px-1.5 text-xs text-brand-ink">{notifications.unread > 99 ? "99+" : notifications.unread}</span>}
              </Link>
            )}
            <span className="hidden text-muted sm:inline">{userName}</span>
            <form action={logoutAction}>
              <button type="submit" className={buttonClasses("secondary", "sm")}>
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="conteudo" className={`mx-auto w-full max-w-6xl flex-1 px-4 py-8 ${mobileNav ? "pb-24 sm:pb-8" : ""}`}>
        {children}
      </main>
      {mobileNav && (
        <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface sm:hidden">
          <ul className="grid" style={{ gridTemplateColumns: `repeat(${mobileNav.length}, minmax(0, 1fr))` }}>
            {mobileNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="flex h-14 items-center justify-center px-1 text-center text-xs font-medium">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}

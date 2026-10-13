import { AppShell, type NavItem } from "@/components/app-shell";
import { requireSession, toPrincipal } from "@/lib/auth/current";
import { can } from "@/modules/access/can";

export default async function UserAreaLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession("/app");
  const nav: NavItem[] = [
    { href: "/app", label: "Início" },
    { href: "/app/catalogo", label: "Catálogo" },
    { href: "/app/looks", label: "Meus looks" },
    { href: "/app/favoritos", label: "Favoritos" },
    { href: "/app/configuracoes", label: "Conta" },
  ];
  const mobileNav: NavItem[] = [
    { href: "/app", label: "Início" },
    { href: "/app/catalogo", label: "Catálogo" },
    { href: "/app/looks", label: "Looks" },
    { href: "/app/favoritos", label: "Favoritos" },
    { href: "/app/configuracoes", label: "Conta" },
  ];
  if (can(toPrincipal(session), "admin.access")) nav.push({ href: "/admin", label: "Painel interno" });
  return (
    <AppShell nav={nav} mobileNav={mobileNav} userName={session.user.displayName}>
      {children}
    </AppShell>
  );
}

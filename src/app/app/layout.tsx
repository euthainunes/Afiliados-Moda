import { AppShell, type NavItem } from "@/components/app-shell";
import { requireSession, toPrincipal } from "@/lib/auth/current";
import { can } from "@/modules/access/can";

export default async function UserAreaLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession("/app");
  const nav: NavItem[] = [
    { href: "/app", label: "Início" },
    { href: "/app/configuracoes", label: "Conta e privacidade" },
  ];
  if (can(toPrincipal(session), "admin.access")) nav.push({ href: "/admin", label: "Painel interno" });
  return (
    <AppShell nav={nav} userName={session.user.displayName}>
      {children}
    </AppShell>
  );
}

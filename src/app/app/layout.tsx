import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { AppShell, type NavItem } from "@/components/app-shell";
import { requireSession, toPrincipal } from "@/lib/auth/current";
import { can } from "@/modules/access/can";
import { unreadCount } from "@/modules/notifications/service";

export default async function UserAreaLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession("/app");
  const unread = await unreadCount(session.user.id);
  // Contas só de marca parceira (sem perfil de criadora) veem apenas a conta e o portal.
  const creator = session.roles.includes("user");
  const accountOnly: NavItem[] = [{ href: "/app/configuracoes", label: "Conta" }];
  const nav: NavItem[] = !creator ? accountOnly : [
    { href: "/app", label: "Início" },
    { href: "/app/catalogo", label: "Catálogo" },
    { href: "/app/looks", label: "Meus looks" },
    { href: "/app/desempenho", label: "Desempenho" },
    { href: "/app/recompensas", label: "Recompensas" },
    { href: "/app/links", label: "Links" },
    { href: "/app/favoritos", label: "Favoritos" },
    { href: "/app/suporte", label: "Suporte" },
    { href: "/app/configuracoes", label: "Conta" },
  ];
  const mobileNav: NavItem[] | undefined = !creator ? undefined : [
    { href: "/app", label: "Início" },
    { href: "/app/catalogo", label: "Catálogo" },
    { href: "/app/looks", label: "Looks" },
    { href: "/app/recompensas", label: "Ganhos" },
    { href: "/app/configuracoes", label: "Conta" },
  ];
  if (can(toPrincipal(session), "admin.access")) nav.push({ href: "/admin", label: "Painel interno" });
  if (can(toPrincipal(session), "brand_portal.access")) nav.push({ href: "/marca", label: "Portal da marca" });
  return (
    <AppShell nav={nav} mobileNav={mobileNav} userName={session.user.displayName} notifications={{ href: "/app/notificacoes", unread }}>
      {session.mfa.enrollmentRequired && (
        <div className="mb-6">
          <Alert tone="warning" title="Acesso a dados comerciais bloqueado">
            Sua conta é da equipe ou de uma marca parceira: <Link href="/app/configuracoes/seguranca" className="font-medium underline">ative a verificação em duas etapas</Link> para acessar o painel ou o portal da marca.
          </Alert>
        </div>
      )}
      {children}
    </AppShell>
  );
}

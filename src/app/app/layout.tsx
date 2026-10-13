import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { AppShell, type NavItem } from "@/components/app-shell";
import { requireSession, toPrincipal } from "@/lib/auth/current";
import { can } from "@/modules/access/can";
import { unreadCount } from "@/modules/notifications/service";

export default async function UserAreaLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession("/app");
  const unread = await unreadCount(session.user.id);
  const nav: NavItem[] = [
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
  const mobileNav: NavItem[] = [
    { href: "/app", label: "Início" },
    { href: "/app/catalogo", label: "Catálogo" },
    { href: "/app/looks", label: "Looks" },
    { href: "/app/recompensas", label: "Ganhos" },
    { href: "/app/configuracoes", label: "Conta" },
  ];
  if (can(toPrincipal(session), "admin.access")) nav.push({ href: "/admin", label: "Painel interno" });
  return (
    <AppShell nav={nav} mobileNav={mobileNav} userName={session.user.displayName} notifications={{ href: "/app/notificacoes", unread }}>
      {session.mfa.enrollmentRequired && (
        <div className="mb-6">
          <Alert tone="warning" title="Painel interno bloqueado">
            Sua conta é da equipe: <Link href="/app/configuracoes/seguranca" className="font-medium underline">ative a verificação em duas etapas</Link> para acessar o painel.
          </Alert>
        </div>
      )}
      {children}
    </AppShell>
  );
}

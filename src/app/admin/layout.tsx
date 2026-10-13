import type { Metadata } from "next";
import { AppShell, type NavItem } from "@/components/app-shell";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { can } from "@/modules/access/can";

export const metadata: Metadata = { title: { default: "Painel", template: "%s · Painel" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePermission("admin.access", "/admin");
  const principal = toPrincipal(session);
  const nav: NavItem[] = [{ href: "/admin", label: "Visão geral" }];
  const add = (perm: Parameters<typeof can>[1], href: string, label: string) => can(principal, perm) && nav.push({ href, label });
  add("orders.read", "/admin/vendas", "Vendas");
  add("ledger.read", "/admin/financeiro", "Financeiro");
  add("payouts.review", "/admin/resgates", "Resgates");
  add("reconciliation.manage", "/admin/conciliacao", "Conciliação");
  add("users.read", "/admin/usuarias", "Usuárias");
  add("users.read", "/admin/suporte", "Suporte");
  add("brands.manage", "/admin/marcas", "Marcas");
  add("catalog.manage", "/admin/catalogo", "Catálogo");
  add("looks.moderate", "/admin/looks", "Looks");
  add("integrations.manage", "/admin/integracoes", "Integrações");
  add("reports.read", "/admin/relatorios", "Relatórios");
  add("team.manage", "/admin/equipe", "Equipe");
  add("settings.manage", "/admin/configuracoes", "Configurações");
  add("settings.manage", "/admin/saude", "Saúde");
  add("audit.read", "/admin/auditoria", "Auditoria");
  nav.push({ href: "/app", label: "Minha área" });
  return (
    <AppShell nav={nav} userName={session.user.displayName} area="Painel interno">
      {children}
    </AppShell>
  );
}

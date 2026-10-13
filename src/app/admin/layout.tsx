import type { Metadata } from "next";
import { AppShell, type NavItem } from "@/components/app-shell";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { can } from "@/modules/access/can";

export const metadata: Metadata = { title: { default: "Painel", template: "%s · Painel" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePermission("admin.access", "/admin");
  const principal = toPrincipal(session);
  const nav: NavItem[] = [{ href: "/admin", label: "Visão geral" }];
  if (can(principal, "users.read")) nav.push({ href: "/admin/usuarias", label: "Usuárias" });
  if (can(principal, "brands.manage")) nav.push({ href: "/admin/marcas", label: "Marcas" });
  if (can(principal, "catalog.manage")) nav.push({ href: "/admin/catalogo", label: "Catálogo" });
  if (can(principal, "looks.moderate")) nav.push({ href: "/admin/looks", label: "Looks" });
  if (can(principal, "reports.read")) nav.push({ href: "/admin/relatorios", label: "Relatórios" });
  if (can(principal, "team.manage")) nav.push({ href: "/admin/equipe", label: "Equipe" });
  if (can(principal, "audit.read")) nav.push({ href: "/admin/auditoria", label: "Auditoria" });
  nav.push({ href: "/app", label: "Minha área" });
  return (
    <AppShell nav={nav} userName={session.user.displayName} area="Painel interno">
      {children}
    </AppShell>
  );
}

import type { Metadata } from "next";
import { AppShell, type NavItem } from "@/components/app-shell";
import { can } from "@/modules/access/can";
import { portalContext } from "../brand";

export const metadata: Metadata = { title: { default: "Portal da marca", template: "%s · Portal da marca" }, robots: { index: false } };

export default async function BrandPortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { session, principal, brand, visible } = await portalContext(slug);
  const nav: NavItem[] = [
    { href: `/marca/${slug}`, label: "Visão geral" },
    { href: `/marca/${slug}/vendas`, label: "Vendas" },
    { href: `/marca/${slug}/faturas`, label: "Faturas" },
  ];
  if (visible.length > 1) nav.push({ href: "/marca", label: "Trocar marca" });
  nav.push(can(principal, "admin.access") ? { href: "/admin", label: "Painel interno" } : { href: "/app/configuracoes", label: "Conta" });
  return (
    <AppShell nav={nav} userName={session.user.displayName} area={`Portal · ${brand.name}`}>
      {children}
    </AppShell>
  );
}

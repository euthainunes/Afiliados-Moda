import "server-only";
import { notFound } from "next/navigation";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { brandsVisibleTo } from "@/modules/brand-portal/service";

// Resolve a marca do endereço entre as que a conta pode ver; marca alheia responde 404.
export async function portalContext(slug: string) {
  const session = await requirePermission("brand_portal.access", `/marca/${slug}`);
  const principal = toPrincipal(session);
  const visible = await brandsVisibleTo(principal);
  const brand = visible.find((b) => b.slug === slug);
  if (!brand) notFound();
  return { session, principal, brand, visible };
}

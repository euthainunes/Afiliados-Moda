import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/current";
import { BrandForm } from "../forms";

export const metadata: Metadata = { title: "Nova marca" };

export default async function NewBrandPage() {
  await requirePermission("brands.manage", "/admin/marcas/nova");
  return (
    <>
      <Link href="/admin/marcas" className="text-sm text-muted hover:underline">← Marcas</Link>
      <PageTitle>Nova marca</PageTitle>
      <Card>
        <BrandForm defaults={{ name: "", slug: "", status: "active", website: "", allowedDomains: "", trackingParams: "" }} />
      </Card>
    </>
  );
}

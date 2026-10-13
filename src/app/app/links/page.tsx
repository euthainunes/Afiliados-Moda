import type { Metadata } from "next";
import Link from "next/link";
import { LookStatusBadge } from "@/components/looks/look-status";
import { PageTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/current";
import { env } from "@/lib/env";
import { linksForUser } from "@/modules/finance/queries";
import { CopyButton } from "./copy-button";

export const metadata: Metadata = { title: "Meus links" };

export default async function LinksPage() {
  const session = await requireSession("/app/links");
  const links = await linksForUser(session.user.id);
  const base = env().APP_URL;
  return (
    <>
      <PageTitle description="Cada peça de um look publicado tem um link rastreável. Compartilhe o look inteiro ou só a peça.">Meus links</PageTitle>
      {links.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">
          Você ainda não tem links. <Link href="/app/looks" className="underline">Publique um look</Link> para gerá-los.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Peça</th>
                <th scope="col" className="px-4 py-3 font-medium">Look</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Cliques</th>
                <th scope="col" className="px-4 py-3 font-medium">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {links.map((l) => (
                <tr key={l.code}>
                  <td className="px-4 py-3">{l.productTitle}<p className="text-xs text-muted">{l.brandName}</p></td>
                  <td className="px-4 py-3">
                    {l.lookStatus === "published" && l.lookSlug ? <Link href={`/l/${l.lookSlug}`} className="underline">{l.lookTitle}</Link> : l.lookTitle}{" "}
                    {l.lookStatus !== "published" && <LookStatusBadge status={l.lookStatus} />}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.clicks}</td>
                  <td className="px-4 py-3">
                    <CopyButton text={`${base}/r/${l.code}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

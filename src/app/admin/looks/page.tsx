import type { Metadata } from "next";
import Link from "next/link";
import { LookStatusBadge } from "@/components/looks/look-status";
import { ActionForm } from "@/components/ui/action-form";
import { PageTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import { listLooksForModeration } from "@/modules/looks/service";
import { removeLookAction } from "./actions";

export const metadata: Metadata = { title: "Moderação de looks" };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function ModerationPage() {
  const session = await requirePermission("looks.moderate", "/admin/looks");
  const rows = await listLooksForModeration(toPrincipal(session));
  return (
    <>
      <PageTitle description="Looks publicados ficam visíveis na hora; a moderação é feita depois, com motivo registrado.">Moderação de looks</PageTitle>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">Nenhum look publicado.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Look</th>
                <th scope="col" className="px-4 py-3 font-medium">Autora</th>
                <th scope="col" className="px-4 py-3 font-medium">Publicado</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(({ look, creator }) => (
                <tr key={look.id} className="align-top">
                  <td className="px-4 py-3">
                    {look.status === "published" ? (
                      <Link href={`/l/${look.slug}`} target="_blank" className="font-medium underline">{look.title}</Link>
                    ) : (
                      <span className="font-medium">{look.title}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{creator.displayName}<p className="text-muted">@{creator.username}</p></td>
                  <td className="px-4 py-3 tabular-nums">{look.publishedAt ? dateFmt.format(look.publishedAt) : "—"}</td>
                  <td className="px-4 py-3">
                    <LookStatusBadge status={look.status} />
                    {look.removedReason && <p className="mt-1 text-xs text-muted">{look.removedReason}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {look.status === "published" && (
                      <ActionForm action={removeLookAction} hidden={{ lookId: look.id }}>
                        <div className="flex gap-2">
                          <label htmlFor={`motivo-${look.id}`} className="sr-only">Motivo</label>
                          <input id={`motivo-${look.id}`} name="reason" required minLength={5} placeholder="Motivo (obrigatório)" className="h-9 w-48 rounded-lg border border-line px-2" />
                          <SubmitButton size="sm" variant="danger" pendingLabel="Removendo…">Remover</SubmitButton>
                        </div>
                      </ActionForm>
                    )}
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

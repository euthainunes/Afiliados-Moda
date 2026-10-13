import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge } from "@/components/finance/money";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/current";
import { dateTimeFmt } from "@/lib/dates";
import { listNotifications } from "@/modules/notifications/service";
import { markAllReadAction } from "./actions";

export const metadata: Metadata = { title: "Notificações" };

export default async function NotificationsPage() {
  const session = await requireSession("/app/notificacoes");
  const items = await listNotifications(session.user.id);
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageTitle description="Vendas, liberações, resgates e respostas do suporte.">Notificações</PageTitle>
        {unread > 0 && (
          <form action={markAllReadAction}>
            <Button type="submit" variant="secondary" size="sm">Marcar todas como lidas</Button>
          </form>
        )}
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">Nada por aqui ainda.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {items.map((n) => (
            <li key={n.id} className={`flex gap-3 px-4 py-3 ${n.readAt ? "" : "bg-brand/5"}`}>
              <span aria-hidden className={`mt-2 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand"}`} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {n.title} {!n.readAt && <span className="sr-only">(não lida)</span>} {n.isDemo && <DemoBadge />}
                </p>
                <p className="text-sm text-muted">{n.body}</p>
                <p className="mt-1 text-xs text-muted">
                  {dateTimeFmt.format(n.createdAt)}
                  {n.link && (
                    <>
                      {" · "}
                      <Link href={n.link} className="underline">Ver</Link>
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

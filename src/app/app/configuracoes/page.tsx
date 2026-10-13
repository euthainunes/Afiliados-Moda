import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/current";
import { listActiveSessions } from "@/modules/identity/sessions";
import { revokeOtherSessionsAction, revokeSessionAction } from "./actions";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Conta e privacidade" };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

function describeDevice(ua: string | null) {
  if (!ua) return "Dispositivo desconhecido";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Outro sistema";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  return `${browser} · ${os}`;
}

export default async function SettingsPage() {
  const session = await requireSession("/app/configuracoes");
  const activeSessions = await listActiveSessions(session.user.id);

  return (
    <>
      <PageTitle>Conta e privacidade</PageTitle>
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="dados">
          <h2 id="dados" className="text-lg font-semibold">Seus dados</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted">Nome</dt>
            <dd>{session.user.displayName}</dd>
            <dt className="text-muted">Nome de usuária</dt>
            <dd>@{session.user.username}</dd>
            <dt className="text-muted">E-mail</dt>
            <dd>{session.user.email}</dd>
          </dl>
          <p className="mt-4 text-sm text-muted">
            Edição de perfil, exportação dos seus dados e exclusão da conta chegam nas próximas etapas.
          </p>
        </Card>

        <Card aria-labelledby="senha">
          <h2 id="senha" className="mb-4 text-lg font-semibold">Alterar senha</h2>
          <ChangePasswordForm />
        </Card>

        <Card aria-labelledby="sessoes">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="sessoes" className="text-lg font-semibold">Sessões ativas</h2>
            {activeSessions.length > 1 && (
              <form action={revokeOtherSessionsAction}>
                <Button type="submit" variant="secondary" size="sm">Sair dos outros dispositivos</Button>
              </form>
            )}
          </div>
          <ul className="mt-4 divide-y divide-line">
            {activeSessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {describeDevice(s.userAgent)} {s.id === session.sessionId && <Badge tone="success">Esta sessão</Badge>}
                  </p>
                  <p className="text-muted">
                    Iniciada em {dateFmt.format(s.createdAt)} · último acesso {dateFmt.format(s.lastSeenAt)}
                  </p>
                </div>
                <form action={revokeSessionAction}>
                  <input type="hidden" name="sessionId" value={s.id} />
                  <Button type="submit" variant="ghost" size="sm">Encerrar</Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

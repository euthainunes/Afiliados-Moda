import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, PageTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/current";
import { listActiveSessions } from "@/modules/identity/sessions";
import { revokeOtherSessionsAction, revokeSessionAction } from "./actions";
import { ChangePasswordForm } from "./change-password-form";
import { DeleteAccountForm, EmailPreferenceForm, ProfileForm } from "./privacy-forms";
import { db } from "@/lib/db";
import { profiles, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, session.user.id));
  const [account] = await db.select({ hasPassword: users.hasPassword }).from(users).where(eq(users.id, session.user.id));

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
        </Card>

        <Card aria-labelledby="perfil">
          <h2 id="perfil" className="mb-4 text-lg font-semibold">Perfil público</h2>
          <ProfileForm defaults={{ displayName: profile.displayName, username: profile.username, bio: profile.bio ?? "" }} />
        </Card>

        <Card aria-labelledby="senha">
          <h2 id="senha" className="mb-4 text-lg font-semibold">{account.hasPassword ? "Alterar senha" : "Criar senha"}</h2>
          {account.hasPassword ? (
            <ChangePasswordForm />
          ) : (
            <p className="text-sm text-muted">
              Você entra pelo Google e ainda não tem senha. Para poder entrar também com e-mail e senha, use{" "}
              <Link href="/recuperar-senha" className="font-medium text-ink underline">criar uma senha</Link>: enviamos um link ao seu e-mail.
            </p>
          )}
        </Card>

        <Card aria-labelledby="avisos-email">
          <h2 id="avisos-email" className="mb-1 text-lg font-semibold">Avisos por e-mail</h2>
          <p className="mb-4 text-sm text-muted">Os avisos sempre aparecem no sino da plataforma. Por e-mail, várias novidades do mesmo momento chegam juntas numa única mensagem.</p>
          <EmailPreferenceForm enabled={profile.emailNotifications} />
        </Card>

        <Card aria-labelledby="seguranca">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="seguranca" className="text-lg font-semibold">Verificação em duas etapas</h2>
              <p className="mt-1 text-sm text-muted">{session.mfa.enabled ? "Ativa: um código do celular é pedido a cada login." : "Desativada. Recomendamos ativar."}</p>
            </div>
            <Link href="/app/configuracoes/seguranca" className={buttonClasses("secondary", "sm")}>{session.mfa.enabled ? "Gerenciar" : "Ativar"}</Link>
          </div>
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

        <Card aria-labelledby="privacidade">
          <h2 id="privacidade" className="text-lg font-semibold">Seus dados (LGPD)</h2>
          <p className="mt-2 text-sm text-muted">
            Você pode baixar uma cópia dos seus dados a qualquer momento. Para outros pedidos (como revisão de dados ou revogação de consentimento), abra um atendimento na categoria Privacidade.
          </p>
          <a href="/app/configuracoes/exportar" className="mt-4 inline-flex h-9 items-center rounded-lg border border-line px-3 text-sm font-medium hover:bg-canvas">
            Baixar meus dados (JSON)
          </a>
          <div className="mt-8 border-t border-line pt-6">
            <h3 className="font-semibold text-danger">Excluir conta</h3>
            <p className="mt-1 mb-4 text-sm text-muted">
              Sua conta é anonimizada, seus looks saem do ar e seus dados de recebimento são apagados. Registros financeiros são mantidos sem identificação pelo prazo exigido por lei. Recompensas ainda não resgatadas são perdidas, conforme o regulamento.
            </p>
            <DeleteAccountForm hasPassword={account.hasPassword} />
          </div>
        </Card>
      </div>
    </>
  );
}

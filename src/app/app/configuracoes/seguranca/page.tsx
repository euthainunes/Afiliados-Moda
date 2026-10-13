import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/current";
import { dateFmt } from "@/lib/dates";
import { staffMfaRequired } from "@/lib/env";
import { isStaff } from "@/modules/access/can";
import { getMfaStatus } from "@/modules/identity/mfa";
import { cancelEnrollmentAction, startEnrollmentAction } from "./actions";
import { ConfirmEnrollmentForm, DisableMfaForm, RegenerateCodesForm } from "./forms";

export const metadata: Metadata = { title: "Segurança da conta" };

// Agrupa o segredo em blocos de 4 para facilitar a digitação manual no app.
function groupSecret(secret: string) {
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}

export default async function SecurityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const session = await requireSession("/app/configuracoes/seguranca");
  const status = await getMfaStatus(session.user.id);
  // Papéis efetivos podem estar suspensos (sem MFA); a exigência vale para quem é da equipe de fato.
  const staffLocked = (session.mfa.enrollmentRequired || isStaff(session.roles)) && staffMfaRequired();
  const qr = status.state === "enrolling" ? await QRCode.toDataURL(status.uri, { margin: 1, width: 220 }) : null;

  return (
    <>
      <PageTitle description="Proteja sua conta com um código do celular além da senha.">Segurança da conta</PageTitle>
      <div className="flex flex-col gap-6">
        {session.mfa.enrollmentRequired && (
          <Alert tone="warning" title="Ative a verificação em duas etapas para acessar o painel interno">
            Contas da equipe precisam do segundo fator. Enquanto ele não estiver ativo, o painel fica bloqueado para esta conta.
          </Alert>
        )}
        {params.aviso === "codigo-usado" && (
          <Alert tone="warning">
            Você entrou com um código de recuperação, que agora deixou de valer. Se restarem poucos, gere novos códigos abaixo.
          </Alert>
        )}

        <Card aria-labelledby="duas-etapas">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="duas-etapas" className="text-lg font-semibold">Verificação em duas etapas</h2>
            {status.state === "enabled" ? <Badge tone="success">Ativa</Badge> : <Badge tone="neutral">Desativada</Badge>}
          </div>

          {status.state === "disabled" && (
            <div className="mt-3 flex flex-col gap-4 text-sm">
              <p className="text-muted">
                Ao entrar, além da senha, será pedido um código de 6 dígitos gerado por um app autenticador (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).
              </p>
              <form action={startEnrollmentAction}>
                <Button type="submit">Ativar verificação em duas etapas</Button>
              </form>
            </div>
          )}

          {status.state === "enrolling" && qr && (
            <div className="mt-3 flex flex-col gap-5 text-sm">
              <ol className="list-decimal space-y-1 pl-5 text-muted">
                <li>No app autenticador, escolha adicionar conta e leia o QR code.</li>
                <li>Se não puder ler, digite a chave manualmente.</li>
                <li>Digite o código de 6 dígitos que o app mostrar.</li>
              </ol>
              <div className="flex flex-wrap items-start gap-6">
                {/* eslint-disable-next-line @next/next/no-img-element -- imagem gerada no servidor (data URL), sem otimização */}
                <img src={qr} alt="QR code para cadastrar a conta no app autenticador" width={220} height={220} className="rounded-lg border border-line" />
                <div className="min-w-0">
                  <p className="font-medium">Chave para digitar</p>
                  <p data-testid="mfa-secret" data-secret={status.secret} className="mt-1 break-all font-mono text-base">{groupSecret(status.secret)}</p>
                  <p className="mt-1 text-muted">Tipo: baseada em tempo · 6 dígitos · 30 segundos</p>
                </div>
              </div>
              <ConfirmEnrollmentForm />
              <form action={cancelEnrollmentAction}>
                <button type="submit" className="text-sm underline">Cancelar ativação</button>
              </form>
            </div>
          )}

          {status.state === "enabled" && (
            <div className="mt-3 flex flex-col gap-6 text-sm">
              <p className="text-muted">
                Ativa desde {dateFmt.format(status.enabledAt)}. Códigos de recuperação disponíveis: <strong className="text-ink">{status.recoveryCodesLeft}</strong> de 10.
              </p>
              {status.recoveryCodesLeft <= 3 && <Alert tone="warning">Restam poucos códigos de recuperação. Gere novos.</Alert>}
              <section aria-labelledby="codigos">
                <h3 id="codigos" className="mb-2 font-semibold">Códigos de recuperação</h3>
                <RegenerateCodesForm />
              </section>
              <section aria-labelledby="desativar">
                <h3 id="desativar" className="mb-2 font-semibold">Desativar</h3>
                {staffLocked ? (
                  <p className="text-muted">Contas da equipe não podem desativar a verificação em duas etapas. Em caso de troca de celular, gere novos códigos ou peça a outra administradora para redefinir.</p>
                ) : (
                  <DisableMfaForm />
                )}
              </section>
            </div>
          )}
        </Card>

        <p className="text-sm">
          <Link href="/app/configuracoes" className="underline">Voltar para Conta e privacidade</Link>
        </p>
      </div>
    </>
  );
}

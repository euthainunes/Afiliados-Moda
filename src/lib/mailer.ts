import { env } from "@/lib/env";

export type Mail = { to: string; subject: string; text: string };

// Caixa de saída em memória: usada nos testes automatizados para inspecionar e-mails enviados.
export const memoryOutbox: Mail[] = [];

// O provedor transacional (Resend/Postmark/SES) ainda será escolhido (docs/04). Até lá:
// - "console": imprime o e-mail no terminal (apenas desenvolvimento);
// - "memory": guarda em memória (testes).
export async function sendMail(mail: Mail): Promise<void> {
  const { MAIL_DRIVER, NODE_ENV } = env();
  if (MAIL_DRIVER === "memory") {
    memoryOutbox.push(mail);
    return;
  }
  if (NODE_ENV === "production") {
    throw new Error("Provedor de e-mail não configurado para produção.");
  }
  console.info(`\n[e-mail de desenvolvimento] para: ${mail.to}\nassunto: ${mail.subject}\n\n${mail.text}\n`);
}

import type { EmailProvider, OutgoingEmail } from "../contracts";
import { HttpError, IntegrationConfigError, withRetry } from "../errors";

// Desenvolvimento: imprime o e-mail no terminal.
export class ConsoleEmailProvider implements EmailProvider {
  readonly provider = "console";
  async send(mail: OutgoingEmail) {
    console.info(`\n[e-mail de desenvolvimento] para: ${mail.to}\nassunto: ${mail.subject}\n\n${mail.text}\n`);
    return { id: null };
  }
}

// Testes: guarda os e-mails em memória.
export const memoryOutbox: OutgoingEmail[] = [];
export class MemoryEmailProvider implements EmailProvider {
  readonly provider = "memory";
  async send(mail: OutgoingEmail) {
    memoryOutbox.push(mail);
    return { id: null };
  }
}

// Resend (API HTTP pública de envio). Exige conta, domínio verificado (SPF/DKIM) e RESEND_API_KEY.
// Preparado, mas só é usado quando MAIL_DRIVER=resend. Não foi testado contra a conta real.
export class ResendEmailProvider implements EmailProvider {
  readonly provider = "resend";
  constructor(
    private readonly apiKey: string | undefined,
    private readonly from: string,
  ) {
    if (!apiKey) throw new IntegrationConfigError("RESEND_API_KEY não configurada.");
  }
  async send(mail: OutgoingEmail) {
    const { value } = await withRetry(async () => {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new HttpError(res.status, `Provedor de e-mail respondeu HTTP ${res.status}`);
      return (await res.json()) as { id?: string };
    });
    return { id: value.id ?? null };
  }
}

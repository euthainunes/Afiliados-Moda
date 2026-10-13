import { env } from "@/lib/env";
import type { EmailProvider, OutgoingEmail } from "@/integrations/contracts";
import { ConsoleEmailProvider, MemoryEmailProvider, ResendEmailProvider } from "@/integrations/email/providers";

export { memoryOutbox } from "@/integrations/email/providers";
export type Mail = OutgoingEmail;

let provider: EmailProvider | undefined;

// O provedor é escolhido por configuração (MAIL_DRIVER). Em produção, env() já exige um provedor real.
function emailProvider(): EmailProvider {
  if (!provider) {
    const { MAIL_DRIVER, RESEND_API_KEY, MAIL_FROM } = env();
    provider =
      MAIL_DRIVER === "memory" ? new MemoryEmailProvider() : MAIL_DRIVER === "resend" ? new ResendEmailProvider(RESEND_API_KEY, MAIL_FROM) : new ConsoleEmailProvider();
  }
  return provider;
}

export async function sendMail(mail: Mail): Promise<void> {
  await emailProvider().send(mail);
}

import "server-only";
import { after } from "next/server";
import { reportError } from "@/lib/observability";
import { deliverNotificationEmails } from "./email";

// Dispara o envio dos e-mails pendentes depois que a resposta já foi entregue à pessoa.
// Se falhar aqui, a rotina agendada (/api/cron/enviar-avisos) envia depois.
export function scheduleNotificationEmails(): void {
  after(async () => {
    try {
      await deliverNotificationEmails({ limit: 50 });
    } catch (error) {
      reportError(error, { event: "avisos.agendamento_falhou" });
    }
  });
}

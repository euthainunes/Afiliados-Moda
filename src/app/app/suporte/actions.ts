"use server";

import { revalidatePath } from "next/cache";
import { scheduleNotificationEmails } from "@/modules/notifications/schedule";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession, toPrincipal } from "@/lib/auth/current";
import type { FormState } from "@/lib/form-state";
import { fieldErrors } from "@/modules/identity/validation";
import { AccessDeniedError } from "@/modules/access/can";
import { closeTicket, openTicket, replyTicket, SupportError } from "@/modules/support/service";

export async function openTicketAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireSession();
  const values = { category: String(fd.get("category") ?? ""), subject: String(fd.get("subject") ?? ""), body: String(fd.get("body") ?? "") };
  let id: string;
  try {
    id = (await openTicket(session.user.id, values as never)).id;
  } catch (error) {
    if (error instanceof z.ZodError) return { status: "error", fieldErrors: fieldErrors(error), values };
    if (error instanceof SupportError) return { status: "error", message: error.message, values };
    throw error;
  }
  redirect(`/app/suporte/${id}`);
}

export async function replyTicketAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireSession();
  const ticketId = String(fd.get("ticketId") ?? "");
  try {
    await replyTicket(toPrincipal(session), ticketId, String(fd.get("body") ?? ""));
  } catch (error) {
    // Só mensagens previstas chegam à tela; o resto vai ao registro de erros.
    if (error instanceof SupportError || error instanceof AccessDeniedError) return { status: "error", message: error.message };
    throw error;
  }
  revalidatePath(`/app/suporte/${ticketId}`);
  revalidatePath(`/admin/suporte/${ticketId}`);
  // Resposta da equipe gera aviso para a usuária.
  scheduleNotificationEmails();
  return { status: "success", message: "Mensagem enviada." };
}

export async function closeTicketAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requireSession();
  const ticketId = String(fd.get("ticketId") ?? "");
  try {
    await closeTicket(toPrincipal(session), ticketId);
  } catch (error) {
    if (error instanceof SupportError || error instanceof AccessDeniedError) return { status: "error", message: error.message };
    throw error;
  }
  revalidatePath(`/app/suporte/${ticketId}`);
  revalidatePath(`/admin/suporte/${ticketId}`);
  return { status: "success", message: "Atendimento encerrado." };
}

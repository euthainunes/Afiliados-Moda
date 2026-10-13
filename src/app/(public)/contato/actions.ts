"use server";

import { z } from "zod";
import { requestContext } from "@/lib/auth/current";
import type { FormState } from "@/lib/form-state";
import { fieldErrors } from "@/modules/identity/validation";
import { consumeRateLimit } from "@/modules/identity/rate-limit";
import { openPublicContact } from "@/modules/support/service";

export async function publicContactAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = { name: String(fd.get("name") ?? ""), email: String(fd.get("email") ?? ""), category: String(fd.get("category") ?? ""), subject: String(fd.get("subject") ?? ""), body: String(fd.get("body") ?? "") };
  const ctx = await requestContext();
  const limit = await consumeRateLimit(`contact:ip:${ctx.ipHash ?? "desconhecido"}`, { limit: 5, windowSec: 3600 });
  if (!limit.ok) return { status: "error", message: "Muitas mensagens enviadas. Tente novamente mais tarde.", values };
  try {
    await openPublicContact(values as never);
  } catch (error) {
    if (error instanceof z.ZodError) return { status: "error", fieldErrors: fieldErrors(error), values };
    throw error;
  }
  return { status: "success", message: "Mensagem recebida! Responderemos pelo e-mail informado." };
}

import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { profiles, supportMessages, supportTickets } from "@/lib/db/schema";
import { assertCan, type Principal } from "@/modules/access/can";
import { recordAudit } from "@/modules/audit/service";
import { notify } from "@/modules/notifications/service";
import { RATE_LIMITS } from "@/modules/identity/policies";
import { consumeRateLimit } from "@/modules/identity/rate-limit";

export const CATEGORY_LABELS = {
  conta: "Conta e acesso",
  looks: "Looks e catálogo",
  recompensas: "Vendas e recompensas",
  resgate: "Resgates",
  privacidade: "Privacidade e dados pessoais",
  marca: "Sou uma marca",
  outro: "Outro assunto",
} as const;

export const ticketSchema = z.object({
  category: z.enum(["conta", "looks", "recompensas", "resgate", "privacidade", "marca", "outro"]),
  subject: z.string().trim().min(5, "Descreva o assunto (mínimo de 5 caracteres).").max(120),
  body: z.string().trim().min(10, "Conte um pouco mais (mínimo de 10 caracteres).").max(4000),
});

export const publicContactSchema = ticketSchema.extend({
  name: z.string().trim().min(2, "Informe seu nome.").max(80),
  email: z.email({ error: "Informe um e-mail válido." }).max(254),
});

export class SupportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupportError";
  }
}

export async function openTicket(userId: string, input: z.input<typeof ticketSchema>) {
  const data = ticketSchema.parse(input);
  const limit = await consumeRateLimit(`tickets:user:${userId}`, RATE_LIMITS.ticketsPerUser);
  if (!limit.ok) throw new SupportError("Você abriu vários atendimentos seguidos. Aguarde a resposta ou tente de novo mais tarde.");
  return db.transaction(async (tx) => {
    const [ticket] = await tx.insert(supportTickets).values({ userId, category: data.category, subject: data.subject }).returning();
    await tx.insert(supportMessages).values({ ticketId: ticket.id, authorId: userId, body: data.body });
    return ticket;
  });
}

export async function openPublicContact(input: z.input<typeof publicContactSchema>) {
  const data = publicContactSchema.parse(input);
  return db.transaction(async (tx) => {
    const [ticket] = await tx.insert(supportTickets).values({ category: data.category, subject: data.subject, contactEmail: data.email.toLowerCase(), contactName: data.name }).returning();
    await tx.insert(supportMessages).values({ ticketId: ticket.id, body: data.body });
    return ticket;
  });
}

export async function listMyTickets(userId: string) {
  return db.select().from(supportTickets).where(eq(supportTickets.userId, userId)).orderBy(desc(supportTickets.updatedAt));
}

// Leitura de um atendimento: a dona vê o seu; a equipe com permissão vê todos.
export async function getTicket(viewer: Principal, ticketId: string) {
  if (!z.uuid().safeParse(ticketId).success) return null;
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId));
  if (!ticket) return null;
  const staff = viewer.roles.includes("admin") || viewer.roles.includes("operator");
  if (ticket.userId !== viewer.id && !staff) return null;
  const messages = await db
    .select({ message: supportMessages, authorName: profiles.displayName })
    .from(supportMessages)
    .leftJoin(profiles, eq(profiles.userId, supportMessages.authorId))
    .where(eq(supportMessages.ticketId, ticketId))
    .orderBy(asc(supportMessages.createdAt));
  return { ticket, messages };
}

export async function replyTicket(viewer: Principal, ticketId: string, body: string) {
  const text = body.trim();
  if (text.length < 2 || text.length > 4000) throw new SupportError("Mensagem inválida.");
  const data = await getTicket(viewer, ticketId);
  if (!data) throw new SupportError("Atendimento não encontrado.");
  if (data.ticket.status === "closed") throw new SupportError("Este atendimento está encerrado. Abra um novo, se precisar.");
  const fromStaff = data.ticket.userId !== viewer.id;
  if (fromStaff) assertCan(viewer, "users.read");
  await db.transaction(async (tx) => {
    await tx.insert(supportMessages).values({ ticketId, authorId: viewer.id, fromStaff, body: text });
    await tx.update(supportTickets).set({ status: fromStaff ? "answered" : "open" }).where(eq(supportTickets.id, ticketId));
    if (fromStaff && data.ticket.userId) {
      await notify({ userId: data.ticket.userId, type: "support_reply", title: "Resposta do suporte", body: `Respondemos: "${data.ticket.subject}".`, link: `/app/suporte/${ticketId}`, dedupeKey: `ticket:${ticketId}:${Date.now()}` }, tx);
    }
  });
}

export async function closeTicket(viewer: Principal, ticketId: string) {
  const data = await getTicket(viewer, ticketId);
  if (!data) throw new SupportError("Atendimento não encontrado.");
  await db.update(supportTickets).set({ status: "closed" }).where(eq(supportTickets.id, ticketId));
  if (data.ticket.userId !== viewer.id) await recordAudit({ actorId: viewer.id, actorRoles: viewer.roles, action: "support.closed", entityType: "support_ticket", entityId: ticketId });
}

export async function listTicketsForStaff(actor: Principal, status?: "open" | "answered" | "closed") {
  assertCan(actor, "users.read");
  return db
    .select({ ticket: supportTickets, userName: profiles.displayName })
    .from(supportTickets)
    .leftJoin(profiles, eq(profiles.userId, supportTickets.userId))
    .where(status ? and(eq(supportTickets.status, status)) : undefined)
    .orderBy(desc(supportTickets.updatedAt))
    .limit(200);
}

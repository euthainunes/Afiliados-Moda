import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  clicks,
  consents,
  conversions,
  authTokens,
  favorites,
  looks,
  mfaRecoveryCodes,
  notifications,
  payoutAccounts,
  payoutRequests,
  profiles,
  sessions,
  supportTickets,
  userIdentities,
  userMfa,
  userRoles,
  users,
} from "@/lib/db/schema";
import { hmac, randomToken, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import { recordAudit } from "@/modules/audit/service";
import { RATE_LIMITS } from "@/modules/identity/policies";
import { consumeRateLimit } from "@/modules/identity/rate-limit";
import { consumeToken, issueToken } from "@/modules/identity/service";
import { userBalances } from "@/modules/finance/ledger";
import { hashPassword, verifyPassword } from "@/modules/identity/password";

export class PrivacyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivacyError";
  }
}

export const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Informe seu nome.").max(60),
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{3,30}$/, "Use de 3 a 30 letras, números ou _."),
  bio: z.string().trim().max(300, "Máximo de 300 caracteres.").optional().transform((v) => v || null),
});

// Correção de dados (LGPD, art. 18, III).
export async function updateProfile(userId: string, input: z.input<typeof profileSchema>) {
  const data = profileSchema.parse(input);
  const [taken] = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(and(sql`lower(${profiles.username}) = ${data.username.toLowerCase()}`, sql`${profiles.userId} <> ${userId}`));
  if (taken) throw new PrivacyError("Este nome de usuária já está em uso.");
  await db.update(profiles).set(data).where(eq(profiles.userId, userId));
}

// Acesso/portabilidade (LGPD, art. 18, II e V): exporta os dados da titular em JSON.
// Dados de compradoras não existem na plataforma; CPF e chave PIX aparecem apenas mascarados.
export async function exportMyData(userId: string) {
  const [user] = await db.select({ email: users.email, createdAt: users.createdAt, emailVerifiedAt: users.emailVerifiedAt, lastLoginAt: users.lastLoginAt }).from(users).where(eq(users.id, userId));
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  const [account] = await db.select({ holderName: payoutAccounts.holderName, pixKeyType: payoutAccounts.pixKeyType, pixKeyHint: payoutAccounts.pixKeyHint }).from(payoutAccounts).where(eq(payoutAccounts.userId, userId));
  const data = {
    geradoEm: new Date().toISOString(),
    conta: user,
    perfil: profile ? { nome: profile.displayName, usuaria: profile.username, bio: profile.bio } : null,
    papeis: (await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId))).map((r) => r.role),
    consentimentos: await db.select({ documento: consents.document, versao: consents.version, aceitoEm: consents.acceptedAt }).from(consents).where(eq(consents.userId, userId)),
    sessoesAtivas: (await db.select({ criadaEm: sessions.createdAt, ultimoAcesso: sessions.lastSeenAt, navegador: sessions.userAgent }).from(sessions).where(and(eq(sessions.userId, userId), sql`${sessions.revokedAt} is null`))),
    looks: await db.select({ titulo: looks.title, status: looks.status, slug: looks.slug, publicadoEm: looks.publishedAt }).from(looks).where(eq(looks.userId, userId)),
    favoritos: (await db.select({ productId: favorites.productId }).from(favorites).where(eq(favorites.userId, userId))).length,
    cliquesRecebidos: (await db.select({ n: sql<number>`count(*)::int` }).from(clicks).where(eq(clicks.userId, userId)))[0].n,
    vendasAtribuidas: await db.select({ estado: conversions.state, recompensaCentavos: conversions.userRewardCents, registradaEm: conversions.registeredAt, demonstracao: conversions.isDemo }).from(conversions).where(eq(conversions.userId, userId)),
    saldos: await userBalances(userId),
    resgates: await db.select({ valorCentavos: payoutRequests.amountCents, status: payoutRequests.status, solicitadoEm: payoutRequests.requestedAt, demonstracao: payoutRequests.isDemo }).from(payoutRequests).where(eq(payoutRequests.userId, userId)),
    dadosDeRecebimento: account ?? null,
    atendimentos: await db.select({ assunto: supportTickets.subject, status: supportTickets.status, criadoEm: supportTickets.createdAt }).from(supportTickets).where(eq(supportTickets.userId, userId)),
    notificacoes: (await db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(eq(notifications.userId, userId)))[0].n,
  };
  await recordAudit({ actorId: userId, action: "privacy.export", entityType: "user", entityId: userId });
  return data;
}

// Eliminação (LGPD, art. 18, VI): anonimiza a conta. Registros financeiros são mantidos de forma
// pseudonimizada pelo prazo legal (cumprimento de obrigação legal), sem dados que identifiquem a titular.
// Caminho 1: quem tem senha confirma com a senha.
export async function deleteMyAccount(userId: string, password: string, confirmation: string) {
  assertConfirmation(confirmation);
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || user.status === "deleted") throw new PrivacyError("Conta não encontrada.");
  if (!user.hasPassword) throw new PrivacyError("Sua conta não tem senha. Use o link de confirmação por e-mail.");
  if (!(await verifyPassword(user.passwordHash, password))) throw new PrivacyError("Senha incorreta.");
  await anonymizeAccount(userId, "senha");
}

// Caminho 2 (contas sem senha, ex.: criadas pelo Google, ou quem esqueceu a senha): um link de uso único
// enviado ao e-mail da conta comprova que a pedido vem da titular.
export async function requestAccountDeletionLink(userId: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || user.status !== "active") throw new PrivacyError("Conta não encontrada.");
  await assertDeletable(userId);
  const limit = await consumeRateLimit(`email:addr:${hmac(user.email)}`, RATE_LIMITS.emailPerAddress);
  if (!limit.ok) throw new PrivacyError("Já enviamos links recentemente. Confira sua caixa de entrada ou tente daqui a uma hora.");
  const token = await issueToken(userId, "account_deletion");
  await sendMail({
    to: user.email,
    subject: "Confirme a exclusão da sua conta",
    text: `Recebemos um pedido para excluir sua conta. Para confirmar, acesse o link abaixo (válido por 30 minutos) e digite EXCLUIR:\n\n${env().APP_URL}/excluir-conta?token=${encodeURIComponent(token)}\n\nSe não foi você, ignore esta mensagem e troque sua senha: nada será excluído.`,
  });
}

// Lido pela página do link: confere sem consumir, para mostrar o formulário só a quem tem link válido.
export async function deletionLinkIsValid(token: string): Promise<boolean> {
  if (!token || token.length > 200) return false;
  const row = await db.query.authTokens.findFirst({
    where: and(eq(authTokens.tokenHash, sha256(token)), eq(authTokens.type, "account_deletion"), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())),
  });
  return !!row;
}

export async function deleteAccountWithLink(token: string, confirmation: string): Promise<void> {
  assertConfirmation(confirmation);
  if (!token || token.length > 200) throw new PrivacyError("Link inválido ou expirado. Peça um novo em Conta e privacidade.");
  const userId = await consumeToken(token, "account_deletion");
  if (!userId) throw new PrivacyError("Link inválido ou expirado. Peça um novo em Conta e privacidade.");
  await anonymizeAccount(userId, "link por e-mail");
}

function assertConfirmation(confirmation: string) {
  if (confirmation.trim().toUpperCase() !== "EXCLUIR") throw new PrivacyError("Digite EXCLUIR para confirmar.");
}

async function assertDeletable(userId: string) {
  const staff = await db.select().from(userRoles).where(and(eq(userRoles.userId, userId), inArray(userRoles.role, ["admin", "operator"])));
  if (staff.length) throw new PrivacyError("Contas da equipe interna precisam ter o acesso removido por uma administradora antes da exclusão.");
  const [open] = await db.select({ id: payoutRequests.id }).from(payoutRequests).where(and(eq(payoutRequests.userId, userId), inArray(payoutRequests.status, ["requested", "approved"])));
  if (open) throw new PrivacyError("Há um resgate em andamento. Aguarde a conclusão ou cancele-o antes de excluir a conta.");
}

async function anonymizeAccount(userId: string, via: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || user.status === "deleted") throw new PrivacyError("Conta não encontrada.");
  await assertDeletable(userId);
  const tag = randomToken(6).replace(/[-_]/g, "x").toLowerCase();
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ email: `excluida-${tag}@anonimizada.invalid`, passwordHash: await hashPassword(randomToken(32)), hasPassword: false, status: "deleted", emailVerifiedAt: null })
      .where(eq(users.id, userId));
    await tx.update(profiles).set({ displayName: "Conta excluída", username: `excluida_${tag}`, bio: null, avatarUrl: null }).where(eq(profiles.userId, userId));
    await tx.update(looks).set({ status: "unpublished" }).where(and(eq(looks.userId, userId), eq(looks.status, "published")));
    await tx.delete(payoutAccounts).where(eq(payoutAccounts.userId, userId));
    await tx.delete(favorites).where(eq(favorites.userId, userId));
    await tx.delete(notifications).where(eq(notifications.userId, userId));
    await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, userId));
    // Segundo fator, contas externas vinculadas e links pendentes deixam de existir com a conta.
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
    await tx.delete(userMfa).where(eq(userMfa.userId, userId));
    await tx.delete(userIdentities).where(eq(userIdentities.userId, userId));
    await tx.update(authTokens).set({ usedAt: new Date() }).where(and(eq(authTokens.userId, userId), isNull(authTokens.usedAt)));
    await recordAudit({ actorId: userId, action: "privacy.account_deleted", entityType: "user", entityId: userId, after: { confirmadoPor: via } }, tx);
  });
}

// Preferência de avisos por e-mail. Avisos que ainda estão na fila também deixam de ser enviados.
export async function setEmailNotifications(userId: string, enabled: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(profiles).set({ emailNotifications: enabled }).where(eq(profiles.userId, userId));
    if (!enabled) {
      await tx.update(notifications).set({ emailStatus: "skipped" }).where(and(eq(notifications.userId, userId), eq(notifications.emailStatus, "pending")));
    }
    await recordAudit({ actorId: userId, action: "privacy.email_notifications", entityType: "user", entityId: userId, after: { enabled } }, tx);
  });
}

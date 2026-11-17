"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import type { FormState } from "@/lib/form-state";
import { AccessDeniedError } from "@/modules/access/can";
import {
  FinanceError,
  issueInvoice,
  markPayoutPaid,
  proposeAdjustment,
  registerBrandPayment,
  resolveReconciliationItem,
  reviewAdjustment,
  reviewPayout,
  runEligibility,
  runReconciliation,
} from "@/modules/finance/operations";
import { scheduleNotificationEmails } from "@/modules/notifications/schedule";
import { reprocessOrder } from "@/modules/orders/sync";
import type { Permission } from "@/modules/access/permissions";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

function reaisToCents(v: string): number | null {
  const m = v.trim().replace(/\./g, "").replace(",", ".").match(/^(-?\d{1,9})(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const sign = m[1].startsWith("-") ? -1 : 1;
  return sign * (Math.abs(Number(m[1])) * 100 + Number((m[2] ?? "").padEnd(2, "0")));
}

// Executa uma ação financeira: confere permissão no servidor, converte erros esperados em mensagem
// e atualiza as telas afetadas.
async function run(permission: Permission, paths: string[], fn: (actor: ReturnType<typeof toPrincipal>) => Promise<string | void>): Promise<FormState> {
  const session = await requirePermission(permission);
  let message: string | void;
  try {
    message = await fn(toPrincipal(session));
  } catch (error) {
    if (error instanceof FinanceError || error instanceof AccessDeniedError) return { status: "error", message: error.message };
    if (error instanceof Error && /PIX|identificador/.test(error.message)) return { status: "error", message: error.message };
    throw error;
  }
  for (const p of paths) revalidatePath(p);
  // Ações financeiras costumam gerar avisos (resgate pago, recompensa liberada…): envia os e-mails em seguida.
  scheduleNotificationEmails();
  return { status: "success", message: message || "Feito." };
}

export async function issueInvoiceAction(_p: FormState, fd: FormData) {
  return run("brand_payments.record", ["/admin/financeiro"], async (a) => {
    const inv = await issueInvoice(a, str(fd, "brandId"), new Date());
    return `Fatura nº ${inv.number} emitida.`;
  });
}

export async function registerPaymentAction(_p: FormState, fd: FormData) {
  return run("brand_payments.record", ["/admin/financeiro"], async (a) => {
    const cents = reaisToCents(str(fd, "amount"));
    if (cents == null || cents <= 0) throw new FinanceError("Informe o valor recebido.");
    if (!fd.get("confirm")) throw new FinanceError("Confirme que o valor consta no extrato bancário (ou que é uma simulação).");
    await registerBrandPayment(a, str(fd, "invoiceId"), { amountCents: cents, receivedAt: new Date(), reference: str(fd, "reference") });
    return "Recebimento registrado.";
  });
}

export async function reviewPayoutAction(_p: FormState, fd: FormData) {
  const decision = str(fd, "decision") === "approve" ? "approve" : "reject";
  const state = await run(decision === "approve" ? "payouts.approve" : "payouts.review", ["/admin/resgates"], async (a) => {
    await reviewPayout(a, str(fd, "payoutId"), decision, str(fd, "note"));
  });
  // O item sai da lista filtrada; a confirmação aparece no topo da página.
  if (state.status === "success") redirect(`/admin/resgates?aviso=${decision === "approve" ? "aprovado" : "recusado"}`);
  return state;
}

export async function markPaidAction(_p: FormState, fd: FormData) {
  const state = await run("payouts.mark_paid", ["/admin/resgates"], async (a) => {
    if (!fd.get("confirm")) throw new FinanceError("Confirme a operação antes de registrar.");
    await markPayoutPaid(a, str(fd, "payoutId"), str(fd, "reference") || null);
  });
  if (state.status === "success") redirect("/admin/resgates?aviso=pago");
  return state;
}

export async function proposeAdjustmentAction(_p: FormState, fd: FormData) {
  return run("ledger.adjust.propose", ["/admin/financeiro"], async (a) => {
    const cents = reaisToCents(str(fd, "amount"));
    if (cents == null || cents === 0) throw new FinanceError("Informe o valor (negativo para débito).");
    await proposeAdjustment(a, { userId: str(fd, "userId"), amountCents: cents, reason: str(fd, "reason"), isDemo: fd.get("isDemo") === "on" });
    return "Ajuste proposto. Outra pessoa precisa aprová-lo.";
  });
}

export async function reviewAdjustmentAction(_p: FormState, fd: FormData) {
  return run("ledger.adjust.approve", ["/admin/financeiro"], async (a) => {
    const approve = str(fd, "decision") === "approve";
    await reviewAdjustment(a, str(fd, "adjustmentId"), approve);
    return approve ? "Ajuste aprovado e lançado." : "Ajuste rejeitado.";
  });
}

export async function runRoutinesAction(_p: FormState) {
  void _p;
  return run("reconciliation.manage", ["/admin/financeiro", "/admin/conciliacao", "/admin/vendas"], async () => {
    const rec = await runReconciliation();
    const elig = await runEligibility();
    return `Conciliação: ${rec.created} divergência(s) nova(s). Elegibilidade: ${elig.released} liberada(s), ${elig.waitingBrandPayment} aguardando pagamento da marca.`;
  });
}

export async function resolveItemAction(_p: FormState, fd: FormData) {
  return run("reconciliation.manage", ["/admin/conciliacao"], async (a) => {
    await resolveReconciliationItem(a, str(fd, "itemId"), str(fd, "note"));
    return "Divergência explicada.";
  });
}

export async function reprocessOrderAction(_p: FormState, fd: FormData) {
  return run("events.reprocess", ["/admin/vendas"], async () => {
    const r = await reprocessOrder(str(fd, "orderId"));
    return r.kind === "processed" ? `Reprocessado (${r.changed ? "com alterações" : "sem alterações"}).` : `Reprocessado: ${"reason" in r ? r.reason : ""}`;
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission, toPrincipal } from "@/lib/auth/current";
import type { FormState } from "@/lib/form-state";
import { AccessDeniedError } from "@/modules/access/can";
import {
  approveRule,
  CommercialError,
  proposeRule,
  rejectRule,
  saveBrand,
  saveCampaign,
  saveFeed,
} from "@/modules/commercial/service";
import { fieldErrors } from "@/modules/identity/validation";

const values = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;

// Converte erros esperados (validação, regra de negócio, permissão) em mensagem no formulário.
async function handle(fd: FormData, fn: () => Promise<void>, success: string): Promise<FormState> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof z.ZodError) return { status: "error", fieldErrors: fieldErrors(error), values: values(fd) };
    if (error instanceof CommercialError || error instanceof AccessDeniedError) return { status: "error", message: error.message, values: values(fd) };
    throw error;
  }
  return { status: "success", message: success };
}

export async function saveBrandAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requirePermission("brands.manage");
  const brandId = String(fd.get("brandId") ?? "") || undefined;
  let id = brandId;
  const state = await handle(
    fd,
    async () => {
      id = await saveBrand(toPrincipal(session), values(fd) as never, brandId);
    },
    "Marca salva.",
  );
  if (state.status === "success" && !brandId) redirect(`/admin/marcas/${id}`);
  revalidatePath(`/admin/marcas/${id ?? ""}`);
  return state;
}

export async function saveFeedAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requirePermission("integrations.manage");
  const brandId = String(fd.get("brandId") ?? "");
  const state = await handle(fd, () => saveFeed(toPrincipal(session), brandId, String(fd.get("source") ?? ""), String(fd.get("feedId") ?? "") || undefined), "Feed salvo.");
  revalidatePath(`/admin/marcas/${brandId}`);
  return state;
}

export async function saveCampaignAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requirePermission("campaigns.manage");
  const brandId = String(fd.get("brandId") ?? "");
  const campaignId = String(fd.get("campaignId") ?? "") || undefined;
  const state = await handle(fd, async () => void (await saveCampaign(toPrincipal(session), brandId, values(fd) as never, campaignId)), "Campanha salva.");
  revalidatePath(`/admin/marcas/${brandId}`);
  if (campaignId) revalidatePath(`/admin/marcas/${brandId}/campanhas/${campaignId}`);
  return state.status === "success" && !campaignId ? { status: "success", message: "Campanha criada." } : state;
}

function rulePath(fd: FormData) {
  return `/admin/marcas/${fd.get("brandId")}/campanhas/${fd.get("campaignId")}`;
}

export async function proposeRuleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requirePermission("commission_rules.propose");
  const state = await handle(fd, async () => void (await proposeRule(toPrincipal(session), String(fd.get("campaignId") ?? ""), values(fd) as never)), "Regra proposta. Outra administradora precisa aprová-la.");
  revalidatePath(rulePath(fd));
  return state;
}

export async function approveRuleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requirePermission("commission_rules.approve");
  const state = await handle(fd, () => approveRule(toPrincipal(session), String(fd.get("ruleId") ?? ""), String(fd.get("note") ?? "")), "Regra aprovada.");
  revalidatePath(rulePath(fd));
  return state;
}

export async function rejectRuleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await requirePermission("commission_rules.approve");
  const state = await handle(fd, () => rejectRule(toPrincipal(session), String(fd.get("ruleId") ?? ""), String(fd.get("note") ?? "")), "Regra rejeitada.");
  revalidatePath(rulePath(fd));
  return state;
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth/current";
import type { FormState } from "@/lib/form-state";
import { toggleFavorite } from "@/modules/catalog/queries";
import {
  addItem,
  createLook,
  deleteDraft,
  LookError,
  lookDetailsSchema,
  moveItem,
  publishLook,
  removeItem,
  unpublishLook,
  updateDetails,
} from "@/modules/looks/service";
import { fieldErrors } from "@/modules/identity/validation";

// Toda action relê a sessão e passa o id da usuária ao serviço, que verifica a propriedade do look.

function str(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

async function run(lookId: string, fn: () => Promise<void>, success?: string): Promise<FormState> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof LookError) return { status: "error", message: error.message };
    throw error;
  }
  revalidatePath(`/app/looks/${lookId}`);
  revalidatePath("/app/looks");
  return success ? { status: "success", message: success } : { status: "idle" };
}

export async function createLookAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const productId = formData.get("productId");
  let lookId: string;
  try {
    lookId = await createLook(session.user.id, typeof productId === "string" && productId ? productId : undefined);
  } catch (error) {
    if (error instanceof LookError) redirect(`/app/looks?aviso=${encodeURIComponent(error.message)}`);
    throw error;
  }
  redirect(`/app/looks/${lookId}`);
}

export async function addToLookAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const productId = str(formData, "productId");
  const lookId = str(formData, "lookId");
  if (lookId === "novo" || !lookId) {
    let id: string;
    try {
      id = await createLook(session.user.id, productId);
    } catch (error) {
      if (error instanceof LookError) return { status: "error", message: error.message };
      throw error;
    }
    redirect(`/app/looks/${id}`);
  }
  return run(lookId, () => addItem(session.user.id, lookId, productId), "Peça adicionada ao look.");
}

export async function addItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const lookId = str(formData, "lookId");
  return run(lookId, () => addItem(session.user.id, lookId, str(formData, "productId")), "Peça adicionada.");
}

export async function removeItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const lookId = str(formData, "lookId");
  return run(lookId, () => removeItem(session.user.id, lookId, str(formData, "productId")));
}

export async function moveItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const lookId = str(formData, "lookId");
  const direction = str(formData, "direction") === "up" ? "up" : "down";
  return run(lookId, () => moveItem(session.user.id, lookId, str(formData, "productId"), direction));
}

export async function saveDetailsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const lookId = str(formData, "lookId");
  const input = { title: str(formData, "title"), description: str(formData, "description") };
  const parsed = lookDetailsSchema.safeParse(input);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), values: input };
  const result = await run(lookId, () => updateDetails(session.user.id, lookId, input), "Alterações salvas.");
  return { ...result, values: input };
}

export async function publishAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const lookId = str(formData, "lookId");
  let slug: string | undefined;
  try {
    const result = await publishLook(session.user.id, lookId);
    if (!result.ok) return { status: "error", message: result.problems.map((p) => p.message).join(" ") };
    slug = result.slug;
  } catch (error) {
    if (error instanceof LookError) return { status: "error", message: error.message };
    throw error;
  }
  revalidatePath(`/app/looks/${lookId}`);
  revalidatePath("/app/looks");
  revalidatePath(`/l/${slug}`);
  return { status: "success", message: "Look publicado! Agora é só compartilhar." };
}

export async function unpublishAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const lookId = str(formData, "lookId");
  return run(lookId, () => unpublishLook(session.user.id, lookId), "Look despublicado. O link deixou de funcionar.");
}

export async function deleteDraftAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const lookId = str(formData, "lookId");
  const result = await run(lookId, () => deleteDraft(session.user.id, lookId));
  if (result.status === "error") return result;
  redirect("/app/looks");
}

export async function toggleFavoriteAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const productId = str(formData, "productId");
  if (!z.uuid().safeParse(productId).success) return;
  await toggleFavorite(session.user.id, productId);
  revalidatePath("/app/favoritos");
  revalidatePath(`/app/produtos/${productId}`);
  revalidatePath("/app/catalogo");
}

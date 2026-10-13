"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/current";
import { markAllRead } from "@/modules/notifications/service";

export async function markAllReadAction(): Promise<void> {
  const session = await requireSession();
  await markAllRead(session.user.id);
  revalidatePath("/app", "layout");
}

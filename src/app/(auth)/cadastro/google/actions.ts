"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requestContext, setSessionCookie } from "@/lib/auth/current";
import { clearGooglePending, readGooglePending } from "@/lib/auth/oauth-cookies";
import type { FormState } from "@/lib/form-state";
import { completeGoogleSignup, SocialSignupError } from "@/modules/identity/social";
import { fieldErrors } from "@/modules/identity/validation";

export async function completeGoogleSignupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(formData);
  const values = { displayName: String(raw.displayName ?? "") };
  let session;
  try {
    session = await completeGoogleSignup(await readGooglePending(), raw, await requestContext());
  } catch (error) {
    if (error instanceof ZodError) return { status: "error", fieldErrors: fieldErrors(error), values };
    if (error instanceof SocialSignupError) return { status: "error", message: error.message, values };
    throw error;
  }
  await clearGooglePending();
  await setSessionCookie(session.token, session.expiresAt);
  redirect("/app");
}

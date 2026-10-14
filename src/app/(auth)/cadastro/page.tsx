import type { Metadata } from "next";
import Link from "next/link";
import { redirectIfAuthenticated } from "../actions";
import { GoogleButton } from "@/components/google-button";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignUpPage() {
  await redirectIfAuthenticated();
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Criar conta</h1>
      <p className="mb-6 mt-1 text-muted">Monte looks, compartilhe e acompanhe suas recompensas.</p>
      <GoogleButton label="Cadastrar com Google" />
      <SignUpForm />
      <p className="mt-6 text-center text-sm text-muted">
        Já tem conta? <Link href="/entrar" className="font-medium text-ink underline">Entrar</Link>
      </p>
    </>
  );
}

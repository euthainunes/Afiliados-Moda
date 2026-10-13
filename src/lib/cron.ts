import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";

// Autoriza rotas agendadas: exige "Authorization: Bearer <CRON_SECRET>" (mínimo de 32 caracteres).
export function cronUnauthorized(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32 || !safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  return null;
}

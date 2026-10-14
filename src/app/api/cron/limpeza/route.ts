import { NextResponse, type NextRequest } from "next/server";
import { cronUnauthorized } from "@/lib/cron";
import { runCleanup } from "@/modules/system/cleanup";
import { logEvent } from "@/lib/observability";

// Rotina diária de retenção: remove sessões, links e limites vencidos e anonimiza contatos antigos.
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  const result = await runCleanup();
  logEvent("info", "cron.limpeza", result);
  return NextResponse.json(result);
}

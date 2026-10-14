import { NextResponse, type NextRequest } from "next/server";
import { cronUnauthorized } from "@/lib/cron";
import { syncAllOrderSources } from "@/modules/integrations/admin";
import { logEvent } from "@/lib/observability";

export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  const results = await syncAllOrderSources();
  const failed = results.filter((r) => r.status === "failed").length;
  logEvent(failed ? "warn" : "info", "cron.sincronizar_pedidos", { total: results.length, failed });
  return NextResponse.json({ results }, { status: failed > 0 ? 207 : 200 });
}

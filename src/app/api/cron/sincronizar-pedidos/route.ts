import { NextResponse, type NextRequest } from "next/server";
import { cronUnauthorized } from "@/lib/cron";
import { syncAllOrderSources } from "@/modules/integrations/admin";

export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  const results = await syncAllOrderSources();
  const failed = results.filter((r) => r.status === "failed").length;
  console.info("[cron] sincronização de pedidos", { total: results.length, failed });
  return NextResponse.json({ results }, { status: failed > 0 ? 207 : 200 });
}

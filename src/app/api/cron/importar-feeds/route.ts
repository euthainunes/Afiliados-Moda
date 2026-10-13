import { NextResponse, type NextRequest } from "next/server";
import { cronUnauthorized } from "@/lib/cron";
import { importAllFeeds } from "@/modules/catalog/scheduler";

// Disparada pelo agendador (ex.: Vercel Cron) com "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  const results = await importAllFeeds();
  const failed = results.filter((r) => r.result.status === "failed").length;
  console.info("[cron] importação de feeds", { total: results.length, failed });
  return NextResponse.json({ results }, { status: failed > 0 ? 207 : 200 });
}

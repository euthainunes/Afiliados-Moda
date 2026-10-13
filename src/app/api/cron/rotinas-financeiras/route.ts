import { NextResponse, type NextRequest } from "next/server";
import { cronUnauthorized } from "@/lib/cron";
import { runEligibility, runReconciliation } from "@/modules/finance/operations";

// Rotina diária: libera recompensas elegíveis e procura divergências financeiras.
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  const reconciliation = await runReconciliation();
  const eligibility = await runEligibility();
  console.info("[cron] rotinas financeiras", { eligibility, reconciliation });
  return NextResponse.json({ eligibility, reconciliation });
}

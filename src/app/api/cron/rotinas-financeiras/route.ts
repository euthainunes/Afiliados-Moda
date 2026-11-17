import { NextResponse, type NextRequest } from "next/server";
import { cronUnauthorized } from "@/lib/cron";
import { scheduleNotificationEmails } from "@/modules/notifications/schedule";
import { runEligibility, runReconciliation } from "@/modules/finance/operations";
import { logEvent } from "@/lib/observability";

// Rotina diária: libera recompensas elegíveis e procura divergências financeiras.
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  const reconciliation = await runReconciliation();
  const eligibility = await runEligibility();
  logEvent("info", "cron.rotinas_financeiras", { eligibility, reconciliation });
  scheduleNotificationEmails();
  return NextResponse.json({ eligibility, reconciliation });
}

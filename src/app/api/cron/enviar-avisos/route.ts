import { NextResponse, type NextRequest } from "next/server";
import { cronUnauthorized } from "@/lib/cron";
import { deliverNotificationEmails } from "@/modules/notifications/email";

// Rotina frequente: envia os avisos por e-mail que ainda estão na fila (inclui novas tentativas).
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  return NextResponse.json(await deliverNotificationEmails());
}

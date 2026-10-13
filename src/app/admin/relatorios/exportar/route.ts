import { NextResponse, type NextRequest } from "next/server";
import { getSession, toPrincipal } from "@/lib/auth/current";
import { can } from "@/modules/access/can";
import { exportClickReport } from "@/modules/reporting/metrics";
import { parsePeriod } from "../period";

// Exportação autorizada e auditada (reports.export).
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !can(toPrincipal(session), "reports.export")) return new NextResponse("Não encontrado.", { status: 404 });
  const period = parsePeriod(Object.fromEntries(request.nextUrl.searchParams));
  const csv = await exportClickReport(toPrincipal(session), period);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cliques-${period.fromStr}-a-${period.toStr}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

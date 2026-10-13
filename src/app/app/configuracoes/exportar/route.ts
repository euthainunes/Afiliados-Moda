import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/current";
import { exportMyData } from "@/modules/privacy/service";

// Portabilidade (LGPD): baixa os dados da própria titular em JSON.
export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse("Não autenticada.", { status: 401 });
  const data = await exportMyData(session.user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="meus-dados-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}

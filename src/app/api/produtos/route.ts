import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/current";
import { catalogFiltersSchema, searchProducts } from "@/modules/catalog/queries";

// Busca usada pelo montador de looks. Exige sessão; retorna apenas dados públicos do catálogo.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticada." }, { status: 401 });
  const filters = catalogFiltersSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const result = await searchProducts({ ...filters, disponivel: true }, 12);
  return NextResponse.json(
    { items: result.items, total: result.total },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

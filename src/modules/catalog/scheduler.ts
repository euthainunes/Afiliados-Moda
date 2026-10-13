import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, importRuns, productFeeds } from "@/lib/db/schema";
import { importFeed, type ImportResult } from "./importer";

// Importa todos os feeds de marcas ativas. Chamado pelo agendador (rota /api/cron/importar-feeds).
export async function importAllFeeds(): Promise<{ feedId: string; brand: string; result: ImportResult | { status: "skipped"; reason: string } }[]> {
  const feeds = await db
    .select({ id: productFeeds.id, brand: brands.name })
    .from(productFeeds)
    .innerJoin(brands, eq(brands.id, productFeeds.brandId))
    .where(eq(brands.status, "active"));
  const results = [];
  for (const feed of feeds) {
    // Evita reimportar um feed que já rodou nos últimos 30 minutos (ex.: disparo manual recente).
    const recent = await db
      .select({ id: importRuns.id })
      .from(importRuns)
      .where(and(eq(importRuns.feedId, feed.id), gte(importRuns.startedAt, sql`now() - interval '30 minutes'`)))
      .limit(1);
    if (recent.length) {
      results.push({ feedId: feed.id, brand: feed.brand, result: { status: "skipped" as const, reason: "importado há menos de 30 minutos" } });
      continue;
    }
    results.push({ feedId: feed.id, brand: feed.brand, result: await importFeed(feed.id, null) });
  }
  return results;
}

export type FeedHealth = {
  feedId: string;
  brand: string;
  lastStatus: "running" | "succeeded" | "failed" | null;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  consecutiveFailures: number;
  alert: string | null;
};

// Saúde das integrações de catálogo: alerta em falhas seguidas ou ausência de sucesso recente.
export async function feedHealth(staleHours = 24): Promise<FeedHealth[]> {
  const feeds = await db
    .select({ id: productFeeds.id, brand: brands.name, brandStatus: brands.status })
    .from(productFeeds)
    .innerJoin(brands, eq(brands.id, productFeeds.brandId));
  return Promise.all(
    feeds.map(async (f) => {
      const runs = await db.select().from(importRuns).where(eq(importRuns.feedId, f.id)).orderBy(desc(importRuns.startedAt)).limit(20);
      const lastSuccess = runs.find((r) => r.status === "succeeded");
      let consecutiveFailures = 0;
      for (const r of runs) {
        if (r.status !== "failed") break;
        consecutiveFailures++;
      }
      const stale = !lastSuccess || Date.now() - lastSuccess.startedAt.getTime() > staleHours * 3600_000;
      const alert =
        f.brandStatus !== "active"
          ? null
          : consecutiveFailures >= 2
            ? `${consecutiveFailures} importações seguidas falharam.`
            : !lastSuccess
              ? "Nenhuma importação concluída ainda."
              : stale
                ? `Sem importação bem-sucedida há mais de ${staleHours} horas.`
                : null;
      return {
        feedId: f.id,
        brand: f.brand,
        lastStatus: runs[0]?.status ?? null,
        lastRunAt: runs[0]?.startedAt ?? null,
        lastSuccessAt: lastSuccess?.startedAt ?? null,
        consecutiveFailures,
        alert,
      };
    }),
  );
}

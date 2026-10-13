import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

// Janela fixa armazenada no Postgres: funciona em ambiente serverless sem depender de Redis no MVP.
export async function consumeRateLimit(
  key: string,
  { limit, windowSec }: { limit: number; windowSec: number },
): Promise<RateLimitResult> {
  const rows = await db.execute<{ count: number; window_start: Date }>(sql`
    insert into rate_limit_buckets (key, count, window_start)
    values (${key}, 1, now())
    on conflict (key) do update set
      count = case when rate_limit_buckets.window_start < now() - make_interval(secs => ${windowSec})
                   then 1 else rate_limit_buckets.count + 1 end,
      window_start = case when rate_limit_buckets.window_start < now() - make_interval(secs => ${windowSec})
                   then now() else rate_limit_buckets.window_start end
    returning count, window_start
  `);
  const row = rows[0];
  if (row.count <= limit) return { ok: true };
  const elapsed = (Date.now() - new Date(row.window_start).getTime()) / 1000;
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil(windowSec - elapsed)) };
}

export async function resetRateLimit(key: string): Promise<void> {
  await db.execute(sql`delete from rate_limit_buckets where key = ${key}`);
}

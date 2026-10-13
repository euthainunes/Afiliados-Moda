import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, importRuns, productFeeds } from "@/lib/db/schema";
import { assertCan, type Principal } from "@/modules/access/can";

export async function listFeedsWithRuns(actor: Principal) {
  assertCan(actor, "catalog.manage");
  const feeds = await db
    .select({ feed: productFeeds, brandName: brands.name, brandFictitious: brands.isFictitious })
    .from(productFeeds)
    .innerJoin(brands, eq(brands.id, productFeeds.brandId))
    .orderBy(brands.name);
  const runs = await Promise.all(
    feeds.map((f) => db.select().from(importRuns).where(eq(importRuns.feedId, f.feed.id)).orderBy(desc(importRuns.startedAt)).limit(10)),
  );
  return feeds.map((f, i) => ({ ...f, runs: runs[i] }));
}

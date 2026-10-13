import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, userRoles, users } from "@/lib/db/schema";
import type { Role } from "@/modules/access/permissions";
import { hashPassword } from "@/modules/identity/password";

export const TEST_PASSWORD = "senha-ficticia-de-teste";

// E-mails fictícios únicos por teste, com domínio reservado .test.
export function fakeEmail(prefix = "pessoa") {
  return `${prefix}-${randomUUID().slice(0, 8)}@exemplo.test`;
}

export function fakeIp() {
  return `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

export async function createUser({ roles = ["user"], verified = true }: { roles?: Role[]; verified?: boolean } = {}) {
  const email = fakeEmail(roles.includes("admin") ? "admin" : roles.includes("operator") ? "operador" : "usuaria");
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: await hashPassword(TEST_PASSWORD), emailVerifiedAt: verified ? new Date() : null })
    .returning();
  await db.insert(profiles).values({ userId: user.id, displayName: "Pessoa Fictícia", username: `f_${user.id.slice(0, 12)}` });
  await db.insert(userRoles).values(roles.map((role) => ({ userId: user.id, role })));
  return { ...user, roles, principal: { id: user.id, roles } };
}

export async function getUser(id: string) {
  return db.query.users.findFirst({ where: eq(users.id, id) });
}

// ---- Catálogo FICTÍCIO para testes ----
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { brands, campaigns, productFeeds, products as productsTable } from "@/lib/db/schema";
import { importFeed } from "@/modules/catalog/importer";

export type FakeItem = { sku: string; group?: string; title: string; price?: string; sale?: string; inStock?: boolean; size?: string; link?: string };

export function feedXml(domain: string, items: FakeItem[]) {
  const body = items
    .map(
      (i) => `<item><g:id>${i.sku}</g:id>${i.group ? `<g:item_group_id>${i.group}</g:item_group_id>` : ""}<title>${i.title}</title>
<link>${i.link ?? `https://${domain}/${i.sku}/p`}</link><g:image_link>https://cdn.${domain}/${i.sku}.jpg</g:image_link>
<g:price>${i.price ?? "100.00 BRL"}</g:price>${i.sale ? `<g:sale_price>${i.sale}</g:sale_price>` : ""}
<g:availability>${i.inStock === false ? "out of stock" : "in stock"}</g:availability>${i.size ? `<g:size>${i.size}</g:size>` : ""}
<g:product_type>Feminino &gt; Teste</g:product_type></item>`,
    )
    .join("\n");
  return `<?xml version="1.0"?><rss xmlns:g="http://base.google.com/ns/1.0"><channel>${body}</channel></rss>`;
}

export async function createBrandWithFeed(items: FakeItem[], { trackingParams = {} as Record<string, string>, campaign = true } = {}) {
  const key = randomUUID().slice(0, 8);
  const domain = `loja-${key}.example`;
  const [brand] = await db
    .insert(brands)
    .values({ name: `Marca Teste ${key}`, slug: `marca-${key}`, allowedDomains: [domain], trackingConfig: { params: trackingParams }, isFictitious: true })
    .returning();
  if (campaign) {
    await db.insert(campaigns).values({ brandId: brand.id, name: "Campanha teste", slug: `camp-${key}`, status: "active", startsAt: new Date(Date.now() - 86_400_000) });
  }
  const file = `test/${key}.xml`;
  const writeFeed = async (list: FakeItem[]) => {
    await mkdir(path.join(process.cwd(), "db/fixtures/test"), { recursive: true });
    await writeFile(path.join(process.cwd(), "db/fixtures", file), feedXml(domain, list));
  };
  await writeFeed(items);
  const [feed] = await db.insert(productFeeds).values({ brandId: brand.id, source: `file:${file}` }).returning();
  return { brand, feed, domain, writeFeed, importNow: () => importFeed(feed.id, null) };
}

export async function productBySku(brandId: string, externalId: string) {
  const rows = await db.select().from(productsTable).where(eq(productsTable.brandId, brandId));
  return rows.find((p) => p.externalId === externalId)!;
}

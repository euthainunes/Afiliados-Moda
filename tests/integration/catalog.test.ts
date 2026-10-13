import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { productPriceHistory, products, productVariants } from "@/lib/db/schema";
import { AccessDeniedError } from "@/modules/access/can";
import { triggerImport } from "@/modules/catalog/importer";
import { favoriteIds, searchProducts, toggleFavorite } from "@/modules/catalog/queries";
import { createBrandWithFeed, createUser, productBySku } from "../support/factories";

describe("importação de feed", () => {
  it("agrupa SKUs, é idempotente e registra histórico de preço", async () => {
    const items = [
      { sku: "A-P", group: "A", title: "Saia Teste - P", size: "P" },
      { sku: "A-M", group: "A", title: "Saia Teste - M", size: "M", inStock: false },
      { sku: "B", title: "Blusa Teste" },
    ];
    const t = await createBrandWithFeed(items);
    const first = await t.importNow();
    expect(first.status).toBe("succeeded");
    expect(first.stats).toMatchObject({ itemsRead: 3, productsUpserted: 2, variantsUpserted: 3, itemsRejected: 0 });

    const second = await t.importNow();
    expect(second.stats).toMatchObject({ productsUpserted: 0, productsUnchanged: 2 });
    const all = await db.select().from(products).where(eq(products.brandId, t.brand.id));
    expect(all).toHaveLength(2);

    const saia = await productBySku(t.brand.id, "A");
    expect(saia.title).toBe("Saia Teste");
    expect(saia.availability).toBe("in_stock");

    await t.writeFeed([{ ...items[0], price: "120.00 BRL" }, items[1], items[2]]);
    const third = await t.importNow();
    expect(third.stats?.priceChanges).toBe(1);
    const history = await db.select().from(productPriceHistory).where(eq(productPriceHistory.productId, saia.id));
    expect(history.map((h) => h.priceCents).sort()).toEqual([10000, 12000]);
  });

  it("retira do catálogo produtos que saíram do feed e marca SKUs ausentes como esgotados", async () => {
    const t = await createBrandWithFeed([
      { sku: "A-P", group: "A", title: "Calça - P", size: "P" },
      { sku: "A-M", group: "A", title: "Calça - M", size: "M" },
      { sku: "B", title: "Blusa" },
      { sku: "C", title: "Bolsa" },
    ]);
    await t.importNow();
    await t.writeFeed([
      { sku: "A-P", group: "A", title: "Calça - P", size: "P" },
      { sku: "B", title: "Blusa" },
    ]);
    const r = await t.importNow();
    expect(r.stats?.productsUnlisted).toBe(1);
    expect((await productBySku(t.brand.id, "C")).status).toBe("unlisted");
    const calca = await productBySku(t.brand.id, "A");
    const variants = await db.select().from(productVariants).where(eq(productVariants.productId, calca.id));
    expect(variants.find((v) => v.externalSku === "A-M")?.availability).toBe("out_of_stock");
  });

  it("não retira produtos quando o feed chega muito menor (provável truncamento)", async () => {
    const t = await createBrandWithFeed(["A", "B", "C", "D"].map((sku) => ({ sku, title: `Peça ${sku}` })));
    await t.importNow();
    await t.writeFeed([{ sku: "A", title: "Peça A" }]);
    const r = await t.importNow();
    expect(r.stats).toMatchObject({ unlistingSkipped: true, productsUnlisted: 0 });
    expect((await productBySku(t.brand.id, "D")).status).toBe("listed");
  });

  it("rejeita itens com link fora dos domínios da marca", async () => {
    const t = await createBrandWithFeed([
      { sku: "OK", title: "Peça ok" },
      { sku: "MAU", title: "Peça maliciosa", link: "https://malicioso.example/p" },
    ]);
    const r = await t.importNow();
    expect(r.stats?.itemsRejected).toBe(1);
    expect((await db.select().from(products).where(eq(products.brandId, t.brand.id))).map((p) => p.externalId)).toEqual(["OK"]);
  });

  it("registra falha sem alterar o catálogo quando o arquivo é inválido", async () => {
    const t = await createBrandWithFeed([{ sku: "A", title: "Peça" }]);
    await t.importNow();
    const { writeFile } = await import("node:fs/promises");
    await writeFile(`${process.cwd()}/db/fixtures/${t.feed.source.slice(5)}`, "isto não é xml <<<");
    const r = await t.importNow();
    expect(r.status).toBe("failed");
    expect((await productBySku(t.brand.id, "A")).status).toBe("listed");
  });

  it("disparo manual exige permissão de catálogo", async () => {
    const t = await createBrandWithFeed([{ sku: "A", title: "Peça" }]);
    const user = await createUser();
    await expect(triggerImport(user.principal, t.feed.id)).rejects.toBeInstanceOf(AccessDeniedError);
    const op = await createUser({ roles: ["user", "operator"] });
    expect((await triggerImport(op.principal, t.feed.id)).status).toBe("succeeded");
  });
});

describe("busca no catálogo", () => {
  it("busca sem acentos, filtra por marca, disponibilidade e preço, e ordena", async () => {
    const t = await createBrandWithFeed([
      { sku: "V1", title: "Vestido Ômega Linho", price: "300.00 BRL" },
      { sku: "V2", title: "Vestido Ômega Seda", price: "150.00 BRL", sale: "120.00 BRL" },
      { sku: "V3", title: "Vestido Ômega Jeans", price: "200.00 BRL", inStock: false },
    ]);
    await t.importNow();
    const marca = t.brand.slug;

    const all = await searchProducts({ q: "omega", marca });
    expect(all.total).toBe(3);

    const available = await searchProducts({ q: "OMEGA", marca, disponivel: true, ordem: "menor-preco" });
    expect(available.items.map((p) => p.title)).toEqual(["Vestido Ômega Seda", "Vestido Ômega Linho"]);

    const cheap = await searchProducts({ marca, max: 150 });
    expect(cheap.items.map((p) => p.title)).toEqual(["Vestido Ômega Seda"]);

    expect((await searchProducts({ q: "%", marca })).total).toBe(0);
  });
});

describe("favoritos", () => {
  it("alterna favorito e mantém isolamento entre contas", async () => {
    const t = await createBrandWithFeed([{ sku: "F", title: "Peça favorita" }]);
    await t.importNow();
    const p = await productBySku(t.brand.id, "F");
    const ana = await createUser();
    const bia = await createUser();
    expect(await toggleFavorite(ana.id, p.id)).toBe(true);
    expect((await favoriteIds(ana.id)).has(p.id)).toBe(true);
    expect((await favoriteIds(bia.id)).has(p.id)).toBe(false);
    expect(await toggleFavorite(ana.id, p.id)).toBe(false);
    expect((await favoriteIds(ana.id)).size).toBe(0);
  });
});

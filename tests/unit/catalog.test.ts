import { describe, expect, it } from "vitest";
import { parsePrice } from "@/lib/money";
import { isAllowedDomain } from "@/modules/catalog/domains";
import { parseGoogleMerchantFeed } from "@/modules/catalog/feed-parser";
import { groupItems } from "@/modules/catalog/importer";
import { newTrackingCode, ulid } from "@/modules/tracking/ids";
import { buildDestination, isBotUserAgent } from "@/modules/tracking/service";

describe("preços", () => {
  it.each([
    ["199.90 BRL", 19990],
    ["199,90 BRL", 19990],
    ["1.299,90 BRL", 129990],
    ["1,299.90 USD", 129990],
    ["R$ 89,90", 8990],
    ["1.299 BRL", 129900],
    ["50 BRL", 5000],
    ["0.5 BRL", 50],
  ])("%s → %i centavos", (raw, cents) => {
    expect(parsePrice(raw)?.cents).toBe(cents);
  });

  it("rejeita valores inválidos, zero e negativos", () => {
    for (const raw of ["", "abc", "0.00 BRL", "-10 BRL", "10.999 BRL x", "1,2,3"]) expect(parsePrice(raw)).toBeNull();
  });

  it("identifica a moeda", () => {
    expect(parsePrice("10.00 USD")?.currency).toBe("USD");
    expect(parsePrice("10,00")?.currency).toBe("BRL");
  });
});

const xml = (items: string) => `<?xml version="1.0"?><rss xmlns:g="http://base.google.com/ns/1.0"><channel>${items}</channel></rss>`;
const item = (id: string, extra = "") => `<item><g:id>${id}</g:id><g:item_group_id>G1</g:item_group_id><title>Vestido Teste - ${id.slice(-1)}</title>
<link>https://loja.example/p/${id}</link><g:image_link>https://cdn.loja.example/${id}.jpg</g:image_link><g:price>100.00 BRL</g:price>
<g:availability>in stock</g:availability><g:size>${id.slice(-1)}</g:size>${extra}</item>`;

describe("leitor de feed", () => {
  it("lê itens válidos e rejeita itens incompletos com motivo", () => {
    const { items, rejected } = parseGoogleMerchantFeed(
      xml(
        item("SKU-P") +
          item("SKU-M", "<g:sale_price>80.00 BRL</g:sale_price>") +
          "<item><g:id>SEM-PRECO</g:id><title>X</title><link>https://loja.example/x</link><g:image_link>https://cdn.loja.example/x.jpg</g:image_link></item>" +
          "<item><g:id>HTTP</g:id><title>X</title><link>http://loja.example/x</link><g:image_link>https://cdn.loja.example/x.jpg</g:image_link><g:price>1 BRL</g:price></item>",
      ),
    );
    expect(items.map((i) => i.id)).toEqual(["SKU-P", "SKU-M"]);
    expect(items[1].salePriceCents).toBe(8000);
    expect(rejected).toEqual([
      { itemId: "SEM-PRECO", reason: "preço inválido" },
      { itemId: "HTTP", reason: "link ausente ou sem https" },
    ]);
  });

  it("ignora preço promocional maior ou igual ao preço cheio", () => {
    const { items } = parseGoogleMerchantFeed(xml(item("SKU-P", "<g:sale_price>120.00 BRL</g:sale_price>")));
    expect(items[0].salePriceCents).toBeNull();
  });

  it("agrupa SKUs em um produto, remove o tamanho do título e calcula disponibilidade", () => {
    const { items } = parseGoogleMerchantFeed(
      xml(item("SKU-P").replace("in stock", "out of stock") + item("SKU-M", "<g:sale_price>80.00 BRL</g:sale_price>")),
    );
    const [group] = groupItems(items);
    expect(group.title).toBe("Vestido Teste");
    expect(group.inStock).toBe(true);
    expect(group.salePriceCents).toBe(8000);
    expect(group.url).toBe("https://loja.example/p/SKU-M");
    expect(group.variants).toHaveLength(2);
  });
});

describe("domínios autorizados", () => {
  it("aceita domínio e subdomínios com https, recusa o resto", () => {
    const allowed = ["loja.example"];
    expect(isAllowedDomain("https://loja.example/p/1", allowed)).toBe(true);
    expect(isAllowedDomain("https://www.loja.example/p/1", allowed)).toBe(true);
    expect(isAllowedDomain("http://loja.example/p/1", allowed)).toBe(false);
    expect(isAllowedDomain("https://loja.example.malicioso.com/p", allowed)).toBe(false);
    expect(isAllowedDomain("https://malicioso-loja.example/p", allowed)).toBe(false);
    expect(isAllowedDomain("https://user:pass@loja.example/p", allowed)).toBe(false);
    expect(isAllowedDomain("javascript:alert(1)", allowed)).toBe(false);
  });
});

describe("rastreamento", () => {
  it("monta o destino com parâmetros configurados, preservando os existentes", () => {
    const url = buildDestination(
      "https://loja.example/p?sku=1",
      { params: { utm_source: "plataforma", utm_campaign: "{campaign}", utmi_cp: "{click_id}" } },
      { clickId: "01ABC", campaign: "lancamento" },
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("sku")).toBe("1");
    expect(parsed.searchParams.get("utm_source")).toBe("plataforma");
    expect(parsed.searchParams.get("utm_campaign")).toBe("lancamento");
    expect(parsed.searchParams.get("utmi_cp")).toBe("01ABC");
  });

  it("omite parâmetros sem valor (robô sem click_id, sem campanha ativa)", () => {
    const url = new URL(buildDestination("https://loja.example/p", { params: { utm_campaign: "{campaign}", utmi_cp: "{click_id}" } }, { clickId: null, campaign: null }));
    expect([...url.searchParams.keys()]).toEqual([]);
  });

  it("gera identificadores no formato esperado e únicos", () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newTrackingCode()));
    expect(ids.size).toBe(2000);
    for (const id of ids) expect(id).toMatch(/^[0-9A-Za-z]{10}$/);
    const a = ulid(1_700_000_000_000);
    const b = ulid(1_700_000_000_001);
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(a.slice(0, 10) < b.slice(0, 10)).toBe(true);
  });

  it("reconhece robôs e pré-visualizadores de link", () => {
    expect(isBotUserAgent("WhatsApp/2.23.20.0")).toBe(true);
    expect(isBotUserAgent("facebookexternalhit/1.1")).toBe(true);
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Safari/604.1")).toBe(false);
  });
});

describe("filtros do catálogo vindos da URL", () => {
  it("campos vazios do formulário não viram zero e valores inválidos são descartados", async () => {
    const { catalogFiltersSchema } = await import("@/modules/catalog/queries");
    expect(catalogFiltersSchema.parse({ q: "vestido", min: "", max: "", ordem: "", pagina: "" })).toEqual({ q: "vestido" });
    expect(catalogFiltersSchema.parse({ max: "150", pagina: "2", ordem: "menor-preco" })).toMatchObject({ max: 150, pagina: 2, ordem: "menor-preco" });
    expect(catalogFiltersSchema.parse({ max: "-1", pagina: "abc", ordem: "hack" })).toEqual({});
  });
});

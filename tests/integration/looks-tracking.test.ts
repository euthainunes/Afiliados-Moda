import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { auditLogs, clicks, looks, products } from "@/lib/db/schema";
import { AccessDeniedError } from "@/modules/access/can";
import {
  addItem,
  createLook,
  deleteDraft,
  getEditableLook,
  getPublicLook,
  LookError,
  moveItem,
  publishLook,
  removeItem,
  removeLook,
  unpublishLook,
  updateDetails,
} from "@/modules/looks/service";
import { resolveClick } from "@/modules/tracking/service";
import { createBrandWithFeed, createUser, productBySku } from "../support/factories";

const BROWSER = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36";
let t: Awaited<ReturnType<typeof createBrandWithFeed>>;
let ids: Record<string, string>;

beforeAll(async () => {
  t = await createBrandWithFeed(
    [
      { sku: "P1", title: "Peça Um" },
      { sku: "P2", title: "Peça Dois" },
      { sku: "P3", title: "Peça Três" },
      { sku: "ESG", title: "Peça Esgotada", inStock: false },
    ],
    { trackingParams: { utm_source: "plataforma", utm_campaign: "{campaign}", utmi_cp: "{click_id}" } },
  );
  await t.importNow();
  ids = Object.fromEntries(await Promise.all(["P1", "P2", "P3", "ESG"].map(async (s) => [s, (await productBySku(t.brand.id, s)).id])));
});

async function publishedLook() {
  const owner = await createUser();
  const lookId = await createLook(owner.id, ids.P1);
  await addItem(owner.id, lookId, ids.P2);
  await updateDetails(owner.id, lookId, { title: "Look de teste" });
  const r = await publishLook(owner.id, lookId);
  if (!r.ok) throw new Error("publicação falhou");
  return { owner, lookId, slug: r.slug };
}

const ctx = (over: Partial<Parameters<typeof resolveClick>[1]> = {}) => ({
  ipHash: `ip-${Math.random()}`,
  uaHash: "ua",
  userAgent: BROWSER,
  referrer: "https://wa.me/",
  viewerUserId: null,
  ...over,
});

describe("montagem e publicação de looks", () => {
  it("valida regras de publicação e gera URL própria e estável", async () => {
    const owner = await createUser();
    const lookId = await createLook(owner.id, ids.P1);

    let r = await publishLook(owner.id, lookId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.map((p) => p.field).sort()).toEqual(["items", "title"]);

    await addItem(owner.id, lookId, ids.ESG).catch(() => {});
    await addItem(owner.id, lookId, ids.P2);
    await updateDetails(owner.id, lookId, { title: "Praia de domingo" });
    r = await publishLook(owner.id, lookId);
    expect(r.ok).toBe(false); // peça esgotada bloqueia
    if (!r.ok) expect(r.problems[0].message).toContain("Peça Esgotada");

    await removeItem(owner.id, lookId, ids.ESG);
    r = await publishLook(owner.id, lookId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.slug).toMatch(/^praia-de-domingo-[a-z0-9]{6}$/);

    const pub = await getPublicLook(r.slug);
    expect(pub?.items.map((i) => i.title)).toEqual(["Peça Um", "Peça Dois"]);
    expect(pub?.items.every((i) => i.trackingCode)).toBe(true);

    await unpublishLook(owner.id, lookId);
    expect(await getPublicLook(r.slug)).toBeNull();
    const again = await publishLook(owner.id, lookId);
    expect(again.ok && again.slug).toBe(r.slug); // republicar mantém a URL
  });

  it("impede duplicar peças, reordena e protege o mínimo de peças do look publicado", async () => {
    const { owner, lookId } = await publishedLook();
    await expect(addItem(owner.id, lookId, ids.P1)).rejects.toThrow(/já está/);
    await expect(removeItem(owner.id, lookId, ids.P1)).rejects.toBeInstanceOf(LookError);

    await addItem(owner.id, lookId, ids.P3);
    await moveItem(owner.id, lookId, ids.P3, "up");
    await moveItem(owner.id, lookId, ids.P3, "up");
    await moveItem(owner.id, lookId, ids.P3, "up"); // já no topo: sem efeito
    const { items } = await getEditableLook(owner.id, lookId);
    expect(items.map((i) => i.title)).toEqual(["Peça Três", "Peça Um", "Peça Dois"]);
    expect(items[0].trackingCode).toBeTruthy(); // peça adicionada após publicar também ganha link
  });

  it("nenhuma usuária edita, publica ou apaga look de outra", async () => {
    const { lookId } = await publishedLook();
    const intrusa = await createUser();
    await expect(addItem(intrusa.id, lookId, ids.P3)).rejects.toThrow("Look não encontrado.");
    await expect(removeItem(intrusa.id, lookId, ids.P1)).rejects.toThrow("Look não encontrado.");
    await expect(updateDetails(intrusa.id, lookId, { title: "Invadido" })).rejects.toThrow("Look não encontrado.");
    await expect(unpublishLook(intrusa.id, lookId)).rejects.toThrow("Look não encontrado.");
    await expect(deleteDraft(intrusa.id, lookId)).rejects.toThrow("Look não encontrado.");
    await expect(getEditableLook(intrusa.id, "nao-e-uuid")).rejects.toThrow("Look não encontrado.");
  });

  it("só apaga rascunhos nunca publicados", async () => {
    const owner = await createUser();
    const draft = await createLook(owner.id);
    await deleteDraft(owner.id, draft);
    expect(await db.query.looks.findFirst({ where: eq(looks.id, draft) })).toBeUndefined();
    const { owner: o2, lookId } = await publishedLook();
    await expect(deleteDraft(o2.id, lookId)).rejects.toThrow(/despublique/);
  });

  it("moderação remove com motivo e auditoria; usuária comum não modera", async () => {
    const { owner, lookId, slug } = await publishedLook();
    const op = await createUser({ roles: ["user", "operator"] });
    await expect(removeLook(owner.principal, lookId, "motivo qualquer")).rejects.toBeInstanceOf(AccessDeniedError);
    await removeLook(op.principal, lookId, "Conteúdo impróprio (teste fictício)");
    expect(await getPublicLook(slug)).toBeNull();
    await expect(addItem(owner.id, lookId, ids.P3)).rejects.toThrow(/moderação/);
    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, lookId), eq(auditLogs.action, "look.removed")));
    expect(log.actorId).toBe(op.id);
  });
});

describe("redirecionador de cliques", () => {
  it("registra o clique com click_id e redireciona ao produto com os parâmetros da marca", async () => {
    const { slug, lookId, owner } = await publishedLook();
    const item = (await getPublicLook(slug))!.items[0];
    const r = await resolveClick(item.trackingCode!, ctx());
    expect(r?.clickId).toMatch(/^[0-9A-Z]{26}$/);
    const url = new URL(r!.url);
    expect(url.hostname).toBe(t.domain);
    expect(url.searchParams.get("utmi_cp")).toBe(r!.clickId);
    expect(url.searchParams.get("utm_campaign")).toMatch(/^camp-/);

    const [click] = await db.select().from(clicks).where(eq(clicks.clickId, r!.clickId!));
    expect(click).toMatchObject({ lookId, userId: owner.id, productId: item.productId, isBot: false, isSelfClick: false, referrerDomain: "wa.me" });
    expect(click.campaignId).not.toBeNull();
  });

  it("marca robôs e cliques da própria autora, sem enviar click_id a robôs", async () => {
    const { slug, owner } = await publishedLook();
    const code = (await getPublicLook(slug))!.items[0].trackingCode!;
    const bot = await resolveClick(code, ctx({ userAgent: "WhatsApp/2.24" }));
    expect(bot?.clickId).toBeNull();
    expect(new URL(bot!.url).searchParams.has("utmi_cp")).toBe(false);
    const self = await resolveClick(code, ctx({ viewerUserId: owner.id }));
    const [row] = await db.select().from(clicks).where(eq(clicks.clickId, self!.clickId!));
    expect(row.isSelfClick).toBe(true);
  });

  it("look despublicado leva à loja sem registrar clique; código inexistente não redireciona", async () => {
    const { slug, owner, lookId } = await publishedLook();
    const code = (await getPublicLook(slug))!.items[0].trackingCode!;
    await unpublishLook(owner.id, lookId);
    const before = await db.select().from(clicks).where(eq(clicks.lookId, lookId));
    const r = await resolveClick(code, ctx());
    expect(r).toMatchObject({ clickId: null });
    expect(new URL(r!.url).search).toBe("");
    expect(await db.select().from(clicks).where(eq(clicks.lookId, lookId))).toHaveLength(before.length);
    expect(await resolveClick("XXXXXXXXXX", ctx())).toBeNull();
    expect(await resolveClick("../../etc", ctx())).toBeNull();
  });

  it("não redireciona para domínio não autorizado, mesmo que o produto seja alterado", async () => {
    const { slug } = await publishedLook();
    const item = (await getPublicLook(slug))!.items[0];
    await db.update(products).set({ url: "https://malicioso.example/roubo" }).where(eq(products.id, item.productId));
    expect(await resolveClick(item.trackingCode!, ctx())).toBeNull();
    await db.update(products).set({ url: `https://${t.domain}/P1/p` }).where(eq(products.id, item.productId));
  });

  it("limita cliques repetidos do mesmo IP", async () => {
    const { slug, lookId } = await publishedLook();
    const code = (await getPublicLook(slug))!.items[0].trackingCode!;
    const ip = `ip-limite-${Math.random()}`;
    for (let i = 0; i < 62; i++) await resolveClick(code, ctx({ ipHash: ip }));
    const recorded = await db.select().from(clicks).where(eq(clicks.lookId, lookId));
    expect(recorded).toHaveLength(60);
  });
});

// DADOS DE DEMONSTRAÇÃO — todos fictícios e marcados como tal.
// Este módulo é o ÚNICO lugar que fabrica dados de exemplo. Ele usa os mesmos serviços da operação real
// (importação, looks, sincronização de pedidos, livro-razão, resgates), de modo que gráficos, saldos e
// comissões são consistentes com as regras cadastradas. É bloqueado em produção.
import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  brandMembers,
  brands,
  campaigns,
  clicks,
  commissionRules,
  consents,
  integrations,
  looks,
  productFeeds,
  products,
  profiles,
  settings,
  trackingLinks,
  userRoles,
  users,
} from "@/lib/db/schema";
import { assertDemoAllowed } from "@/lib/env";
import type { Principal } from "@/modules/access/can";
import type { Role } from "@/modules/access/permissions";
import { importFeed } from "@/modules/catalog/importer";
import { userBalances } from "@/modules/finance/ledger";
import {
  issueInvoice,
  markPayoutPaid,
  registerBrandPayment,
  requestPayout,
  reviewPayout,
  runEligibility,
  runReconciliation,
  savePayoutAccount,
} from "@/modules/finance/operations";
import { hashPassword } from "@/modules/identity/password";
import { LEGAL_VERSIONS } from "@/modules/identity/policies";
import { addItem, createLook, publishLook, updateDetails } from "@/modules/looks/service";
import { syncOrderIntegration } from "@/modules/orders/sync";
import { openTicket, replyTicket } from "@/modules/support/service";
import { ulid } from "@/modules/tracking/ids";

const DAY = 86_400_000;
const DEMO_FLAG = "demo.seeded_at";

// Gerador pseudoaleatório determinístico: a mesma semente produz sempre os mesmos dados.
function rng(seed: string) {
  let h = createHash("sha256").update(seed).digest().readUInt32LE(0) || 1;
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 1_000_000) / 1_000_000;
  };
}

// CPF fictício com dígitos verificadores válidos (necessário para passar na validação), gerado a partir de um número.
export function fictitiousCpf(n: number): string {
  const base = String(100_000_000 + n * 7_919).slice(0, 9).split("").map(Number);
  const dv = (digits: number[]) => {
    const sum = digits.reduce((s, d, i) => s + d * (digits.length + 1 - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base);
  const d2 = dv([...base, d1]);
  return [...base, d1, d2].join("");
}

type Person = { email: string; name: string; username: string; roles: Role[]; bio?: string };

const PEOPLE: Person[] = [
  { email: "admin@exemplo.test", name: "Ana Admin (fictícia)", username: "ana_admin", roles: ["user", "admin"] },
  { email: "admin2@exemplo.test", name: "Bia Admin (fictícia)", username: "bia_admin", roles: ["user", "admin"] },
  { email: "operadora@exemplo.test", name: "Olga Operadora (fictícia)", username: "olga_operadora", roles: ["user", "operator"] },
  { email: "criadora1@exemplo.test", name: "Carol Lima (fictícia)", username: "carol_demo", roles: ["user"], bio: "Perfil fictício de demonstração · looks de praia" },
  { email: "criadora2@exemplo.test", name: "Duda Rocha (fictícia)", username: "duda_demo", roles: ["user"], bio: "Perfil fictício · alfaiataria e trabalho" },
  { email: "criadora3@exemplo.test", name: "Elis Moraes (fictícia)", username: "elis_demo", roles: ["user"], bio: "Perfil fictício · jeans e básicos" },
  { email: "criadora4@exemplo.test", name: "Fê Souza (fictícia)", username: "fe_demo", roles: ["user"], bio: "Perfil fictício · festas" },
  { email: "criadora5@exemplo.test", name: "Gabi Nunes (fictícia)", username: "gabi_demo", roles: ["user"], bio: "Perfil fictício · recém-chegada" },
  // Representante da marca fictícia: só o portal da marca (sem perfil de criadora).
  { email: "marca@exemplo.test", name: "Mara da Marca (fictícia)", username: "mara_marca", roles: ["brand_rep"] },
];

const LOOKS: Record<string, [string, string, string[]][]> = {
  carol_demo: [
    ["Fim de semana na praia", "Leve, fresco e pronto para o sol.", ["Vestido Longo Linho", "Bolsa de Palha", "Sandália Tiras Finas", "Óculos de Sol Gatinho"]],
    ["Pôr do sol na orla", "Para o fim de tarde.", ["Saia Midi Plissada", "Regata Canelada", "Brinco Argola Dourada"]],
  ],
  duda_demo: [
    ["Escritório sem esforço", "Alfaiataria confortável para o dia todo.", ["Blazer Linho Estruturado", "Blusa Seda Decote V", "Calça Pantalona Alfaiataria", "Mule Bico Quadrado"]],
    ["Reunião importante", "Sóbrio e elegante.", ["Calça Wide Leg Linho", "Camisa Oversized Listrada", "Bolsa Tiracolo Couro"]],
  ],
  elis_demo: [
    ["Jeans com jeans", "Duas lavagens, zero erro.", ["Jaqueta Jeans Cropped", "Regata Canelada", "Calça Jeans Reta", "Tênis Branco Couro"]],
    ["Sábado na feira", "Prático e bonito.", ["Short Alfaiataria", "Camisa Oversized Listrada", "Tênis Branco Couro"]],
  ],
  fe_demo: [["Aniversário da amiga", "Festa de dia.", ["Vestido Midi Floral", "Lenço de Seda Estampado", "Sandália Tiras Finas"]]],
  gabi_demo: [],
};

async function ensurePerson(p: Person, password: string) {
  let user = await db.query.users.findFirst({ where: eq(users.email, p.email) });
  if (!user) {
    [user] = await db.insert(users).values({ email: p.email, passwordHash: await hashPassword(password), emailVerifiedAt: new Date() }).returning();
    await db.insert(profiles).values({ userId: user.id, displayName: p.name, username: p.username, bio: p.bio ?? "Perfil fictício de demonstração." });
    await db.insert(userRoles).values(p.roles.map((role) => ({ userId: user!.id, role })));
    await db.insert(consents).values((Object.keys(LEGAL_VERSIONS) as (keyof typeof LEGAL_VERSIONS)[]).map((document) => ({ userId: user!.id, document, version: LEGAL_VERSIONS[document] })));
  }
  return { id: user.id, roles: p.roles } satisfies Principal;
}

export async function seedDemo({ password, log = console.info, now = new Date() }: { password: string; log?: (...a: unknown[]) => void; now?: Date }) {
  assertDemoAllowed("Carga de dados de demonstração");
  if (await db.query.settings.findFirst({ where: eq(settings.key, DEMO_FLAG) })) {
    log("Dados de demonstração já carregados (para recriar: pnpm db:reset).");
    return;
  }
  const people = Object.fromEntries(await Promise.all(PEOPLE.map(async (p) => [p.username, await ensurePerson(p, password)] as const)));
  const ana = people.ana_admin;
  const bia = people.bia_admin;

  // ---- Marca, campanha, feed e regra comercial (FICTÍCIOS) ----
  let brand = await db.query.brands.findFirst({ where: eq(brands.slug, "marca-ficticia") });
  if (!brand) {
    [brand] = await db
      .insert(brands)
      .values({
        name: "Marca Fictícia",
        slug: "marca-ficticia",
        website: "https://loja-ficticia.example",
        allowedDomains: ["loja-ficticia.example"],
        trackingConfig: { params: { utm_source: "afiliadosmoda", utm_medium: "look", utm_campaign: "{campaign}", utmi_cp: "{click_id}" } },
        isFictitious: true,
      })
      .returning();
    await db.insert(productFeeds).values({ brandId: brand.id, source: "file:feed-ficticio.xml" });
  }
  await db.insert(brandMembers).values({ brandId: brand.id, userId: people.mara_marca.id, grantedBy: ana.id }).onConflictDoNothing();
  let [campaign] = await db.select().from(campaigns).where(eq(campaigns.brandId, brand.id));
  if (!campaign) {
    [campaign] = await db.insert(campaigns).values({ brandId: brand.id, name: "Campanha fictícia de lançamento", slug: "lancamento-ficticio", status: "active", startsAt: new Date(now.getTime() - 200 * DAY) }).returning();
  }
  const feed = await db.query.productFeeds.findFirst({ where: eq(productFeeds.brandId, brand.id) });
  const imported = await importFeed(feed!.id, null);
  log(`Catálogo fictício: ${imported.status}`);

  const [existingRule] = await db.select().from(commissionRules).where(eq(commissionRules.campaignId, campaign.id));
  if (!existingRule) {
    // Regra de DEMONSTRAÇÃO com os percentuais pretendidos (25% / 20 p.p. / 5 p.p.). Inserida diretamente porque
    // vale desde o passado — o fluxo normal (pelo painel) nunca permite vigência retroativa.
    await db.insert(commissionRules).values({
      campaignId: campaign.id,
      version: 1,
      status: "approved",
      baseType: "item_net_paid",
      commissionBps: 2500,
      userShareBps: 2000,
      platformShareBps: 500,
      attributionWindowDays: 7,
      eligibilityPolicy: { startEvent: "order_invoiced", waitDays: 30, requireBrandPaymentReceived: true },
      validFrom: new Date(now.getTime() - 150 * DAY),
      contractReference: "DEMONSTRAÇÃO — sem contrato (percentuais pretendidos, não contratados)",
      notes: "Regra fictícia para demonstração.",
      proposedBy: ana.id,
      reviewedBy: bia.id,
      reviewedAt: new Date(now.getTime() - 150 * DAY),
    });
  }

  // ---- Looks publicados ----
  const productId = async (title: string) => (await db.query.products.findFirst({ where: and(eq(products.brandId, brand!.id), eq(products.title, title)) }))!.id;
  const lookIds: { lookId: string; userId: string }[] = [];
  for (const [username, list] of Object.entries(LOOKS)) {
    const owner = people[username];
    for (const [title, description, items] of list) {
      const lookId = await createLook(owner.id);
      for (const t of items) await addItem(owner.id, lookId, await productId(t));
      await updateDetails(owner.id, lookId, { title, description });
      await publishLook(owner.id, lookId);
      await db.update(looks).set({ publishedAt: new Date(now.getTime() - 95 * DAY) }).where(eq(looks.id, lookId));
      lookIds.push({ lookId, userId: owner.id });
    }
  }
  const draft = await createLook(people.gabi_demo.id, await productId("Cropped Ombro a Ombro"));
  await updateDetails(people.gabi_demo.id, draft, { title: "Rascunho com peça esgotada" });

  // ---- Cliques dos últimos 90 dias (determinísticos) ----
  const links = await db.select().from(trackingLinks).where(inArray(trackingLinks.lookId, lookIds.map((l) => l.lookId)));
  const rand = rng("demo-clicks-v1");
  const rows: (typeof clicks.$inferInsert)[] = [];
  for (const link of links) {
    const popularity = 0.15 + rand() * 0.5;
    for (let d = 90; d >= 0; d--) {
      const perDay = Math.floor(rand() * 3 * popularity + (rand() < popularity ? 1 : 0));
      for (let k = 0; k < perDay; k++) {
        const at = new Date(now.getTime() - d * DAY - Math.floor(rand() * 20) * 3_600_000);
        if (at > now) continue;
        const bot = rand() < 0.05;
        const self = !bot && rand() < 0.03;
        const clickId = ulid(at.getTime());
        rows.push({
          clickId: bot ? `bot-${clickId}` : clickId,
          trackingLinkId: link.id,
          userId: link.userId,
          lookId: link.lookId,
          productId: link.productId,
          brandId: brand.id,
          campaignId: campaign.id,
          occurredAt: at,
          ipHash: `demo-${Math.floor(rand() * 5000)}`,
          uaHash: "demo",
          referrerDomain: ["wa.me", "instagram.com", "l.facebook.com", null][Math.floor(rand() * 4)],
          isBot: bot,
          isSelfClick: self,
          destinationUrl: "https://loja-ficticia.example/",
        });
      }
    }
  }
  for (let i = 0; i < rows.length; i += 500) await db.insert(clicks).values(rows.slice(i, i + 500));
  log(`Cliques fictícios: ${rows.length}`);

  // ---- Pedidos da loja de demonstração → conversões e livro-razão ----
  let [integration] = await db.select().from(integrations).where(and(eq(integrations.kind, "order_source"), eq(integrations.brandId, brand.id)));
  if (!integration) {
    [integration] = await db.insert(integrations).values({ kind: "order_source", provider: "demo", brandId: brand.id, name: "Pedidos — Marca Fictícia (loja de demonstração)", mode: "demo", updatedBy: ana.id }).returning();
  }
  const sync = await syncOrderIntegration(integration.id, { since: new Date(now.getTime() - 120 * DAY), now });
  log("Sincronização de pedidos fictícios:", sync.status, sync.counters);

  // ---- Cobrança da marca: uma fatura paga (simulada) e outra em aberto ----
  try {
    const paid = await issueInvoice(ana, brand.id, new Date(now.getTime() - 35 * DAY));
    await registerBrandPayment(ana, paid.id, { amountCents: paid.amountCents, receivedAt: new Date(now.getTime() - 30 * DAY), reference: "" });
    await issueInvoice(ana, brand.id, new Date(now.getTime() - 5 * DAY));
  } catch (error) {
    log("Faturas:", error instanceof Error ? error.message : error);
  }

  const elig = await runEligibility(now);
  log("Elegibilidade:", elig);

  // ---- Resgates em etapas diferentes (pagamentos SIMULADOS) ----
  const flows: [string, "paid" | "approved" | "requested" | "rejected"][] = [
    ["carol_demo", "paid"],
    ["duda_demo", "approved"],
    ["elis_demo", "requested"],
    ["fe_demo", "rejected"],
  ];
  for (const [i, [username, outcome]] of flows.entries()) {
    const person = people[username];
    const b = await userBalances(person.id);
    if (b.eligibleCents < 2000) continue;
    await savePayoutAccount(person.id, { holderName: PEOPLE.find((p) => p.username === username)!.name, cpf: fictitiousCpf(i + 1), pixKeyType: "email", pixKey: `${username}@exemplo.test` });
    const amount = Math.max(2000, Math.floor((b.eligibleCents * 0.6) / 100) * 100);
    const p = await requestPayout(person.id, amount);
    if (outcome === "requested") continue;
    if (outcome === "rejected") {
      await reviewPayout(ana, p.id, "reject", "Dados de recebimento divergentes (demonstração)");
      continue;
    }
    await reviewPayout(ana, p.id, "approve");
    if (outcome === "paid") await markPayoutPaid(bia, p.id, null);
  }

  // ---- Suporte ----
  const t1 = await openTicket(people.carol_demo.id, { category: "recompensas", subject: "Quando minha recompensa é liberada?", body: "Vi uma venda aprovada, mas ainda não está disponível. (mensagem fictícia)" });
  await replyTicket(ana, t1.id, "Oi! Depois da aprovação, há o prazo de validação e a confirmação do pagamento da marca. A data prevista aparece em Desempenho. (resposta fictícia)");
  await openTicket(people.duda_demo.id, { category: "looks", subject: "Peça esgotada no meu look", body: "Uma peça do meu look aparece como indisponível. O que faço? (mensagem fictícia)" });

  const rec = await runReconciliation(now);
  log("Conciliação:", rec);
  await db.insert(settings).values({ key: DEMO_FLAG, value: now.toISOString() });
  log("Demonstração pronta. Contas: admin@exemplo.test, admin2@exemplo.test, operadora@exemplo.test, criadora1..5@exemplo.test, marca@exemplo.test (portal da marca) (senha do .env.local).");
}
